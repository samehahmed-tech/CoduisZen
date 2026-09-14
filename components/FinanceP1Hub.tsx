// ---------------------------------------------------------------------------
// Finance P1 Hub — Financial Backbone (Phase P1)
// ---------------------------------------------------------------------------
import React, { useEffect, useState } from 'react';
import {
  Wallet, Plus, Trash2, CheckCircle2, ArrowRightLeft,
  CircleDollarSign, CreditCard, Landmark, Users, Gift, Plug, Coins, Ban, TrendingUp,
} from 'lucide-react';
import { useToast } from '@/components/common/ToastProvider';
import { useConfirm } from '@/components/common/ConfirmProvider';

const P1_BASE = '/api/finance/p1';

function fmtMoney(v: any, currency: string) {
  const n = Number(v ?? 0);
  return `${currency} ${isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0.00'}`;
}

function fmtPct(v: any) {
  const n = Number(v ?? 0);
  return `${isFinite(n) ? n.toFixed(1) : '0.0'}%`;
}

const p1Fetch = async (path: string, opts: RequestInit = {}) => {
  const branchId = window.localStorage.getItem('active_branch_id') || '';
  const res = await fetch(`${P1_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(branchId ? { 'X-Branch-Id': branchId } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Request failed');
  }
  return res.json();
};

// ---------------------------------------------------------------------------
// Daily P&L
// ---------------------------------------------------------------------------
const DailyPnlView: React.FC<{ isAr: boolean; currency: string; branch: string }> = ({ isAr, currency, branch }) => {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [snapshot, setSnapshot] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const toast = useToast();

  const loadHistory = async () => {
    try {
      const list = await p1Fetch(`/pnl/list?branchId=${branch}`);
      setHistory(Array.isArray(list) ? list : []);
    } catch { /* silent */ }
  };

  const compute = async () => {
    try {
      const snap = await p1Fetch(`/pnl/compute/${date}`, { method: 'POST' });
      setSnapshot(snap);
      toast.success((isAr ? 'تم حساب لقطة اليوم: ' : 'Computed snapshot: ') + date);
      await loadHistory();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const finalize = async (id: string) => {
    try {
      await p1Fetch(`/pnl/finalize/${id}`, { method: 'POST' });
      toast.success(isAr ? 'تم ترحيل اللقطة رسمياً' : 'Snapshot finalized');
      await loadHistory();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => { loadHistory(); /* eslint-disable-next-line */ }, [branch]);

  const metrics = snapshot ? [
    { label: isAr ? 'الإيراد' : 'Revenue', value: fmtMoney(snapshot.totalRevenue, currency), color: '#10b981' },
    { label: isAr ? 'صافي الأرباح' : 'Net Income', value: fmtMoney(snapshot.netIncome, currency), color: snapshot.netIncome >= 0 ? '#10b981' : '#f43f5e' },
    { label: isAr ? 'تكلفة الطعام' : 'Food Cost %', value: fmtPct(snapshot.foodCostPct), color: '#f59e0b' },
    { label: isAr ? 'تكلفة العمالة' : 'Labor Cost %', value: fmtPct(snapshot.laborCostPct), color: '#8b5cf6' },
    { label: isAr ? 'هامش الربح' : 'Profit Margin', value: fmtPct(snapshot.profitMarginPct), color: '#06b6d4' },
    { label: isAr ? 'الطلبات' : 'Orders', value: String(snapshot.orderCount ?? 0), color: '#3b82f6' },
  ] : [];

  return (
    <div className="grid gap-6">
      <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none" />
          <button onClick={compute}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black text-sm shadow-lg shadow-emerald-500/25 hover:scale-[1.02] transition-transform">
            {isAr ? 'حساب اليوم' : 'Compute Day'}
          </button>
          <p className="text-xs text-muted font-bold">
            {snapshot ? (isAr ? 'اللقطة مرحّلة رسمياً ولا يمكن تعديلها' : 'Snapshot is finalized and read-only') : (isAr ? 'اضغط لحساب لقطة الأرباح والخسائر لهذا اليوم' : 'Compute the daily P&L snapshot')}
          </p>
        </div>
        {metrics.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mt-6">
            {metrics.map((m, i) => (
              <div key={i} className="bg-app/40 border border-border/30 rounded-3xl p-5">
                <p className="text-xs font-black text-muted">{m.label}</p>
                <p className="text-lg lg:text-xl font-black mt-2" style={{ color: m.color }}>{m.value}</p>
              </div>))}
          </div>)}
      </div>
      <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
        <h3 className="font-black text-main mb-4">{isAr ? 'لقطات سابقة' : 'Snapshot History'}</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted">{isAr ? 'لا توجد لقطات بعد' : 'No snapshots yet'}</p>) : (
          <div className="space-y-2 max-h-72 overflow-auto">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between bg-app/40 border border-border/30 rounded-2xl px-5 py-3">
                <div>
                  <p className="font-black text-sm">{h.businessDate}</p>
                  <p className="text-xs text-muted">{fmtMoney(h.netIncome, currency)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${h.status === 'FINALIZED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{h.status}</span>
                  {h.status !== 'FINALIZED' && (
                    <button onClick={() => finalize(h.id)}
                      className="text-[10px] font-black uppercase px-4 py-1.5 rounded-full bg-teal-600 text-white">{isAr ? 'ترحيل' : 'Finalize'}</button>)}
                </div>
              </div>))}
          </div>)}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Cash Drawers
// ---------------------------------------------------------------------------
const DrawersView: React.FC<{ isAr: boolean; currency: string; branch: string }> = ({ isAr, currency, branch }) => {
  const { confirm } = useConfirm();
  const [active, setActive] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [openingCash, setOpeningCash] = useState('');
  const [lines, setLines] = useState<{ label: string; faceValue: number; quantity: number }[]>([
    { label: '', faceValue: 200, quantity: 0 },
  ]);
  const [counting, setCounting] = useState(false);
  const toast = useToast();

  const refresh = async () => {
    try {
      const act = await p1Fetch('/drawers/active');
      setActive(act && act.id ? act : null);
      const hist = await p1Fetch('/drawers/list');
      setHistory(Array.isArray(hist) ? hist : []);
    } catch { /* silent */ }
  };

  const openDrawer = async () => {
    try {
      await p1Fetch('/drawers/open', { method: 'POST', body: JSON.stringify({ openingCash: Number(openingCash || 0) }) });
      toast.success(isAr ? 'تم فتح الدرج بنجاح' : 'Drawer opened');
      setOpeningCash('');
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const recordCount = async () => {
    if (!active?.id) return;
    const filled = lines.filter((l) => l.quantity > 0);
    if (filled.length === 0) {
      toast.error(isAr ? 'أضف على الأقل فئة نقدية واحدة' : 'Add at least one denomination');
      return;
    }
    setCounting(true);
    try {
      const res = await p1Fetch(`/drawers/count/${active.id}`, { method: 'POST', body: JSON.stringify({ lines: filled }) });
      toast.success(`${isAr ? 'تم العد: ' : 'Counted: '}${fmtMoney(res.countedCash, currency)}`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCounting(false);
    }
  };

  const closeDrawer = async () => {
    if (!active?.id) return;
    if (!(await confirm({ title: isAr ? 'تأكيد إغلاق الدرج؟' : 'Close drawer?', message: isAr ? 'النقد المتوقع سيتم مقارنته مع النقد المعدود' : 'Expected cash will be compared with counted cash', confirmText: isAr ? 'إغلاق' : 'Close', variant: 'warning' }))) return;
    try {
      await p1Fetch(`/drawers/close/${active.id}`, { method: 'POST', body: JSON.stringify({ businessDate: new Date().toISOString().slice(0, 10) }) });
      toast.success(isAr ? 'تم إغلاق الدرج بنجاح' : 'Drawer closed');
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const addLine = () => setLines([...lines, { label: '', faceValue: 0, quantity: 0 }]);
  const setLine = (i: number, key: string, val: any) => setLines(lines.map((l, j) => (j === i ? { ...l, [key]: val } : l)));
  const countedCash = lines.reduce((s, l) => s + (Number(l.faceValue) || 0) * (Number(l.quantity) || 0), 0);

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [branch]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
        <h3 className="font-black text-main mb-4 flex items-center gap-3">
          <Wallet size={20} className="text-amber-500" />
          {isAr ? 'الدرج النشط' : 'Active Drawer'}
        </h3>
        {active ? (
          <div className="space-y-4">
            <div className="bg-app/40 border border-border/30 rounded-2xl p-4">
              <p className="text-xs text-muted">{isAr ? 'أُفتح بواسطة' : 'Opened by'}</p>
              <p className="font-black">{active.openedBy || '-'}</p>
              <p className="text-xs text-muted mt-2">{isAr ? 'نقد الافتتاح' : 'Opening cash'}</p>
              <p className="font-black">{fmtMoney(active.openingCash, currency)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-black text-muted">{isAr ? 'بالفئات' : 'By denomination'}</p>
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="number" placeholder={isAr ? 'الفئة' : 'Face'} value={l.faceValue || ''}
                    onChange={(e) => setLine(i, 'faceValue', Number(e.target.value))}
                    className="w-24 px-3 py-2 bg-app/50 border border-border/40 rounded-xl text-sm outline-none" />
                  <input type="number" placeholder={isAr ? 'العدد' : 'Qty'} value={l.quantity || ''}
                    onChange={(e) => setLine(i, 'quantity', Number(e.target.value))}
                    className="w-20 px-3 py-2 bg-app/50 border border-border/40 rounded-xl text-sm outline-none" />
                  <button onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    className="p-2 rounded-xl bg-rose-500/10 text-rose-500"><Trash2 size={14} /></button>
                </div>))}
              <button onClick={addLine} className="text-xs font-black text-emerald-500 flex items-center gap-1"><Plus size={12} />{isAr ? 'إضافة فئة' : 'Add row'}</button>
              <p className="font-black text-sm">{isAr ? 'المبلغ المعدود' : 'Counted'}: {fmtMoney(countedCash, currency)}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={recordCount} disabled={counting}
                className="flex-1 px-5 py-3 rounded-2xl bg-emerald-600 text-white font-black text-sm disabled:opacity-50">
                {isAr ? 'حفظ العد' : 'Save Count'}</button>
              <button onClick={closeDrawer}
                className="flex-1 px-5 py-3 rounded-2xl bg-rose-600 text-white font-black text-sm">
                {isAr ? 'إغلاق الدرج' : 'Close Drawer'}</button>
            </div>
          </div>) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">{isAr ? 'لا يوجد درج مفتوح حالياً' : 'No drawer currently open'}</p>
            <input type="number" placeholder={isAr ? 'نقد الافتتاح' : 'Opening cash'} value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none" />
            <button onClick={openDrawer}
              className="w-full px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black text-sm">
              {isAr ? 'فتح الدرج' : 'Open Drawer'}</button>
          </div>)}
      </div>
      <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
        <h3 className="font-black text-main mb-4">{isAr ? 'سجل الأدراج' : 'Drawer History'}</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted">{isAr ? 'لا توجد سجلات' : 'No records yet'}</p>) : (
          <div className="space-y-2 max-h-96 overflow-auto">
            {history.map((h) => (
              <div key={h.id} className="bg-app/40 border border-border/30 rounded-2xl px-5 py-3">
                <div className="flex justify-between items-center">
                  <p className="font-black text-sm">{h.openedAt?.slice(0, 16) || '-'}</p>
                  <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${h.status === 'CLOSED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{h.status}</span>
                </div>
                <p className="text-xs text-muted mt-1">
                  {isAr ? 'الافتتاح' : 'Opening'}: {fmtMoney(h.openingCash, currency)}
                  {h.variance !== null && h.variance !== undefined && ` · ${isAr ? 'الفرق' : 'Variance'}: ${fmtMoney(h.variance, currency)}`}
                </p>
              </div>))}
          </div>)}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Banking
// ---------------------------------------------------------------------------
const BankingView: React.FC<{ isAr: boolean; currency: string; branch: string }> = ({ isAr, currency }) => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const toast = useToast();

  const load = async () => {
    try {
      const list = await p1Fetch('/bank-accounts');
      setAccounts(Array.isArray(list) ? list : []);
    } catch { /* silent */ }
  };

  const create = async () => {
    if (!name.trim() || !institution.trim()) {
      toast.error(isAr ? 'أدخل اسم الحساب والبنك' : 'Enter account name and bank');
      return;
    }
    try {
      await p1Fetch('/bank-accounts', { method: 'POST', body: JSON.stringify({
        name, institution, accountNumber, openingBalance: Number(openingBalance || 0),
      }) });
      toast.success(isAr ? 'تم إنشاء الحساب البنكي' : 'Bank account created');
      setName(''); setInstitution(''); setAccountNumber(''); setOpeningBalance('');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
        <h3 className="font-black text-main mb-4 flex items-center gap-3">
          <Landmark size={20} className="text-blue-500" />
          {isAr ? 'حساب بنكي جديد' : 'New Bank Account'}
        </h3>
        <div className="space-y-3">
          <input placeholder={isAr ? 'الاسم' : 'Account name'} value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none" />
          <input placeholder={isAr ? 'البنك' : 'Bank / institution'} value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none" />
          <input placeholder={isAr ? 'رقم الحساب (اختياري)' : 'Account number (optional)'} value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none" />
          <input type="number" placeholder={isAr ? 'رصيد الافتتاح' : 'Opening balance'} value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none" />
          <button onClick={create}
            className="w-full px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-black text-sm shadow-lg shadow-blue-500/25 hover:scale-[1.02] transition-transform">
            {isAr ? 'إضافة الحساب' : 'Add Account'}</button>
        </div>
      </div>
      <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
        <h3 className="font-black text-main mb-4">{isAr ? 'الحسابات البنكية' : 'Bank Accounts'}</h3>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted">{isAr ? 'لا توجد حسابات بعد' : 'No accounts yet'}</p>) : (
          <div className="space-y-2 max-h-96 overflow-auto">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between bg-app/40 border border-border/30 rounded-2xl px-5 py-3">
                <div>
                  <p className="font-black text-sm">{a.name}</p>
                  <p className="text-xs text-muted">{a.institution}{a.accountNumber ? ` · ${a.accountNumber}` : ''}</p>
                </div>
                <p className="font-black text-emerald-500">{fmtMoney(a.balance ?? a.openingBalance ?? 0, currency)}</p>
              </div>))}
          </div>)}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tip Pools
// ---------------------------------------------------------------------------
const TipsView: React.FC<{ isAr: boolean; currency: string; branch: string }> = ({ isAr, currency }) => {
  const { confirm } = useConfirm();
  const [pools, setPools] = useState<any[]>([]);
  const [pooledAmount, setPooledAmount] = useState('');
  const toast = useToast();

  const load = async () => {
    try {
      const list = await p1Fetch('/tip-pools');
      setPools(Array.isArray(list) ? list : []);
    } catch { /* silent */ }
  };

  const create = async () => {
    if (!Number(pooledAmount)) {
      toast.error(isAr ? 'أدخل مبلغ مجمع الإكراميات' : 'Enter the tip pool amount');
      return;
    }
    try {
      await p1Fetch('/tip-pools', { method: 'POST', body: JSON.stringify({ pooledAmount: Number(pooledAmount) }) });
      toast.success(isAr ? 'تم إنشاء مجمع الإكراميات' : 'Tip pool created');
      setPooledAmount('');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const payout = async (id: string) => {
    if (!(await confirm({ title: isAr ? 'صرف مجمع الإكراميات بالكامل؟' : 'Payout tip pool?', message: isAr ? 'يُوزع تلقائياً بين الموظفين الموجودين بالوردية بنسب متساوية' : 'Distributed automatically among staff on duty', confirmText: isAr ? 'الصرف' : 'Payout', variant: 'warning' }))) return;
    try {
      await p1Fetch(`/tip-pools/payout/${id}`, { method: 'POST' });
      toast.success(isAr ? 'تم صرف المجمع بنجاح' : 'Pool paid out');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
        <h3 className="font-black text-main mb-4 flex items-center gap-3">
          <Coins size={20} className="text-amber-500" />
          {isAr ? 'إنشاء مجمع إكراميات' : 'Create Tip Pool'}
        </h3>
        <p className="text-xs text-muted mb-3">{isAr ? 'مجمعات الإكراميات تُوزع تلقائياً على الموظفين الموجودين بالوردية الحالية بنسب متساوية' : 'Tip pools are automatically split among staff on the current shift'}</p>
        <input type="number" placeholder={isAr ? 'مبلغ مجمع الإكراميات' : 'Tip pool amount'} value={pooledAmount}
          onChange={(e) => setPooledAmount(e.target.value)}
          className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none" />
        <button onClick={create}
          className="w-full mt-3 px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-sm shadow-lg shadow-amber-500/25 hover:scale-[1.02] transition-transform">
          {isAr ? 'إنشاء المجمع' : 'Create Pool'}</button>
      </div>
      <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
        <h3 className="font-black text-main mb-4">{isAr ? 'المجمعات' : 'Tip Pools'}</h3>
        {pools.length === 0 ? (
          <p className="text-sm text-muted">{isAr ? 'لا توجد مجمعات بعد' : 'No pools yet'}</p>) : (
          <div className="space-y-2 max-h-96 overflow-auto">
            {pools.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-app/40 border border-border/30 rounded-2xl px-5 py-3">
                <div>
                  <p className="font-black text-sm">{p.businessDate || p.createdAt?.slice(0, 16)}</p>
                  <p className="text-xs text-muted">{fmtMoney(p.pooledAmount, currency)}</p>
                </div>
                <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${p.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{p.status || 'OPEN'}</span>
                {p.status !== 'PAID' && (
                  <button onClick={() => payout(p.id)} className="text-[10px] font-black uppercase px-4 py-1.5 rounded-full bg-orange-600 text-white">{isAr ? 'صرف' : 'Payout'}</button>)}
              </div>))}
          </div>)}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Gift Cards
// ---------------------------------------------------------------------------
const GiftsView: React.FC<{ isAr: boolean; currency: string; branch: string }> = ({ isAr, currency }) => {
  const { confirm } = useConfirm();
  const [cards, setCards] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [issuedTo, setIssuedTo] = useState('');
  const toast = useToast();

  const load = async () => {
    try {
      const list = await p1Fetch('/gift-cards');
      setCards(Array.isArray(list) ? list : []);
    } catch { /* silent */ }
  };

  const issue = async () => {
    if (!Number(amount)) {
      toast.error(isAr ? 'أدخل قيمة البطاقة' : 'Enter card value');
      return;
    }
    try {
      await p1Fetch('/gift-cards', { method: 'POST', body: JSON.stringify({ code: code.trim() || undefined, amount: Number(amount), issuedTo: issuedTo.trim() || undefined }) });
      toast.success(isAr ? 'تم إصدار البطاقة بنجاح' : 'Gift card issued');
      setCode(''); setAmount(''); setIssuedTo('');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const voidCard = async (id: string) => {
    if (!(await confirm({ title: isAr ? 'إلغاء البطاقة نهائياً؟' : 'Void card permanently?', message: isAr ? 'سيتم إلغاء البطاقة وخصمها من التوازنات' : 'The card will be voided', confirmText: isAr ? 'إلغاء' : 'Void', variant: 'danger' }))) return;
    try {
      await p1Fetch(`/gift-cards/void/${id}`, { method: 'POST' });
      toast.success(isAr ? 'تم إلغاء البطاقة' : 'Card voided');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
        <h3 className="font-black text-main mb-4 flex items-center gap-3">
          <Gift size={20} className="text-pink-500" />
          {isAr ? 'إصدار بطاقة جديدة' : 'Issue New Card'}
        </h3>
        <div className="space-y-3">
          <input placeholder={`${isAr ? 'الرمز' : 'Code'} (${isAr ? 'اختياري' : 'optional'})`} value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none" />
          <input type="number" placeholder={isAr ? 'القيمة' : 'Value'} value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none" />
          <input placeholder={isAr ? 'اسم حامل البطاقة (اختياري)' : 'Holder name (optional)'} value={issuedTo}
            onChange={(e) => setIssuedTo(e.target.value)}
            className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none" />
          <button onClick={issue}
            className="w-full px-5 py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 text-white font-black text-sm shadow-lg shadow-pink-500/25 hover:scale-[1.02] transition-transform">
            {isAr ? 'إصدار' : 'Issue'}</button>
        </div>
      </div>
      <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
        <h3 className="font-black text-main mb-4">{isAr ? 'البطاقات' : 'Gift Cards'}</h3>
        {cards.length === 0 ? (
          <p className="text-sm text-muted">{isAr ? 'لا توجد بطاقات بعد' : 'No cards yet'}</p>) : (
          <div className="space-y-2 max-h-96 overflow-auto">
            {cards.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-app/40 border border-border/30 rounded-2xl px-5 py-3">
                <div>
                  <p className="font-black text-sm">{c.code || c.id}</p>
                  <p className="text-xs text-muted">{c.issuedTo || '-'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-black text-emerald-500">{fmtMoney(c.balance ?? c.amount, currency)}</p>
                  {c.status !== 'VOIDED' && (
                    <button onClick={() => voidCard(c.id)} className="p-2 rounded-xl bg-rose-500/10 text-rose-500"><Ban size={14} /></button>)}
                </div>
              </div>))}
          </div>)}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Payment Gateways
// ---------------------------------------------------------------------------
const PROVIDERS = [
  { id: 'paymob', label: 'Paymob', ar: 'باي موب' },
  { id: 'fawry', label: 'Fawry', ar: 'فوري' },
  { id: 'instapay', label: 'InstaPay', ar: 'إنستاباي' },
];

const GatewaysView: React.FC<{ isAr: boolean; currency: string; branch: string }> = ({ isAr, currency }) => {
  const [providers, setProviders] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [provider, setProvider] = useState('paymob');
  const [apiKey, setApiKey] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const toast = useToast();

  const load = async () => {
    try {
      const p = await p1Fetch('/gateways/providers');
      setProviders(Array.isArray(p) ? p : []);
      const s = await p1Fetch('/gateways/sessions');
      setSessions(Array.isArray(s) ? s : []);
    } catch { /* silent */ }
  };

  const linkProvider = async () => {
    if (!apiKey.trim()) {
      toast.error(isAr ? 'أدخل مفتاح الربط' : 'Enter API key');
      return;
    }
    try {
      await p1Fetch('/gateways/providers', { method: 'POST', body: JSON.stringify({ provider, apiKey, merchantId: merchantId.trim() || undefined }) });
      toast.success(isAr ? 'تم ربط البوابة بنجاح' : 'Gateway linked');
      setApiKey(''); setMerchantId('');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const testPayment = async () => {
    if (!Number(payAmount)) {
      toast.error(isAr ? 'أدخل مبلغ تجربة الدفع' : 'Enter a payment amount');
      return;
    }
    try {
      const res = await p1Fetch('/gateways/sessions', { method: 'POST', body: JSON.stringify({ provider, amount: Number(payAmount) }) });
      toast.success(`${isAr ? 'تم إنشاء جلسة دفع: ' : 'Payment session created: '}${res.status || 'PENDING'}`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const providerLabel = (id: string) => {
    const p = PROVIDERS.find((x) => x.id === id);
    return p ? (isAr ? p.ar : p.label) : id;
  };

  return (
    <div className="grid gap-6">
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
          <h3 className="font-black text-main mb-4 flex items-center gap-3">
            <Plug size={20} className="text-indigo-500" />
            {isAr ? 'ربط بوابة دفع' : 'Link Payment Gateway'}
          </h3>
          <div className="space-y-3">
            <select value={provider} onChange={(e) => setProvider(e.target.value)}
              className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none">
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{isAr ? p.ar : p.label}</option>))}
            </select>
            <input placeholder={isAr ? 'مفتاح الربط' : 'API key'} value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none" />
            <input placeholder={`${isAr ? 'معرف التاجر' : 'Merchant ID'} (${isAr ? 'اختياري' : 'optional'})`} value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none" />
            <button onClick={linkProvider}
              className="w-full px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-black text-sm shadow-lg shadow-indigo-500/25 hover:scale-[1.02] transition-transform">
              {isAr ? 'حفظ الربط' : 'Save Link'}</button>
          </div>
          <p className="text-[11px] text-muted mt-3">{isAr ? 'إطار عمل قابل للتوسعة — أضف بوابات جديدة عبر نفس الواجهة' : 'Extensible framework — add new gateways through the same adapter API'}</p>
        </div>
        <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
          <h3 className="font-black text-main mb-4 flex items-center gap-3">
            <CreditCard size={20} className="text-teal-500" />
            {isAr ? 'تجربة الدفع' : 'Test Payment'}
          </h3>
          <div className="space-y-3">
            <select value={provider} onChange={(e) => setProvider(e.target.value)}
              className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none">
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{isAr ? p.ar : p.label}</option>))}
            </select>
            <input type="number" placeholder={isAr ? 'مبلغ' : 'Amount'} value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full px-5 py-3 bg-app/50 border border-border/40 rounded-2xl text-sm font-black outline-none" />
            <button onClick={testPayment}
              className="w-full px-5 py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-black text-sm">
              {isAr ? 'تجربة الدفع' : 'Create Payment Session'}</button>
          </div>
        </div>
      </div>
      <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
        <h3 className="font-black text-main mb-4">{isAr ? 'البوابات المربوطة' : 'Linked Gateways'}</h3>
        {providers.length === 0 ? (
          <p className="text-sm text-muted">{isAr ? 'لا توجد بوابات مربوطة بعد' : 'No linked gateways yet'}</p>) : (
          <div className="grid md:grid-cols-3 gap-3">
            {providers.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-app/40 border border-border/30 rounded-2xl px-5 py-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <p className="font-black text-sm">{providerLabel(p.provider)}</p>
                </div>
                <span className="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500">{isAr ? 'مربوط' : 'Linked'}</span>
              </div>))}
          </div>)}
      </div>
      <div className="bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl">
        <h3 className="font-black text-main mb-4 flex items-center gap-3">
          <ArrowRightLeft size={20} className="text-cyan-500" />
          {isAr ? 'جلسات الدفع' : 'Payment Sessions'}
        </h3>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted">{isAr ? 'لا توجد جلسات دفع' : 'No payment sessions yet'}</p>) : (
          <div className="space-y-2 max-h-72 overflow-auto">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-app/40 border border-border/30 rounded-2xl px-5 py-3">
                <div>
                  <p className="font-black text-sm">{providerLabel(s.provider)}</p>
                  <p className="text-xs text-muted">{s.id} · {(s.createdAt || '').slice(0, 16)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-black">{fmtMoney(s.amount, currency)}</p>
                  <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${s.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-500' : s.status === 'FAILED' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'}`}>{s.status || 'PENDING'}</span>
                </div>
              </div>))}
          </div>)}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main hub
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'pnl', label: 'Daily P&L', labelAr: 'أرباح وخسائر يومية', icon: TrendingUp, color: '#10b981' },
  { id: 'drawers', label: 'Cash Drawers', labelAr: 'درج الكاشير', icon: Wallet, color: '#f59e0b' },
  { id: 'banking', label: 'Banking', labelAr: 'البنوك والتحويلات', icon: Landmark, color: '#3b82f6' },
  { id: 'tips', label: 'Tip Pools', labelAr: 'مجمعات الإكراميات', icon: Coins, color: '#8b5cf6' },
  { id: 'gifts', label: 'Gift Cards', labelAr: 'البطاقات المدفوعة', icon: Gift, color: '#ec4899' },
  { id: 'gateways', label: 'Gateways', labelAr: 'بوابات الدفع', icon: Plug, color: '#06b6d4' },
];

