import { Request, Response } from 'express';
import { db } from '../db';
import { employees, attendance, departments, jobTitles, payrollCycles, payrollPayouts, users } from '../../src/db/schema';
import { count, desc, eq, and, gte, lte, or, sql, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';
import { GLService } from '../services/glService';

const likeSearch = (column: any, search: string) => sql`LOWER(${column}) LIKE ${`%${search.toLowerCase()}%`}`;

const employeeInputError = (message: string) => Object.assign(new Error(message), { status: 400 });

const validateEmployeeInput = async (data: any, branchId: string, creating: boolean) => {
    if (creating && !String(data.name || '').trim()) throw employeeInputError('EMPLOYEE_NAME_REQUIRED');
    for (const value of [data.basicSalary ?? data.salary, data.hourlyRate]) {
        if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
            throw employeeInputError('INVALID_EMPLOYEE_COMPENSATION');
        }
    }
    const joinedAt = data.joinedAt ?? data.employmentDate;
    if (joinedAt && Number.isNaN(new Date(joinedAt).getTime())) throw employeeInputError('INVALID_EMPLOYMENT_DATE');

    const departmentId = data.departmentId ?? data.department_id;
    const jobTitleId = data.jobTitleId ?? data.job_title_id;
    const [department] = departmentId
        ? await db.select().from(departments).where(eq(departments.id, String(departmentId))).limit(1)
        : [];
    if (departmentId && (!department || (department.branchId && department.branchId !== branchId))) {
        throw employeeInputError('INVALID_EMPLOYEE_DEPARTMENT');
    }
    const [jobTitle] = jobTitleId
        ? await db.select().from(jobTitles).where(eq(jobTitles.id, String(jobTitleId))).limit(1)
        : [];
    if (jobTitleId && (!jobTitle || (jobTitle.departmentId && jobTitle.departmentId !== departmentId))) {
        throw employeeInputError('INVALID_EMPLOYEE_JOB_TITLE');
    }

    // Identity uniqueness: national id, employee/attendance codes, email and
    // phone must not collide with another employee record.
    const selfId = data.id ? String(data.id) : null;
    const uniqueChecks: Array<{ column: any; value: unknown; code: string }> = [
        { column: employees.nationalId, value: data.nationalId, code: 'DUPLICATE_NATIONAL_ID' },
        { column: employees.employeeCode, value: data.employeeCode, code: 'DUPLICATE_EMPLOYEE_CODE' },
        { column: employees.attendanceCode, value: data.attendanceCode, code: 'DUPLICATE_ATTENDANCE_CODE' },
        { column: employees.email, value: data.email, code: 'DUPLICATE_EMPLOYEE_EMAIL' },
        { column: employees.phone, value: data.phone, code: 'DUPLICATE_EMPLOYEE_PHONE' },
    ];
    for (const check of uniqueChecks) {
        const value = String(check.value || '').trim();
        if (!value) continue;
        const [clash] = await db.select({ id: employees.id }).from(employees)
            .where(eq(check.column, value)).limit(1);
        if (clash && String(clash.id) !== selfId) {
            throw employeeInputError(check.code);
        }
    }
};

// ============================================================================
// Employees
// ============================================================================

export const getEmployees = async (req: Request, res: Response) => {
    try {
        const branchId = req.effectiveBranchId;
        const search = req.query.q ? String(req.query.q).trim() : '';
        const paged = req.query.paged === 'true' || req.query.limit !== undefined || req.query.offset !== undefined;
        const limit = Math.min(Math.max(Number(req.query.limit || 250), 1), 500);
        const offset = Math.max(Number(req.query.offset || 0), 0);
        const conditions = [
            eq(employees.isActive, true),
            branchId ? eq(employees.branchId, branchId) : undefined,
            search ? or(
                likeSearch(employees.name, search),
                likeSearch(employees.employeeCode, search),
                likeSearch(employees.attendanceCode, search),
                likeSearch(employees.phone, search),
                likeSearch(employees.email, search),
            ) : undefined,
        ].filter(Boolean) as any[];
        const where = and(...conditions);

        const [totalRow] = await db.select({ value: count() }).from(employees).where(where);
        const result = await db.select().from(employees)
            .where(where)
            .orderBy(desc(employees.createdAt))
            .offset(paged ? offset : 0).fetch(paged ? limit : 5000);

        if (paged) {
            return res.json({
                items: result,
                total: Number(totalRow?.value || 0),
                limit,
                offset,
                hasMore: offset + result.length < Number(totalRow?.value || 0),
            });
        }
        res.json(result);
    } catch (error: any) {
        logger.error({ err: error }, 'Error fetching employees');
        res.status(500).json({ error: 'Failed to fetch employees' });
    }
};

