import { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { mailMessages, mailMessageRecipients, users } from '../../src/db/schema';
import { getStringParam } from '../utils/request';
import { getIO } from '../socket';
import logger from '../utils/logger';
import { writeDbError } from '../utils/dbErrors';

let mailSchemaReady = false;

const ensureMailSchema = async () => {
    if (mailSchemaReady) return;
    await pool.query(`
        IF OBJECT_ID('dbo.mail_messages', 'U') IS NULL
        CREATE TABLE dbo.mail_messages (
            id nvarchar(255) NOT NULL PRIMARY KEY,
            branch_id nvarchar(255) NULL,
            sender_id nvarchar(255) NOT NULL,
            subject nvarchar(500) NOT NULL,
            body nvarchar(max) NOT NULL,
            priority nvarchar(50) NOT NULL DEFAULT 'NORMAL',
            is_broadcast bit NOT NULL DEFAULT 0,
            broadcast_scope nvarchar(50) NULL,
            reply_to_message_id nvarchar(255) NULL,
            created_at datetime2 NOT NULL DEFAULT GETDATE()
        );
        IF COL_LENGTH('dbo.mail_messages', 'reply_to_message_id') IS NULL
            ALTER TABLE dbo.mail_messages ADD reply_to_message_id nvarchar(255) NULL;
        IF OBJECT_ID('dbo.mail_message_recipients', 'U') IS NULL
        CREATE TABLE dbo.mail_message_recipients (
            id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
            message_id nvarchar(255) NOT NULL,
            user_id nvarchar(255) NOT NULL,
            is_read bit NOT NULL DEFAULT 0,
            read_at datetime2 NULL,
            is_starred bit NOT NULL DEFAULT 0,
            is_archived bit NOT NULL DEFAULT 0
        );
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'mail_recipients_user_idx' AND object_id = OBJECT_ID('dbo.mail_message_recipients'))
            CREATE INDEX mail_recipients_user_idx ON dbo.mail_message_recipients(user_id, is_archived, is_read);
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'mail_recipients_message_idx' AND object_id = OBJECT_ID('dbo.mail_message_recipients'))
            CREATE INDEX mail_recipients_message_idx ON dbo.mail_message_recipients(message_id);
        -- Normalize legacy rows: tables created by older builds may lack the
        -- DEFAULT 0 constraints, leaving NULL flags that equality filters
        -- silently drop (message stored in Sent but invisible in Inbox).
        UPDATE dbo.mail_message_recipients SET is_read = 0 WHERE is_read IS NULL;
        UPDATE dbo.mail_message_recipients SET is_starred = 0 WHERE is_starred IS NULL;
        UPDATE dbo.mail_message_recipients SET is_archived = 0 WHERE is_archived IS NULL;
    `);
    mailSchemaReady = true;
};

const BROADCAST_ALL_ROLES = new Set(['SUPER_ADMIN', 'OWNER', 'GENERAL_MANAGER', 'BRANCH_MANAGER']);

const userBranches = (user: { branchId?: string | null; allowedBranches?: string[] | null }): string[] => {
    const set = new Set<string>();
    if (user.branchId) set.add(user.branchId);
    for (const b of user.allowedBranches || []) if (b) set.add(b);
    return Array.from(set);
};

const notifyRecipients = (userIds: string[], payload: Record<string, unknown>) => {
    try {
        const io = getIO();
        for (const uid of userIds) {
            io.to(`user:${uid}`).emit('mail:new', { ...payload, toUserId: uid });
        }
    } catch {
        /* socket delivery is best-effort */
    }
};

/**
 * POST /mail/send
 * { toUserIds?: string[], broadcast?: 'BRANCH' | 'ALL', subject, body, priority?, replyToMessageId?, replyAll? }
 */
export const sendMail = async (req: Request, res: Response) => {
    try {
        await ensureMailSchema();
        const senderId = req.user?.id;
        if (!senderId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

        let subject = String(req.body?.subject || '').trim().slice(0, 200);
        const body = String(req.body?.body || '').trim().slice(0, 20000);
        const priority = ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(String(req.body?.priority))
            ? String(req.body.priority)
            : 'NORMAL';
        const broadcast = req.body?.broadcast === 'ALL' ? 'ALL' : req.body?.broadcast === 'BRANCH' ? 'BRANCH' : null;
        const rawIds = Array.isArray(req.body?.toUserIds) ? req.body.toUserIds : [];
        const replyToMessageId = String(req.body?.replyToMessageId || '').trim() || null;
        const replyAll = Boolean(req.body?.replyAll);

        // Validate reply parent + access (sender or recipient only)
        let replyParent: typeof mailMessages.$inferSelect | null = null;
        let replyParentRecipients: string[] = [];
        if (replyToMessageId) {
            const [parent] = await db.select().from(mailMessages).where(eq(mailMessages.id, replyToMessageId));
            if (!parent) return res.status(404).json({ error: 'REPLY_PARENT_NOT_FOUND' });
            const myRows = await db.select().from(mailMessageRecipients)
                .where(and(eq(mailMessageRecipients.messageId, replyToMessageId), eq(mailMessageRecipients.userId, senderId)));
            const isParentSender = parent.senderId === senderId;
            if (!isParentSender && myRows.length === 0) return res.status(403).json({ error: 'REPLY_FORBIDDEN' });
            replyParent = parent;
            const parentRows = await db.select({ userId: mailMessageRecipients.userId })
                .from(mailMessageRecipients).where(eq(mailMessageRecipients.messageId, replyToMessageId));
            replyParentRecipients = parentRows.map((r: any) => r.userId).filter((id: string) => id !== senderId);
            // Auto subject: Re: ...
            if (!subject) subject = `Re: ${parent.subject}`.slice(0, 200);
            else if (!/^re:/i.test(subject)) subject = `Re: ${subject}`.slice(0, 200);
        }

        if (!subject || !body) return res.status(400).json({ error: 'SUBJECT_AND_BODY_REQUIRED' });
        if (!broadcast && rawIds.length === 0 && !replyToMessageId) return res.status(400).json({ error: 'RECIPIENTS_REQUIRED' });
        if (broadcast === 'ALL' && !BROADCAST_ALL_ROLES.has(String(req.user?.role || ''))) {
            return res.status(403).json({ error: 'BROADCAST_ALL_FORBIDDEN' });
        }

        const senderBranches = userBranches({ branchId: req.user?.branchId, allowedBranches: req.user?.allowedBranches });
        const allUsers = await db.select({
            id: users.id, name: users.name, role: users.role,
            assignedBranchId: users.assignedBranchId, allowedBranches: users.allowedBranches, isActive: users.isActive,
        }).from(users);
        const activeUsers = allUsers.filter((u) => u.isActive !== false && u.id !== senderId);

        const recipientIds = new Set<string>();
        for (const raw of rawIds) {
            const id = String(raw || '').trim();
            if (id && activeUsers.some((u) => u.id === id)) recipientIds.add(id);
        }
        if (broadcast === 'BRANCH') {
            for (const u of activeUsers) {
                const branches = [u.assignedBranchId, ...((u.allowedBranches as string[] | null) || [])].filter(Boolean);
                if (branches.some((b) => senderBranches.includes(String(b)))) recipientIds.add(u.id);
            }
        } else if (broadcast === 'ALL') {
            for (const u of activeUsers) recipientIds.add(u.id);
        }
        // Reply defaults: بدون مستلمين صريحين → الرد على المرسل، والرد على الكل → المرسل + باقي المستلمين
        if (recipientIds.size === 0 && replyParent) {
            if (replyParent.senderId !== senderId) recipientIds.add(replyParent.senderId);
            if (replyAll) {
                for (const id of replyParentRecipients) recipientIds.add(id);
                // لو أنا المرسل الأصلي وبعمل reply-all أضيف الكل ما عدا نفسي
                if (replyParent.senderId === senderId) {
                    for (const id of replyParentRecipients) recipientIds.add(id);
                }
            }
            // لا نسمح بالرد على النفس فقط
            recipientIds.delete(senderId);
        }
        if (recipientIds.size === 0) return res.status(400).json({ error: 'NO_VALID_RECIPIENTS' });

        const messageId = `MAIL-${Date.now()}-${nanoid(6)}`;
        const senderBranch = broadcast === 'ALL' ? null : senderBranches[0] || null;
        await db.transaction(async (tx) => {
            await tx.insert(mailMessages).values({
                id: messageId,
                branchId: senderBranch,
                senderId,
                subject,
                body,
                priority,
                isBroadcast: broadcast !== null,
                broadcastScope: broadcast,
                replyToMessageId: replyToMessageId,
                createdAt: new Date(),
            });
            await tx.insert(mailMessageRecipients).values(
                Array.from(recipientIds).map((userId) => ({
                    messageId, userId,
                    // Explicit flags: never rely on table defaults (older
                    // installs may miss the DEFAULT 0 constraints).
                    isRead: false, isStarred: false, isArchived: false,
                })),
            );
        });
        logger.info({ messageId, senderId, recipientCount: recipientIds.size }, 'mail sent');

        const [sender] = await db.select({ name: users.name }).from(users).where(eq(users.id, senderId)).top(1);
        notifyRecipients(Array.from(recipientIds), {
            messageId, subject, priority, fromName: sender?.name || senderId,
        });
        res.status(201).json({ success: true, id: messageId, recipientCount: recipientIds.size });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /mail/inbox?includeArchived=&limit=
 */
export const getInbox = async (req: Request, res: Response) => {
    try {
        await ensureMailSchema();
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const includeArchived = String(req.query.includeArchived || '').toLowerCase() === 'true';
        const limit = Math.max(1, Math.min(Number(req.query.limit || 100) || 100, 300));

        const rows = await db.select({
            messageId: mailMessages.id,
            subject: mailMessages.subject,
            body: mailMessages.body,
            priority: mailMessages.priority,
            isBroadcast: mailMessages.isBroadcast,
            broadcastScope: mailMessages.broadcastScope,
            replyToMessageId: mailMessages.replyToMessageId,
            senderId: mailMessages.senderId,
            senderName: users.name,
            createdAt: mailMessages.createdAt,
            isRead: mailMessageRecipients.isRead,
            readAt: mailMessageRecipients.readAt,
            isStarred: mailMessageRecipients.isStarred,
            isArchived: mailMessageRecipients.isArchived,
        })
            .from(mailMessageRecipients)
            .innerJoin(mailMessages, eq(mailMessageRecipients.messageId, mailMessages.id))
            .leftJoin(users, eq(users.id, mailMessages.senderId))
            .where(and(
                eq(mailMessageRecipients.userId, userId),
                // NULL-tolerant: legacy rows may predate the DEFAULT 0 backfill.
                includeArchived ? undefined : or(
                    eq(mailMessageRecipients.isArchived, false),
                    isNull(mailMessageRecipients.isArchived),
                ),
            ))
            .orderBy(desc(mailMessages.createdAt))
            .limit(limit);
        logger.debug({ userId, count: rows.length }, 'mail inbox fetched');
        res.json(rows);
    } catch (error: any) {
        return writeDbError(res, error);
    }
};

/**
 * GET /mail/sent — messages I sent with read stats
 */
export const getSent = async (req: Request, res: Response) => {
    try {
        await ensureMailSchema();
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const result = await pool.query(`
            SELECT TOP 100 m.*, u.name AS sender_name,
                (SELECT COUNT(*) FROM mail_message_recipients r WHERE r.message_id = m.id) AS recipient_count,
                (SELECT COUNT(*) FROM mail_message_recipients r WHERE r.message_id = m.id AND r.is_read = 1) AS read_count
            FROM mail_messages m
            LEFT JOIN users u ON u.id = m.sender_id
            WHERE m.sender_id = $1
            ORDER BY m.created_at DESC
        `, [userId]);
        res.json(result.rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /mail/message/:id — full detail + per-recipient read state
 * (sender or a recipient only)
 */
export const getMessage = async (req: Request, res: Response) => {
    try {
        await ensureMailSchema();
        const userId = req.user?.id;
        const id = getStringParam(req.params.id);
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        if (!id) return res.status(400).json({ error: 'MESSAGE_ID_REQUIRED' });

        const [message] = await db.select().from(mailMessages).where(eq(mailMessages.id, id));
        if (!message) return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
        const myRows = await db.select().from(mailMessageRecipients)
            .where(and(eq(mailMessageRecipients.messageId, id), eq(mailMessageRecipients.userId, userId)));
        const isSender = message.senderId === userId;
        if (!isSender && myRows.length === 0) return res.status(403).json({ error: 'FORBIDDEN' });

        const [sender] = await db.select({ name: users.name }).from(users).where(eq(users.id, message.senderId)).top(1);
        let recipients: any[] = [];
        if (isSender) {
            recipients = await db.select({
                userId: mailMessageRecipients.userId,
                userName: users.name,
                isRead: mailMessageRecipients.isRead,
                readAt: mailMessageRecipients.readAt,
            })
                .from(mailMessageRecipients)
                .leftJoin(users, eq(users.id, mailMessageRecipients.userId))
                .where(eq(mailMessageRecipients.messageId, id));
        }
        // Parent (original message) snippet — visible only if user can see parent
        let replyParent: any | null = null;
        if ((message as any).replyToMessageId) {
            const [parent] = await db.select({
                id: mailMessages.id, subject: mailMessages.subject, body: mailMessages.body,
                senderId: mailMessages.senderId, senderName: users.name, createdAt: mailMessages.createdAt,
            }).from(mailMessages).leftJoin(users, eq(users.id, mailMessages.senderId))
                .where(eq(mailMessages.id, (message as any).replyToMessageId));
            if (parent) {
                const parentIsSender = parent.senderId === userId;
                const [parentAccess] = parentIsSender ? [true] : await db.select()
                    .from(mailMessageRecipients)
                    .where(and(eq(mailMessageRecipients.messageId, parent.id), eq(mailMessageRecipients.userId, userId)));
                if (parentIsSender || parentAccess) replyParent = parent;
            }
        }
        // Direct replies visible to me (I sent them or I'm a recipient)
        const replyRows = await db.select({
            id: mailMessages.id, subject: mailMessages.subject, body: mailMessages.body,
            senderId: mailMessages.senderId, senderName: users.name, createdAt: mailMessages.createdAt,
        }).from(mailMessages).leftJoin(users, eq(users.id, mailMessages.senderId))
            .where(eq(mailMessages.replyToMessageId, id))
            .orderBy(mailMessages.createdAt);
        const visibleReplies: any[] = [];
        for (const r of replyRows) {
            if (r.senderId === userId) { visibleReplies.push(r); continue; }
            const [acc] = await db.select().from(mailMessageRecipients)
                .where(and(eq(mailMessageRecipients.messageId, r.id), eq(mailMessageRecipients.userId, userId)));
            if (acc) visibleReplies.push(r);
        }
        res.json({ ...message, senderName: sender?.name || message.senderId, myState: myRows[0] || null, recipients, replyParent, replies: visibleReplies, replyCount: visibleReplies.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

const myRecipientRow = async (messageId: string, userId: string) => {
    const [row] = await db.select().from(mailMessageRecipients)
        .where(and(eq(mailMessageRecipients.messageId, messageId), eq(mailMessageRecipients.userId, userId)));
    return row;
};

/** POST /mail/:id/read */
export const markMailRead = async (req: Request, res: Response) => {
    try {
        await ensureMailSchema();
        const userId = req.user?.id;
        const id = getStringParam(req.params.id);
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const row = await myRecipientRow(id, userId);
        if (!row) return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
        await db.update(mailMessageRecipients)
            .set({ isRead: true, readAt: new Date() })
            .where(eq(mailMessageRecipients.id, row.id));
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** POST /mail/:id/star { starred?: boolean } */
export const toggleMailStar = async (req: Request, res: Response) => {
    try {
        await ensureMailSchema();
        const userId = req.user?.id;
        const id = getStringParam(req.params.id);
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const row = await myRecipientRow(id, userId);
        if (!row) return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
        const starred = req.body?.starred === undefined ? !row.isStarred : Boolean(req.body.starred);
        await db.update(mailMessageRecipients)
            .set({ isStarred: starred })
            .where(eq(mailMessageRecipients.id, row.id));
        res.json({ success: true, starred });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** POST /mail/:id/archive { archived?: boolean } */
export const archiveMail = async (req: Request, res: Response) => {
    try {
        await ensureMailSchema();
        const userId = req.user?.id;
        const id = getStringParam(req.params.id);
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const row = await myRecipientRow(id, userId);
        if (!row) return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
        const archived = req.body?.archived === undefined ? !row.isArchived : Boolean(req.body.archived);
        await db.update(mailMessageRecipients)
            .set({ isArchived: archived })
            .where(eq(mailMessageRecipients.id, row.id));
        res.json({ success: true, archived });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** GET /mail/unread-count */
export const getMailUnreadCount = async (req: Request, res: Response) => {
    try {
        await ensureMailSchema();
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const result = await pool.query(`
            SELECT COUNT(*) AS unread FROM mail_message_recipients
            WHERE user_id = $1 AND (is_read = 0 OR is_read IS NULL) AND (is_archived = 0 OR is_archived IS NULL)
        `, [userId]);
        res.json({ unread: Number(result.rows[0]?.unread || 0) });
    } catch (error: any) {
        return writeDbError(res, error);
    }
};

/**
 * GET /mail/directory — active users for compose.
 * Same-branch users (assigned or allowed); SUPER_ADMIN sees everyone.
 */
export const getMailDirectory = async (req: Request, res: Response) => {
    try {
        await ensureMailSchema();
        const myBranches = userBranches({ branchId: req.user?.branchId, allowedBranches: req.user?.allowedBranches });
        const isSuper = String(req.user?.role || '') === 'SUPER_ADMIN';
        const rows = await db.select({
            id: users.id, name: users.name, role: users.role, assignedBranchId: users.assignedBranchId,
        }).from(users).where(eq(users.isActive, true));
        const list = rows
            .filter((u) => u.id !== req.user?.id)
            .filter((u) => {
                if (isSuper) return true;
                if (u.assignedBranchId && myBranches.includes(u.assignedBranchId)) return true;
                return false;
            })
            .map((u) => ({ id: u.id, name: u.name, role: u.role, branchId: u.assignedBranchId }));
        res.json(list);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** GET /mail/thread/:id — سلسلة الردود: الأصل + الردود المرئية لي */
export const getMailThread = async (req: Request, res: Response) => {
    try {
        await ensureMailSchema();
        const userId = req.user?.id;
        const id = getStringParam(req.params.id);
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        if (!id) return res.status(400).json({ error: 'MESSAGE_ID_REQUIRED' });
        const [anchor] = await db.select().from(mailMessages).where(eq(mailMessages.id, id));
        if (!anchor) return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
        // Walk up to root (max 20 levels)
        let rootId: string = anchor.id;
        const chainUp: string[] = [anchor.id];
        let cursor: any = anchor;
        for (let i = 0; i < 20; i++) {
            const parentId = (cursor as any).replyToMessageId as string | null;
            if (!parentId) break;
            const [parent] = await db.select().from(mailMessages).where(eq(mailMessages.id, parentId));
            if (!parent) break;
            rootId = parent.id;
            chainUp.unshift(parent.id);
            cursor = parent;
        }
        // Collect thread: root + all descendants via BFS on reply_to
        const collected = new Map<string, any>();
        const queue: string[] = [rootId];
        const seen = new Set<string>([rootId]);
        while (queue.length > 0) {
            const currentId = queue.shift()!;
            const [msg] = await db.select().from(mailMessages).where(eq(mailMessages.id, currentId));
            if (!msg) continue;
            const [snd] = await db.select({ name: users.name }).from(users).where(eq(users.id, (msg as any).senderId)).top(1);
            collected.set(currentId, { ...msg, senderName: snd?.name || (msg as any).senderId });
            const children = await db.select({ id: mailMessages.id })
                .from(mailMessages).where(eq(mailMessages.replyToMessageId, currentId));
            for (const c of children) {
                if (!seen.has(c.id)) { seen.add(c.id); queue.push(c.id); }
            }
        }
        // Filter to messages visible to user (sender or recipient)
        const thread: any[] = [];
        for (const msg of collected.values()) {
            if (msg.senderId === userId) { thread.push(msg); continue; }
            const [acc] = await db.select().from(mailMessageRecipients)
                .where(and(eq(mailMessageRecipients.messageId, msg.id), eq(mailMessageRecipients.userId, userId)));
            if (acc) thread.push({ ...msg, myState: acc });
        }
        if (thread.length === 0) return res.status(403).json({ error: 'FORBIDDEN' });
        thread.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        res.json({ rootId, thread });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** DELETE /mail/sent/:id — sender deletes own message (removes for everyone) */
export const deleteSentMail = async (req: Request, res: Response) => {
    try {
        await ensureMailSchema();
        const userId = req.user?.id;
        const id = getStringParam(req.params.id);
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        const [message] = await db.select().from(mailMessages).where(eq(mailMessages.id, id));
        if (!message) return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
        if (message.senderId !== userId && String(req.user?.role || '') !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }
        await db.transaction(async (tx) => {
            await tx.delete(mailMessageRecipients).where(eq(mailMessageRecipients.messageId, id));
            await tx.delete(mailMessages).where(eq(mailMessages.id, id));
        });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
