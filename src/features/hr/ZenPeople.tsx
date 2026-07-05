import React, { useEffect, useMemo, useState } from 'react';
import {
    Users, Clock, Wallet, ShieldCheck, Search, Plus, ChevronRight, Award,
    Calendar, UserPlus, CheckCircle, XCircle, Timer, Briefcase, Building2, Activity,
    X, Save, AlertTriangle, TrendingUp, MapPin, Phone, Mail, CreditCard,
    FileText, ArrowRight, RefreshCw, Eye, Layers, Printer, Pencil, Trash2
} from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { translations } from '@/services/translations';
import { useHRStore } from '@/stores/useHRStore';
import { hrApi, hrExtendedApi } from '@/services/api/hr';
import { useToast } from '@/components/common/ToastProvider';
import { useConfirm } from '@/components/common/ConfirmProvider';
import { Employee } from '@/types';

type HRTab = 'employees' | 'attendance' | 'leave' | 'payroll' | 'departments';

const TABS: { id: HRTab; label: string; labelAr: string; icon: any }[] = [
    { id: 'employees', label: 'Employees', labelAr: 'الموظفين', icon: Users },
    { id: 'attendance', label: 'Attendance', labelAr: 'الحضور', icon: Clock },
    { id: 'leave', label: 'Leave', labelAr: 'الإجازات', icon: Calendar },
    { id: 'payroll', label: 'Payroll', labelAr: 'الرواتب', icon: Wallet },
    { id: 'departments', label: 'Departments', labelAr: 'الأقسام', icon: Building2 },
];

