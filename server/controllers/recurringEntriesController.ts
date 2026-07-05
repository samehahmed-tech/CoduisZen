/**
 * Recurring Journal Entries Controller
 * Manages templates for automatically generated journal entries on a schedule.
 * Supports: DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY frequencies.
 */

import { Request, Response } from 'express';
import { db } from '../db';
import { settings } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// We store recurring templates in the settings table as JSON
// (until a dedicated table migration is created)
const RECURRING_ENTRIES_KEY = 'finance:recurring_journal_templates';

type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

interface RecurringTemplate {
    id: string;
    name: string;
    description: string;
    debitAccountCode: string;
    creditAccountCode: string;
    amount: number;
    frequency: Frequency;
    dayOfMonth?: number;      // For MONTHLY (1-28)
    dayOfWeek?: number;       // For WEEKLY (0=Sun, 6=Sat)
    startDate: string;        // ISO date
    endDate?: string;         // ISO date (optional)
    lastExecutedAt?: string;  // ISO datetime
    nextExecutionAt?: string; // ISO datetime
    isActive: boolean;
    source: string;
    metadata?: Record<string, any>;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

// ============================================================================
// Helpers
// ============================================================================

async function loadTemplates(): Promise<RecurringTemplate[]> {
    const [row] = await db.select().from(settings).where(eq(settings.key, RECURRING_ENTRIES_KEY)).limit(1);
    const value = row?.value;
    return Array.isArray(value) ? (value as RecurringTemplate[]) : [];
}

async function saveTemplates(templates: RecurringTemplate[]): Promise<void> {
    const [existing] = await db.select().from(settings).where(eq(settings.key, RECURRING_ENTRIES_KEY)).limit(1);
    if (existing) {
        await db.update(settings).set({ value: templates as any, updatedAt: new Date() }).where(eq(settings.key, RECURRING_ENTRIES_KEY));
    } else {
        await db.insert(settings).values({
            key: RECURRING_ENTRIES_KEY,
            value: templates as any,
            updatedAt: new Date(),
        });
    }
}

function computeNextExecution(template: RecurringTemplate): string {
    const now = new Date();
    const lastExec = template.lastExecutedAt ? new Date(template.lastExecutedAt) : new Date(template.startDate);
    let next = new Date(lastExec);

    switch (template.frequency) {
        case 'DAILY':
            next.setDate(next.getDate() + 1);
            break;
        case 'WEEKLY':
            next.setDate(next.getDate() + 7);
            break;
        case 'MONTHLY':
            next.setMonth(next.getMonth() + 1);
            if (template.dayOfMonth) next.setDate(Math.min(template.dayOfMonth, 28));
            break;
        case 'QUARTERLY':
            next.setMonth(next.getMonth() + 3);
            break;
        case 'YEARLY':
            next.setFullYear(next.getFullYear() + 1);
            break;
    }

    // If next is in the past, advance to the next valid occurrence
    while (next < now) {
        switch (template.frequency) {
            case 'DAILY': next.setDate(next.getDate() + 1); break;
            case 'WEEKLY': next.setDate(next.getDate() + 7); break;
            case 'MONTHLY': next.setMonth(next.getMonth() + 1); break;
            case 'QUARTERLY': next.setMonth(next.getMonth() + 3); break;
            case 'YEARLY': next.setFullYear(next.getFullYear() + 1); break;
        }
    }

    return next.toISOString();
}

// ============================================================================
// CRUD Endpoints
// ============================================================================

export const getRecurringTemplates = async (_req: Request, res: Response) => {
    try {
        const templates = await loadTemplates();
        res.json(templates);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createRecurringTemplate = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        if (!body.name || !body.debitAccountCode || !body.creditAccountCode || !body.amount || !body.frequency) {
            return res.status(400).json({ error: 'name, debitAccountCode, creditAccountCode, amount, and frequency are required' });
        }

        const validFrequencies: Frequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];
        if (!validFrequencies.includes(body.frequency)) {
            return res.status(400).json({ error: `frequency must be one of: ${validFrequencies.join(', ')}` });
        }

        const now = new Date().toISOString();
        const template: RecurringTemplate = {
            id: nanoid(12),
            name: body.name,
            description: body.description || '',
            debitAccountCode: body.debitAccountCode,
            creditAccountCode: body.creditAccountCode,
            amount: Number(body.amount),
            frequency: body.frequency,
            dayOfMonth: body.dayOfMonth ? Number(body.dayOfMonth) : undefined,
            dayOfWeek: body.dayOfWeek !== undefined ? Number(body.dayOfWeek) : undefined,
            startDate: body.startDate || now.split('T')[0],
            endDate: body.endDate || undefined,
            isActive: body.isActive !== false,
            source: body.source || 'RECURRING',
            metadata: body.metadata,
            createdBy: req.user?.id || 'system',
            createdAt: now,
            updatedAt: now,
        };

        template.nextExecutionAt = computeNextExecution(template);

        const templates = await loadTemplates();
        templates.push(template);
        await saveTemplates(templates);

        res.status(201).json(template);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateRecurringTemplate = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '');
        if (!id) return res.status(400).json({ error: 'Template ID is required' });

