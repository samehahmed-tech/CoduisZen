import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, LineChart, Line } from 'recharts';
import { BadgeDollarSign, CalendarDays, Clock3, TrendingUp, Users, Wallet, ShieldAlert, TimerReset, BriefcaseBusiness } from 'lucide-react';
import { useAuthStore } from '../../../stores/useAuthStore';
import ReportDataTable, { fmtMoney, fmtNum } from './shared/ReportDataTable';
import CoverageReportView from './shared/CoverageReportView';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

const labels = {
   ar: {
      executive: 'الملخص التنفيذي',
      payroll: 'ملخص الرواتب',
      payrollLedger: 'كشف استحقاقات الموظفين',
      attendance: 'الحضور والتأخير',
      exceptions: 'الغياب والاستثناءات',
      overtime: 'الساعات الإضافية',
      staffCost: 'تكلفة العمالة',
      salesPerHour: 'الإيراد لكل ساعة عمل',
      productivity: 'إنتاجية الموظفين',
      noData: 'لا توجد بيانات للفترة الحالية.',
      employee: 'الموظف',
      role: 'الوظيفة',
      amount: 'القيمة',
      status: 'الحالة',
      employees: 'الموظفون',
      cycles: 'الدورات',
      totalPayroll: 'إجمالي الرواتب',
      netPay: 'صافي المستحق',
      deductions: 'الاستقطاعات',
      overtimeAmount: 'الإضافي',
      basicSalary: 'الأساسي',
      totalDays: 'أيام العمل',
      present: 'حضور',
      late: 'تأخير',
      absent: 'غياب',
      sick: 'مرضي',
      totalHours: 'الساعات',
      avgDay: 'متوسط اليوم',
      totalLaborHours: 'ساعات العمل',
      revenue: 'الإيراد',
      staffCostRatio: 'نسبة العمالة',
      costPerEmployee: 'متوسط تكلفة الموظف',
      workDays: 'أيام العمل',
      overtimeHours: 'الساعات الإضافية',
      overtimeCost: 'تكلفة الإضافي',
      hourlyRate: 'أجر الساعة',
      avgTicket: 'متوسط الطلب',
      orders: 'الطلبات',
      rank: 'الترتيب',
      branchImpact: 'الصورة العامة للفترة',
      payrollHealth: 'صحة الرواتب',
      attendanceHealth: 'الانضباط والحضور',
      teamOutput: 'مخرجات الفريق',
      keyNote: 'مؤشرات الفترة الحالية',
      exceptionNote: 'الموظفون الذين يحتاجون متابعة مباشرة',
      productivityNote: 'الأعلى تأثيرًا خلال الفترة المختارة',
      printReady: 'جاهز للطباعة والتصدير',
      currencySuffix: 'ج.م',
   },
   en: {
      executive: 'Executive Summary',
      payroll: 'Payroll Summary',
      payrollLedger: 'Payroll Ledger',
      attendance: 'Attendance & Delays',
      exceptions: 'Attendance Exceptions',
      overtime: 'Overtime Report',
      staffCost: 'Staff Cost',
      salesPerHour: 'Sales per Labor Hour',
      productivity: 'Employee Productivity',
      noData: 'No data available for the selected period.',
      employee: 'Employee',
      role: 'Role',
      amount: 'Amount',
      status: 'Status',
      employees: 'Employees',
      cycles: 'Cycles',
      totalPayroll: 'Total Payroll',
      netPay: 'Net Pay',
      deductions: 'Deductions',
      overtimeAmount: 'Overtime',
      basicSalary: 'Basic Salary',
      totalDays: 'Working Days',
      present: 'Present',
      late: 'Late',
      absent: 'Absent',
      sick: 'Sick',
      totalHours: 'Hours',
      avgDay: 'Avg/Day',
      totalLaborHours: 'Labor Hours',
      revenue: 'Revenue',
      staffCostRatio: 'Staff Cost Ratio',
      costPerEmployee: 'Cost / Employee',
      workDays: 'Work Days',
      overtimeHours: 'OT Hours',
      overtimeCost: 'OT Cost',
      hourlyRate: 'Hourly Rate',
      avgTicket: 'Avg Ticket',
      orders: 'Orders',
      rank: 'Rank',
      branchImpact: 'Period Snapshot',
      payrollHealth: 'Payroll Health',
      attendanceHealth: 'Attendance Health',
      teamOutput: 'Team Output',
      keyNote: 'Current period indicators',
      exceptionNote: 'Employees who need direct follow-up',
      productivityNote: 'Highest impact contributors in the selected range',
      printReady: 'Ready for print and export',
      currencySuffix: 'LE',
   },
} as const;

