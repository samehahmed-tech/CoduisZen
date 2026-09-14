import { apiRequest } from './core';

export const hrApi = {
    getEmployees: () => apiRequest<any[]>('/hr/employees'),
    upsertEmployee: (data: any) => apiRequest<any>('/hr/employees', { method: 'POST', body: JSON.stringify(data) }),
    deleteEmployee: (id: string) => apiRequest<any>(`/hr/employees/${id}`, { method: 'DELETE' }),
    getAttendance: (params?: { employeeId?: string; branchId?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any[]>(`/hr/attendance${query ? `?${query}` : ''}`);
    },
    clockIn: (data: { employeeId: string; branchId?: string; deviceId?: string }) =>
        apiRequest<any>('/hr/attendance/clock-in', { method: 'POST', body: JSON.stringify(data) }),
    clockOut: (data: { employeeId: string }) =>
        apiRequest<any>('/hr/attendance/clock-out', { method: 'POST', body: JSON.stringify(data) }),
    payrollSummary: (params: { employeeId: string; startDate: string; endDate: string }) => {
        const query = new URLSearchParams(params as any).toString();
        return apiRequest<any>(`/hr/payroll/summary?${query}`);
    },
    getPayrollCycles: () => apiRequest<any[]>('/hr/payroll/cycles'),
    getPayouts: () => apiRequest<any[]>('/hr/payroll/payouts'),
    executePayroll: (data: { startDate: string; endDate: string; branchId?: string }) =>
        apiRequest<any>('/hr/payroll/execute', { method: 'POST', body: JSON.stringify(data) }),
};

export const hrExtendedApi = {
    getDepartments: () => apiRequest<any[]>('/hr-extended/departments'),
    createDepartment: (data: { id?: string; name: string; nameAr?: string; managerId?: string; parentId?: string; branchId?: string; isActive?: boolean }) =>
        apiRequest<any>('/hr-extended/departments', { method: 'POST', body: JSON.stringify(data) }),
    deleteDepartment: (id: string) =>
        apiRequest<any>(`/hr-extended/departments/${id}`, { method: 'DELETE' }),
    getJobTitles: () => apiRequest<any[]>('/hr-extended/job-titles'),
    createJobTitle: (data: { id?: string; name: string; nameAr?: string; departmentId?: string; isActive?: boolean }) =>
        apiRequest<any>('/hr-extended/job-titles', { method: 'POST', body: JSON.stringify(data) }),
    deleteJobTitle: (id: string) =>
        apiRequest<any>(`/hr-extended/job-titles/${id}`, { method: 'DELETE' }),
    getLeaveTypes: () => apiRequest<any[]>('/hr-extended/leave-types'),
    getLeaveRequests: (filters?: { employeeId?: string; status?: string }) => {
        const query = new URLSearchParams(filters as any).toString();
        return apiRequest<any[]>(`/hr-extended/leave-requests${query ? `?${query}` : ''}`);
    },
    createLeaveRequest: (data: {
        employeeId: string; employeeName: string; leaveTypeId: string;
        startDate: string; endDate: string; reason: string;
    }) => apiRequest<any>('/hr-extended/leave-requests', { method: 'POST', body: JSON.stringify(data) }),
    approveLeave: (id: string) =>
        apiRequest<any>(`/hr-extended/leave-requests/${id}/approve`, { method: 'PUT' }),
    rejectLeave: (id: string, reason: string) =>
        apiRequest<any>(`/hr-extended/leave-requests/${id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) }),
    getLeaveBalance: (employeeId: string) =>
        apiRequest<any[]>(`/hr-extended/leave-balance/${employeeId}`),
    getOvertimeEntries: (filters?: { employeeId?: string; status?: string; month?: string }) => {
        const query = new URLSearchParams(filters as any).toString();
        return apiRequest<any[]>(`/hr-extended/overtime${query ? `?${query}` : ''}`);
    },
    recordOvertime: (data: {
        employeeId: string; date: string; regularHours: number;
        overtimeHours: number; overtimeRate?: number; baseSalaryPerHour?: number;
    }) => apiRequest<any>('/hr-extended/overtime', { method: 'POST', body: JSON.stringify(data) }),
    approveOvertime: (id: string) =>
        apiRequest<any>(`/hr-extended/overtime/${id}/approve`, { method: 'PUT' }),
};
