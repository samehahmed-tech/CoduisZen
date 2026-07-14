import { Request, Response } from 'express';
import { dayCloseService } from '../services/dayCloseService';
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

        const [report, fiscalHealth, financeHealth, sideEffectHealth, readiness] = await Promise.all([
            dayCloseService.generateReport(branchId, date),
            dayCloseService.getFiscalHealth(branchId, date),
            dayCloseService.getFinanceHealth(branchId, date),
            dayCloseService.getSideEffectHealth(branchId, date),
            dayCloseService.getCloseReadiness(branchId, date),
        ]);
        res.json({ ...report, fiscalHealth, financeHealth, sideEffectHealth, readiness });
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
        const pdf = await generateDayClosePDF(report, lang);
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
    const [closedReport, liveReport] = await Promise.all([
        dayCloseService.getClosedReport(branchId, date),
        dayCloseService.generateReport(branchId, date),
    ]);
    const report = closedReport
        ? {
            ...closedReport,
            currency: closedReport.currency || liveReport.currency,
            financeSummary: closedReport.financeSummary || liveReport.financeSummary,
        }
        : liveReport;
    if (!report.fiscalHealth) report.fiscalHealth = await dayCloseService.getFiscalHealth(branchId, date);
    if (!report.financeHealth) report.financeHealth = await dayCloseService.getFinanceHealth(branchId, date);
    if (!report.sideEffectHealth) report.sideEffectHealth = await dayCloseService.getSideEffectHealth(branchId, date);
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
        res.status(500).json({ error: error.message });
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
