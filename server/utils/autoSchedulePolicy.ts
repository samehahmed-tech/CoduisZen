import { findShiftConflict } from './schedulingPolicy';

export type AutoScheduleEmployee = { id: string; name?: string | null };
export type AutoScheduleDay = { date: string; requiredHeadcount: number };
export type AutoScheduleTemplate = { id: string; startTime: string; endTime: string; workDays?: string[] | null };
export type ExistingScheduleEntry = { id?: string | number; employeeId: string; date: string | Date; startTime?: string | null; endTime?: string | null };

const weekdayKey = (date: string) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${date}T00:00:00.000Z`).getUTCDay()];

export function buildAutoSchedulePreview(input: {
    days: AutoScheduleDay[];
    employees: AutoScheduleEmployee[];
    template: AutoScheduleTemplate;
    existingEntries?: ExistingScheduleEntry[];
}) {
    const entries: Array<{
        date: string;
        employeeId: string;
        employeeName?: string | null;
        shiftTemplateId: string;
        startTime: string;
        endTime: string;
        status: 'PLANNED';
    }> = [];
    const blockers: Array<{ date: string; reason: string; requiredHeadcount: number; availableEmployees: number }> = [];
    const existing = [...(input.existingEntries || [])];
    let cursor = 0;
    for (const day of input.days) {
        const allowedDays = Array.isArray(input.template.workDays) && input.template.workDays.length
            ? input.template.workDays
            : ['sun', 'mon', 'tue', 'wed', 'thu'];
        if (!allowedDays.includes(weekdayKey(day.date))) continue;
        const required = Math.max(0, Math.ceil(Number(day.requiredHeadcount || 0)));
        if (required === 0) continue;
        if (required > input.employees.length) {
            blockers.push({ date: day.date, reason: 'INSUFFICIENT_ACTIVE_EMPLOYEES', requiredHeadcount: required, availableEmployees: input.employees.length });
            continue;
        }
        let assigned = 0;
        let attempts = 0;
        while (assigned < required && attempts < input.employees.length * 2) {
            const employee = input.employees[(cursor + attempts) % input.employees.length];
            attempts += 1;
            const candidate = { date: day.date, startTime: input.template.startTime, endTime: input.template.endTime };
            const employeeEntries = [...existing, ...entries].filter(item => item.employeeId === employee.id);
            if (findShiftConflict(candidate, employeeEntries)) continue;
            entries.push({ date: day.date, employeeId: employee.id, employeeName: employee.name, shiftTemplateId: input.template.id, startTime: input.template.startTime, endTime: input.template.endTime, status: 'PLANNED' });
            assigned += 1;
        }
        cursor = (cursor + Math.max(1, assigned)) % Math.max(1, input.employees.length);
        if (assigned < required) blockers.push({ date: day.date, reason: 'SHIFT_CONFLICT_OR_REST_CONSTRAINT', requiredHeadcount: required, availableEmployees: input.employees.length });
    }
    return { entries, blockers, readyToPublish: blockers.length === 0 && entries.length > 0 };
}
