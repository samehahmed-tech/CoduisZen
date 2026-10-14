/**
 * Day-close auto-close scheduler: closes every still-open branch business
 * date once the global configured time has passed. Force-close reuses the
 * existing override path (`closeDay` with `autoCloseOpenShifts: true` and a
 * written `overrideReason`); no gate-logic changes. Server-local timezone is
 * authoritative. WhatsApp failure never fails the close. The boot sweep acts
 * as catch-up for downtime covering the configured time and notes that in
 * the override reason.
 */
import { db } from '../db';
import { branches, settings, users } from '../../src/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { dayCloseService, getDayCloseAutoClose, isValidAutoCloseTime } from './dayCloseService';
import { emitBranchEvent } from '../utils/socketEmit';
import { sendWhatsAppText } from './whatsappService';
import logger from '../utils/logger';

const log = logger.child({ service: 'dayCloseAutoClose' });
const POLL_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
const lastRun = new Set<string>();
const MAX_LAST_RUN = 500;

const markLastRun = (key: string) => {
    lastRun.add(key);
    while (lastRun.size > MAX_LAST_RUN) {
        const oldest = lastRun.values().next().value as string | undefined;
        if (oldest === undefined) break;
        lastRun.delete(oldest);
    }
};

/** Test-only reset for the in-memory dedupe guard. No production effect. */
export const clearLastRunForTests = () => { lastRun.clear(); };

const pad2 = (n: number) => String(n).padStart(2, '0');
const localHm = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const localDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const normalizeRecipients = (items: unknown): string[] => (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter((item) => /^\+?\d{10,15}$/.test(item.replace(/[\s()-]/g, '')));

const getWhatsappRecipients = async (): Promise<string[]> => {
    try {
        const [row] = await db.select({ value: settings.value }).from(settings)
            .where(eq(settings.key, 'dayCloseWhatsappRecipients')).top(1);
        return normalizeRecipients((row as any)?.value);
    } catch {
        return [];
    }
};

const findAutoCloseActor = async (): Promise<string | null> => {
    const [admin] = await db.select().from(users)
        .where(and(eq(users.isActive, true), inArray(users.role, ['SUPER_ADMIN', 'OWNER'])))
        .orderBy(asc(users.id)).top(1);
    return admin ? String((admin as any).id) : null;
};

const sendAutoCloseNotification = async (
    branchId: string,
    event: 'day-close:auto' | 'day-close:auto-failure',
    text: string,
    extra: Record<string, unknown>,
) => {
    try {
        emitBranchEvent(branchId, event, { branchId, ...extra });
        const recipients = await getWhatsappRecipients();
        if (recipients.length > 0) {
            await Promise.allSettled(recipients.map((to) => sendWhatsAppText({
                to, text, branchId, sessionRole: 'DAY_CLOSE',
            })));
        }
    } catch (notifyErr: any) {
        log.warn({ err: notifyErr?.message, branchId }, 'day-close auto-close notify failed');
    }
};

export const runAutoCloseOnce = async (
    now = new Date(),
    opts?: { catchUp?: boolean },
): Promise<{ closed: string[]; skipped: string[] }> => {
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
        }).from(branches).where(eq(branches.isActive, true))) as any[];
        const actorId = await findAutoCloseActor();
        if (!actorId) {
            log.error('day-close auto-close skipped: no active SUPER_ADMIN/OWNER user found');
            return { closed: [], skipped: (branchRows || []).map((b) => String((b as any)?.id || '').trim()).filter(Boolean) };
        }
        const closed: string[] = [];
        const skipped: string[] = [];
        const overrideReason = `AUTO_CLOSE scheduled ${cfg.time}${opts?.catchUp ? ' (catch-up)' : ''}`;
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
                if (existing) { markLastRun(key); skipped.push(branchId); continue; }
                // closeDay's own generic WhatsApp is suppressed (notifyWhatsapp: false);
                // the service sends its own AUTO text below so recipients get exactly one.
                await dayCloseService.closeDay(branchId, date, actorId, { autoCloseOpenShifts: true, overrideReason, notifyWhatsapp: false });
                markLastRun(key);
                closed.push(branchId);
                const text = [
                    `Day Close AUTO ${date}`,
                    `Branch: ${branchId}`,
                    `Closed By: ${actorId}`,
                    `Override: ${overrideReason}`,
                ].join('\n');
                await sendAutoCloseNotification(branchId, 'day-close:auto', text, { date, closedBy: actorId, autoClosed: true, overrideReason });
            } catch (err: any) {
                const errText = `${String((err as any)?.code || '')} ${String(err?.message || '')}`;
                if (errText.includes('DAY_ALREADY_CLOSED')) {
                    markLastRun(key);
                    log.info({ branchId, date }, 'day-close auto-close already closed');
                    skipped.push(branchId);
                } else if (errText.includes('BUSINESS_DATE_MISMATCH')) {
                    markLastRun(key);
                    log.info({ branchId, date }, 'day-close auto-close business date moved, skipping');
                    skipped.push(branchId);
                } else {
                    const reason = String(err?.message || errText).trim() || 'UNKNOWN';
                    log.error({ err: reason, branchId, date }, 'day-close auto-close failed');
                    skipped.push(branchId);
                    const text = [
                        `Day Close AUTO FAILED ${date}`,
                        `Branch: ${branchId}`,
                        `Error: ${reason}`,
                    ].join('\n');
                    await sendAutoCloseNotification(branchId, 'day-close:auto-failure', text, { date, error: reason });
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
            runAutoCloseOnce(new Date(), { catchUp: true })
                .catch((err: any) => log.error({ err: err?.message }, 'day-close auto-close boot sweep failed'));
        }, intervalMs);
    },
    runAutoCloseOnce,
};