const ZenPeople: React.FC = () => {
    const { settings, hasPermission } = useAuthStore();
    const { employees, attendance, payrollCycles, payoutLedger, fetchEmployees, clockIn, clockOut, executePayrollCycle } = useHRStore();
    const lang = settings.language || 'en';
    const t = translations[lang];
    const { success, error: showError } = useToast();
    const { confirm } = useConfirm();

    const [activeTab, setActiveTab] = useState<HRTab>('employees');
    const [searchQuery, setSearchQuery] = useState('');
    const [isExecutingPayroll, setIsExecutingPayroll] = useState(false);

    // Employee Modal
    const [showEmployeeModal, setShowEmployeeModal] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<any>(null);
    const [empForm, setEmpForm] = useState({ name: '', phone: '', email: '', role: 'STAFF', basicSalary: '', hourlyRate: '', nationalId: '', emergencyContact: '', bankAccount: '', departmentId: '', jobTitleId: '' });

    // Leave
    const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
    const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [leaveForm, setLeaveForm] = useState({ employeeId: '', leaveTypeId: '', startDate: '', endDate: '', reason: '' });

    // Departments
    const [departments, setDepartments] = useState<any[]>([]);
    const [jobTitles, setJobTitles] = useState<any[]>([]);
    const [showJobTitleModal, setShowJobTitleModal] = useState(false);
    const [editingJobTitle, setEditingJobTitle] = useState<any>(null);
    const [jobTitleForm, setJobTitleForm] = useState({ name: '', nameAr: '', departmentId: '' });

    // Overtime
    const [overtime, setOvertime] = useState<any[]>([]);

    const refreshDepartments = async () => {
        const [departmentRows, jobTitleRows] = await Promise.all([
            hrExtendedApi.getDepartments(),
            hrExtendedApi.getJobTitles(),
        ]);
        setDepartments(departmentRows);
        setJobTitles(jobTitleRows);
    };

    useEffect(() => {
        fetchEmployees();
        refreshDepartments().catch(() => { });
    }, [fetchEmployees]);

    useEffect(() => {
        if (activeTab === 'leave') {
            hrExtendedApi.getLeaveRequests({}).then(setLeaveRequests).catch(() => { });
            hrExtendedApi.getLeaveTypes().then(setLeaveTypes).catch(() => { });
        }
        if (activeTab === 'departments') {
            refreshDepartments().catch(() => { });
        }
        if (activeTab === 'attendance') {
            hrExtendedApi.getOvertimeEntries({}).then(setOvertime).catch(() => { });
        }
    }, [activeTab]);

    const activeAttendance = attendance.filter(a => !a.clockOut);
    const filteredEmployees = useMemo(() => employees.filter(e =>
        `${e.id} ${e.name || ''} ${e.userId || ''} ${e.phone || ''} ${e.role || ''}`.toLowerCase().includes(searchQuery.toLowerCase())
    ), [employees, searchQuery]);

    const payrollLiability = useMemo(() => employees.reduce((sum, e) => sum + (e.salary || 0), 0), [employees]);
    const departmentMap = useMemo(() => new Map(departments.map((department: any) => [department.id, department])), [departments]);
    const sectionOptions = useMemo(() => departments.filter((department: any) => department.parentId && department.isActive !== false), [departments]);
    const filteredJobTitleOptions = useMemo(() => jobTitles.filter((jobTitle: any) => jobTitle.isActive !== false), [jobTitles]);
    const getDepartmentName = (id?: string) => {
        const department = id ? departmentMap.get(id) : null;
        return department?.nameAr || department?.name || id || '—';
    };

    const handleSaveEmployee = async () => {
        try {
            await hrApi.upsertEmployee({
                ...(editingEmployee?.id ? { id: editingEmployee.id } : {}),
                name: empForm.name,
                phone: empForm.phone,
                email: empForm.email,
                role: empForm.role,
                basicSalary: Number(empForm.basicSalary) || 0,
                hourlyRate: Number(empForm.hourlyRate) || 0,
                nationalId: empForm.nationalId,
                emergencyContact: empForm.emergencyContact,
                bankAccount: empForm.bankAccount,
                departmentId: empForm.departmentId || undefined,
                jobTitleId: empForm.jobTitleId || undefined,
            });
            await fetchEmployees();
            setShowEmployeeModal(false);
            setEditingEmployee(null);
            success(editingEmployee ? 'Employee updated properly' : 'Employee added properly');
        } catch (e: any) { showError(e.message); }
    };

    const openAddEmployee = () => {
        setEditingEmployee(null);
        setEmpForm({ name: '', phone: '', email: '', role: 'STAFF', basicSalary: '', hourlyRate: '', nationalId: '', emergencyContact: '', bankAccount: '', departmentId: '', jobTitleId: '' });
        setShowEmployeeModal(true);
    };

    const openEditEmployee = (emp: Employee) => {
        setEditingEmployee(emp);
        setEmpForm({
            name: emp.name || emp.id,
            phone: emp.phone || '',
            email: emp.email || '',
            role: emp.role || 'STAFF',
            basicSalary: String(emp.salary || 0),
            hourlyRate: '0',
            nationalId: emp.nationalId || '',
            emergencyContact: emp.emergencyContact || '',
            bankAccount: emp.bankAccount || '',
            departmentId: emp.departmentId || '',
            jobTitleId: emp.jobTitleId || '',
        });
        setShowEmployeeModal(true);
    };

    const handleApproveLeave = async (id: string) => {
        await hrExtendedApi.approveLeave(id);
        setLeaveRequests(await hrExtendedApi.getLeaveRequests({}));
    };
    const handleRejectLeave = async (id: string) => {
        const ok = await confirm({ title: 'Reject Leave', message: 'Are you sure you want to reject this leave request?', confirmText: 'Reject', variant: 'danger' });
        if (!ok) return;
        await hrExtendedApi.rejectLeave(id, 'Rejected by manager');
        setLeaveRequests(await hrExtendedApi.getLeaveRequests({}));
        success('Leave request rejected');
    };
    const handleSubmitLeave = async () => {
        try {
            const emp = employees.find(e => e.id === leaveForm.employeeId);
            await hrExtendedApi.createLeaveRequest({ ...leaveForm, employeeName: emp?.name || leaveForm.employeeId });
            setLeaveRequests(await hrExtendedApi.getLeaveRequests({}));
            setShowLeaveModal(false);
            success('Leave request submitted successfully');
        } catch (e: any) { showError(e.message); }
    };

    const openAddJobTitle = () => {
        setEditingJobTitle(null);
        setJobTitleForm({ name: '', nameAr: '', departmentId: '' });
        setShowJobTitleModal(true);
    };

    const openEditJobTitle = (jobTitle: any) => {
        setEditingJobTitle(jobTitle);
        setJobTitleForm({
            name: jobTitle.title || jobTitle.name || '',
            nameAr: jobTitle.nameAr || '',
            departmentId: jobTitle.departmentId || '',
        });
        setShowJobTitleModal(true);
    };

    const handleSaveJobTitle = async () => {
        try {
            await hrExtendedApi.createJobTitle({
                ...(editingJobTitle?.id ? { id: editingJobTitle.id } : {}),
                name: jobTitleForm.name.trim(),
                nameAr: jobTitleForm.nameAr.trim() || jobTitleForm.name.trim(),
            });
            await refreshDepartments();
            setShowJobTitleModal(false);
            setEditingJobTitle(null);
            success(editingJobTitle ? 'Job title updated' : 'Job title added');
        } catch (e: any) { showError(e.message); }
    };

    const handleDeleteJobTitle = async (jobTitle: any) => {
        const ok = await confirm({
            title: 'Delete Job Title',
            message: `Delete "${jobTitle.title || jobTitle.name}" from job titles? Existing employees keep their current role text.`,
            confirmText: 'Delete',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await hrExtendedApi.deleteJobTitle(jobTitle.id);
            await refreshDepartments();
            success('Job title deleted');
        } catch (e: any) { showError(e.message); }
    };

    return (
        <div className="p-4 md:p-8 lg:p-10 bg-app min-h-screen pb-24 overflow-y-auto custom-scrollbar">
            {/* Visual Effects Overlay */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-indigo-500/5 blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-violet-500/5 blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
            </div>

            <div className="relative z-10 max-w-[1920px] mx-auto">
                {/* Header */}
                <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6 mb-10 pb-8 border-b border-border/20">
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 rounded-[1.75rem] bg-gradient-to-br from-indigo-600 to-violet-600 p-0.5 shadow-2xl shadow-indigo-600/20">
                            <div className="w-full h-full rounded-[1.6rem] bg-card flex items-center justify-center">
                                <Users size={36} className="text-indigo-600 animate-pulse-soft" />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-3xl lg:text-5xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                                {lang === 'ar' ? 'الموارد البشرية' : 'Human Resources'}
                                <span className="hidden md:flex px-3 py-1 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded-full text-[10px] font-black uppercase tracking-widest">
                                    {employees.length} Staff
                                </span>
                            </h2>
                            <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] mt-2 opacity-60">
                                {lang === 'ar' ? 'إدارة الموظفين والحضور والرواتب' : 'Workforce · Attendance · Leave · Payroll'}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {activeTab === 'employees' && (
                            <button onClick={openAddEmployee} className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-8 py-4 rounded-2xl shadow-2xl shadow-indigo-600/30 font-black uppercase text-[11px] tracking-widest flex items-center gap-3 hover:scale-105 active:scale-95 transition-all">
                                <UserPlus size={18} /> {lang === 'ar' ? 'موظف جديد' : 'Add Employee'}
                            </button>
                        )}
                        {activeTab === 'leave' && (
                            <button onClick={() => { setLeaveForm({ employeeId: '', leaveTypeId: '', startDate: '', endDate: '', reason: '' }); setShowLeaveModal(true); }} className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-8 py-4 rounded-2xl shadow-2xl shadow-indigo-600/30 font-black uppercase text-[11px] tracking-widest flex items-center gap-3 hover:scale-105 active:scale-95 transition-all">
                                <Plus size={18} /> New Leave Request
                            </button>
                        )}
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
                    {[
                        { label: 'Total Workforce', value: employees.length, icon: Users, color: '#4f46e5' },
                        { label: 'Active Now', value: activeAttendance.length, icon: Clock, color: '#10b981', trend: { val: 12, up: true } },
                        { label: 'Payroll Liability', value: `${payrollLiability.toLocaleString()}`, subValue: 'LE', icon: Wallet, color: '#8b5cf6' },
                        { label: 'Attendance Rate', value: employees.length > 0 ? `${Math.round((activeAttendance.length / employees.length) * 100)}%` : '0%', icon: TrendingUp, color: '#f59e0b' },
                    ].map((stat, i) => (
                        <div key={i} className="relative group overflow-hidden bg-card/60  border border-border/30 rounded-[2rem] p-6 transition-all hover:scale-[1.02] hover:bg-card/70 hover:shadow-2xl active:scale-[0.98]">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br transition-opacity duration-150 opacity-10 group-hover:opacity-20 blur-3xl" style={{ background: stat.color }} />
                            <div className="flex items-start justify-between relative z-10">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-2">{stat.label}</p>
                                    <h4 className="text-3xl font-black text-main tracking-tighter tabular-nums flex items-end gap-1.5">
                                        {stat.value}
                                        {stat.subValue && <span className="text-xs font-bold text-muted mb-1 opacity-60">{stat.subValue}</span>}
                                    </h4>
                                    {stat.trend && (
                                        <div className={`flex items-center gap-1 mt-2 text-[10px] font-black uppercase tracking-wider ${stat.trend.up ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            <Activity size={12} />
                                            {stat.trend.val}% <span className="text-muted ml-1 opacity-70">vs prev</span>
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 rounded-2xl border flex items-center justify-center shadow-lg transition-transform duration-150 group-hover:rotate-12" style={{ borderColor: `${stat.color}30`, backgroundColor: `${stat.color}15`, color: stat.color }}>
                                    <stat.icon size={22} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Tab Navigation */}
                <div className="flex flex-wrap gap-2 mb-10 bg-card/40  p-2 rounded-[2rem] border border-border/30 w-fit">
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-3 px-6 py-3.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all duration-150 ${activeTab === tab.id ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-600/20 scale-105' : 'text-muted hover:text-main hover:bg-elevated/60'}`}>
                            <tab.icon size={16} /> {lang === 'ar' ? tab.labelAr : tab.label}
                        </button>
                    ))}
                </div>

            {/* ??????????? EMPLOYEES TAB ??????????? */}
            {activeTab === 'employees' && (
                <div className="bg-card/60  border border-border/30 rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-10 duration-700">
                    <div className="p-8 border-b border-border/20 bg-elevated/30 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div>
                            <h3 className="text-xl font-black text-main uppercase tracking-tighter">Talent Roster</h3>
                            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">Manage global employee directory</p>
                        </div>
                        <div className="relative w-full max-w-sm group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-indigo-500 transition-colors" size={18} />
                            <input type="text" placeholder="Search employees name, role, phone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-6 py-4 bg-app/50 border border-border/40 rounded-2xl font-bold text-xs outline-none focus:border-indigo-500/50 focus:bg-app transition-all placeholder:text-muted/50" />
                        </div>
                    </div>
                    <div className="responsive-table">
                        <table className="w-full text-left">
                            <thead className="bg-app/50 text-[9px] font-black uppercase text-muted tracking-[0.2em]">
                                <tr>
                                    <th className="px-6 py-4">Employee</th>
                                    <th className="px-4 py-4">Role</th>
                                    <th className="px-4 py-4">Department</th>
                                    <th className="px-4 py-4">Status</th>
                                    <th className="px-4 py-4 text-right">Salary</th>
                                    <th className="px-4 py-4">Contact</th>
                                    <th className="px-6 py-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {filteredEmployees.map(emp => {
                                    const isActive = !!activeAttendance.find(a => a.employeeId === emp.id);
                                    return (
                                        <tr key={emp.id} className="hover:bg-elevated/20 transition-all">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/30 dark:to-violet-900/30 text-indigo-600 flex items-center justify-center font-black text-sm border border-indigo-200 dark:border-indigo-800">
                                                        {(emp.name || emp.id).charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black text-main">{emp.name || emp.id}</p>
                                                        <p className="text-[9px] font-bold text-muted tracking-tighter mt-0.5">
                                                            Joined {new Date(emp.joinDate).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{emp.role || '—'}</span>
                                            </td>
                                            <td className="px-4 py-4 text-[10px] font-bold text-muted">
                                                {getDepartmentName(emp.departmentId)}
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-muted/40'}`} />
                                                    <span className="text-[9px] font-black uppercase text-muted">{isActive ? 'ACTIVE' : 'OFFLINE'}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-right font-mono text-xs font-black text-main">
                                                {(emp.salary || 0).toLocaleString()} <span className="text-[9px] text-muted">LE/{emp.salaryType === 'HOURLY' ? 'H' : 'M'}</span>
                                            </td>
                                            <td className="px-4 py-4 text-[10px] text-muted">
                                                {emp.phone && <span className="flex items-center gap-1"><Phone size={10} />{emp.phone}</span>}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    {!isActive ? (
                                                        <button onClick={() => clockIn(emp.id)} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-[9px] font-black uppercase hover:bg-emerald-500/20 transition-colors">Clock In</button>
                                                    ) : (
                                                        <button onClick={() => clockOut(emp.id)} className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-600 text-[9px] font-black uppercase hover:bg-rose-500/20 transition-colors">Clock Out</button>
                                                    )}
                                                    <button onClick={() => openEditEmployee(emp)} className="p-1.5 text-muted hover:text-indigo-600 transition-all"><Eye size={14} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {filteredEmployees.length === 0 && <p className="text-center text-muted py-16 text-sm">No employees found.</p>}
                </div>
            )}

            {/* ??????????? ATTENDANCE TAB ??????????? */}
            {activeTab === 'attendance' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="card-primary border border-emerald-200 dark:border-emerald-800 p-6 rounded-[2rem] bg-emerald-50/30 dark:bg-emerald-950/20">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-1">Currently Active</p>
                            <h4 className="text-3xl font-black text-emerald-500">{activeAttendance.length}</h4>
                        </div>
                        <div className="card-primary border border-blue-200 dark:border-blue-800 p-6 rounded-[2rem] bg-blue-50/30 dark:bg-blue-950/20">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-1">Today's Records</p>
                            <h4 className="text-3xl font-black text-blue-500">{attendance.filter(a => new Date(a.clockIn).toDateString() === new Date().toDateString()).length}</h4>
                        </div>
                        <div className="card-primary border border-amber-200 dark:border-amber-800 p-6 rounded-[2rem] bg-amber-50/30 dark:bg-amber-950/20">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-1">Overtime Entries</p>
                            <h4 className="text-3xl font-black text-amber-500">{overtime.length}</h4>
                        </div>
                    </div>

                    <div className="card-primary border border-border rounded-[2.5rem] shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-border bg-elevated/30">
                            <h3 className="text-lg font-black text-main uppercase tracking-tight">Attendance Log</h3>
                        </div>
                        <div className="responsive-table">
                            <table className="w-full text-left">
                                <thead className="bg-app/50 text-[9px] font-black uppercase text-muted tracking-[0.2em]">
                                    <tr>
                                        <th className="px-6 py-4">Employee</th>
                                        <th className="px-4 py-4">Clock In</th>
                                        <th className="px-4 py-4">Clock Out</th>
                                        <th className="px-4 py-4 text-right">Hours</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {attendance.slice(0, 50).map((rec, idx) => {
                                        const emp = employees.find(e => e.id === rec.employeeId);
                                        return (
                                            <tr key={idx} className="hover:bg-elevated/20 transition-all">
                                                <td className="px-6 py-4 text-xs font-black text-main">{emp?.name || rec.employeeId}</td>
                                                <td className="px-4 py-4 font-mono text-[10px] text-muted">{new Date(rec.clockIn).toLocaleString()}</td>
                                                <td className="px-4 py-4 font-mono text-[10px] text-muted">{rec.clockOut ? new Date(rec.clockOut).toLocaleString() : '—'}</td>
                                                <td className="px-4 py-4 text-right font-mono text-xs font-bold text-main">{rec.totalHours ? `${rec.totalHours.toFixed(1)}h` : '—'}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black ${rec.clockOut ? 'bg-slate-100 dark:bg-slate-800 text-slate-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                                        {rec.clockOut ? 'COMPLETED' : 'ACTIVE'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {attendance.length === 0 && <p className="text-center text-muted py-16 text-sm">No attendance records.</p>}
                    </div>
                </div>
            )}

            {/* ??????????? LEAVE TAB ??????????? */}
            {activeTab === 'leave' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="card-primary border border-amber-200 dark:border-amber-800 p-6 rounded-[2rem] bg-amber-50/30 dark:bg-amber-950/20">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-1">Pending</p>
                            <h4 className="text-3xl font-black text-amber-500">{leaveRequests.filter(l => l.status === 'PENDING').length}</h4>
                        </div>
                        <div className="card-primary border border-emerald-200 dark:border-emerald-800 p-6 rounded-[2rem] bg-emerald-50/30 dark:bg-emerald-950/20">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-1">Approved</p>
                            <h4 className="text-3xl font-black text-emerald-500">{leaveRequests.filter(l => l.status === 'APPROVED').length}</h4>
                        </div>
                        <div className="card-primary border border-rose-200 dark:border-rose-800 p-6 rounded-[2rem] bg-rose-50/30 dark:bg-rose-950/20">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-1">Rejected</p>
                            <h4 className="text-3xl font-black text-rose-500">{leaveRequests.filter(l => l.status === 'REJECTED').length}</h4>
                        </div>
                    </div>

                    <div className="card-primary border border-border rounded-[2.5rem] shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-border bg-elevated/30 flex items-center justify-between">
                            <h3 className="text-lg font-black text-main uppercase tracking-tight">Leave Requests</h3>
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted">{leaveTypes.length} leave types configured</p>
                        </div>
                        <div className="responsive-table">
                            <table className="w-full text-left">
                                <thead className="bg-app/50 text-[9px] font-black uppercase text-muted tracking-[0.2em]">
                                    <tr>
                                        <th className="px-6 py-4">Employee</th>
                                        <th className="px-4 py-4">Type</th>
                                        <th className="px-4 py-4">From</th>
                                        <th className="px-4 py-4">To</th>
                                        <th className="px-4 py-4">Reason</th>
                                        <th className="px-4 py-4">Status</th>
                                        <th className="px-6 py-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {leaveRequests.map((lr: any) => {
                                        const emp = employees.find(e => e.id === lr.employeeId);
                                        const lt = leaveTypes.find((t: any) => t.id === lr.leaveTypeId);
                                        return (
                                            <tr key={lr.id} className="hover:bg-elevated/20 transition-all">
                                                <td className="px-6 py-4 text-xs font-black text-main">{emp?.name || lr.employeeId}</td>
                                                <td className="px-4 py-4 text-[10px] font-bold text-muted">{lt?.name || lr.leaveTypeId}</td>
                                                <td className="px-4 py-4 font-mono text-[10px] text-muted">{lr.startDate ? new Date(lr.startDate).toLocaleDateString() : '—'}</td>
                                                <td className="px-4 py-4 font-mono text-[10px] text-muted">{lr.endDate ? new Date(lr.endDate).toLocaleDateString() : '—'}</td>
                                                <td className="px-4 py-4 text-[10px] text-muted max-w-[160px] truncate">{lr.reason || '—'}</td>
                                                <td className="px-4 py-4">
                                                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black ${lr.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500' : lr.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'}`}>{lr.status}</span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {lr.status === 'PENDING' && (
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button onClick={() => handleApproveLeave(lr.id)} className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"><CheckCircle size={14} /></button>
                                                            <button onClick={() => handleRejectLeave(lr.id)} className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"><XCircle size={14} /></button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {leaveRequests.length === 0 && <p className="text-center text-muted py-16 text-sm">No leave requests.</p>}
                    </div>
                </div>
            )}

            {/* ??????????? PAYROLL TAB ??????????? */}
            {activeTab === 'payroll' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Payroll Action Card */}
                        <div className="card-primary border border-indigo-200 dark:border-indigo-800 p-8 rounded-[2.5rem] bg-gradient-to-br from-indigo-50/50 to-violet-50/50 dark:from-indigo-950/30 dark:to-violet-950/30 shadow-sm">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center"><Wallet size={22} /></div>
                                <div>
                                    <h3 className="text-lg font-black text-main">Execute Payroll</h3>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted">Process monthly salaries</p>
                                </div>
                            </div>
                            <div className="space-y-3 mb-6">
                                <div className="flex justify-between text-xs"><span className="text-muted">Employees</span><span className="font-black text-main">{employees.length}</span></div>
                                <div className="flex justify-between text-xs"><span className="text-muted">Total Liability</span><span className="font-black text-indigo-600">{payrollLiability.toLocaleString()} LE</span></div>
                            </div>
                            <button onClick={async () => { setIsExecutingPayroll(true); try { await executePayrollCycle(new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date(), settings.activeBranchId); } finally { setIsExecutingPayroll(false); } }}
                                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:shadow-lg hover:shadow-indigo-600/30 transition-all flex items-center justify-center gap-2">
                                {isExecutingPayroll ? <><RefreshCw size={14} className="animate-spin" /> Processing...</> : <><CreditCard size={14} /> Execute Payroll</>}
                            </button>
                        </div>

                        {/* Payroll Draft */}
                        <div className="lg:col-span-2 card-primary border border-border rounded-[2.5rem] shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-border bg-elevated/30">
                                <h3 className="text-lg font-black text-main uppercase tracking-tight">Salary Breakdown</h3>
                            </div>
                            <div className="divide-y divide-border/50 max-h-[420px] overflow-y-auto">
                                {employees.map(emp => (
                                    <div key={emp.id} className="flex items-center justify-between px-6 py-4 hover:bg-elevated/20 transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-indigo-600 flex items-center justify-center font-black text-xs">
                                                {(emp.name || emp.id).charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-main">{emp.name || emp.id}</p>
                                                <p className="text-[9px] text-muted font-bold">{emp.salaryType}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <p className="text-sm font-black text-main font-mono">{(emp.salary || 0).toLocaleString()} <span className="text-[9px] text-muted">LE</span></p>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const w = window.open('', '_blank', 'width=600,height=800');
                                                    if (!w) return;
                                                    w.document.write(`<html><head><title>Payslip - ${emp.name || emp.id}</title><style>body{font-family:'Tajawal',system-ui,sans-serif;padding:40px;color:#1e293b}h1,h2{font-family:'Cairo',system-ui,sans-serif}h1{font-size:24px;margin:0}h2{font-size:16px;color:#6366f1;margin:4px 0 24px}.header{border-bottom:3px solid #6366f1;padding-bottom:16px;margin-bottom:24px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0}.row:last-child{border-bottom:none}.label{color:#64748b;font-size:13px}.value{font-family:'Cairo',system-ui,sans-serif;font-weight:700;font-size:14px}.total{font-family:'Cairo',system-ui,sans-serif;font-size:20px;font-weight:900;color:#6366f1;border-top:3px solid #6366f1;margin-top:16px;padding-top:16px;text-align:right}.footer{margin-top:40px;font-size:11px;color:#94a3b8;text-align:center}@media print{body{padding:20px}}</style></head><body><div class='header'><h1>Coduis Zen ERP</h1><h2>Monthly Payslip</h2></div><div class='row'><span class='label'>Employee</span><span class='value'>${emp.name || emp.id}</span></div><div class='row'><span class='label'>Role</span><span class='value'>${emp.role || 'Staff'}</span></div><div class='row'><span class='label'>National ID</span><span class='value'>${emp.nationalId || '—'}</span></div><div class='row'><span class='label'>Bank Account</span><span class='value'>${emp.bankAccount || '—'}</span></div><div class='row'><span class='label'>Salary Type</span><span class='value'>${emp.salaryType || 'Monthly'}</span></div><div class='row'><span class='label'>Basic Salary</span><span class='value'>${(emp.salary || 0).toLocaleString()} LE</span></div><div class='row'><span class='label'>Social Insurance (11%)</span><span class='value'>-${((emp.salary || 0) * 0.11).toLocaleString()} LE</span></div><div class='row'><span class='label'>Tax Deduction (est.)</span><span class='value'>-${((emp.salary || 0) * 0.05).toLocaleString()} LE</span></div><div class='total'>Net Pay: ${((emp.salary || 0) * 0.84).toLocaleString()} LE</div><div class='footer'>Generated on ${new Date().toLocaleDateString()} · Coduis Zen ERP</div></body></html>`);
                                                    w.document.close();
                                                    setTimeout(() => w.print(), 300);
                                                }}
                                                className="p-1.5 rounded-lg text-muted hover:text-indigo-500 hover:bg-indigo-500/10 transition-all" title="Print Payslip">
                                                <Printer size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Payroll History */}
                    {payrollCycles.length > 0 && (
                        <div className="card-primary border border-border rounded-[2.5rem] shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-border bg-elevated/30">
                                <h3 className="text-lg font-black text-main uppercase tracking-tight">Payroll History</h3>
                            </div>
                            <div className="responsive-table">
                                <table className="w-full text-left">
                                    <thead className="bg-app/50 text-[9px] font-black uppercase text-muted tracking-[0.2em]">
                                        <tr>
                                            <th className="px-6 py-4">Cycle ID</th>
                                            <th className="px-4 py-4">Period</th>
                                            <th className="px-4 py-4 text-right">Amount</th>
                                            <th className="px-4 py-4 text-right">Entries</th>
                                            <th className="px-6 py-4">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {payrollCycles.map((cycle: any) => (
                                            <tr key={cycle.id} className="hover:bg-elevated/20 transition-all">
                                                <td className="px-6 py-4 font-mono text-[10px] text-main">{cycle.id.slice(0, 8)}</td>
                                                <td className="px-4 py-4 text-[10px] text-muted">{new Date(cycle.startDate).toLocaleDateString()} ? {new Date(cycle.endDate).toLocaleDateString()}</td>
                                                <td className="px-4 py-4 text-right font-mono text-xs font-black text-main">{Number(cycle.totalAmount || 0).toLocaleString()} LE</td>
                                                <td className="px-4 py-4 text-right font-mono text-xs">{cycle.entries || 0}</td>
                                                <td className="px-6 py-4"><span className="px-2.5 py-1 rounded-lg text-[9px] font-black bg-emerald-500/10 text-emerald-500">{cycle.status || 'CLOSED'}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Payout Ledger */}
                    {payoutLedger.length > 0 && (
                        <div className="card-primary border border-border rounded-[2.5rem] shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-border bg-elevated/30">
                                <h3 className="text-lg font-black text-main uppercase tracking-tight">Payout Ledger ({payoutLedger.length})</h3>
                            </div>
                            <div className="divide-y divide-border/50 max-h-[300px] overflow-y-auto">
                                {payoutLedger.map((p: any) => {
                                    const emp = employees.find(e => e.id === p.employeeId);
                                    return (
                                        <div key={p.id} className="flex items-center justify-between px-6 py-3 hover:bg-elevated/20">
                                            <div>
                                                <p className="text-[10px] font-black text-main">{emp?.name || p.employeeId}</p>
                                                <p className="text-[9px] text-muted font-mono">{p.postedAt ? new Date(p.postedAt).toLocaleDateString() : '—'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-black text-main font-mono">{Number(p.amount || 0).toLocaleString()} LE</p>
                                                <span className={`text-[8px] font-black uppercase ${p.status === 'PAID' ? 'text-emerald-500' : 'text-amber-500'}`}>{p.status}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ??????????? DEPARTMENTS TAB ??????????? */}
            {activeTab === 'departments' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-150">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Departments */}
                        <div className="card-primary border border-border rounded-[2.5rem] shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-border bg-elevated/30 flex items-center justify-between">
                                <h3 className="text-lg font-black text-main uppercase tracking-tight">Departments ({departments.length})</h3>
                            </div>
                            <div className="divide-y divide-border/50">
                                {departments.map((dept: any) => (
                                    <div key={dept.id} className="flex items-center justify-between px-6 py-4 hover:bg-elevated/20 transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center"><Building2 size={16} /></div>
                                            <div>
                                                <p className="text-xs font-black text-main">{dept.name}</p>
                                                {dept.managerId && <p className="text-[9px] text-muted">Manager: {dept.managerId}</p>}
                                            </div>
                                        </div>
                                        <span className="text-[9px] font-black uppercase text-muted bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">{dept.employeeCount || 0} staff</span>
                                    </div>
                                ))}
                                {departments.length === 0 && <p className="text-center text-muted py-12 text-sm">No departments configured.</p>}
                            </div>
                        </div>

                        {/* Job Titles */}
                        <div className="card-primary border border-border rounded-[2.5rem] shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-border bg-elevated/30 flex items-center justify-between gap-4">
                                <h3 className="text-lg font-black text-main uppercase tracking-tight">Job Titles ({jobTitles.length})</h3>
                                <button onClick={openAddJobTitle} className="px-4 py-3 rounded-2xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all">
                                    <Plus size={14} /> Add
                                </button>
                            </div>
                            <div className="divide-y divide-border/50 max-h-[560px] overflow-y-auto custom-scrollbar">
                                {jobTitles.map((jt: any) => (
                                    <div key={jt.id} className="flex items-center justify-between px-6 py-4 hover:bg-elevated/20 transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center"><Briefcase size={16} /></div>
                                            <div>
                                                <p className="text-xs font-black text-main">{jt.title || jt.name}</p>
                                                {jt.nameAr && jt.nameAr !== (jt.title || jt.name) && <p className="text-[9px] text-muted mt-1">{jt.nameAr}</p>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => openEditJobTitle(jt)} className="w-9 h-9 rounded-xl bg-elevated/70 text-muted hover:text-indigo-500 hover:bg-indigo-500/10 flex items-center justify-center transition-all" title="Edit job title">
                                                <Pencil size={14} />
                                            </button>
                                            <button onClick={() => handleDeleteJobTitle(jt)} className="w-9 h-9 rounded-xl bg-elevated/70 text-muted hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-all" title="Delete job title">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {jobTitles.length === 0 && <p className="text-center text-muted py-12 text-sm">No job titles configured.</p>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ??????????? EMPLOYEE MODAL ??????????? */}
            {showEmployeeModal && (
                <div className="fixed inset-0 bg-black/80  z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150" onClick={() => setShowEmployeeModal(false)}>
                    <div className="bg-card border border-border/50 rounded-[3rem] w-full max-w-xl shadow-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[100px] -z-10" />
                        
                        <div className="p-8 border-b border-border/20 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-main tracking-tighter uppercase">{editingEmployee ? 'Update Profile' : 'New Employee'}</h3>
                                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">Fill out the essential staff details</p>
                            </div>
                            <button onClick={() => setShowEmployeeModal(false)} className="w-12 h-12 rounded-2xl bg-elevated/50 flex items-center justify-center text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all border border-border/20"><X size={20} /></button>
                        </div>
                        
                        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {[
                                    { key: 'name', label: 'Full Name', icon: Users, span: 'col-span-2' },
                                    { key: 'phone', label: 'Phone Number', icon: Phone },
                                    { key: 'email', label: 'Email Address', icon: Mail },
                                    { key: 'nationalId', label: 'National ID', icon: ShieldCheck },
                                    { key: 'basicSalary', label: 'Basic Salary (LE)', icon: Wallet },
                                    { key: 'emergencyContact', label: 'Emergency Contact', icon: AlertTriangle },
                                    { key: 'bankAccount', label: 'Bank Account/Iban', icon: CreditCard },
                                ].map(f => (
                                    <div key={f.key} className={f.span || ''}>
                                        <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-2 block ml-1">{f.label}</label>
                                        <div className="relative group">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-indigo-500 transition-colors">
                                                <f.icon size={16} />
                                            </div>
                                            <input type="text" value={(empForm as any)[f.key]} onChange={e => setEmpForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                                className="w-full pl-12 pr-4 py-4 bg-app/50 border border-border/40 rounded-2xl text-xs font-bold outline-none focus:border-indigo-500/50 focus:bg-app transition-all text-main" placeholder={`Enter ${f.label.toLowerCase()}`} />
                                        </div>
                                    </div>
                                ))}
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-2 block ml-1">Assigned Role</label>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-indigo-500">
                                            <Briefcase size={16} />
                                        </div>
                                        <select value={empForm.role} onChange={e => e.target.value && setEmpForm(prev => ({ ...prev, role: e.target.value }))}
                                            className="w-full pl-12 pr-10 py-4 bg-app/50 border border-border/40 rounded-2xl text-xs font-bold outline-none focus:border-indigo-500/50 focus:bg-app transition-all text-main appearance-none cursor-pointer">
                                            {[...new Set([
                                                empForm.role,
                                                ...jobTitles.map((job: any) => job.title || job.name).filter(Boolean),
                                                'STAFF', 'CASHIER', 'WAITER', 'COOK', 'MANAGER', 'ADMIN', 'DRIVER', 'SUPERVISOR',
                                            ])].map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                        <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-muted rotate-90 pointer-events-none" size={16} />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-2 block ml-1">Department / Section</label>
                                    <select
                                        value={empForm.departmentId}
                                        onChange={e => setEmpForm(prev => ({ ...prev, departmentId: e.target.value, jobTitleId: '' }))}
                                        className="w-full px-4 py-4 bg-app/50 border border-border/40 rounded-2xl text-xs font-bold outline-none focus:border-indigo-500/50 focus:bg-app transition-all text-main"
                                    >
                                        <option value="">Choose department...</option>
                                        {sectionOptions.map((department: any) => (
                                            <option key={department.id} value={department.id}>{department.nameAr || department.name} - {getDepartmentName(department.parentId)}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-2 block ml-1">Job Title</label>
                                    <select
                                        value={empForm.jobTitleId}
                                        onChange={e => {
                                            const jobTitle = jobTitles.find((job: any) => job.id === e.target.value);
                                            setEmpForm(prev => ({
                                                ...prev,
                                                jobTitleId: e.target.value,
                                                role: jobTitle?.title || jobTitle?.name || prev.role,
                                            }));
                                        }}
                                        className="w-full px-4 py-4 bg-app/50 border border-border/40 rounded-2xl text-xs font-bold outline-none focus:border-indigo-500/50 focus:bg-app transition-all text-main"
                                    >
                                        <option value="">Choose job title...</option>
                                        {filteredJobTitleOptions.map((job: any) => (
                                            <option key={job.id} value={job.id}>{job.nameAr || job.title || job.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-8 border-t border-border/20 bg-elevated/30 flex gap-4">
                            <button onClick={() => setShowEmployeeModal(false)} className="flex-1 px-6 py-4 bg-app border border-border rounded-2xl text-xs font-black text-muted uppercase tracking-widest hover:bg-border transition-colors">Cancel Changes</button>
                            <button onClick={handleSaveEmployee} className="flex-[1.5] px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-95 transition-all">
                                <Save size={18} />
                                {editingEmployee ? 'Confirm Updates' : 'Create Staff Member'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ??????????? JOB TITLE MODAL ??????????? */}
            {showJobTitleModal && (
                <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150" onClick={() => setShowJobTitleModal(false)}>
                    <div className="bg-card border border-border/50 rounded-[3rem] w-full max-w-lg shadow-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 blur-[100px] -z-10" />

                        <div className="p-8 border-b border-border/20 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-main tracking-tighter uppercase">{editingJobTitle ? 'Update Job Title' : 'New Job Title'}</h3>
                                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">Manage titles used by employee profiles</p>
                            </div>
                            <button onClick={() => setShowJobTitleModal(false)} className="w-12 h-12 rounded-2xl bg-elevated/50 flex items-center justify-center text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all border border-border/20"><X size={20} /></button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-2 block ml-1">Job Title</label>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-indigo-500 transition-colors">
                                        <Briefcase size={16} />
                                    </div>
                                    <input type="text" value={jobTitleForm.name} onChange={e => setJobTitleForm(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full pl-12 pr-4 py-4 bg-app/50 border border-border/40 rounded-2xl text-xs font-bold outline-none focus:border-indigo-500/50 focus:bg-app transition-all text-main" placeholder="مثال: مدير فرع" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-2 block ml-1">Arabic Display Name</label>
                                <input type="text" value={jobTitleForm.nameAr} onChange={e => setJobTitleForm(prev => ({ ...prev, nameAr: e.target.value }))}
                                    className="w-full px-4 py-4 bg-app/50 border border-border/40 rounded-2xl text-xs font-bold outline-none focus:border-indigo-500/50 focus:bg-app transition-all text-main" placeholder="اختياري" />
                            </div>
                            <p className="rounded-2xl border border-border/40 bg-app/50 px-4 py-4 text-[11px] font-bold text-muted">
                                Job titles are global. Assign each employee to a department separately from the employee profile.
                            </p>
                        </div>

                        <div className="p-8 border-t border-border/20 bg-elevated/30 flex gap-4">
                            <button onClick={() => setShowJobTitleModal(false)} className="flex-1 px-6 py-4 bg-app border border-border rounded-2xl text-xs font-black text-muted uppercase tracking-widest hover:bg-border transition-colors">Cancel</button>
                            <button onClick={handleSaveJobTitle} disabled={!jobTitleForm.name.trim()} className="flex-[1.5] px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100">
                                <Save size={18} />
                                {editingJobTitle ? 'Save Changes' : 'Create Job Title'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ??????????? LEAVE REQUEST MODAL ??????????? */}
            {showLeaveModal && (
                <div className="fixed inset-0 bg-black/80  z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150" onClick={() => setShowLeaveModal(false)}>
                    <div className="bg-card border border-border/50 rounded-[3rem] w-full max-w-xl shadow-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[100px] -z-10" />
                        
                        <div className="p-8 border-b border-border/20 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-main tracking-tighter uppercase">Leave Registration</h3>
                                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">Submit a formal time-off request</p>
                            </div>
                            <button onClick={() => setShowLeaveModal(false)} className="w-12 h-12 rounded-2xl bg-elevated/50 flex items-center justify-center text-muted hover:text-rose-500 transition-all border border-border/20"><X size={20} /></button>
                        </div>
                        
                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-2 block ml-1">Staff Member</label>
                                    <select value={leaveForm.employeeId} onChange={e => setLeaveForm(prev => ({ ...prev, employeeId: e.target.value }))}
                                        className="w-full px-6 py-4 bg-app/50 border border-border/40 rounded-2xl text-xs font-bold outline-none focus:border-indigo-500/50 transition-all text-main">
                                        <option value="">Choose Employee...</option>
                                        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name || emp.id}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-2 block ml-1">Type of Leave</label>
                                    <select value={leaveForm.leaveTypeId} onChange={e => setLeaveForm(prev => ({ ...prev, leaveTypeId: e.target.value }))}
                                        className="w-full px-6 py-4 bg-app/50 border border-border/40 rounded-2xl text-xs font-bold outline-none focus:border-indigo-500/50 transition-all text-main">
                                        <option value="">Select Category...</option>
                                        {leaveTypes.map((lt: any) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-2 block ml-1">Start Date</label>
                                    <input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(prev => ({ ...prev, startDate: e.target.value }))}
                                        className="w-full px-6 py-4 bg-app/50 border border-border/40 rounded-2xl text-xs font-bold outline-none text-main" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-2 block ml-1">End Date</label>
                                    <input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm(prev => ({ ...prev, endDate: e.target.value }))}
                                        className="w-full px-6 py-4 bg-app/50 border border-border/40 rounded-2xl text-xs font-bold outline-none text-main" />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-muted mb-2 block ml-1">Reason / justificaiton</label>
                                    <textarea value={leaveForm.reason} onChange={e => setLeaveForm(prev => ({ ...prev, reason: e.target.value }))} rows={3}
                                        className="w-full px-6 py-4 bg-app/50 border border-border/40 rounded-2xl text-xs font-bold outline-none resize-none text-main focus:border-indigo-500/50 transition-all" placeholder="Explain the reason for leave..." />
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-8 border-t border-border/20 bg-elevated/30 flex gap-4">
                            <button onClick={() => setShowLeaveModal(false)} className="flex-1 px-6 py-4 bg-app border border-border rounded-2xl text-xs font-black text-muted uppercase tracking-widest">Withdraw</button>
                            <button onClick={handleSubmitLeave} className="flex-[1.5] px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-95 transition-all">
                                <Save size={18} />
                                Submit Request
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
};

export default ZenPeople;
