import { Request, Response } from 'express';
import { dayCloseService, isValidDateKey } from '../services/dayCloseService';
import { generateDayClosePDF, generateDayCloseXlsx } from '../services/pdfService';

/**
 * Get day close report preview
 * GET /api/day-close/:branchId/:date
 */
export const getDayCloseReport = async (req: Request, res: Response) => {
    try {
        const branchId = req.params.branchId as string;
        const date = req.params.date as string;

        if (!branchId || !date) {
            return res.status(400).json({
                error: 'BRANCH_ID_AND_DATE_REQUIRED',
                message: 'Please provide branch and date',
            });
        }

        const closedReport = await dayCloseService.getClosedReport(branchId, date);
        if (closedReport) return res.json(closedReport);

        const [report, fiscalHealth, financeHealth, sideEffectHealth, readiness, shiftCashSummary] = await Promise.all([
            dayCloseService.generateReport(branchId, date),
            dayCloseService.getFiscalHealth(branchId, date),
            dayCloseService.getFinanceHealth(branchId, date),
            dayCloseService.getSideEffectHealth(branchId, date),
            dayCloseService.getCloseReadiness(branchId, date),
            dayCloseService.getShiftCashSummary(branchId, date),
        ]);
        res.json({ ...report, fiscalHealth, financeHealth, sideEffectHealth, readiness, shiftCashSummary });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Download printable day close PDF
 * GET /api/day-close/:branchId/:date/pdf
 */
export const downloadDayClosePdf = async (req: Request, res: Response) => {
    try {
        const branchId = req.params.branchId as string;
        const date = req.params.date as string;

        if (!branchId || !date) {
            return res.status(400).json({
                error: 'BRANCH_ID_AND_DATE_REQUIRED',
                message: 'Please provide branch and date',
            });
        }

        const report = await buildExportReport(branchId, date);
        const lang = req.query.lang === 'en' ? 'en' : 'ar';
        const paper = req.query.paper === '80mm' ? '80mm' : 'a4';
        const pdf = await generateDayClosePDF(report, lang, paper);
        const safeName = `CoduisZen-DayClose-${branchId}-${date}.pdf`.replace(/[^\w.-]+/g, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
        res.send(pdf);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const downloadDayCloseXlsx = async (req: Request, res: Response) => {
    try {
        const branchId = req.params.branchId as string;
        const date = req.params.date as string;
        if (!branchId || !date) {
            return res.status(400).json({
                error: 'BRANCH_ID_AND_DATE_REQUIRED',
                message: 'Please provide branch and date',
            });
        }

        const report = await buildExportReport(branchId, date);
        const lang = req.query.lang === 'en' ? 'en' : 'ar';
        const xlsx = await generateDayCloseXlsx(report, lang);
        const safeName = `CoduisZen-DayClose-${branchId}-${date}.xlsx`.replace(/[^\w.-]+/g, '_');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        res.send(xlsx);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

const buildExportReport = async (branchId: string, date: string) => {
    const closedReport = await dayCloseService.getClosedReport(branchId, date);
    const report = closedReport || await dayCloseService.generateReport(branchId, date);
    if (!report.fiscalHealth) report.fiscalHealth = await dayCloseService.getFiscalHealth(branchId, date);
    if (!report.financeHealth) report.financeHealth = await dayCloseService.getFinanceHealth(branchId, date);
    if (!report.sideEffectHealth) report.sideEffectHealth = await dayCloseService.getSideEffectHealth(branchId, date);
    if (!(report as any).shiftCashSummary) {
        const closedShifts = (report as any).closedSnapshot?.shifts;
        (report as any).shiftCashSummary = closedShifts?.expectedCash !== undefined
            ? { expectedCash: Number(closedShifts.expectedCash || 0), actualCash: Number(closedShifts.actualCash || 0), variance: Number(closedShifts.variance ?? 0) }
            : await dayCloseService.getShiftCashSummary(branchId, date);
    }
    return report;
};

/**
 * Close the day for a branch
 * POST /api/day-close/:branchId/:date/close
 */
export const closeDay = async (req: Request, res: Response) => {
    try {
        const branchId = req.params.branchId as string;
        const date = req.params.date as string;
        const userId = (req as any).user?.id || req.body.userId;
        const {
            emailConfig,
            notes,
            enforceShiftsClosed,
            autoCloseOpenShifts,
            overrideReason,
        } = req.body;

        if (!branchId || !date) {
            return res.status(400).json({
                error: 'BRANCH_ID_AND_DATE_REQUIRED',
                message: 'Please provide branch and date',
            });
        }

        if (!userId) {
            return res.status(401).json({
                error: 'USER_ID_REQUIRED',
                message: 'Authentication required',
            });
        }

        const report = await dayCloseService.closeDay(branchId, date, userId, {
            emailConfig,
            notes,
            enforceShiftsClosed: Boolean(enforceShiftsClosed),
            autoCloseOpenShifts: Boolean(autoCloseOpenShifts),
            overrideReason,
        });

        res.json({
            success: true,
            message: 'Day closed successfully',
            report,
        });
    } catch (error: any) {
        if (error?.message === 'FISCAL_NOT_CLEAN_FOR_DAY_CLOSE') {
            return res.status(409).json({
                error: error.message,
                message: 'Cannot close day while pending/failed fiscal submissions exist',
            });
        }
        if (error?.message === 'DAY_CLOSE_BLOCKED') {
            return res.status(409).json({
                error: error.message,
                message: 'Day close is blocked until required checks are cleared',
                blockedReasons: error.blockedReasons || [],
                details: {
                    blockedReasons: error.blockedReasons || [],
                    rules: (error as any).rules,
                },
            });
        }
        if (error?.message === 'DAY_CLOSE_OVERRIDE_DISABLED') {
            return res.status(403).json({
                error: error.message,
                message: 'Manager override is disabled in day-close settings',
                blockedReasons: error.blockedReasons || [],
                details: {
                    blockedReasons: error.blockedReasons || [],
                },
            });
        }
        if (error?.message === 'DAY_ALREADY_CLOSED') {
            return res.status(409).json({
                error: error.message,
                message: 'This branch day is already closed',
                report: error.closedReport,
                details: {
                    blockedReasons: ['DAY_ALREADY_CLOSED'],
                },
            });
        }
        if (error?.message === 'BUSINESS_DATE_MISMATCH') {
            return res.status(409).json({
                error: error.message,
                message: 'Close the active business date or change it explicitly first',
                businessDate: error.businessDate,
            });
        }
        res.status(500).json({ error: error.message });
    }
};

export const updateBusinessDate = async (req: Request, res: Response) => {
    try {
        const branchId = req.params.branchId as string;
        const userId = req.user?.id;
        const businessDate = String(req.body?.businessDate || '').trim();
        if (!branchId || !businessDate) return res.status(400).json({ error: 'BRANCH_ID_AND_DATE_REQUIRED' });
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

        const updated = await dayCloseService.setBusinessDate(branchId, businessDate, userId);
        res.json({ success: true, ...updated });
    } catch (error: any) {
        const code = String(error?.message || 'BUSINESS_DATE_UPDATE_FAILED');
        if (code === 'INVALID_BUSINESS_DATE' || code === 'FUTURE_BUSINESS_DATE_NOT_ALLOWED') {
            return res.status(400).json({ error: code });
        }
        if (code === 'BRANCH_NOT_FOUND') return res.status(404).json({ error: code });
        if (code === 'OPEN_SHIFTS_EXIST_FOR_BUSINESS_DATE_CHANGE' || code === 'BUSINESS_DATE_ALREADY_CLOSED') {
            return res.status(409).json({ error: code });
        }
        res.status(500).json({ error: code });
    }
};

/**
 * Reopen a wrongly-closed business day (undo close).
 * POST /api/day-close/:branchId/:date/reopen
 * Manager-only (route gate). Requires a written reason.
 */
export const reopenDay = async (req: Request, res: Response) => {
    try {
        const branchId = req.params.branchId as string;
        const date = req.params.date as string;
        const userId = req.user?.id;
        const reason = String(req.body?.reason || '').trim();
        if (!branchId || !date) return res.status(400).json({ error: 'BRANCH_ID_AND_DATE_REQUIRED' });
        if (!userId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
        if (reason.length < 3) return res.status(400).json({ error: 'REOPEN_REASON_REQUIRED' });

        const result = await dayCloseService.reopenDay(branchId, date, userId, reason);
        res.json({ success: true, message: 'Business day reopened', ...result });
    } catch (error: any) {
        const code = String(error?.message || 'DAY_REOPEN_FAILED');
        if (code === 'INVALID_BUSINESS_DATE' || code === 'REOPEN_REASON_REQUIRED') return res.status(400).json({ error: code });
        if (code === 'DAY_NOT_CLOSED' || code === 'BRANCH_NOT_FOUND') return res.status(404).json({ error: code });
        res.status(500).json({ error: code });
    }
};

/**
 * Auto-close status for the DayCloseHub result banner.
 * GET /api/day-close/:branchId/auto-close-status?date=YYYY-MM-DD
 * Reads the latest DAY_CLOSED audit row (override reason + overridden
 * blocker codes); nulls when the day was never closed.
 */
export const getAutoCloseStatus = async (req: Request, res: Response) => {
    try {
        const branchId = req.params.branchId as string;
        const date = String(req.query.date || '');
        if (!branchId || !date) {
            return res.status(400).json({
                error: 'BRANCH_ID_AND_DATE_REQUIRED',
                message: 'Please provide branch and date',
            });
        }
        if (!isValidDateKey(date)) return res.status(400).json({ error: 'INVALID_BUSINESS_DATE' });
        const status = await dayCloseService.getAutoCloseStatus(branchId, date);
        res.json(status || { overrideReason: null, blockedReasons: [], closedBy: null, closedAt: null });
    } catch (error: any) {
        const code = String(error?.message || 'AUTO_CLOSE_STATUS_FAILED');
        res.status(500).json({ error: code });
    }
};

/**
 * Get day close history
 * GET /api/day-close/:branchId/history
 */
export const getDayCloseHistory = async (req: Request, res: Response) => {
    try {
        const branchId = req.params.branchId as string;
        const limit = parseInt(req.query.limit as string) || 30;

        if (!branchId) {
            return res.status(400).json({
                error: 'BRANCH_ID_REQUIRED',
                message: 'Please provide branch ID',
            });
        }

        const history = await dayCloseService.getCloseHistory(branchId, limit);
        res.json(history);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Send day close email manually
 * POST /api/day-close/:branchId/:date/send-email
 */
export const sendDayCloseEmail = async (req: Request, res: Response) => {
    try {
        const branchId = req.params.branchId as string;
        const date = req.params.date as string;
        const { emailConfig } = req.body;

        if (!branchId || !date) {
            return res.status(400).json({
                error: 'BRANCH_ID_AND_DATE_REQUIRED',
                message: 'Please provide branch and date',
            });
        }

        if (!emailConfig || !emailConfig.to || !emailConfig.to.length) {
            return res.status(400).json({
                error: 'EMAIL_CONFIG_REQUIRED',
                message: 'Please provide email config',
            });
        }

        const report = await dayCloseService.generateReport(branchId, date);
        report.fiscalHealth = await dayCloseService.getFiscalHealth(branchId, date);
        const result = await dayCloseService.sendDayCloseEmail(report, emailConfig);

        res.json({
            success: result.sent,
            message: result.sent ? 'Email sent' : 'Email failed',
            ...result,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