export const upsertEmployee = async (req: Request, res: Response) => {
    try {
        const data = req.body;
        const existingEmployee = data.id
            ? await db.query.employees.findFirst({ where: eq(employees.id, data.id) })
            : null;

        if (existingEmployee && req.effectiveBranchId && existingEmployee.branchId !== req.effectiveBranchId) {
            return res.status(403).json({ error: 'FORBIDDEN_BRANCH_ACCESS' });
        }
        const targetBranchId = req.effectiveBranchId || data.branchId || existingEmployee?.branchId;
        if (!targetBranchId) return res.status(400).json({ error: 'Branch is required' });
        await validateEmployeeInput(existingEmployee ? { ...existingEmployee, ...data } : data, targetBranchId, !existingEmployee);

        if (existingEmployee) {
            const employeeCode = data.employeeCode ?? data.employee_code ?? existingEmployee.employeeCode;
            const attendanceCode = data.attendanceCode ?? data.attendance_code ?? data.employeeCode ?? data.employee_code ?? existingEmployee.attendanceCode;
            const departmentId = data.departmentId ?? data.department_id ?? existingEmployee.departmentId;
            const jobTitleId = data.jobTitleId ?? data.job_title_id ?? existingEmployee.jobTitleId;
            const [updated] = await db.update(employees)
                .set({
                    name: data.name || existingEmployee.name,
                    branchId: targetBranchId,
                    role: data.role || existingEmployee.role || 'STAFF',
                    departmentId: departmentId || null,
                    jobTitleId: jobTitleId || null,
                    basicSalary: data.basicSalary ?? data.salary ?? existingEmployee.basicSalary ?? 0,
                    hourlyRate: data.hourlyRate ?? existingEmployee.hourlyRate ?? 0,
                    phone: data.phone ?? existingEmployee.phone,
                    email: data.email ?? existingEmployee.email,
                    nationalId: data.nationalId ?? existingEmployee.nationalId,
                    emergencyContact: data.emergencyContact ?? data.emergency_contact ?? existingEmployee.emergencyContact,
                    bankAccount: data.bankAccount ?? data.bank_account ?? existingEmployee.bankAccount,
                    employeeCode: employeeCode || null,
                    attendanceCode: attendanceCode || null,
                    joinedAt: data.joinedAt ? new Date(data.joinedAt) : data.employmentDate ? new Date(data.employmentDate) : undefined,
                    updatedAt: new Date(),
                })
                .output()
                .where(eq(employees.id, data.id));
            if (existingEmployee.userId && targetBranchId && targetBranchId !== existingEmployee.branchId) {
                await db.update(users)
                    .set({
                        assignedBranchId: targetBranchId,
                        allowedBranches: [targetBranchId],
                        updatedAt: new Date(),
                    })
                    .where(eq(users.id, existingEmployee.userId));
            }
            res.json(updated[0]);
        } else {
            const id = data.id || nanoid();
            const createdRows = await db.insert(employees).output().values({
                    id: id,
                    branchId: targetBranchId,
                    name: data.name,
                    role: data.role || 'STAFF',
                    departmentId: data.departmentId || data.department_id || null,
                    jobTitleId: data.jobTitleId || data.job_title_id || null,
                    basicSalary: data.basicSalary || data.salary || 0,
                    hourlyRate: data.hourlyRate || 0,
                    phone: data.phone,
                    email: data.email,
                    nationalId: data.nationalId,
                    emergencyContact: data.emergencyContact || data.emergency_contact || null,
                    bankAccount: data.bankAccount || data.bank_account || null,
                    employeeCode: data.employeeCode || data.employee_code,
                    attendanceCode: data.attendanceCode || data.attendance_code || data.employeeCode || data.employee_code,
                    joinedAt: data.joinedAt ? new Date(data.joinedAt) : data.employmentDate ? new Date(data.employmentDate) : new Date(),
                }) as any[];
            const created = createdRows[0];
            res.json(created);
        }
    } catch (error: any) {
        logger.error({ err: error }, 'Error upserting employee');
        res.status(error?.status || 500).json({ error: error?.status ? error.message : 'Failed to save employee' });
    }
};

