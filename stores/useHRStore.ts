import { create } from 'zustand';
import { Employee } from '../types';
import { hrApi } from '../services/api/hr';

interface AttendanceRecord {
    id: string;
    employeeId: string;
    clockIn: Date;
    clockOut?: Date;
    totalHours: number;
}

interface HRState {
    employees: Employee[];
    attendance: AttendanceRecord[];
    payrollCycles: Array<{ id: string; startDate: string; endDate: string; totalAmount: number; entries: number; status: string }>;
    payoutLedger: Array<{ id: string; employeeId: string; amount: number; postedAt: string; status: string }>;
    isLoading: boolean;
    error: string | null;

    // Actions
    fetchEmployees: () => Promise<void>;
    clockIn: (employeeId: string) => Promise<void>;
    clockOut: (employeeId: string) => Promise<void>;
    executePayrollCycle: (startDate: Date, endDate: Date, branchId?: string) => Promise<void>;
}

export const useHRStore = create<HRState>((set, get) => ({
    employees: [],
    attendance: [],
    payrollCycles: [],
    payoutLedger: [],
    isLoading: false,
    error: null,

    fetchEmployees: async () => {
        set({ isLoading: true, error: null });
        try {
            const [employeesRaw, attendanceRaw] = await Promise.all([
                hrApi.getEmployees(),
                hrApi.getAttendance(),
            ]);
            const [payrollCycles, payoutLedger] = await Promise.all([
                hrApi.getPayrollCycles().catch(() => []),
                hrApi.getPayouts().catch(() => []),
            ]);

            const employees: Employee[] = employeesRaw.map((e: any) => ({
                id: e.id,
                userId: e.userId,
                nationalId: e.nationalId,
                joinDate: new Date(e.joinedAt || e.joinDate),
                salary: Number(e.basicSalary || e.salary || 0),
                salaryType: e.hourlyRate > 0 ? 'HOURLY' : 'MONTHLY',
                emergencyContact: e.emergencyContact || '',
                activeShiftId: e.activeShiftId,
                bankAccount: e.bankAccount,
                departmentId: e.departmentId,
                jobTitleId: e.jobTitleId,
                role: e.role,
                name: e.name,
                email: e.email,
                phone: e.phone
            }));

            const attendance: AttendanceRecord[] = attendanceRaw.map((a: any) => ({
                id: a.id,
                employeeId: a.employeeId,
                clockIn: new Date(a.clockIn),
                clockOut: a.clockOut ? new Date(a.clockOut) : undefined,
                totalHours: Number(a.totalHours || 0),
            }));

            set({ employees, attendance, payrollCycles, payoutLedger, isLoading: false });
        } catch (error: any) {
            set({ isLoading: false, error: 'Failed to fetch HR data from backend.' });
        }
    },

    clockIn: async (employeeId) => {
        try {
            await hrApi.clockIn({ employeeId });
            await get().fetchEmployees(); // Refresh state from DB
        } catch (error) {
            set({ error: 'Failed to clock in via API' });
            throw error;
        }
    },

    clockOut: async (employeeId) => {
        try {
            await hrApi.clockOut({ employeeId });
            await get().fetchEmployees(); // Refresh state from DB
        } catch (error) {
            set({ error: 'Failed to clock out via API' });
            throw error;
        }
    },

    executePayrollCycle: async (startDate, endDate, branchId) => {
        try {
            await hrApi.executePayroll({
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                branchId,
            });
            await get().fetchEmployees(); // Refresh cycles and payouts
        } catch (error) {
            set({ error: 'Failed to execute payroll cycle via API' });
            throw error;
        }
    },
}));
