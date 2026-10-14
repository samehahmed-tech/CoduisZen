/**
 * Day-close auto-close scheduler: closes every still-open branch business
 * date once the global configured time has passed. Force-close reuses the
 * existing override path (`closeDay` with `autoCloseOpenShifts: true` and a
 * written `overrideReason`); no gate-logic changes. Server-local timezone is
 * authoritative. WhatsApp failure never fails the close.
 */
import { db } from '../db';
import { branches, settings, users } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { dayCloseService, getDayCloseAutoClose, isValidAutoCloseTime } from './dayCloseService';
import { emitBranchEvent } from '../utils/socketEmit';
import { sendWhatsAppText } from './whatsappService';
import logger from '../utils/logger';

const log = logger.child({ service: 'dayCloseAutoClose' });
const POLL_MS = 60_000;
const BOOT_DELAY_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
const lastRun = new Set<string>();

const pad2 = (n: number) => String(n).padStart(2, '0');
const localHm = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const localDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const normalizeRecipients = (items: unknown): string[] => (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter((item) => /^\+?\d{10,15}$/.test(item.replace(/[\s()-]/g, '')));

const getWhatsappRecipients = async (): Promise<string[]> => {
    try {
        const [row] = await db.select({ value: settings.value }).top(1).from(settings)
            .where(eq(settings.key, 'dayCloseWhatsappRecipients'));
        return normalizeRecipients((row as any)?.value);
    } catch {
        return [];
    }
};

const findAutoCloseActor = async (): Promise<string | null> => {
    const rows = await db.select().from(users);
    const admin = (rows as any[]).find((u) => u
        && (u as any).isActive === true
        && ['SUPER_ADMIN', 'OWNER'].includes(String((u as any).role)));
    return admin ? String((admin as any).id) : null;
};

export const runAutoCloseOnce = async (now = new Date()): Promise<{ closed: string[]; skipped: string[] }> => {
    if (running) return { closed: [], skipped: [] };
    running = true;
    try {
        const cfg = await getDayCloseAutoClose();
        if (!cfg.enabled || !isValidAutoCloseTime(cfg.time)) return { closed: [], skipped: [] };
        if (localHm(now) < cfg.time) return { closed: [], skipped: [] };
        if (process.env.NODE_ENV !== 'production') log.info({ time: cfg.time }, 'day-close auto-close tick (non-production)');
        const branchRows = (await db.select({
            id: branches.id,
            businessDate: branches.businessDate,
        }).from(branches)) as any[];
        const actorId = await findAutoCloseActor();
        if (!actorId) {
            log.error('day-close auto-close skipped: no active SUPER_ADMIN/OWNER user found');
            return { closed: [], skipped: [] };
        }
        const closed: string[] = [];
        const skipped: string[] = [];
        const overrideReason = `AUTO_CLOSE scheduled ${cfg.time}`;
        for (const b of branchRows || []) {
            const branchId = String((b as any)?.id || '').trim();
            if (!branchId) continue;
            const date = (b as any)?.businessDate
                ? String((b as any).businessDate).slice(0, 10)
                : localDateKey(now);
            const key = `${branchId}:${date}`;
            try {
                if (lastRun.has(key)) { skipped.push(branchId); continue; }
                const existing = await dayCloseService.getClosedReport(branchId, date);
                if (existing) { lastRun.add(key); skipped.push(branchId); continue; }
                await dayCloseService.closeDay(branchId, date, actorId, { autoCloseOpenShifts: true, overrideReason });
                lastRun.add(key);
                closed.push(branchId);
                try {
                    emitBranchEvent(branchId, 'day-close:auto', { branchId, date, closedBy: actorId, autoClosed: true, overrideReason });
                    const recipients = await getWhatsappRecipients();
                    if (recipients.length > 0) {
                        const text = [
                            `Day Close AUTO ${date}`,
                            `Branch: ${branchId}`,
                            `Closed By: ${actorId}`,
                            `Override: ${overrideReason}`,
                        ].join('\n');
                        await Promise.allSettled(recipients.map((to) => sendWhatsAppText({
                            to, text, branchId, sessionRole: 'DAY_CLOSE',
                        })));
                    }
                } catch (notifyErr: any) {
                    log.warn({ err: notifyErr?.message, branchId, date }, 'day-close auto-close notify failed');
                }
            } catch (err: any) {
                const code = String(err?.message || '');
                if (code === 'DAY_ALREADY_CLOSED') {
                    lastRun.add(key);
                    log.info({ branchId, date }, 'day-close auto-close already closed');
                    skipped.push(branchId);
                } else if (code === 'BUSINESS_DATE_MISMATCH') {
                    log.info({ branchId, date }, 'day-close auto-close business date moved, skipping');
                    skipped.push(branchId);
                } else {
                    log.error({ err: code, branchId, date }, 'day-close auto-close failed');
                    skipped.push(branchId);
                }
            }
        }
        return { closed, skipped };
    } finally {
        running = false;
    }
};

export const dayCloseAutoCloseService = {
    start: (intervalMs: number = POLL_MS) => {
        if (timer) return;
        timer = setInterval(() => {
            runAutoCloseOnce().catch((err: any) => log.error({ err: err?.message }, 'day-close auto-close tick failed'));
        }, intervalMs);
        if (typeof (timer as any).unref === 'function') (timer as any).unref();
        // Catch-up shortly after boot: a downtime covering the configured
        // time still closes open branches via the same code path.
        setTimeout(() => {
            runAutoCloseOnce().catch((err: any) => log.error({ err: err?.message }, 'day-close auto-close boot sweep failed'));
        }, BOOT_DELAY_MS);
    },
    runAutoCloseOnce,
};