export const deleteEmployee = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id);
        const [existing] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
        if (!existing) return res.status(404).json({ error: 'EMPLOYEE_NOT_FOUND' });
        if (req.effectiveBranchId && existing.branchId !== req.effectiveBranchId) {
            return res.status(403).json({ error: 'FORBIDDEN_BRANCH_ACCESS' });
        }

        await db.transaction(async (tx: any) => {
            await tx.update(attendance)
                .set({ clockOut: new Date(), status: 'AUTO_CLOSED' })
                .where(and(
                    eq(attendance.employeeId, id),
                    sql`${attendance.clockOut} IS NULL`,
                ));
            await tx.update(employees)
                .set({ isActive: false, updatedAt: new Date() })
                .where(eq(employees.id, id));
            if (existing.userId) {
                await tx.update(users)
                    .set({ isActive: false, updatedAt: new Date() })
                    .where(eq(users.id, existing.userId));
            }
        });

        res.json({ success: true, id });
    } catch (error: any) {
        logger.error({ err: error }, 'Error deleting employee');
        res.status(500).json({ error: 'Failed to delete employee' });
    }
};

// ============================================================================
// Attendance
// ============================================================================

export const getAttendance = async (req: Request, res: Response) => {
    try {
        const { employeeId } = req.query;
        const branchId = req.effectiveBranchId;
        let conditions = [];
        if (employeeId) conditions.push(eq(attendance.employeeId, employeeId as string));
        if (branchId) conditions.push(eq(attendance.branchId, branchId as string));

        const result = await db.query.attendance.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            orderBy: (attendance, { desc }) => [desc(attendance.clockIn)],
            limit: 100,
        });
        res.json(result);
    } catch (error: any) {
        logger.error({ err: error }, 'Error fetching attendance');
        res.status(500).json({ error: 'Failed to fetch attendance' });
    }
};

export const clockIn = async (req: Request, res: Response) => {
    try {
        const { employeeId, branchId } = req.body;
        const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
        if (!emp) return res.status(404).json({ error: 'Employee not found' });
        const actualBranchId = req.effectiveBranchId || branchId || emp.branchId;
        if (!actualBranchId || emp.branchId !== actualBranchId) {
            return res.status(403).json({ error: 'FORBIDDEN_BRANCH_ACCESS' });
        }
        if (emp.isActive === false) {
            return res.status(403).json({ error: 'EMPLOYEE_INACTIVE' });
        }
        // No duplicate open sessions: one active punch per employee.
        const openRecord = await db.query.attendance.findFirst({
            where: and(
                eq(attendance.employeeId, employeeId),
                sql`${attendance.clockOut} IS NULL`,
            ),
            orderBy: (attendance, { desc }) => [desc(attendance.clockIn)],
        });
        if (openRecord) {
            return res.status(409).json({ error: 'ALREADY_CLOCKED_IN', code: 'ALREADY_CLOCKED_IN', openSince: openRecord.clockIn });
        }

        const [record] = await db.insert(attendance).output().values({
                id: nanoid(),
                employeeId,
                branchId: actualBranchId,
                clockIn: new Date(),
                status: 'PRESENT',
            });
        res.json(record);
    } catch (error: any) {
        logger.error({ err: error }, 'Error clocking in');
        res.status(500).json({ error: 'Failed to clock in' });
    }
};

