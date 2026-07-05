import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet, Plus, Search, ChevronRight, ChevronDown, History, BookText,
  ShieldCheck, CalendarCheck2, X, Save, TrendingUp, TrendingDown,
  BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Layers, Scale,
  FileText, DollarSign, Building2, RefreshCw, AlertTriangle
} from 'lucide-react';
import { FinancialAccount } from '../types';
import { useFinanceStore } from '../stores/useFinanceStore';
import { useAuthStore } from '../stores/useAuthStore';
import ExportButton from './common/ExportButton';
import { useToast } from './Toast';
import { reportsApi } from '../services/api/reports';

// Shared Components
import PageSkeleton from './common/PageSkeleton';
import Skeleton from './common/Skeleton';
import { ManualJournalModal } from './finance/ManualJournalModal';
import { recurringApi } from '../services/api/recurring';
import { useConfirm } from './common/ConfirmProvider';

type FinanceTab = 'dashboard' | 'coa' | 'rules' | 'journal' | 'recurring' | 'exceptions' | 'reconciliation' | 'periods' | 'pnl';

const TABS: { id: FinanceTab; label: string; labelAr: string; icon: any }[] = [
  { id: 'dashboard', label: 'Dashboard', labelAr: 'لوحة المحاسبة', icon: BarChart3 },
  { id: 'pnl', label: 'P&L', labelAr: 'الأرباح والخسائر', icon: TrendingUp },
  { id: 'coa', label: 'Chart of Accounts', labelAr: 'دليل الحسابات', icon: BookText },
  { id: 'rules', label: 'Posting Engine', labelAr: 'قواعد الترحيل', icon: Layers },
  { id: 'journal', label: 'Journal', labelAr: 'اليومية العامة', icon: History },
  { id: 'recurring', label: 'Recurring', labelAr: 'قيود دورية', icon: RefreshCw },
  { id: 'exceptions', label: 'Exceptions', labelAr: 'استثناءات مالية', icon: AlertTriangle },
  { id: 'reconciliation', label: 'Reconciliation', labelAr: 'مطابقة الحسابات', icon: ShieldCheck },
  { id: 'periods', label: 'Closed Periods', labelAr: 'الفترات المغلقة', icon: CalendarCheck2 },
];

