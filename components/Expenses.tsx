import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Wallet,
} from 'lucide-react';
import { financeApi } from '../services/api/finance';
import { reportsApi } from '../services/api/reports';
import { useAuthStore } from '../stores/useAuthStore';
import { useToast } from './Toast';

type AccountRow = {
  id: string;
  code: string;
  name: string;
  nameAr?: string;
  type: string;
  allowManualJournals?: boolean;
  children?: AccountRow[];
};

type JournalRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  debitAccountId?: string;
  debitAccountCode?: string;
  creditAccountId?: string;
  creditAccountCode?: string;
  referenceId?: string;
  referenceType?: string;
  status?: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

const flattenAccounts = (accounts: AccountRow[]): AccountRow[] => {
  const out: AccountRow[] = [];
  const walk = (rows: AccountRow[]) => {
    rows.forEach((row) => {
      out.push(row);
      if (row.children?.length) walk(row.children);
    });
  };
  walk(accounts || []);
  return out;
};

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Expenses: React.FC = () => {
  const { settings } = useAuthStore();
  const { showToast } = useToast();
  const lang = settings.language || 'en';
  const isAr = lang === 'ar';

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [topExpenses, setTopExpenses] = useState<Array<{ name: string; total: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  const [form, setForm] = useState({
    date: today(),
    description: '',
    categoryCode: '',
    paymentAccountCode: '',
    amount: '',
    reference: '',
    notes: '',
  });

  const flatAccounts = useMemo(() => flattenAccounts(accounts), [accounts]);
  const expenseAccounts = useMemo(
    () => flatAccounts.filter((account) => account.type === 'EXPENSE' && account.allowManualJournals !== false),
    [flatAccounts]
  );
  const paymentAccounts = useMemo(
    () => flatAccounts.filter((account) => account.type === 'ASSET' && account.allowManualJournals !== false),
    [flatAccounts]
  );

  const expenseJournalEntries = useMemo(() => {
    return journal
      .filter((entry) => {
        const debitCode = entry.debitAccountCode || entry.debitAccountId || '';
        const isExpense = expenseAccounts.some((account) => account.code === debitCode);
        return isExpense;
      })
      .slice(0, 80);
  }, [journal, expenseAccounts]);

  const recentExpenses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return expenseJournalEntries;
    return expenseJournalEntries.filter((entry) => {
      const debitCode = entry.debitAccountCode || entry.debitAccountId || '';
      return `${entry.description} ${entry.referenceId} ${debitCode}`.toLowerCase().includes(needle);
    });
  }, [expenseJournalEntries, query]);

  const expenseSuggestions = useMemo(() => {
    const suggestions = new Set<string>();
    expenseAccounts.forEach((account) => {
      const label = (isAr ? account.nameAr || account.name : account.name || account.nameAr || '').trim();
      if (label) suggestions.add(label);
    });
    expenseJournalEntries.forEach((entry) => {
      const clean = String(entry.description || '')
        .replace(/^Expense\s*-\s*/i, '')
        .replace(/^مصروف\s*-\s*/i, '')
        .split('|')[0]
        .trim();
      if (clean) suggestions.add(clean);
    });
    return Array.from(suggestions).slice(0, 30);
  }, [expenseAccounts, expenseJournalEntries, isAr]);

  const pendingTotal = recentExpenses
    .filter((entry) => entry.status === 'PENDING_APPROVAL')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const postedTotal = recentExpenses
    .filter((entry) => !entry.status || entry.status === 'POSTED')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const pendingApprovalExpenses = useMemo(
    () => expenseJournalEntries.filter((entry) => entry.status === 'PENDING_APPROVAL'),
    [expenseJournalEntries]
  );

  const load = async () => {
    setIsLoading(true);
    try {
      const [accountRows, journalRows, topRows] = await Promise.all([
        financeApi.getAccounts(),
        financeApi.getJournal(250),
        reportsApi.getTopExpenses({ startDate: monthStart(), endDate: today() }).catch(() => []),
      ]);
      setAccounts(accountRows || []);
      setJournal(journalRows || []);
      setTopExpenses(topRows || []);

      const flat = flattenAccounts(accountRows || []);
      const firstExpense = flat.find((account) => account.type === 'EXPENSE' && account.allowManualJournals !== false);
      const firstPayment = flat.find((account) => account.type === 'ASSET' && account.allowManualJournals !== false);
      setForm((current) => ({
        ...current,
        categoryCode: current.categoryCode || firstExpense?.code || '',
        paymentAccountCode: current.paymentAccountCode || firstPayment?.code || '',
      }));
    } catch (error: any) {
      showToast(error?.message || (isAr ? 'تعذر تحميل المصروفات' : 'Failed to load expenses'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitExpense = async () => {
    const amount = Number(form.amount || 0);
    if (!form.description.trim() || !form.categoryCode || !form.paymentAccountCode || amount <= 0) {
      showToast(isAr ? 'أكمل الوصف والحساب والمبلغ' : 'Complete description, accounts, and amount', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const referenceId = form.reference.trim() || `EXP-${Date.now()}`;
      await financeApi.createJournal({
        description: `${isAr ? 'مصروف' : 'Expense'} - ${form.description.trim()}${form.notes.trim() ? ` | ${form.notes.trim()}` : ''}`,
        amount,
        debitAccountCode: form.categoryCode,
        creditAccountCode: form.paymentAccountCode,
        referenceId,
        source: 'EXPENSE',
        date: form.date,
      });
      showToast(
        isAr ? 'تم تسجيل المصروف وبانتظار الاعتماد المحاسبي' : 'Expense recorded and awaiting finance approval',
        'success'
      );
      setForm((current) => ({ ...current, description: '', amount: '', reference: '', notes: '' }));
      await load();
    } catch (error: any) {
      showToast(error?.message || (isAr ? 'فشل تسجيل المصروف' : 'Failed to record expense'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const addExpenseCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      showToast(isAr ? 'اكتب اسم بند المصروف' : 'Enter expense category name', 'error');
      return;
    }

    setIsAddingCategory(true);
    try {
      const created = await financeApi.createExpenseAccount({
        name,
        nameAr: name,
      });
      showToast(isAr ? 'تمت إضافة بند المصروف' : 'Expense category added', 'success');
      setNewCategoryName('');
      setShowNewCategory(false);
      await load();
      setForm((current) => ({ ...current, categoryCode: created?.code || current.categoryCode }));
    } catch (error: any) {
      showToast(error?.message || (isAr ? 'فشل إضافة بند المصروف' : 'Failed to add expense category'), 'error');
    } finally {
      setIsAddingCategory(false);
    }
  };

  const approveExpense = async (entry: JournalRow) => {
    if (!entry?.id || approvingId) return;
    setApprovingId(entry.id);
    try {
      await financeApi.approveJournal(entry.id);
      showToast(isAr ? 'تم اعتماد المصروف وترحيله للتقارير' : 'Expense approved and posted to reports', 'success');
      await load();
    } catch (error: any) {
      showToast(error?.message || (isAr ? 'فشل اعتماد المصروف' : 'Failed to approve expense'), 'error');
    } finally {
      setApprovingId(null);
    }
  };

  const categoryName = (code?: string) => {
    const account = flatAccounts.find((row) => row.code === code);
    return (isAr ? account?.nameAr || account?.name : account?.name) || code || '-';
  };

  return (
    <div className="relative min-h-screen bg-app p-4 lg:p-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-5 border-b border-border/30 pb-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center">
              <ReceiptText size={30} />
            </div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-black text-main tracking-tight">
                {isAr ? 'مصروفات المطعم' : 'Restaurant Expenses'}
              </h1>
              <p className="text-xs font-bold text-muted mt-1">
                {isAr
                  ? 'تسجيل النثريات والصيانة والمشتريات غير المخزنية وربطها بالتقارير المحاسبية.'
                  : 'Record petty cash, maintenance, and non-stock spend into finance reports.'}
              </p>
            </div>
          </div>
          <button
            onClick={load}
            className="h-12 px-5 rounded-xl bg-card border border-border/60 text-main text-xs font-black flex items-center justify-center gap-2 hover:border-indigo-500/40 transition-all"
          >
            <RefreshCw size={16} /> {isAr ? 'تحديث' : 'Refresh'}
          </button>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card/80 border border-border/50 rounded-2xl p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-2">{isAr ? 'مرحّل للتقارير' : 'Posted to reports'}</p>
            <div className="flex items-end justify-between">
              <h2 className="text-3xl font-black text-main tabular-nums">{money(postedTotal)}</h2>
              <CheckCircle2 className="text-emerald-500" />
            </div>
          </div>
          <div className="bg-card/80 border border-border/50 rounded-2xl p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-2">{isAr ? 'بانتظار الاعتماد' : 'Pending approval'}</p>
            <div className="flex items-end justify-between">
              <h2 className="text-3xl font-black text-amber-500 tabular-nums">{money(pendingTotal)}</h2>
              <Clock className="text-amber-500" />
            </div>
          </div>
          <div className="bg-card/80 border border-border/50 rounded-2xl p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted mb-2">{isAr ? 'أكبر بند هذا الشهر' : 'Top category this month'}</p>
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-xl font-black text-main truncate">{topExpenses[0]?.name || '-'}</h2>
              <span className="font-mono text-sm font-black text-rose-500">{money(Number(topExpenses[0]?.total || 0))}</span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
          <section className="bg-card/80 border border-border/50 rounded-2xl p-5 space-y-4 h-fit">
            <div className="flex items-center gap-3">
              <Plus className="text-indigo-500" />
              <h2 className="text-lg font-black text-main">{isAr ? 'تسجيل مصروف' : 'Record Expense'}</h2>
            </div>

            <div className="space-y-3">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full h-12 rounded-xl bg-elevated/50 border border-border/60 px-4 text-sm font-bold text-main outline-none focus:border-indigo-500"
              />
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                list="expense-description-suggestions"
                placeholder={isAr ? 'مثال: كهرباء، صيانة، مواصلات' : 'Example: electricity, maintenance, transport'}
                className="w-full h-12 rounded-xl bg-elevated/50 border border-border/60 px-4 text-sm font-bold text-main outline-none focus:border-indigo-500"
              />
              <datalist id="expense-description-suggestions">
                {expenseSuggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select
                    value={form.categoryCode}
                    onChange={(e) => setForm({ ...form, categoryCode: e.target.value })}
                    className="w-full h-12 rounded-xl bg-elevated/50 border border-border/60 px-4 text-sm font-bold text-main outline-none focus:border-indigo-500"
                  >
                    <option value="">{isAr ? 'اختر بند المصروف' : 'Select expense category'}</option>
                    {expenseAccounts.map((account) => (
                      <option key={account.id} value={account.code}>{account.code} - {(isAr ? account.nameAr || account.name : account.name)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewCategory((value) => !value)}
                    className="h-12 px-4 rounded-xl bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 text-[11px] font-black flex items-center gap-2"
                  >
                    <Plus size={15} /> {isAr ? 'بند' : 'Add'}
                  </button>
                </div>
                {showNewCategory && (
                  <div className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-border/50 bg-elevated/30 p-2">
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder={isAr ? 'مثال: غاز، إيجار، صيانة تكييف' : 'Example: gas, rent, AC maintenance'}
                      className="h-10 rounded-lg bg-card border border-border/60 px-3 text-xs font-bold text-main outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={addExpenseCategory}
                      disabled={isAddingCategory}
                      className="h-10 px-4 rounded-lg bg-indigo-600 text-white text-[10px] font-black disabled:opacity-60"
                    >
                      {isAddingCategory ? (isAr ? 'حفظ...' : 'Saving...') : (isAr ? 'حفظ' : 'Save')}
                    </button>
                  </div>
                )}
              </div>
              <select
                value={form.paymentAccountCode}
                onChange={(e) => setForm({ ...form, paymentAccountCode: e.target.value })}
                className="w-full h-12 rounded-xl bg-elevated/50 border border-border/60 px-4 text-sm font-bold text-main outline-none focus:border-indigo-500"
              >
                <option value="">{isAr ? 'اختر مصدر الدفع' : 'Select payment source'}</option>
                {paymentAccounts.map((account) => (
                  <option key={account.id} value={account.code}>{account.code} - {(isAr ? account.nameAr || account.name : account.name)}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder={isAr ? 'المبلغ' : 'Amount'}
                className="w-full h-12 rounded-xl bg-elevated/50 border border-border/60 px-4 text-sm font-black text-main outline-none focus:border-indigo-500"
              />
              <input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder={isAr ? 'رقم إيصال أو مرجع اختياري' : 'Optional receipt/reference number'}
                className="w-full h-12 rounded-xl bg-elevated/50 border border-border/60 px-4 text-sm font-bold text-main outline-none focus:border-indigo-500"
              />
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={isAr ? 'ملاحظات اختيارية' : 'Optional notes'}
                rows={3}
                className="w-full rounded-xl bg-elevated/50 border border-border/60 px-4 py-3 text-sm font-bold text-main outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <button
              onClick={submitExpense}
              disabled={isSaving}
              className="w-full h-12 rounded-xl bg-indigo-600 text-white text-xs font-black tracking-widest uppercase flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-60 transition-all"
            >
              <Wallet size={18} /> {isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'تسجيل المصروف' : 'Record Expense')}
            </button>
            <p className="text-[11px] leading-5 text-muted font-bold flex gap-2">
              <AlertTriangle size={15} className="shrink-0 text-amber-500 mt-0.5" />
              {isAr
                ? 'المصروف يتسجل كقيد بانتظار الاعتماد، وبعد الاعتماد يظهر في تقارير الأرباح والمصروفات.'
                : 'Expense is submitted as a pending journal entry. It appears in reports after approval.'}
            </p>
          </section>

          <section className="space-y-4">
            <div className="bg-card/80 border border-amber-500/25 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-amber-500/20 bg-amber-500/5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-main flex items-center gap-2">
                    <Clock size={18} className="text-amber-500" />
                    {isAr ? 'مصروفات بانتظار الاعتماد' : 'Expenses Pending Approval'}
                  </h2>
                  <p className="text-xs text-muted font-bold">
                    {isAr ? 'اعتمد المصروفات من هنا مباشرة لتظهر في التقارير.' : 'Approve expenses here so they post into financial reports.'}
                  </p>
                </div>
                <span className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-xs font-black text-amber-600">
                  {pendingApprovalExpenses.length} {isAr ? 'معلق' : 'pending'}
                </span>
              </div>

              {isLoading ? (
                <div className="p-8 text-center text-sm font-bold text-muted">{isAr ? 'جاري التحميل...' : 'Loading...'}</div>
              ) : pendingApprovalExpenses.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={30} />
                  <p className="text-sm font-black text-main">{isAr ? 'لا توجد مصروفات معلقة للاعتماد' : 'No expenses waiting for approval'}</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {pendingApprovalExpenses.map((entry) => {
                    const debitCode = entry.debitAccountCode || entry.debitAccountId;
                    return (
                      <div key={`pending-${entry.id}`} className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 p-4 hover:bg-elevated/25 transition-colors">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-[10px] font-black text-amber-600">
                              {isAr ? 'بانتظار الاعتماد' : 'Pending approval'}
                            </span>
                            <span className="text-[11px] font-bold text-muted">{new Date(entry.date).toLocaleDateString()}</span>
                          </div>
                          <p className="truncate text-sm font-black text-main">{entry.description}</p>
                          <p className="mt-1 text-xs font-bold text-muted">{categoryName(debitCode)} · {entry.referenceId || '-'}</p>
                        </div>
                        <div className="flex items-center justify-between gap-3 lg:justify-end">
                          <span className="font-mono text-lg font-black text-rose-500">{money(Number(entry.amount || 0))}</span>
                          <button
                            type="button"
                            onClick={() => approveExpense(entry)}
                            disabled={approvingId === entry.id}
                            className="h-11 rounded-xl bg-emerald-600 px-5 text-xs font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {approvingId === entry.id ? (isAr ? 'جاري الاعتماد...' : 'Approving...') : (isAr ? 'اعتماد' : 'Approve')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          <section className="bg-card/80 border border-border/50 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-main">{isAr ? 'آخر المصروفات' : 'Recent Expenses'}</h2>
                <p className="text-xs text-muted font-bold">{isAr ? 'يشمل المرحّل والمعلّق للاعتماد' : 'Includes posted and pending entries'}</p>
              </div>
              <div className="relative w-full md:w-80">
                <Search size={16} className="absolute top-1/2 -translate-y-1/2 left-4 text-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={isAr ? 'بحث في المصروفات' : 'Search expenses'}
                  className="w-full h-11 rounded-xl bg-elevated/50 border border-border/60 pl-10 pr-4 text-sm font-bold text-main outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[120px]" />
                  <col />
                  <col className="w-[220px]" />
                  <col className="w-[140px]" />
                  <col className="w-[150px]" />
                </colgroup>
                <thead className="bg-elevated/40 text-muted text-[10px] uppercase tracking-widest">
                  <tr>
                    <th className="px-5 py-4 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="px-5 py-4 text-start">{isAr ? 'الوصف' : 'Description'}</th>
                    <th className="px-5 py-4 text-start">{isAr ? 'البند' : 'Category'}</th>
                    <th className="px-5 py-4 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="px-5 py-4 text-end">{isAr ? 'المبلغ' : 'Amount'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {isLoading ? (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-muted font-bold">{isAr ? 'جاري التحميل...' : 'Loading...'}</td></tr>
                  ) : recentExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-16 text-center">
                        <FileText className="mx-auto text-muted mb-3" size={34} />
                        <p className="text-muted font-black">{isAr ? 'لا توجد مصروفات مسجلة' : 'No expenses recorded'}</p>
                      </td>
                    </tr>
                  ) : recentExpenses.map((entry) => {
                    const debitCode = entry.debitAccountCode || entry.debitAccountId;
                    const pending = entry.status === 'PENDING_APPROVAL';
                    return (
                      <tr key={entry.id} className="hover:bg-elevated/30 transition-colors">
                        <td className="px-5 py-4 font-mono text-xs text-muted">{new Date(entry.date).toLocaleDateString()}</td>
                        <td className="px-5 py-4 font-black text-main max-w-md truncate">{entry.description}</td>
                        <td className="px-5 py-4 text-xs font-bold text-muted">{categoryName(debitCode)}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${pending ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                            {pending ? <Clock size={12} /> : <CheckCircle2 size={12} />}
                            {pending ? (isAr ? 'معلّق' : 'Pending') : (isAr ? 'مرحل' : 'Posted')}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-end font-mono font-black text-rose-500">
                          <span className="inline-flex items-center justify-end gap-1">
                            <ArrowDownRight size={14} /> {money(Number(entry.amount || 0))}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Expenses;
