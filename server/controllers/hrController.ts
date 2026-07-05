import { Request, Response } from 'express';
import { db } from '../db';
import { branches, employees, attendance, payrollCycles, payrollPayouts, users } from '../../src/db/schema';
import { count, desc, eq, and, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import logger from '../utils/logger';
import { GLService } from '../services/glService';

// ============================================================================
// Employees
// ============================================================================

export const getEmployees = async (req: Request, res: Response) => {
    try {
        const branchId = req.query.branchId ? String(req.query.branchId) : undefined;
        const search = req.query.q ? String(req.query.q).trim() : '';
        const paged = req.query.paged === 'true' || req.query.limit !== undefined || req.query.offset !== undefined;
        const limit = Math.min(Math.max(Number(req.query.limit || 250), 1), 500);
        const offset = Math.max(Number(req.query.offset || 0), 0);
        const conditions = [
            eq(employees.isActive, true),
            branchId ? eq(employees.branchId, branchId) : undefined,
            search ? or(
                ilike(employees.name, `%${search}%`),
                ilike(employees.employeeCode, `%${search}%`),
                ilike(employees.attendanceCode, `%${search}%`),
                ilike(employees.phone, `%${search}%`),
                ilike(employees.email, `%${search}%`),
            ) : undefined,
        ].filter(Boolean) as any[];
        const where = and(...conditions);

        const [totalRow] = await db.select({ value: count() }).from(employees).where(where);
        const result = await db.select().from(employees)
            .where(where)
            .orderBy(desc(employees.createdAt))
            .limit(paged ? limit : 5000)
            .offset(paged ? offset : 0);

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
        if (!data.branchId) {
            const fallbackBranches = await db.select({ id: branches.id }).from(branches).limit(1);
            if (fallbackBranches.length > 0) {
                data.branchId = fallbackBranches[0].id;
            } else {
                return res.status(400).json({ error: 'Branch is required' });
            }
        }

        const existingEmployee = data.id
            ? await db.query.employees.findFirst({ where: eq(employees.id, data.id) })
            : null;

        if (existingEmployee) {
            const employeeCode = data.employeeCode ?? data.employee_code ?? existingEmployee.employeeCode;
            const attendanceCode = data.attendanceCode ?? data.attendance_code ?? data.employeeCode ?? data.employee_code ?? existingEmployee.attendanceCode;
            const targetBranchId = data.branchId || existingEmployee.branchId;
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
                .where(eq(employees.id, data.id))
                .returning();
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
            const createdRows = await db.insert(employees)
                .values({
                    id: id,
                    branchId: data.branchId,
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
                })
                .returning() as any[];
            const created = createdRows[0];
            res.json(created);
        }
    } catch (error: any) {
        logger.error({ err: error }, 'Error upserting employee');
        res.status(500).json({ error: 'Failed to save employee' });
    }
};

// ============================================================================
// Attendance
// ============================================================================

export const getAttendance = async (req: Request, res: Response) => {
    try {
        const { employeeId, branchId } = req.query;
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

        // Find employee to get their branch if not provided
        let actualBranchId = branchId;
        if (!actualBranchId) {
            const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
            if (!emp) return res.status(404).json({ error: 'Employee not found' });
            actualBranchId = emp.branchId;
        }

        const [record] = await db.insert(attendance)
            .values({
                id: nanoid(),
                employeeId,
                branchId: actualBranchId,
                clockIn: new Date(),
                status: 'PRESENT',
            })
            .returning();
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
        const openRecord = await db.query.attendance.findFirst({
            where: and(
                eq(attendance.employeeId, employeeId),
                sql`${attendance.clockOut} IS NULL`
            ),
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
            .where(eq(attendance.id, openRecord.id))
            .returning();

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

        const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
        if (!emp) return res.status(404).json({ error: 'Employee not found' });

        const records = await db.query.attendance.findMany({
            where: and(
                eq(attendance.employeeId, employeeId),
                gte(attendance.clockIn, startDate),
                lte(attendance.clockIn, endDate)
            )
        });

        let totalHours = 0;
        records.forEach(r => totalHours += (r.totalHours || 0));

        let amount = 0;
        // Simple logic mirroring mock: 
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
            orderBy: (cycles, { desc }) => [desc(cycles.periodStart)]
        });
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch payroll cycles' });
    }
};

export const getPayoutLedger = async (req: Request, res: Response) => {
    try {
        const result = await db.query.payrollPayouts.findMany({});
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch payouts' });
    }
};

export const executePayrollCycle = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const startDate = new Date(body.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
        const endDate = new Date(body.endDate || new Date());

        let targetBranchId = body.branchId;
        if (!targetBranchId) {
            const fallbackBranches = await db.select({ id: branches.id }).from(branches).limit(1);
            if (fallbackBranches.length > 0) targetBranchId = fallbackBranches[0].id;
            else return res.status(400).json({ error: 'Branch is required' });
        }

        // Create cycle
        const [cycle] = await db.insert(payrollCycles)
            .values({
                id: nanoid(),
                branchId: targetBranchId,
                periodStart: startDate,
                periodEnd: endDate,
                status: 'CLOSED', // Using closed to match original mock behavior
            })
            .returning();

        // Get all employees
        const allEmps = await db.query.employees.findMany({
            where: eq(employees.isActive, true)
        });

        const allAttendance = await db.query.attendance.findMany({
            where: and(
                gte(attendance.clockIn, startDate),
                lte(attendance.clockIn, endDate)
            )
        });

        let cycleTotal = 0;

        // Create payouts
        for (const emp of allEmps) {
            const scoped = allAttendance.filter(r => r.employeeId === emp.id && r.totalHours);
            let amount = 0;
            if (emp.hourlyRate && emp.hourlyRate > 0) {
                const totalHours = scoped.reduce((sum, r) => sum + (r.totalHours || 0), 0);
                amount = totalHours * emp.hourlyRate;
            } else {
                amount = (emp.basicSalary / 30) * scoped.length;
            }

            cycleTotal += amount;

            await db.insert(payrollPayouts)
                .values({
                    id: nanoid(),
                    cycleId: cycle.id,
                    employeeId: emp.id,
                    basicSalary: emp.basicSalary,
                    netPay: amount || 0,
                    status: 'POSTED'
                });
        }

        // Update cycle total
        const [updatedCycle] = await db.update(payrollCycles)
            .set({ totalAmount: cycleTotal })
            .where(eq(payrollCycles.id, cycle.id))
            .returning();

        // Finance integration: Post Payroll to General Ledger
        if (cycleTotal > 0) {
            await GLService.postJournalEntry({
                reference: cycle.id,
                referenceType: 'PAYROLL',
                description: `Payroll Run for period ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
                lines: [
                    { accountCode: '61000', debit: cycleTotal, credit: 0, description: 'Salaries Expense' },
                    { accountCode: '21200', credit: cycleTotal, debit: 0, description: 'Accrued Payroll Liability' }
                ],
                branchId: targetBranchId
            }).catch(e => logger.error({ err: e }, 'Failed to post payroll GL entry'));
        }

        res.status(201).json({
            ...updatedCycle,
            entries: allEmps.length
        });
    } catch (error: any) {
        logger.error({ err: error }, 'Error executing payroll');
        res.status(500).json({ error: 'Failed to execute payroll' });
    }
};