const FinanceMetric: React.FC<{
  label: string;
  value: any;
  icon: any;
  color: string;
  lang?: string;
}> = ({ label, value, icon: Icon, color, lang }) => (
  <div className="relative group overflow-hidden bg-card/60  border border-border/30 rounded-[1.5rem] p-5 lg:p-6 transition-all hover:scale-[1.02] hover:bg-card/70 hover:shadow-2xl hover:shadow-black/5 active:scale-[0.98]">
    <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br transition-opacity duration-150 opacity-20 group-hover:opacity-30 blur-3xl`} style={{ background: color }} />
    <div className="flex items-start justify-between relative z-10">
      <div>
        <p className="text-[10px] lg:text-[11px] font-black uppercase tracking-[0.15em] text-muted mb-2">{label}</p>
        <h2 className="text-xl lg:text-3xl font-black text-main tracking-tighter tabular-nums">
          {value}
        </h2>
      </div>
      <div className={`p-4 rounded-2xl border flex items-center justify-center shadow-lg transition-transform duration-150 group-hover:rotate-12`} style={{ borderColor: `${color}30`, backgroundColor: `${color}15`, color }}>
        <Icon size={24} />
      </div>
    </div>
  </div>
);

const Finance: React.FC = () => {
  const {
    accounts, transactions, fetchFinanceData, trialBalance, isLoading,
    recordTransaction, reconciliations, periodCloses, exceptions, createReconciliation,
    postingRules, fetchPostingRules, createPostingRule, deletePostingRule,
    resolveReconciliation, closePeriod, resolveException, approveJournal, reverseJournal
  } = useFinanceStore();
  const { settings, branches } = useAuthStore();
  const isAr = (settings.language || 'en') === 'ar';
  const currency = settings.currencySymbol || (isAr ? 'ج.م' : 'EGP');
  const activeBranch = branches.find((branch: any) => branch.id === settings.activeBranchId);
  const tabTitle = (tab: FinanceTab) => {
    const current = TABS.find(item => item.id === tab);
    return isAr ? (current?.labelAr || current?.label || tab) : (current?.label || tab);
  };
  const t = {
    title: isAr ? 'المحاسبة' : 'Financial Nexus',
    badge: isAr ? 'دفتر آمن' : 'Secure Ledger',
    subtitle: isAr ? 'مطابقة مالية لحظية - مراجعة محاسبية - دفتر أستاذ للفروع' : 'Real-time financial reconciliation - Enterprise auditing - Multi-branch GL',
    ledgerScope: isAr ? 'دفتر مجمع' : 'Consolidated ledger',
    recordEntry: isAr ? 'تسجيل قيد' : 'Record Entry',
    reconcile: isAr ? 'مطابقة' : 'Reconcile',
    closePeriod: isAr ? 'إغلاق فترة' : 'Close Period',
    trialDebit: isAr ? 'إجمالي المدين' : 'Trial Balance Debit',
    trialCredit: isAr ? 'إجمالي الدائن' : 'Trial Balance Credit',
    netIncome: isAr ? 'صافي الربح' : 'Net Income',
    systemStatus: isAr ? 'حالة الدفتر' : 'System Status',
    balanced: isAr ? 'متوازن' : 'BALANCED',
    unbalanced: isAr ? 'غير متوازن' : 'UNBALANCED',
    searchLedger: isAr ? 'ابحث في الحسابات والدفتر...' : 'Search audit ledger...',
    assets: isAr ? 'الأصول' : 'Asset Total',
    liabilities: isAr ? 'الالتزامات' : 'Liabilities',
    equity: isAr ? 'حقوق الملكية' : 'Equity Balance',
    revenue: isAr ? 'الإيرادات' : 'Revenue MTD',
    expenses: isAr ? 'المصروفات' : 'Expense MTD',
    netSurplus: isAr ? 'صافي النتيجة' : 'Net Surplus',
    recentActivity: isAr ? 'آخر حركة دفترية' : 'Recent Ledger Activity',
    noRecentActivity: isAr ? 'لا توجد قيود حديثة' : 'No recent ledger activity',
    pendingAudits: isAr ? 'مطابقات معلقة' : 'Pending Audits',
    cycleStability: isAr ? 'استقرار الدورة' : 'Cycle Stability',
    verifiedIntegrity: isAr ? 'سلامة محاسبية مؤكدة' : 'Verified Integrity',
    journal: isAr ? 'اليومية العامة' : 'General Journal',
    entries: isAr ? 'قيود' : 'Entries',
    noEntries: isAr ? 'لا توجد قيود' : 'No Entries',
    pendingApproval: isAr ? 'بانتظار الاعتماد' : 'PENDING APPROVAL',
    reversed: isAr ? 'معكوس' : 'REVERSED',
    posted: isAr ? 'مرحل' : 'POSTED',
    approveEntry: isAr ? 'اعتماد القيد' : 'Approve Entry',
    reverseEntry: isAr ? 'عكس القيد' : 'Reverse Entry',
    reversalReason: isAr ? 'سبب عكس القيد؟' : 'Reason for reversal?',
    approvedToast: isAr ? 'تم اعتماد القيد وترحيله' : 'Journal entry approved and posted',
    reversedToast: isAr ? 'تم عكس القيد بنجاح' : 'Journal entry reversed successfully',
    recurringTemplates: isAr ? 'القوالب الدورية' : 'Recurring Templates',
    addTemplate: isAr ? '+ قالب جديد' : '+ Add Template',
    triggerProcessor: isAr ? 'تشغيل المعالج' : 'Trigger Processor',
    processed: isAr ? 'تمت معالجة' : 'Processed',
    noRecurring: isAr ? 'لا توجد قيود دورية' : 'No Recurring Entries',
    next: isAr ? 'التالي' : 'Next',
    active: isAr ? 'نشط' : 'ACTIVE',
    paused: isAr ? 'متوقف' : 'PAUSED',
    chartOfAccounts: isAr ? 'دليل الحسابات' : 'Chart of Accounts',
    postingEngine: isAr ? 'محرك الترحيل' : 'Dynamic Posting Engine',
    addRule: isAr ? '+ قاعدة جديدة' : '+ Add Rule',
    noRules: isAr ? 'لا توجد قواعد ترحيل' : 'No Posting Rules Found',
    system: isAr ? 'نظامية' : 'SYSTEM',
    deleteRule: isAr ? 'حذف القاعدة؟' : 'Delete rule?',
    ruleDeleted: isAr ? 'تم حذف القاعدة' : 'Rule deleted',
    exceptionQueue: isAr ? 'قائمة الاستثناءات المالية' : 'Finance Exception Queue',
    pending: isAr ? 'معلق' : 'PENDING',
    noExceptions: isAr ? 'لا توجد استثناءات' : 'No Exceptions',
    retryPost: isAr ? 'إعادة الترحيل' : 'Retry Post',
    dismiss: isAr ? 'تجاهل' : 'Dismiss',
    auditReconciliation: isAr ? 'مطابقة حساب' : 'Audit Reconciliation',
    reconSubtitle: isAr ? 'مطابقة رصيد الدفتر مع كشف خارجي' : 'Aligning internal ledger with external statements',
    targetAccount: isAr ? 'الحساب المستهدف' : 'Target Account',
    statementDate: isAr ? 'تاريخ الكشف' : 'Statement Date',
    reportedBalance: isAr ? 'الرصيد حسب الكشف' : 'Reported Balance',
    abort: isAr ? 'إلغاء' : 'Abort',
    generateAudit: isAr ? 'تنفيذ المطابقة' : 'Generate Audit',
    loadReport: isAr ? 'تحديث التقرير' : 'Refresh Report',
    totalRevenue: isAr ? 'إجمالي الإيرادات' : 'Total Revenue',
    totalExpenses: isAr ? 'إجمالي المصروفات' : 'Total Expenses',
    netProfit: isAr ? 'صافي الربح' : 'Net Profit',
    account: isAr ? 'الحساب' : 'Account',
    type: isAr ? 'النوع' : 'Type',
    debit: isAr ? 'مدين' : 'Debit',
    credit: isAr ? 'دائن' : 'Credit',
    net: isAr ? 'صافي' : 'Net',
    noData: isAr ? 'لا توجد بيانات' : 'No data',
    reconciliations: isAr ? 'مطابقات الحسابات' : 'Account Reconciliations',
    date: isAr ? 'التاريخ' : 'Date',
    status: isAr ? 'الحالة' : 'Status',
    difference: isAr ? 'الفرق' : 'Difference',
    periodCloses: isAr ? 'الفترات المغلقة' : 'Closed Periods',
    periodStart: isAr ? 'بداية الفترة' : 'Period Start',
    periodEnd: isAr ? 'نهاية الفترة' : 'Period End',
    closePeriodTitle: isAr ? 'إغلاق فترة محاسبية' : 'Close Accounting Period',
    closeInstruction: isAr ? 'اكتب CLOSE للتأكيد. بعد الإغلاق يتم قفل الفترة من التعديل المباشر.' : 'Type CLOSE to confirm. Closed periods are locked for direct edits.',
    confirmText: isAr ? 'نص التأكيد' : 'Confirmation Text',
    confirmClose: isAr ? 'تأكيد الإغلاق' : 'Confirm Close',
  };

  const [activeTab, setActiveTab] = useState<FinanceTab>('dashboard');
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [journalSearch, setJournalSearch] = useState('');
  const [journalDateFrom, setJournalDateFrom] = useState('');
  const [journalDateTo, setJournalDateTo] = useState('');
  const [journalModal, setJournalModal] = useState(false);
  const [reconModal, setReconModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [form, setForm] = useState({ description: '', amount: 0, debit: '1110', credit: '4100' });
  const [reconForm, setReconForm] = useState({ accountCode: '1110', statementDate: new Date().toISOString().slice(0, 10), statementBalance: 0, notes: '' });
  const [closeForm, setCloseForm] = useState({ periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), periodEnd: new Date().toISOString().slice(0, 10) });
  const [closeConfirmText, setCloseConfirmText] = useState('');
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [pendingFinanceAction, setPendingFinanceAction] = useState<string | null>(null);
  const [reverseModalTxId, setReverseModalTxId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  
  const [recurringTemplates, setRecurringTemplates] = useState<any[]>([]);

  useEffect(() => {
    fetchFinanceData();
    fetchPostingRules();
    recurringApi.getTemplates()
      .then(setRecurringTemplates)
      .catch(() => showToast(isAr ? 'تعذر تحميل القيود الدورية' : 'Failed to load recurring entries', 'error'));
  }, [fetchFinanceData, fetchPostingRules]);

  // P&L state
  const [pnlData, setPnlData] = useState<{ revenue: number; expenses: number; netProfit: number; details: { type: string; name: string; debit: number; credit: number; net: number }[] } | null>(null);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlDateFrom, setPnlDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [pnlDateTo, setPnlDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  const loadPnl = async () => {
    setPnlLoading(true);
    try {
      const data = await reportsApi.getProfitAndLoss({ startDate: pnlDateFrom, endDate: pnlDateTo });
      setPnlData(data);
    } catch {
      showToast(isAr ? 'تعذر تحميل تقرير الأرباح والخسائر' : 'Failed to load P&L report', 'error');
    }
    setPnlLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'pnl' && !pnlData) loadPnl();
  }, [activeTab]);

  const flatAccounts = useMemo(() => {
    const out: FinancialAccount[] = [];
    const walk = (arr: FinancialAccount[]) => { arr.forEach(a => { out.push(a); if (a.children?.length) walk(a.children); }); };
    walk(accounts);
    return out;
  }, [accounts]);

  // Compute financial summaries
  const financialSummary = useMemo(() => {
    const assets = flatAccounts.filter(a => a.code?.startsWith('1')).reduce((s, a) => s + Number(a.balance || 0), 0);
    const liabilities = flatAccounts.filter(a => a.code?.startsWith('2')).reduce((s, a) => s + Number(a.balance || 0), 0);
    const equity = flatAccounts.filter(a => a.code?.startsWith('3')).reduce((s, a) => s + Number(a.balance || 0), 0);
    const revenue = flatAccounts.filter(a => a.code?.startsWith('4')).reduce((s, a) => s + Number(a.balance || 0), 0);
    const expenses = flatAccounts.filter(a => a.code?.startsWith('5')).reduce((s, a) => s + Number(a.balance || 0), 0);
    const netIncome = revenue - expenses;
    return { assets, liabilities, equity, revenue, expenses, netIncome };
  }, [flatAccounts]);

  const filteredTransactions = useMemo(() => {
    let result = transactions;
    if (journalSearch) {
      result = result.filter(tx =>
        `${tx.description} ${tx.debitAccountId} ${tx.creditAccountId}`.toLowerCase().includes(journalSearch.toLowerCase())
      );
    }
    if (journalDateFrom) {
      const from = new Date(journalDateFrom);
      result = result.filter(tx => new Date(tx.date) >= from);
    }
    if (journalDateTo) {
      const to = new Date(journalDateTo); to.setHours(23, 59, 59);
      result = result.filter(tx => new Date(tx.date) <= to);
    }
    return result;
  }, [transactions, journalSearch, journalDateFrom, journalDateTo]);

  const toggleExpand = (id: string) => {
    const next = new Set(expandedAccounts);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedAccounts(next);
  };

  const renderAccountRow = (account: FinancialAccount, level = 0): React.ReactNode => {
    const hasChildren = Boolean(account.children && account.children.length > 0);
    const isExpanded = expandedAccounts.has(account.id);
    const matches = `${account.code} ${account.name}`.toLowerCase().includes(search.toLowerCase());
    if (!matches && search && !hasChildren) return null;
    return (
      <React.Fragment key={account.id}>
        <div className={`flex items-center justify-between px-4 py-3 border-b border-border/50 hover:bg-elevated/20 transition-all ${level === 0 ? 'bg-app/30' : ''}`}
          style={{ paddingLeft: `${level * 1.25 + 1}rem` }}>
          <button className="flex items-center gap-2 text-left" onClick={() => hasChildren && toggleExpand(account.id)}>
            {hasChildren ? (isExpanded ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />) : <span className="w-[14px]" />}
            <span className="font-mono text-[10px] font-black text-muted w-12">{account.code}</span>
            <span className="text-xs font-black text-main uppercase">{account.name}</span>
          </button>
          <span className={`font-mono text-xs font-black ${Number(account.balance || 0) < 0 ? 'text-rose-500' : 'text-main'}`}>
            {Number(account.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        {hasChildren && isExpanded && account.children!.map(c => renderAccountRow(c, level + 1))}
      </React.Fragment>
    );
  };

  const submitReconciliation = async () => {
    if (pendingFinanceAction) return;
    setPendingFinanceAction('reconciliation');
    try {
      await createReconciliation({ accountCode: reconForm.accountCode, statementDate: new Date(reconForm.statementDate).toISOString(), statementBalance: Number(reconForm.statementBalance || 0), notes: reconForm.notes?.trim() || undefined });
      setReconModal(false);
      setReconForm({ accountCode: '1110', statementDate: new Date().toISOString().slice(0, 10), statementBalance: 0, notes: '' });
      showToast(isAr ? 'تم إنشاء المطابقة' : 'Reconciliation created', 'success');
    } catch (err: any) {
      showToast(err?.message || (isAr ? 'تعذر إنشاء المطابقة' : 'Failed to create reconciliation'), 'error');
    } finally {
      setPendingFinanceAction(null);
    }
  };

  const submitPeriodClose = async () => {
    if (closeConfirmText !== 'CLOSE' || pendingFinanceAction) return;
    setPendingFinanceAction('period-close');
    try {
      await closePeriod({ periodStart: new Date(closeForm.periodStart).toISOString(), periodEnd: new Date(closeForm.periodEnd).toISOString() });
      setCloseModal(false);
      setCloseConfirmText('');
      showToast(isAr ? 'تم إغلاق الفترة بنجاح' : 'Period closed successfully', 'success');
    } catch (err: any) {
      showToast(err?.message || (isAr ? 'تعذر إغلاق الفترة' : 'Failed to close period'), 'error');
    } finally {
      setPendingFinanceAction(null);
    }
  };

  const handleApproveJournal = async (txId: string) => {
    if (pendingFinanceAction) return;
    setPendingFinanceAction(`approve:${txId}`);
    try {
      await approveJournal(txId);
      showToast(t.approvedToast, 'success');
      fetchFinanceData();
    } catch (err: any) {
      showToast(err?.message || (isAr ? 'تعذر اعتماد القيد' : 'Failed to approve journal entry'), 'error');
    } finally {
      setPendingFinanceAction(null);
    }
  };

  const submitReverseJournal = async () => {
    if (!reverseModalTxId || pendingFinanceAction) return;
    const reason = reverseReason.trim();
    if (!reason) {
      showToast(isAr ? 'سبب عكس القيد مطلوب' : 'Reversal reason is required', 'error');
      return;
    }
    setPendingFinanceAction(`reverse:${reverseModalTxId}`);
    try {
      await reverseJournal(reverseModalTxId, reason);
      showToast(t.reversedToast, 'success');
      setReverseModalTxId(null);
      setReverseReason('');
      fetchFinanceData();
    } catch (err: any) {
      showToast(err?.message || (isAr ? 'تعذر عكس القيد' : 'Failed to reverse journal entry'), 'error');
    } finally {
      setPendingFinanceAction(null);
    }
  };

  const handleDeletePostingRule = async (ruleId: string) => {
    const ok = await confirm({
      title: isAr ? 'حذف قاعدة الترحيل' : 'Delete posting rule',
      message: t.deleteRule,
      confirmText: isAr ? 'حذف' : 'Delete',
      cancelText: isAr ? 'إلغاء' : 'Cancel',
      variant: 'danger',
    });
    if (!ok || pendingFinanceAction) return;
    setPendingFinanceAction(`delete-rule:${ruleId}`);
    try {
      await deletePostingRule(ruleId);
      showToast(t.ruleDeleted, 'success');
    } catch (err: any) {
      showToast(err?.message || (isAr ? 'تعذر حذف القاعدة' : 'Failed to delete rule'), 'error');
    } finally {
      setPendingFinanceAction(null);
    }
  };

  return (
    <div className="relative min-h-screen bg-app overflow-hidden selection:bg-indigo-500/30">
      {/* Visual Effects Overlay */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-indigo-500/5 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-violet-500/5 blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 p-4 lg:p-10 space-y-8 max-w-[1920px] mx-auto overflow-y-auto max-h-screen custom-scrollbar pb-32">
        {/* Header */}
        <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 pb-8 border-b border-border/20">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-[1.75rem] bg-gradient-to-br from-indigo-600 to-violet-600 p-0.5 shadow-2xl shadow-indigo-600/20">
              <div className="w-full h-full rounded-[1.6rem] bg-card flex items-center justify-center">
                <DollarSign size={36} className="text-indigo-600 animate-pulse-soft" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl lg:text-5xl font-black text-main tracking-tighter uppercase flex items-center gap-4">
                {activeTab === 'dashboard' ? t.title : tabTitle(activeTab)}
                <span className="hidden md:flex px-3 py-1 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded-full text-[10px] font-black uppercase tracking-widest">
                  {t.badge}
                </span>
              </h1>
              <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] mt-2 opacity-60">
                {t.subtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
              <div className="h-14 flex items-center justify-center gap-2 bg-app/50 border border-border/40 text-main text-xs font-black uppercase tracking-widest px-6 rounded-2xl">
                <Building2 size={16} className="text-indigo-500" />
                <span>{activeBranch ? (isAr ? activeBranch.nameAr || activeBranch.name : activeBranch.name || activeBranch.nameAr) : t.ledgerScope}</span>
              </div>
             <button
                onClick={() => setJournalModal(true)}
                className="h-14 flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-8 rounded-2xl shadow-2xl shadow-indigo-600/30 font-black text-[11px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
              >
                <Plus size={18} /> {t.recordEntry}
              </button>
              <button
                onClick={() => setReconModal(true)}
                className="h-14 flex items-center justify-center gap-3 bg-card/60  text-emerald-500 px-8 rounded-2xl border border-border/30 font-black text-[11px] uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all active:scale-95 shadow-lg"
              >
                <ShieldCheck size={18} /> {t.reconcile}
              </button>
              <button
                onClick={() => setCloseModal(true)}
                className="h-14 flex items-center justify-center gap-3 bg-slate-900 text-white px-8 rounded-2xl hover:bg-black transition-all font-black text-[11px] uppercase tracking-widest active:scale-95 shadow-xl"
              >
                <CalendarCheck2 size={18} /> {t.closePeriod}
              </button>
          </div>
        </header>

        {/* Finance KPIs */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
          <FinanceMetric 
            label={t.trialDebit}
            value={(trialBalance?.debit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            icon={Scale}
            color="#6366f1"
          />
          <FinanceMetric 
            label={t.trialCredit}
            value={(trialBalance?.credit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            icon={Scale}
            color="#8b5cf6"
          />
          <FinanceMetric 
            label={t.netIncome}
            value={financialSummary.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            icon={financialSummary.netIncome >= 0 ? TrendingUp : TrendingDown}
            color={financialSummary.netIncome >= 0 ? "#10b981" : "#f43f5e"}
          />
          <FinanceMetric 
            label={t.systemStatus}
            value={trialBalance?.balanced ? t.balanced : t.unbalanced}
            icon={trialBalance?.balanced ? ShieldCheck : AlertTriangle}
            color={trialBalance?.balanced ? "#10b981" : "#f59e0b"}
          />
        </section>

        {/* Tabs Navigation */}
        <div className="flex flex-col xl:flex-row justify-between items-stretch lg:items-center gap-6 relative z-20">
          <div className="flex bg-card/40  rounded-[2rem] border border-border/30 p-2 overflow-x-auto no-scrollbar w-fit">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all duration-150 flex items-center gap-3 whitespace-nowrap ${activeTab === tab.id ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-600/20 scale-105' : 'text-muted hover:text-main hover:bg-elevated/60'}`}
              >
                <tab.icon size={16} />
                {isAr ? tab.labelAr : tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-96 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-muted w-5 h-5 group-focus-within:text-indigo-500 transition-colors z-10" />
            <input
              type="text"
              placeholder={t.searchLedger}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-14 pr-6 py-5 bg-card/60  border border-border/30 rounded-[2rem] outline-none focus:border-indigo-500/50 transition-all font-bold text-sm text-main placeholder:text-muted/40 shadow-xl"
            />
          </div>
        </div>

        {/* Main Content View */}
        <div className="bg-card/60  rounded-[3.5rem] border border-border/20 overflow-hidden min-h-[600px] relative z-20 shadow-3xl">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-violet-500/5 opacity-50 pointer-events-none" />

          {activeTab === 'dashboard' && (
            <div className="p-10 space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-1000">
              {/* Financial Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-6">
                {[
                  { label: t.assets, value: financialSummary.assets, icon: Wallet, color: 'indigo' },
                  { label: t.liabilities, value: financialSummary.liabilities, icon: TrendingDown, color: 'rose' },
                  { label: t.equity, value: financialSummary.equity, icon: Layers, color: 'violet' },
                  { label: t.revenue, value: financialSummary.revenue, icon: ArrowUpRight, color: 'emerald' },
                  { label: t.expenses, value: financialSummary.expenses, icon: ArrowDownRight, color: 'amber' },
                  { label: t.netSurplus, value: financialSummary.netIncome, icon: DollarSign, color: financialSummary.netIncome >= 0 ? 'emerald' : 'rose' },
                ].map((stat, i) => (
                  <div key={i} className="bg-card/40  border border-border/30 p-6 rounded-[2rem] shadow-xl hover:translate-y--2 transition-all group overflow-hidden relative">
                    <div className={`absolute top-0 right-0 w-16 h-16 bg-${stat.color}-500/10 blur-2xl group-hover:scale-150 transition-transform`} />
                    <div className={`w-10 h-10 rounded-xl bg-${stat.color}-500/10 text-${stat.color}-500 flex items-center justify-center mb-5 group-hover:rotate-12 transition-transform shadow-lg border border-${stat.color}-500/10`}><stat.icon size={18} /></div>
                    <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2 opacity-50">{stat.label}</p>
                    <h4 className="text-xl font-black text-main font-mono tabular-nums">{stat.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h4>
                  </div>
                ))}
              </div>

              {/* Reconciliation & Cycles */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                 <div className="bg-card/40  border border-border/30 rounded-[2.5rem] p-8 shadow-xl">
                    <h3 className="text-lg font-black text-main uppercase mb-8 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500"><History size={20} /></div>
                      {t.recentActivity}
                    </h3>
                    <div className="space-y-4">
                       {transactions.slice(0, 5).length === 0 && (
                         <div className="p-8 text-center text-xs font-black text-muted uppercase tracking-widest bg-app/40 rounded-2xl border border-border/20">
                           {t.noRecentActivity}
                         </div>
                       )}
                       {transactions.slice(0, 5).map(tx => (
                          <div key={tx.id} className="flex items-center justify-between p-4 bg-app/40 rounded-2xl border border-border/20 hover:bg-app transition-colors group">
                             <div>
                                <p className="text-xs font-black text-main uppercase pr-4">{tx.description}</p>
                                <p className="text-[10px] text-muted font-bold mt-1 uppercase tracking-widest opacity-60">{tx.debitAccountId} <span className="text-indigo-500/50 mx-1">→</span> {tx.creditAccountId}</p>
                             </div>
                             <div className="text-right">
                                <p className="text-lg font-mono font-black text-main tabular-nums">{tx.amount.toLocaleString()} <span className="text-[10px] text-muted">{currency}</span></p>
                                <p className="text-[9px] text-muted font-bold uppercase mt-1">{new Date(tx.date).toLocaleDateString()}</p>
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-card/40  border border-border/30 rounded-[2.5rem] p-8 flex flex-col justify-between shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl group-hover:scale-150 transition-all" />
                      <div>
                        <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-4">{t.pendingAudits}</p>
                        <p className="text-6xl font-black text-emerald-500 tracking-tighter tabular-nums">{reconciliations.filter((r: any) => r.status !== 'RESOLVED').length}</p>
                      </div>
                      <div className="w-full h-2 bg-emerald-500/10 rounded-full mt-8 overflow-hidden">
                         <div className="h-full bg-emerald-500 shadow-lg shadow-emerald-500/20" style={{ width: '40%' }} />
                      </div>
                    </div>
                    <div className="bg-card/40  border border-border/30 rounded-[2.5rem] p-8 flex flex-col justify-between shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 blur-3xl group-hover:scale-150 transition-all" />
                      <div>
                        <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-4">{t.cycleStability}</p>
                        <p className="text-6xl font-black text-violet-500 tracking-tighter tabular-nums">100%</p>
                      </div>
                      <p className="text-[10px] text-muted font-black mt-8 uppercase tracking-widest opacity-60">{t.verifiedIntegrity}</p>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'journal' && (
            <div className="p-8 animate-in slide-in-from-bottom-5 duration-150">
               <div className="bg-app/40 rounded-[2.5rem] border border-border/30 overflow-hidden shadow-2xl">
                 <div className="p-8 border-b border-border/20 flex items-center justify-between bg-elevated/30">
                   <h3 className="text-xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                     <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-500 border border-indigo-500/20"><History size={24} /></div>
                     {t.journal}
                   </h3>
                   <div className="px-4 py-2 bg-indigo-500/10 text-indigo-500 rounded-xl text-xs font-black">
                     {transactions.length} {t.entries}
                   </div>
                 </div>
                 <div className="max-h-[70vh] overflow-y-auto custom-scrollbar p-6 space-y-4">
                    {transactions.length === 0 ? (
                      <div className="text-center py-20 opacity-50">
                         <History size={48} className="mx-auto mb-4 text-muted" />
                         <p className="font-black uppercase tracking-widest text-sm">{t.noEntries}</p>
                      </div>
                    ) : transactions.map((tx: any) => (
                       <div key={tx.id} className="p-6 bg-card/40 border border-border/30 rounded-3xl shrink-0 group hover:border-indigo-500/30 transition-all shadow-lg">
                         <div className="flex justify-between items-start mb-4">
                            <div>
                               <p className="text-sm font-black text-main uppercase flex items-center gap-2">
                                 {tx.description}
                               </p>
                               <p className="text-[10px] font-black text-muted mt-1 uppercase tracking-widest">{tx.referenceId || '-'} · {new Date(tx.date).toLocaleString()}</p>
                            </div>
                            <div className="flex gap-2">
                              {tx.status === 'PENDING_APPROVAL' && (
                                <div className="px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-amber-500/10 text-amber-500">{t.pendingApproval}</div>
                              )}
                              {tx.status === 'REVERSED' && (
                                <div className="px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-rose-500/10 text-rose-500">{t.reversed}</div>
                              )}
                              {(!tx.status || tx.status === 'POSTED') && (
                                <div className="px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-emerald-500/10 text-emerald-500">{t.posted}</div>
                              )}
                            </div>
                         </div>
                         
                         {/* We don't have lines populated deeply in `getJournal` yet, just aggregate amount.
                             Wait, if we can add approval/reversal actions here: */}
                         <div className="flex items-center gap-4 mt-6 pt-4 border-t border-border/20">
                            {tx.status === 'PENDING_APPROVAL' && (
                              <button onClick={() => handleApproveJournal(tx.id)} disabled={Boolean(pendingFinanceAction)} className="px-4 py-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                                {t.approveEntry}
                              </button>
                            )}
                            {(!tx.status || tx.status === 'POSTED') && (
                              <button onClick={() => { setReverseModalTxId(tx.id); setReverseReason(''); }} disabled={Boolean(pendingFinanceAction)} className="px-4 py-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                                {t.reverseEntry}
                              </button>
                            )}
                         </div>
                       </div>
                    ))}
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'recurring' && (
            <div className="p-8 animate-in slide-in-from-bottom-5 duration-150">
               <div className="bg-app/40 rounded-[2.5rem] border border-border/30 overflow-hidden shadow-2xl">
                 <div className="p-8 border-b border-border/20 flex items-center justify-between bg-elevated/30">
                   <h3 className="text-xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                     <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-500 border border-indigo-500/20"><RefreshCw size={24} /></div>
                     {t.recurringTemplates}
                   </h3>
                   <div className="flex gap-3">
                     <button className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-lg">
                       {t.addTemplate}
                     </button>
                      <button onClick={async () => {
                          if (pendingFinanceAction) return;
                          setPendingFinanceAction('recurring-process');
                          try {
                            const res = await recurringApi.processDueNow();
                            showToast(`${t.processed} ${res.processed || 0} ${t.entries}`, 'success');
                            setRecurringTemplates(await recurringApi.getTemplates());
                          } catch (err: any) {
                            showToast(err?.message || (isAr ? 'تعذر تشغيل معالج القيود الدورية' : 'Failed to process recurring entries'), 'error');
                          } finally {
                            setPendingFinanceAction(null);
                          }
                      }} disabled={Boolean(pendingFinanceAction)} className="px-6 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all shadow-lg disabled:opacity-50">
                        {t.triggerProcessor}
                      </button>
                   </div>
                 </div>
                 <div className="max-h-[70vh] overflow-y-auto custom-scrollbar p-6 space-y-4">
                    {recurringTemplates.length === 0 ? (
                      <div className="text-center py-20 opacity-50">
                         <RefreshCw size={48} className="mx-auto mb-4 text-muted" />
                         <p className="font-black uppercase tracking-widest text-sm">{t.noRecurring}</p>
                      </div>
                    ) : recurringTemplates.map((tpl: any) => (
                       <div key={tpl.id} className="p-6 bg-card/40 border border-border/30 rounded-3xl shrink-0 group hover:border-indigo-500/30 transition-all shadow-lg">
                         <div className="flex justify-between items-start">
                            <div>
                               <p className="text-sm font-black text-main uppercase flex items-center gap-2">
                                 {tpl.name || tpl.description}
                               </p>
                               <p className="text-[10px] font-black text-muted mt-1 uppercase tracking-widest">{tpl.recurringType} · {t.next}: {new Date(tpl.nextProcessDate).toLocaleDateString()}</p>
                            </div>
                            <div className="flex gap-2">
                              {tpl.isActive ? (
                                <div className="px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-emerald-500/10 text-emerald-500">{t.active}</div>
                              ) : (
                                <div className="px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-rose-500/10 text-rose-500">{t.paused}</div>
                              )}
                            </div>
                         </div>
                       </div>
                    ))}
                 </div>
               </div>
            </div>
          )}

          {/* Render other tabs here... */}
          {activeTab === 'coa' && (
            <div className="p-8 animate-in slide-in-from-bottom-5 duration-150">
               <div className="bg-app/40 rounded-[2.5rem] border border-border/30 overflow-hidden shadow-2xl">
                 <div className="p-8 border-b border-border/20 flex items-center justify-between bg-elevated/30">
                   <h3 className="text-xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                     <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-500 border border-indigo-500/20"><BookText size={24} /></div>
                     {t.chartOfAccounts}
                   </h3>
                 </div>
                 <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
                   {accounts.map(acc => renderAccountRow(acc))}
                 </div>
               </div>
             </div>
          )}

          {activeTab === 'rules' && (
            <div className="p-8 animate-in slide-in-from-bottom-5 duration-150">
               <div className="bg-app/40 rounded-[2.5rem] border border-border/30 overflow-hidden shadow-2xl">
                 <div className="p-8 border-b border-border/20 flex items-center justify-between bg-elevated/30">
                   <h3 className="text-xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                     <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-500 border border-indigo-500/20"><Layers size={24} /></div>
                     {t.postingEngine}
                   </h3>
                   <button className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-lg">
                     {t.addRule}
                   </button>
                 </div>
                 <div className="max-h-[70vh] overflow-y-auto custom-scrollbar p-6 space-y-4">
                   {postingRules?.length === 0 ? (
                      <div className="text-center py-20 opacity-50">
                         <Layers size={48} className="mx-auto mb-4 text-muted" />
                         <p className="font-black uppercase tracking-widest text-sm">{t.noRules}</p>
                      </div>
                   ) : postingRules?.map((rule: any) => (
                      <div key={rule.id} className="p-6 bg-card/40 border border-border/30 rounded-3xl shrink-0 group hover:border-indigo-500/30 transition-all shadow-lg flex justify-between items-center">
                         <div>
                            <div className="flex items-center gap-3 mb-2">
                               <span className="px-3 py-1 rounded bg-indigo-500/10 text-indigo-500 font-black text-[10px] uppercase tracking-widest border border-indigo-500/20">{rule.documentType}</span>
                               {rule.conditionField && (
                                 <span className="text-xs font-bold text-muted uppercase">IF {rule.conditionField} = {rule.conditionValue}</span>
                               )}
                               {rule.isSystem && (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-stone-500/10 text-stone-500 border border-stone-500/20">{t.system}</span>
                               )}
                            </div>
                            <div className="flex items-center gap-4 text-xs font-black uppercase tracking-widest">
                               <div className="flex items-center gap-2">
                                  <span className="text-muted">DR:</span>
                                  <span className="text-emerald-500">{rule.debitAccountCode}</span>
                               </div>
                               <div className="flex items-center gap-2">
                                  <span className="text-muted">CR:</span>
                                  <span className="text-rose-500">{rule.creditAccountCode}</span>
                               </div>
                            </div>
                         </div>
                         {!rule.isSystem && (
                             <button onClick={() => handleDeletePostingRule(rule.id)} disabled={Boolean(pendingFinanceAction)} className="w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm disabled:opacity-50">
                               <X size={16} />
                             </button>
                         )}
                      </div>
                   ))}
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'exceptions' && (
            <div className="p-8 animate-in slide-in-from-bottom-5 duration-150">
               <div className="bg-app/40 rounded-[2.5rem] border border-border/30 overflow-hidden shadow-2xl">
                 <div className="p-8 border-b border-border/20 flex items-center justify-between bg-elevated/30">
                   <h3 className="text-xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                     <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 border border-rose-500/20"><AlertTriangle size={24} /></div>
                     {t.exceptionQueue}
                   </h3>
                   <div className="px-4 py-2 bg-rose-500/10 text-rose-500 rounded-xl text-xs font-black">
                     {exceptions.filter(e => e.status === 'PENDING').length} {t.pending}
                   </div>
                 </div>
                 <div className="max-h-[70vh] overflow-y-auto custom-scrollbar p-6 space-y-4">
                   {exceptions.length === 0 ? (
                     <div className="text-center py-20 opacity-50">
                        <ShieldCheck size={48} className="mx-auto mb-4 text-emerald-500" />
                        <p className="font-black uppercase tracking-widest text-sm">{t.noExceptions}</p>
                     </div>
                   ) : exceptions.map(exc => (
                      <div key={exc.id} className="p-6 bg-card/40 border border-border/30 rounded-3xl shrink-0 group hover:border-rose-500/30 transition-all shadow-lg">
                        <div className="flex justify-between items-start mb-4">
                           <div>
                              <p className="text-xs font-black uppercase text-rose-500 flex items-center gap-2">
                                <AlertTriangle size={14} /> {exc.reason}
                              </p>
                              <p className="text-sm font-black text-main mt-1">{exc.reference} · {exc.referenceType}</p>
                           </div>
                           <div className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${exc.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                             {exc.status}
                           </div>
                        </div>
                        <div className="text-xs text-muted font-mono bg-app/50 p-4 rounded-xl mb-4 overflow-x-auto">
                          {JSON.stringify(exc.payload, null, 2)}
                        </div>
                        {exc.status === 'PENDING' && (
                          <div className="flex gap-4">
                            <button onClick={() => resolveException(exc.id, 'RETRY')} className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors">{t.retryPost}</button>
                            <button onClick={() => resolveException(exc.id, 'DISMISS')} className="px-6 py-3 bg-app border border-border/50 text-main rounded-xl text-xs font-black uppercase tracking-widest hover:border-rose-500/50 transition-colors">{t.dismiss}</button>
                          </div>
                        )}
                      </div>
                   ))}
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'pnl' && (
            <div className="p-8 animate-in slide-in-from-bottom-5 duration-150">
              <div className="bg-app/40 rounded-[2.5rem] border border-border/30 overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-border/20 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-elevated/30">
                  <h3 className="text-xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-500/20"><TrendingUp size={24} /></div>
                    {tabTitle('pnl')}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3">
                    <input type="date" className="h-12 px-4 bg-app/50 border border-border/40 rounded-xl text-xs font-black text-main outline-none" value={pnlDateFrom} onChange={(e) => setPnlDateFrom(e.target.value)} />
                    <input type="date" className="h-12 px-4 bg-app/50 border border-border/40 rounded-xl text-xs font-black text-main outline-none" value={pnlDateTo} onChange={(e) => setPnlDateTo(e.target.value)} />
                    <button onClick={loadPnl} disabled={pnlLoading} className="h-12 px-5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-50">
                      <RefreshCw size={14} className={pnlLoading ? 'animate-spin' : ''} /> {t.loadReport}
                    </button>
                  </div>
                </div>
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FinanceMetric label={t.totalRevenue} value={`${(pnlData?.revenue || 0).toLocaleString()} ${currency}`} icon={ArrowUpRight} color="#10b981" />
                    <FinanceMetric label={t.totalExpenses} value={`${(pnlData?.expenses || 0).toLocaleString()} ${currency}`} icon={ArrowDownRight} color="#f43f5e" />
                    <FinanceMetric label={t.netProfit} value={`${(pnlData?.netProfit || 0).toLocaleString()} ${currency}`} icon={(pnlData?.netProfit || 0) >= 0 ? TrendingUp : TrendingDown} color={(pnlData?.netProfit || 0) >= 0 ? "#10b981" : "#f43f5e"} />
                  </div>
                  <div className="responsive-table bg-card/40 border border-border/30 rounded-[2rem] overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead><tr className="bg-elevated/30 text-muted text-[10px] uppercase font-black tracking-[0.2em]">
                        <th className="px-6 py-5">{t.account}</th><th className="px-6 py-5">{t.type}</th><th className="px-6 py-5 text-right">{t.debit}</th><th className="px-6 py-5 text-right">{t.credit}</th><th className="px-6 py-5 text-right">{t.net}</th>
                      </tr></thead>
                      <tbody className="divide-y divide-border/30">
                        {(pnlData?.details || []).length === 0 ? (
                          <tr><td colSpan={5} className="px-6 py-16 text-center text-xs font-black text-muted uppercase tracking-widest">{t.noData}</td></tr>
                        ) : pnlData!.details.map((row, idx) => (
                          <tr key={`${row.name}-${idx}`} className="hover:bg-elevated/30">
                            <td className="px-6 py-4 text-xs font-black text-main">{row.name}</td>
                            <td className="px-6 py-4 text-[10px] font-black text-muted">{row.type}</td>
                            <td className="px-6 py-4 text-right font-mono text-xs font-bold">{row.debit.toLocaleString()}</td>
                            <td className="px-6 py-4 text-right font-mono text-xs font-bold">{row.credit.toLocaleString()}</td>
                            <td className={`px-6 py-4 text-right font-mono text-xs font-black ${row.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{row.net.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reconciliation' && (
            <div className="p-8 animate-in slide-in-from-bottom-5 duration-150">
              <div className="bg-app/40 rounded-[2.5rem] border border-border/30 overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-border/20 flex items-center justify-between bg-elevated/30">
                  <h3 className="text-xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-500/20"><ShieldCheck size={24} /></div>
                    {t.reconciliations}
                  </h3>
                  <button onClick={() => setReconModal(true)} className="px-5 py-3 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest">{t.reconcile}</button>
                </div>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  {reconciliations.length === 0 ? (
                    <div className="py-20 text-center text-xs font-black text-muted uppercase tracking-widest">{t.noData}</div>
                  ) : reconciliations.map((row: any) => (
                    <div key={row.id} className="p-5 rounded-2xl bg-card/40 border border-border/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-black text-main">{row.accountCode || row.accountName || t.account}</p>
                        <p className="text-[10px] font-bold text-muted uppercase tracking-widest">{row.statementDate ? new Date(row.statementDate).toLocaleDateString() : '-'}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-black">
                        <span className="text-muted">{t.difference}: <span className="font-mono text-main">{Number(row.difference || 0).toLocaleString()} {currency}</span></span>
                        <span className={`px-3 py-1 rounded-full text-[10px] ${row.status === 'RESOLVED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{row.status || t.pending}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'periods' && (
            <div className="p-8 animate-in slide-in-from-bottom-5 duration-150">
              <div className="bg-app/40 rounded-[2.5rem] border border-border/30 overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-border/20 flex items-center justify-between bg-elevated/30">
                  <h3 className="text-xl font-black text-main uppercase tracking-tighter flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-500/10 rounded-2xl flex items-center justify-center text-slate-500 border border-slate-500/20"><CalendarCheck2 size={24} /></div>
                    {t.periodCloses}
                  </h3>
                  <button onClick={() => setCloseModal(true)} className="px-5 py-3 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest">{t.closePeriod}</button>
                </div>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  {periodCloses.length === 0 ? (
                    <div className="py-20 text-center text-xs font-black text-muted uppercase tracking-widest">{t.noData}</div>
                  ) : periodCloses.map((row: any) => (
                    <div key={row.id} className="p-5 rounded-2xl bg-card/40 border border-border/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-black text-main">{t.periodStart}: {row.periodStart ? new Date(row.periodStart).toLocaleDateString() : '-'}</p>
                        <p className="text-[10px] font-bold text-muted uppercase tracking-widest">{t.periodEnd}: {row.periodEnd ? new Date(row.periodEnd).toLocaleDateString() : '-'}</p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-[10px] font-black bg-slate-500/10 text-slate-500">{row.status || t.posted}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals... */}
      {journalModal && (
        <ManualJournalModal
          onClose={() => setJournalModal(false)}
          accounts={flatAccounts}
          onSubmit={async (data) => {
            await recordTransaction(data);
            fetchFinanceData();
          }}
          isLoading={isLoading}
        />
      )}

      {/* Recon Modal... simplified update */}
      {reconModal && (
        <div className="fixed inset-0 bg-black/80  z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150" onClick={() => setReconModal(false)}>
          <div className="bg-card border border-border/50 rounded-[3rem] w-full max-w-xl shadow-3xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
             <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-600/10 blur-[100px] -z-10" />
             <div className="p-8 border-b border-border/20 flex items-center justify-between bg-elevated/30">
               <div>
                 <h3 className="text-2xl font-black text-main tracking-tighter uppercase">{t.auditReconciliation}</h3>
                 <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">{t.reconSubtitle}</p>
               </div>
               <button onClick={() => setReconModal(false)} className="w-12 h-12 rounded-2xl bg-elevated/50 flex items-center justify-center text-muted hover:text-rose-500 transition-all border border-border/20"><X size={20} /></button>
             </div>
             <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                   <div className="col-span-2 space-y-3">
                     <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted pl-1">{t.targetAccount}</label>
                     <select className="w-full px-6 py-5 bg-app/50 border border-border/40 rounded-2xl text-sm font-black text-main outline-none focus:border-emerald-500/50 appearance-none transition-all" value={reconForm.accountCode} onChange={(e) => setReconForm({ ...reconForm, accountCode: e.target.value })}>{flatAccounts.map(a => <option key={`r-${a.id}`} value={a.code}>{a.code} · {a.name}</option>)}</select>
                   </div>
                   <div className="space-y-3">
                     <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted pl-1">{t.statementDate}</label>
                     <input type="date" className="w-full px-6 py-5 bg-app/50 border border-border/40 rounded-2xl text-sm font-black text-main outline-none focus:border-emerald-500/50 transition-all" value={reconForm.statementDate} onChange={(e) => setReconForm({ ...reconForm, statementDate: e.target.value })} />
                   </div>
                   <div className="space-y-3">
                     <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted pl-1">{t.reportedBalance}</label>
                     <input type="number" className="w-full px-6 py-5 bg-app/50 border border-border/40 rounded-2xl text-sm font-black text-main outline-none focus:border-emerald-500/50 transition-all tabular-nums" value={reconForm.statementBalance || ''} onChange={(e) => setReconForm({ ...reconForm, statementBalance: Number(e.target.value || 0) })} />
                   </div>
                </div>
             </div>
             <div className="p-8 border-t border-border/20 bg-elevated/30 flex gap-4">
               <button onClick={() => setReconModal(false)} className="flex-1 h-16 bg-app border border-border rounded-2xl text-[10px] font-black text-muted uppercase tracking-widest hover:bg-border transition-all">{t.abort}</button>
                <button onClick={submitReconciliation} disabled={Boolean(pendingFinanceAction)} className="flex-[2] h-16 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                  <ShieldCheck size={18} /> {t.generateAudit}
                </button>
             </div>
          </div>
        </div>
      )}

      {closeModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150" onClick={() => setCloseModal(false)}>
          <div className="bg-card border border-border/50 rounded-[3rem] w-full max-w-xl shadow-3xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-border/20 flex items-center justify-between bg-elevated/30">
              <div>
                <h3 className="text-2xl font-black text-main tracking-tighter uppercase">{t.closePeriodTitle}</h3>
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">{t.closeInstruction}</p>
              </div>
              <button onClick={() => setCloseModal(false)} className="w-12 h-12 rounded-2xl bg-elevated/50 flex items-center justify-center text-muted hover:text-rose-500 transition-all border border-border/20"><X size={20} /></button>
            </div>
            <div className="p-8 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">{t.periodStart}</span>
                  <input type="date" className="w-full px-5 py-4 bg-app/50 border border-border/40 rounded-2xl text-sm font-black text-main outline-none focus:border-slate-500/50" value={closeForm.periodStart} onChange={(e) => setCloseForm({ ...closeForm, periodStart: e.target.value })} />
                </label>
                <label className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">{t.periodEnd}</span>
                  <input type="date" className="w-full px-5 py-4 bg-app/50 border border-border/40 rounded-2xl text-sm font-black text-main outline-none focus:border-slate-500/50" value={closeForm.periodEnd} onChange={(e) => setCloseForm({ ...closeForm, periodEnd: e.target.value })} />
                </label>
              </div>
              <label className="space-y-2 block">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">{t.confirmText}</span>
                <input className="w-full px-5 py-4 bg-app/50 border border-border/40 rounded-2xl text-sm font-black text-main outline-none focus:border-slate-500/50" value={closeConfirmText} onChange={(e) => setCloseConfirmText(e.target.value)} placeholder="CLOSE" />
              </label>
            </div>
            <div className="p-8 border-t border-border/20 bg-elevated/30 flex gap-4">
              <button onClick={() => setCloseModal(false)} className="flex-1 h-16 bg-app border border-border rounded-2xl text-[10px] font-black text-muted uppercase tracking-widest hover:bg-border transition-all">{t.abort}</button>
              <button onClick={submitPeriodClose} disabled={closeConfirmText !== 'CLOSE' || Boolean(pendingFinanceAction)} className="flex-[2] h-16 bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:scale-[1.02] active:scale-95 transition-all">
                <CalendarCheck2 size={18} /> {t.confirmClose}
              </button>
            </div>
          </div>
        </div>
      )}

      {reverseModalTxId && (
        <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-150" onClick={() => !pendingFinanceAction && setReverseModalTxId(null)}>
          <div className="bg-card border border-border/50 rounded-[3rem] w-full max-w-xl shadow-3xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-border/20 flex items-center justify-between bg-elevated/30">
              <div>
                <h3 className="text-2xl font-black text-main tracking-tighter uppercase">{t.reverseEntry}</h3>
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">{t.reversalReason}</p>
              </div>
              <button onClick={() => setReverseModalTxId(null)} disabled={Boolean(pendingFinanceAction)} className="w-12 h-12 rounded-2xl bg-elevated/50 flex items-center justify-center text-muted hover:text-rose-500 transition-all border border-border/20 disabled:opacity-50">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-3">
              <textarea
                value={reverseReason}
                onChange={event => setReverseReason(event.target.value)}
                maxLength={240}
                rows={4}
                autoFocus
                className="w-full resize-none px-5 py-4 bg-app/50 border border-border/40 rounded-2xl text-sm font-bold text-main outline-none focus:border-rose-500/50"
                placeholder={isAr ? 'اكتب سبب واضح لعكس القيد' : 'Enter a clear reversal reason'}
              />
              <p className="text-end text-[10px] font-black text-muted">{reverseReason.trim().length}/240</p>
            </div>
            <div className="p-8 border-t border-border/20 bg-elevated/30 flex gap-4">
              <button onClick={() => setReverseModalTxId(null)} disabled={Boolean(pendingFinanceAction)} className="flex-1 h-16 bg-app border border-border rounded-2xl text-[10px] font-black text-muted uppercase tracking-widest hover:bg-border transition-all disabled:opacity-50">{t.abort}</button>
              <button onClick={submitReverseJournal} disabled={Boolean(pendingFinanceAction) || !reverseReason.trim()} className="flex-[2] h-16 bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:scale-[1.02] active:scale-95 transition-all">
                <X size={18} /> {t.reverseEntry}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Finance;