        const templates = await loadTemplates();
        const idx = templates.findIndex(t => t.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Template not found' });

        const body = req.body || {};
        const existing = templates[idx];

        if (body.name !== undefined) existing.name = body.name;
        if (body.description !== undefined) existing.description = body.description;
        if (body.debitAccountCode !== undefined) existing.debitAccountCode = body.debitAccountCode;
        if (body.creditAccountCode !== undefined) existing.creditAccountCode = body.creditAccountCode;
        if (body.amount !== undefined) existing.amount = Number(body.amount);
        if (body.frequency !== undefined) existing.frequency = body.frequency;
        if (body.dayOfMonth !== undefined) existing.dayOfMonth = Number(body.dayOfMonth);
        if (body.dayOfWeek !== undefined) existing.dayOfWeek = Number(body.dayOfWeek);
        if (body.startDate !== undefined) existing.startDate = body.startDate;
        if (body.endDate !== undefined) existing.endDate = body.endDate;
        if (body.isActive !== undefined) existing.isActive = body.isActive;
        if (body.metadata !== undefined) existing.metadata = body.metadata;
        existing.updatedAt = new Date().toISOString();

        // Recompute next execution
        existing.nextExecutionAt = computeNextExecution(existing);
        templates[idx] = existing;
        await saveTemplates(templates);

        res.json(existing);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteRecurringTemplate = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '');
        if (!id) return res.status(400).json({ error: 'Template ID is required' });

        const templates = await loadTemplates();
        const filtered = templates.filter(t => t.id !== id);
        if (filtered.length === templates.length) return res.status(404).json({ error: 'Template not found' });

        await saveTemplates(filtered);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================================================
// Execution: Process Due Recurring Entries
// ============================================================================

export const processDueRecurringEntries = async (req: Request, res: Response) => {
    try {
        // Dynamic import to avoid circular dependency
        const { GLService } = await import('../services/glService');

        const templates = await loadTemplates();
        const now = new Date();
        const results: { id: string; name: string; status: 'success' | 'skipped' | 'error'; error?: string }[] = [];

        for (const template of templates) {
            if (!template.isActive) {
                results.push({ id: template.id, name: template.name, status: 'skipped', error: 'Inactive' });
                continue;
            }
            if (template.endDate && new Date(template.endDate) < now) {
                results.push({ id: template.id, name: template.name, status: 'skipped', error: 'Past end date' });
                continue;
            }
            if (template.nextExecutionAt && new Date(template.nextExecutionAt) > now) {
                results.push({ id: template.id, name: template.name, status: 'skipped', error: 'Not yet due' });
                continue;
            }

            try {
                await GLService.postJournalEntry({
                    reference: `REC-${template.id}-${now.toISOString().slice(0, 10)}`,
                    referenceType: 'MANUAL',
                    description: `[Recurring] ${template.name}`,
                    createdBy: template.createdBy,
                    lines: [
                        { accountCode: template.debitAccountCode, debit: template.amount, credit: 0 },
                        { accountCode: template.creditAccountCode, debit: 0, credit: template.amount }
                    ]
                });

                template.lastExecutedAt = now.toISOString();
                template.nextExecutionAt = computeNextExecution(template);
                results.push({ id: template.id, name: template.name, status: 'success' });
            } catch (e: any) {
                results.push({ id: template.id, name: template.name, status: 'error', error: e.message });
            }
        }

        await saveTemplates(templates);

        res.json({
            processed: results.length,
            successful: results.filter(r => r.status === 'success').length,
            skipped: results.filter(r => r.status === 'skipped').length,
            errors: results.filter(r => r.status === 'error').length,
            details: results,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