export const clockOut = async (req: Request, res: Response) => {
    try {
        const { employeeId } = req.body;

        // Find latest open attendance record
        const openConditions = [
                eq(attendance.employeeId, employeeId),
                sql`${attendance.clockOut} IS NULL`,
                req.effectiveBranchId ? eq(attendance.branchId, req.effectiveBranchId) : undefined,
        ].filter(Boolean) as any[];
        const openRecord = await db.query.attendance.findFirst({
            where: and(...openConditions),
            orderBy: (attendance, { desc }) => [desc(attendance.clockIn)]
        });

        if (!openRecord) {
            return res.status(400).json({ error: 'No active clock-in found' });
        }

        const clockOutTime = new Date();
        const diffMs = clockOutTime.getTime() - new Date(openRecord.clockIn).getTime();
        const totalHours = diffMs / (1000 * 60 * 60);

        const [updated] = await db.update(attendance)
            .set({
                clockOut: clockOutTime,
                totalHours: Number(totalHours.toFixed(2)),
            })
            .output()
            .where(eq(attendance.id, openRecord.id));

        res.json(updated);
    } catch (error: any) {
        logger.error({ err: error }, 'Error clocking out');
        res.status(500).json({ error: 'Failed to clock out' });
    }
};

// ============================================================================
// Payroll
// ============================================================================

export const payrollSummary = async (req: Request, res: Response) => {
    try {
        const employeeId = req.query.employeeId as string;
        const startDate = new Date((req.query.startDate as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
        const endDate = new Date((req.query.endDate as string) || new Date());

        if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });
        const employeeConditions = [
            eq(employees.id, employeeId),
            req.effectiveBranchId ? eq(employees.branchId, req.effectiveBranchId) : undefined,
        ].filter(Boolean) as any[];
        const emp = await db.query.employees.findFirst({ where: and(...employeeConditions) });
        if (!emp) return res.status(404).json({ error: 'Employee not found' });

        const records = await db.query.attendance.findMany({
            where: and(
                eq(attendance.employeeId, employeeId),
                req.effectiveBranchId ? eq(attendance.branchId, req.effectiveBranchId) : undefined,
                gte(attendance.clockIn, startDate),
                lte(attendance.clockIn, endDate)
            )
        });

        let totalHours = 0;
        records.forEach(r => totalHours += (r.totalHours || 0));

        let amount = 0;
        if (emp.hourlyRate && emp.hourlyRate > 0) {
            amount = totalHours * emp.hourlyRate;
        } else {
            // Rough day calculation based on attendance count
            const attendedDays = records.filter(r => r.totalHours && r.totalHours > 0).length;
            amount = (emp.basicSalary / 30) * attendedDays;
        }

        res.json({
            employeeId,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            records: records.length,
            amount,
        });
    } catch (error: any) {
        logger.error({ err: error }, 'Error fetching payroll summary');
        res.status(500).json({ error: 'Failed to fetch payroll summary' });
    }
};

export const getPayrollCycles = async (req: Request, res: Response) => {
    try {
        const result = await db.query.payrollCycles.findMany({
            where: req.effectiveBranchId ? eq(payrollCycles.branchId, req.effectiveBranchId) : undefined,
            orderBy: (cycles, { desc }) => [desc(cycles.periodStart)]
        });
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch payroll cycles' });
    }
};

export const getPayoutLedger = async (req: Request, res: Response) => {
    try {
        let cycleIds: string[] | undefined;
        if (req.effectiveBranchId) {
            const cycles = await db.select({ id: payrollCycles.id }).from(payrollCycles)
                .where(eq(payrollCycles.branchId, req.effectiveBranchId));
            cycleIds = cycles.map(cycle => cycle.id);
        }
        const result = cycleIds
            ? cycleIds.length > 0
                ? await db.query.payrollPayouts.findMany({ where: inArray(payrollPayouts.cycleId, cycleIds) })
                : []
            : await db.query.payrollPayouts.findMany({});
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch payouts' });
    }
};

export const executePayrollCycle = async (req: Request, res: Response) => {
    // Legacy one-click payroll is DISABLED: it posted unaudited CLOSED/POSTED
    // payouts with no blockers, loans, bonuses, tax, or idempotency (re-click
    // = double pay + double GL). Use the governed engine instead:
    // preview → calculate → close (hrExtended payroll cycle endpoints).
    return res.status(410).json({
        error: 'LEGACY_PAYROLL_DISABLED',
        code: 'LEGACY_PAYROLL_DISABLED',
        message: 'Use payroll preview → calculate → close instead of legacy execute.',
    });
};