const StatCard = ({ icon: Icon, title, value, hint, tone = 'teal' }: any) => (
   <div className="rounded-[2rem] border border-border/50 bg-card/80 p-5 shadow-[0_20px_60px_-40px_rgba(15,118,110,0.45)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
         <div>
            <p className="text-[11px] font-black text-muted">{title}</p>
            <div className="mt-3 text-3xl font-black text-main">{value}</div>
            {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
         </div>
         <div className={cx('flex h-12 w-12 items-center justify-center rounded-2xl border', tone === 'amber' && 'border-amber-500/20 bg-amber-500/10 text-amber-500', tone === 'rose' && 'border-rose-500/20 bg-rose-500/10 text-rose-500', tone === 'blue' && 'border-blue-500/20 bg-blue-500/10 text-blue-500', tone === 'teal' && 'border-teal-500/20 bg-teal-500/10 text-teal-600')}>
            <Icon size={22} />
         </div>
      </div>
   </div>
);

const TableShell = ({ title, subtitle, children }: any) => (
   <section className="overflow-hidden rounded-[2.2rem] border border-border/50 bg-card/85 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
      <div className="flex flex-col gap-2 border-b border-border/40 bg-elevated/30 px-6 py-5 md:flex-row md:items-center md:justify-between">
         <div>
            <h3 className="text-lg font-black text-main">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
         </div>
      </div>
      {children}
   </section>
);

const EmptyState = ({ text }: { text: string }) => (
   <div className="flex min-h-[220px] items-center justify-center px-6 text-center text-sm font-bold text-muted">
      {text}
   </div>
);

const formatNumber = (value: unknown, locale: string, digits = 0) => {
   const parsed = Number(value || 0);
   return Number.isFinite(parsed) ? parsed.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '0';
};

export const HrReports = ({ state }: any) => {
   const { settings } = useAuthStore();
   const lang = settings.language === 'en' ? 'en' : 'ar';
   const t = labels[lang];
   const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
   const currency = settings.currencySymbol || t.currencySuffix;
   const {
      activeSubReport,
      payrollData,
      attendanceData,
      overtimeData,
      staffCostData,
      salesPerLaborData,
      empProductivityData,
      appliedRange,
      activeBranchName,
   } = state;

   const payrollPayouts = Array.isArray(payrollData?.payouts) ? payrollData.payouts : [];
   const payrollCycles = Array.isArray(payrollData?.cycles) ? payrollData.cycles : [];
   const attendanceRows = Array.isArray(attendanceData) ? attendanceData : [];
   const overtimeRows = Array.isArray(overtimeData) ? overtimeData : [];
   const productivityRows = Array.isArray(empProductivityData) ? empProductivityData : [];

   const exceptionRows = useMemo(
      () => attendanceRows.filter((row: any) => Number(row.lateDays || 0) > 0 || Number(row.absentDays || 0) > 0 || Number(row.sickDays || 0) > 0),
      [attendanceRows],
   );

   const attendanceChart = useMemo(() => attendanceRows.slice(0, 10).map((row: any) => ({
      name: row.employeeName,
      present: Number(row.presentDays || 0),
      late: Number(row.lateDays || 0),
      absent: Number(row.absentDays || 0),
   })), [attendanceRows]);

   const productivityChart = useMemo(() => productivityRows.slice(0, 8).map((row: any, index: number) => ({
      name: row.userId || `${t.employee} ${index + 1}`,
      revenue: Number(row.revenue || 0),
      orders: Number(row.orderCount || 0),
   })), [productivityRows, t.employee]);

    const approvedPayroll = payrollData?.approvedTotal ?? payrollData?.totalPayroll;
    const draftPayroll = Math.max(0, Number(payrollData?.totalPayroll || 0) - Number(approvedPayroll || 0));
    const executiveStats = [
      {
         icon: Wallet,
         title: t.totalPayroll,
         value: `${formatNumber(approvedPayroll, locale, 0)} ${currency}`,
         hint: draftPayroll > 0
            ? `${formatNumber(payrollPayouts.length, locale)} ${t.employees} · ${lang === 'ar' ? `مسودات ${formatNumber(draftPayroll, locale, 0)}` : `drafts ${formatNumber(draftPayroll, locale, 0)}`}`
            : `${formatNumber(payrollPayouts.length, locale)} ${t.employees}`,
         tone: 'teal',
      },
      {
         icon: CalendarDays,
         title: t.attendanceHealth,
         value: `${formatNumber(attendanceRows.reduce((sum: number, row: any) => sum + Number(row.presentDays || 0), 0), locale)} / ${formatNumber(attendanceRows.reduce((sum: number, row: any) => sum + Number(row.totalDays || 0), 0), locale)}`,
         hint: t.keyNote,
         tone: 'blue',
      },
      {
         icon: Clock3,
         title: t.overtimeHours,
         value: `${formatNumber(overtimeRows.reduce((sum: number, row: any) => sum + Number(row.overtimeHours || 0), 0), locale, 1)}h`,
         hint: `${formatNumber(overtimeRows.reduce((sum: number, row: any) => sum + Number(row.overtimeCost || 0), 0), locale, 0)} ${currency}`,
         tone: 'amber',
      },
      {
         icon: TrendingUp,
         title: t.salesPerHour,
         value: `${formatNumber(salesPerLaborData?.salesPerLaborHour, locale, 1)} ${currency}`,
         hint: `${formatNumber(salesPerLaborData?.totalLaborHours, locale, 1)}h ${t.totalLaborHours}`,
         tone: 'rose',
      },
   ];

   const renderExecutiveSummary = () => (
      <div className="space-y-6">
         <section className="overflow-hidden rounded-[2.5rem] border border-teal-500/15 bg-[linear-gradient(135deg,rgba(15,118,110,0.12),rgba(15,23,42,0.04))] p-6 shadow-[0_28px_90px_-50px_rgba(15,118,110,0.45)]">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
               <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/15 bg-white/60 px-3 py-1 text-[11px] font-black text-teal-700 dark:bg-white/5 dark:text-teal-300">
                     <BriefcaseBusiness size={14} />
                     {t.executive}
                  </div>
                  <h2 className="mt-4 text-3xl font-black text-main">{t.branchImpact}</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
                     {activeBranchName} | {appliedRange.start} - {appliedRange.end}
                  </p>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                     {executiveStats.map((card) => <StatCard key={card.title} {...card} />)}
                  </div>
               </div>
               <div className="rounded-[2rem] border border-border/40 bg-card/75 p-5 backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-3">
                     <div>
                        <p className="text-[11px] font-black text-muted">{t.teamOutput}</p>
                        <h3 className="mt-2 text-xl font-black text-main">{t.productivity}</h3>
                     </div>
                     <div className="rounded-2xl border border-teal-500/15 bg-teal-500/10 p-3 text-teal-600">
                        <Users size={22} />
                     </div>
                  </div>
                  {productivityChart.length === 0 ? (
                     <EmptyState text={t.noData} />
                  ) : (
                     <div className="mt-5 h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                           <BarChart data={productivityChart} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
                              <XAxis dataKey="name" tick={{ fill: 'rgb(100 116 139)', fontSize: 11 }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fill: 'rgb(100 116 139)', fontSize: 11 }} axisLine={false} tickLine={false} />
                              <Tooltip />
                              <Bar dataKey="revenue" fill="#0f766e" radius={[10, 10, 0, 0]} />
                           </BarChart>
                        </ResponsiveContainer>
                     </div>
                  )}
               </div>
            </div>
         </section>

         <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <TableShell title={t.attendanceHealth} subtitle={t.keyNote}>
               {attendanceChart.length === 0 ? (
                  <EmptyState text={t.noData} />
               ) : (
                  <div className="h-[360px] px-4 py-4">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={attendanceChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
                           <XAxis dataKey="name" tick={{ fill: 'rgb(100 116 139)', fontSize: 11 }} axisLine={false} tickLine={false} />
                           <YAxis tick={{ fill: 'rgb(100 116 139)', fontSize: 11 }} axisLine={false} tickLine={false} />
                           <Tooltip />
                           <Bar dataKey="present" stackId="a" fill="#14b8a6" radius={[10, 10, 0, 0]} />
                           <Bar dataKey="late" stackId="a" fill="#f59e0b" />
                           <Bar dataKey="absent" stackId="a" fill="#ef4444" />
                        </BarChart>
                     </ResponsiveContainer>
                  </div>
               )}
            </TableShell>

            <TableShell title={t.exceptionNote} subtitle={t.printReady}>
               {exceptionRows.length === 0 ? (
                  <EmptyState text={t.noData} />
               ) : (
                  <div className="space-y-3 p-4">
                     {exceptionRows.slice(0, 8).map((row: any) => (
                        <div key={row.employeeName} className="rounded-2xl border border-border/40 bg-app/50 p-4">
                           <div className="flex items-start justify-between gap-4">
                              <div>
                                 <div className="text-sm font-black text-main">{row.employeeName}</div>
                                 <div className="mt-1 text-xs text-muted">{row.role}</div>
                              </div>
                              <div className="rounded-xl bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-500">
                                 {Number(row.absentDays || 0)} {t.absent}
                              </div>
                           </div>
                           <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                              <div className="rounded-xl bg-elevated/50 px-3 py-2"><div className="font-black text-main">{row.lateDays}</div><div className="mt-1 text-muted">{t.late}</div></div>
                              <div className="rounded-xl bg-elevated/50 px-3 py-2"><div className="font-black text-main">{row.absentDays}</div><div className="mt-1 text-muted">{t.absent}</div></div>
                              <div className="rounded-xl bg-elevated/50 px-3 py-2"><div className="font-black text-main">{row.sickDays}</div><div className="mt-1 text-muted">{t.sick}</div></div>
                           </div>
                        </div>
                     ))}
                  </div>
               )}
            </TableShell>
         </div>
          <ReportDataTable
             title={lang === 'ar' ? 'الإنتاجية — جدول' : 'Productivity — table'}
             data={productivityChart}
             columns={[
                { key: 'name', label: lang === 'ar' ? 'الموظف' : 'Employee' },
                { key: 'revenue', label: lang === 'ar' ? 'الإيراد' : 'Revenue', align: 'right', sum: true, format: (v: any) => fmtMoney(v, settings?.currencySymbol || 'LE') },
             ]}
             exportFilename="hr-productivity"
             lang={lang}
          />
          <ReportDataTable
             title={lang === 'ar' ? 'الحضور — جدول' : 'Attendance — table'}
             data={attendanceChart}
             columns={[
                { key: 'name', label: lang === 'ar' ? 'الموظف' : 'Employee' },
                { key: 'present', label: lang === 'ar' ? 'حاضر' : 'Present', align: 'right', sum: true, format: (v: any) => fmtNum(v) },
                { key: 'late', label: lang === 'ar' ? 'متأخر' : 'Late', align: 'right', sum: true, format: (v: any) => fmtNum(v) },
                { key: 'absent', label: lang === 'ar' ? 'غائب' : 'Absent', align: 'right', sum: true, format: (v: any) => fmtNum(v) },
             ]}
             exportFilename="hr-attendance-summary"
             lang={lang}
          />
       </div>
    );

    const renderPayroll = (ledger = false) => (
      <div className="space-y-6">
         <div className="grid gap-4 md:grid-cols-4">
            <StatCard icon={BadgeDollarSign} title={t.totalPayroll} value={`${formatNumber(payrollData?.approvedTotal ?? payrollData?.totalPayroll, locale, 0)} ${currency}`} hint={t.payrollHealth} />
            <StatCard icon={Users} title={t.employees} value={formatNumber(payrollPayouts.length, locale)} hint={t.printReady} tone="blue" />
            <StatCard icon={CalendarDays} title={t.cycles} value={formatNumber(payrollCycles.length, locale)} hint={t.keyNote} tone="amber" />
            <StatCard icon={Wallet} title={t.netPay} value={`${formatNumber(payrollData?.approvedTotal ?? payrollPayouts.reduce((sum: number, row: any) => sum + Number(row.netPay || 0), 0), locale, 0)} ${currency}`} hint={t.payroll} tone="teal" />
         </div>

         <TableShell title={ledger ? t.payrollLedger : t.payroll} subtitle={t.printReady}>
            {payrollPayouts.length === 0 ? (
               <EmptyState text={t.noData} />
            ) : (
               <div className="overflow-x-auto">
                  <table className="w-full min-w-[940px] text-sm">
                     <thead>
                        <tr className="border-b border-border/40 bg-elevated/20 text-muted">
                           <th className="px-5 py-4 text-start font-black">{t.employee}</th>
                           <th className="px-4 py-4 text-start font-black">{t.role}</th>
                           <th className="px-4 py-4 text-center font-black">{t.basicSalary}</th>
                           <th className="px-4 py-4 text-center font-black">{t.overtimeAmount}</th>
                           <th className="px-4 py-4 text-center font-black">{t.deductions}</th>
                           <th className="px-4 py-4 text-center font-black">{t.netPay}</th>
                           <th className="px-5 py-4 text-center font-black">{t.status}</th>
                        </tr>
                     </thead>
                     <tbody>
                        {payrollPayouts.map((row: any, index: number) => (
                           <tr key={`${row.employeeName}-${index}`} className="border-b border-border/30 hover:bg-elevated/20">
                              <td className="px-5 py-4 font-black text-main">{row.employeeName}</td>
                              <td className="px-4 py-4 text-muted">{row.role}</td>
                              <td className="px-4 py-4 text-center font-bold text-main">{formatNumber(row.basicSalary, locale, 0)}</td>
                              <td className="px-4 py-4 text-center font-bold text-teal-600">{formatNumber(row.overtime, locale, 0)}</td>
                              <td className="px-4 py-4 text-center font-bold text-rose-500">{formatNumber(row.deductions, locale, 0)}</td>
                              <td className="px-4 py-4 text-center font-black text-main">{formatNumber(row.netPay, locale, 0)}</td>
                              <td className="px-5 py-4 text-center">
                                 <span className="rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-xs font-black text-teal-600">{row.status || '-'}</span>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            )}
         </TableShell>
      </div>
   );

   const renderAttendance = (exceptions = false) => {
      const rows = exceptions ? exceptionRows : attendanceRows;
      return (
         <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
               <StatCard icon={Users} title={t.employees} value={formatNumber(rows.length, locale)} hint={exceptions ? t.exceptionNote : t.attendanceHealth} />
               <StatCard icon={CalendarDays} title={t.present} value={formatNumber(rows.reduce((sum: number, row: any) => sum + Number(row.presentDays || 0), 0), locale)} hint={t.totalDays} tone="blue" />
               <StatCard icon={ShieldAlert} title={t.late} value={formatNumber(rows.reduce((sum: number, row: any) => sum + Number(row.lateDays || 0), 0), locale)} hint={t.exceptionNote} tone="amber" />
               <StatCard icon={TimerReset} title={t.absent} value={formatNumber(rows.reduce((sum: number, row: any) => sum + Number(row.absentDays || 0), 0), locale)} hint={t.printReady} tone="rose" />
            </div>

            <TableShell title={exceptions ? t.exceptions : t.attendance} subtitle={exceptions ? t.exceptionNote : t.keyNote}>
               {rows.length === 0 ? (
                  <EmptyState text={t.noData} />
               ) : (
                  <div className="overflow-x-auto">
                     <table className="w-full min-w-[1080px] text-sm">
                        <thead>
                           <tr className="border-b border-border/40 bg-elevated/20 text-muted">
                              <th className="px-5 py-4 text-start font-black">{t.employee}</th>
                              <th className="px-4 py-4 text-start font-black">{t.role}</th>
                              <th className="px-4 py-4 text-center font-black">{t.totalDays}</th>
                              <th className="px-4 py-4 text-center font-black">{t.present}</th>
                              <th className="px-4 py-4 text-center font-black">{t.late}</th>
                              <th className="px-4 py-4 text-center font-black">{t.absent}</th>
                              <th className="px-4 py-4 text-center font-black">{t.sick}</th>
                              <th className="px-4 py-4 text-center font-black">{t.totalHours}</th>
                              <th className="px-5 py-4 text-center font-black">{t.avgDay}</th>
                           </tr>
                        </thead>
                        <tbody>
                           {rows.map((row: any, index: number) => (
                              <tr key={`${row.employeeName}-${index}`} className="border-b border-border/30 hover:bg-elevated/20">
                                 <td className="px-5 py-4 font-black text-main">{row.employeeName}</td>
                                 <td className="px-4 py-4 text-muted">{row.role}</td>
                                 <td className="px-4 py-4 text-center font-bold">{formatNumber(row.totalDays, locale)}</td>
                                 <td className="px-4 py-4 text-center font-bold text-teal-600">{formatNumber(row.presentDays, locale)}</td>
                                 <td className="px-4 py-4 text-center font-bold text-amber-500">{formatNumber(row.lateDays, locale)}</td>
                                 <td className="px-4 py-4 text-center font-bold text-rose-500">{formatNumber(row.absentDays, locale)}</td>
                                 <td className="px-4 py-4 text-center font-bold text-blue-500">{formatNumber(row.sickDays, locale)}</td>
                                 <td className="px-4 py-4 text-center font-bold">{formatNumber(row.totalHours, locale, 1)}</td>
                                 <td className="px-5 py-4 text-center font-bold text-muted">{formatNumber(row.avgHoursPerDay, locale, 1)}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               )}
            </TableShell>
         </div>
      );
   };

   const renderOvertime = () => (
      <div className="space-y-6">
         <div className="grid gap-4 md:grid-cols-4">
            <StatCard icon={Clock3} title={t.overtimeHours} value={`${formatNumber(overtimeRows.reduce((sum: number, row: any) => sum + Number(row.overtimeHours || 0), 0), locale, 1)}h`} hint={t.overtime} />
            <StatCard icon={Wallet} title={t.overtimeCost} value={`${formatNumber(overtimeRows.reduce((sum: number, row: any) => sum + Number(row.overtimeCost || 0), 0), locale, 0)} ${currency}`} hint={t.amount} tone="blue" />
            <StatCard icon={Users} title={t.employees} value={formatNumber(overtimeRows.length, locale)} hint={t.printReady} tone="amber" />
            <StatCard icon={CalendarDays} title={t.workDays} value={formatNumber(overtimeRows.reduce((sum: number, row: any) => sum + Number(row.workDays || 0), 0), locale)} hint={t.totalDays} tone="teal" />
         </div>

         <TableShell title={t.overtime} subtitle={t.keyNote}>
            {overtimeRows.length === 0 ? (
               <EmptyState text={t.noData} />
            ) : (
               <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                     <thead>
                        <tr className="border-b border-border/40 bg-elevated/20 text-muted">
                           <th className="px-5 py-4 text-start font-black">{t.employee}</th>
                           <th className="px-4 py-4 text-start font-black">{t.role}</th>
                           <th className="px-4 py-4 text-center font-black">{t.workDays}</th>
                           <th className="px-4 py-4 text-center font-black">{t.totalHours}</th>
                           <th className="px-4 py-4 text-center font-black">{t.overtimeHours}</th>
                           <th className="px-4 py-4 text-center font-black">{t.hourlyRate}</th>
                           <th className="px-5 py-4 text-center font-black">{t.overtimeCost}</th>
                        </tr>
                     </thead>
                     <tbody>
                        {overtimeRows.map((row: any, index: number) => (
                           <tr key={`${row.employeeName}-${index}`} className="border-b border-border/30 hover:bg-elevated/20">
                              <td className="px-5 py-4 font-black text-main">{row.employeeName}</td>
                              <td className="px-4 py-4 text-muted">{row.role}</td>
                              <td className="px-4 py-4 text-center font-bold">{formatNumber(row.workDays, locale)}</td>
                              <td className="px-4 py-4 text-center font-bold">{formatNumber(row.totalHours, locale, 1)}</td>
                              <td className="px-4 py-4 text-center font-bold text-amber-500">{formatNumber(row.overtimeHours, locale, 1)}</td>
                              <td className="px-4 py-4 text-center font-bold text-muted">{formatNumber(row.effectiveHourlyRate ?? row.hourlyRate, locale, 2)}{row.rateEstimated ? <span className="ml-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black text-amber-600">{lang === 'ar' ? 'تقديري' : 'est.'}</span> : null}</td>
                              <td className="px-5 py-4 text-center font-black text-teal-600">{formatNumber(row.overtimeCost, locale, 0)} {currency}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            )}
         </TableShell>
      </div>
   );

   const renderStaffCost = () => (
      <div className="space-y-6">
         <div className="rounded-2xl border border-border/40 bg-elevated/20 px-4 py-3 text-[11px] font-bold text-muted">{lang === 'ar' ? 'المقام إجمالي الإيراد (شامل الضريبة والخدمة) — قد يختلف عن نسب التكلفة المحسوبة على الصافي.' : 'Revenue here is gross (incl. tax/service) — may differ from net-basis cost ratios.'}{Number(staffCostData?.staffCostPercent || 0) > 100 ? (lang === 'ar' ? ' تجاوزت النسبة 100% — تحقق من الفترة.' : ' Ratio exceeds 100% — check the period.') : ''}</div>
         <div className="grid gap-4 md:grid-cols-4">
            <StatCard icon={TrendingUp} title={t.revenue} value={`${formatNumber(staffCostData?.revenue, locale, 0)} ${currency}`} hint={t.branchImpact} />
            <StatCard icon={Wallet} title={t.staffCost} value={`${formatNumber(staffCostData?.staffCost, locale, 0)} ${currency}`} hint={t.totalPayroll} tone="blue" />
            <StatCard icon={Users} title={t.employees} value={formatNumber(staffCostData?.employeeCount, locale)} hint={t.keyNote} tone="amber" />
            <StatCard icon={BadgeDollarSign} title={t.staffCostRatio} value={`${formatNumber(staffCostData?.staffCostPercent, locale, 1)}%`} hint={`${formatNumber(staffCostData?.costPerEmployee, locale, 0)} ${currency}`} tone="rose" />
         </div>
         <TableShell title={t.staffCost} subtitle={t.printReady}>
            <div className="grid gap-6 p-6 lg:grid-cols-[0.9fr_1.1fr]">
               <div className="rounded-[2rem] border border-border/40 bg-app/40 p-5">
                  <div className="space-y-4">
                     <div className="flex items-center justify-between text-sm"><span className="text-muted">{t.revenue}</span><span className="font-black text-main">{formatNumber(staffCostData?.revenue, locale, 0)} {currency}</span></div>
                     <div className="flex items-center justify-between text-sm"><span className="text-muted">{t.staffCost}</span><span className="font-black text-main">{formatNumber(staffCostData?.staffCost, locale, 0)} {currency}</span></div>
                     <div className="flex items-center justify-between text-sm"><span className="text-muted">{t.costPerEmployee}</span><span className="font-black text-main">{formatNumber(staffCostData?.costPerEmployee, locale, 0)} {currency}</span></div>
                     <div>
                        <div className="mb-2 flex items-center justify-between text-sm"><span className="text-muted">{t.staffCostRatio}</span><span className="font-black text-rose-500">{formatNumber(staffCostData?.staffCostPercent, locale, 1)}%</span></div>
                        <div className="h-3 overflow-hidden rounded-full bg-elevated/60">
                           <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" style={{ width: `${Math.min(Number(staffCostData?.staffCostPercent || 0), 100)}%` }} />
                        </div>
                     </div>
                  </div>
               </div>
               <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={[{ name: t.revenue, value: Number(staffCostData?.revenue || 0) }, { name: t.staffCost, value: Number(staffCostData?.staffCost || 0) }]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
                        <XAxis dataKey="name" tick={{ fill: 'rgb(100 116 139)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'rgb(100 116 139)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#0f766e" radius={[12, 12, 0, 0]} />
                     </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>
         </TableShell>
      </div>
   );

   const renderSalesPerHour = () => (
      <div className="space-y-6">
         <div className="grid gap-4 md:grid-cols-4">
            <StatCard icon={TrendingUp} title={t.revenue} value={`${formatNumber(salesPerLaborData?.revenue, locale, 0)} ${currency}`} hint={t.branchImpact} />
            <StatCard icon={Clock3} title={t.totalLaborHours} value={`${formatNumber(salesPerLaborData?.totalLaborHours, locale, 1)}h`} hint={t.keyNote} tone="blue" />
            <StatCard icon={CalendarDays} title={t.totalDays} value={formatNumber(salesPerLaborData?.totalLaborDays, locale)} hint={t.printReady} tone="amber" />
            <StatCard icon={BadgeDollarSign} title={t.salesPerHour} value={`${formatNumber(salesPerLaborData?.salesPerLaborHour, locale, 1)} ${currency}`} hint={t.payrollHealth} tone="teal" />
         </div>
         <TableShell title={t.salesPerHour} subtitle={t.printReady}>
            <div className="grid gap-6 p-6 lg:grid-cols-[0.95fr_1.05fr]">
               <div className="space-y-4 rounded-[2rem] border border-border/40 bg-app/40 p-5">
                  <div className="flex items-center justify-between text-sm"><span className="text-muted">{t.revenue}</span><span className="font-black text-main">{formatNumber(salesPerLaborData?.revenue, locale, 0)} {currency}</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-muted">{t.totalLaborHours}</span><span className="font-black text-main">{formatNumber(salesPerLaborData?.totalLaborHours, locale, 1)}h</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-muted">{t.totalDays}</span><span className="font-black text-main">{formatNumber(salesPerLaborData?.totalLaborDays, locale)}</span></div>
                  <div className="rounded-2xl border border-teal-500/20 bg-teal-500/10 p-4 text-sm font-black text-teal-700 dark:text-teal-300">
                     {t.salesPerHour}: {formatNumber(salesPerLaborData?.salesPerLaborHour, locale, 1)} {currency}
                  </div>
               </div>
               <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={[{ name: t.salesPerHour, value: Number(salesPerLaborData?.salesPerLaborHour || 0) }]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
                        <XAxis dataKey="name" tick={{ fill: 'rgb(100 116 139)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'rgb(100 116 139)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#0f766e" radius={[14, 14, 0, 0]} />
                     </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>
         </TableShell>
      </div>
   );

   const renderProductivity = () => (
      <div className="space-y-6">
         <div className="grid gap-4 md:grid-cols-4">
            <StatCard icon={Users} title={t.employees} value={formatNumber(productivityRows.length, locale)} hint={t.productivityNote} />
            <StatCard icon={BadgeDollarSign} title={t.revenue} value={`${formatNumber(productivityRows.reduce((sum: number, row: any) => sum + Number(row.revenue || 0), 0), locale, 0)} ${currency}`} hint={t.teamOutput} tone="blue" />
            <StatCard icon={BriefcaseBusiness} title={t.orders} value={formatNumber(productivityRows.reduce((sum: number, row: any) => sum + Number(row.orderCount || 0), 0), locale)} hint={t.keyNote} tone="amber" />
            <StatCard icon={TrendingUp} title={t.avgTicket} value={`${formatNumber((() => { const rev = productivityRows.reduce((sum: number, row: any) => sum + Number(row.revenue || 0), 0); const ord = productivityRows.reduce((sum: number, row: any) => sum + Number(row.orderCount || 0), 0); return ord > 0 ? rev / ord : 0; })(), locale, 1)} ${currency}`} hint={t.printReady} tone="teal" />
         </div>
         <TableShell title={t.productivity} subtitle={t.productivityNote}>
            {productivityRows.length === 0 ? (
               <EmptyState text={t.noData} />
            ) : (
               <div className="grid gap-0 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="overflow-x-auto">
                     <table className="w-full min-w-[760px] text-sm">
                        <thead>
                           <tr className="border-b border-border/40 bg-elevated/20 text-muted">
                              <th className="px-5 py-4 text-start font-black">{t.rank}</th>
                              <th className="px-4 py-4 text-start font-black">{t.employee}</th>
                              <th className="px-4 py-4 text-center font-black">{t.orders}</th>
                              <th className="px-4 py-4 text-center font-black">{t.revenue}</th>
                              <th className="px-5 py-4 text-center font-black">{t.avgTicket}</th>
                           </tr>
                        </thead>
                        <tbody>
                           {productivityRows.map((row: any, index: number) => (
                              <tr key={`${row.userId}-${index}`} className="border-b border-border/30 hover:bg-elevated/20">
                                 <td className="px-5 py-4 font-black text-teal-600">#{index + 1}</td>
                                 <td className="px-4 py-4 font-black text-main">{row.userId}</td>
                                 <td className="px-4 py-4 text-center font-bold">{formatNumber(row.orderCount, locale)}</td>
                                 <td className="px-4 py-4 text-center font-bold">{formatNumber(row.revenue, locale, 0)} {currency}</td>
                                 <td className="px-5 py-4 text-center font-bold text-muted">{formatNumber(row.avgTicket, locale, 1)} {currency}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
                  <div className="h-[360px] p-4">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={productivityChart}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
                           <XAxis dataKey="name" tick={{ fill: 'rgb(100 116 139)', fontSize: 11 }} axisLine={false} tickLine={false} />
                           <YAxis tick={{ fill: 'rgb(100 116 139)', fontSize: 11 }} axisLine={false} tickLine={false} />
                           <Tooltip />
                           <Bar dataKey="orders" fill="#0ea5e9" radius={[12, 12, 0, 0]} />
                        </BarChart>
                     </ResponsiveContainer>
                  </div>
               </div>
            )}
         </TableShell>
      </div>
   );

   if (activeSubReport === 'HR Executive Summary') return renderExecutiveSummary();
   if (activeSubReport === 'Payroll Summary') return renderPayroll(false);
   if (activeSubReport === 'Payroll Ledger') return renderPayroll(true);
   if (activeSubReport === 'Attendance & Delays') return renderAttendance(false);
   if (activeSubReport === 'Attendance Exceptions') return renderAttendance(true);
   if (activeSubReport === 'Overtime Report') return renderOvertime();
   if (activeSubReport === 'Staff Cost %') return renderStaffCost();
   if (activeSubReport === 'Sales per Labor Hour') return renderSalesPerHour();
   if (activeSubReport === 'Employee Productivity') return renderProductivity();
   if (activeSubReport === 'Leave & Absence' || activeSubReport === 'Shift Tasks Completion' || activeSubReport === 'Headcount & Turnover') {
      return (
         <CoverageReportView
            reportName={activeSubReport}
            rows={(state as any).customReportRows?.[activeSubReport] || []}
            meta={(state as any).customReportMeta?.[activeSubReport]}
            lang={lang}
            currency={currency}
         />
      );
   }

   return <EmptyState text={t.noData} />;
};