export default function FinanceP1Hub() {
  const [tab, setTab] = useState('pnl');
  const [isAr, setIsAr] = useState(() => {
    try { return localStorage.getItem('app_lang') === 'ar'; } catch { return false; }
  });
  const [currency, setCurrency] = useState(() => {
    try { return localStorage.getItem('app_currency') || 'ج.م'; } catch { return 'ج.م'; }
  });
  const [branch, setBranch] = useState(() => {
    try { return localStorage.getItem('active_branch_id') || ''; } catch { return ''; }
  });
  const toast = useToast();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'active_branch_id' && e.newValue !== null) setBranch(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border/30 rounded-[2.5rem] p-8 shadow-xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <CircleDollarSign size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-main flex items-center gap-3">
                {isAr ? 'العمود الفقري المالي' : 'Financial Backbone'}
                <span className="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500">P1</span>
              </h1>
              <p className="text-xs text-muted mt-1">
                {isAr ? 'تسوية درج الكاشير · البنوك والتحويلات · الإكراميات · البطاقات المدفوعة · بوابات الدفع · لقطة أرباح وخسائر يومية' : 'Drawer reconciliation · Banking · Tip pools · Gift cards · Payment gateways · Daily P&L snapshots'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => { setIsAr(!isAr); try { localStorage.setItem('app_lang', isAr ? 'en' : 'ar'); } catch {} }}
              className="px-5 py-2.5 rounded-2xl bg-app/60 border border-border/40 text-sm font-black text-main hover:bg-app transition-colors">
              {isAr ? 'English' : 'العربية'}</button>
            <select value={currency} onChange={(e) => { setCurrency(e.target.value); try { localStorage.setItem('app_currency', e.target.value); } catch {} }}
              className="px-4 py-2.5 rounded-2xl bg-app/60 border border-border/40 text-sm font-black outline-none">
              {['ج.م', '$', '€', 'SAR', 'AED'].map((c) => (
                <option key={c} value={c}>{c}</option>))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-6 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={'flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-black whitespace-nowrap transition-all ' + (tab === t.id ? 'text-white shadow-lg' : 'bg-app/50 text-muted hover:text-main')}
              style={tab === t.id ? { background: t.color, boxShadow: '0 8px 24px ' + t.color + '40' } : undefined}>
              <t.icon size={16} />
              {isAr ? t.labelAr : t.label}
            </button>))}
        </div>
      </div>
      {tab === 'pnl' && <DailyPnlView isAr={isAr} currency={currency} branch={branch} />}
      {tab === 'drawers' && <DrawersView isAr={isAr} currency={currency} branch={branch} />}
      {tab === 'banking' && <BankingView isAr={isAr} currency={currency} branch={branch} />}
      {tab === 'tips' && <TipsView isAr={isAr} currency={currency} branch={branch} />}
      {tab === 'gifts' && <GiftsView isAr={isAr} currency={currency} branch={branch} />}
      {tab === 'gateways' && <GatewaysView isAr={isAr} currency={currency} branch={branch} />}
    </div>
  );
}
