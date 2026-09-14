import React, { useEffect, useMemo, useState } from 'react';
import {
    Wallet, Landmark, ArrowRightLeft, Users, TrendingDown, HandCoins,
    ReceiptText, LayoutDashboard, Plus, CheckCircle2, XCircle, RefreshCw,
    Smartphone, Vault,
} from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { useToast } from './common/ToastProvider';
import { useConfirm } from './common/ConfirmProvider';
import { treasuryApi } from '../services/api/treasury';
import { suppliersApi } from '../services/api/procurement';
import { usersApi } from '../services/api/users';
import { financeApi } from '../services/api/finance';

type Tab = 'overview' | 'accounts' | 'transfers' | 'suppliers' | 'expenses' | 'custody' | 'vouchers';

const TABS: { id: Tab; labelAr: string; label: string; icon: any }[] = [
    { id: 'overview', labelAr: 'نظرة عامة', label: 'Overview', icon: LayoutDashboard },
    { id: 'accounts', labelAr: 'حسابات الخزينة', label: 'Accounts', icon: Vault },
    { id: 'transfers', labelAr: 'التحويلات والتوريد', label: 'Transfers', icon: ArrowRightLeft },
    { id: 'suppliers', labelAr: 'مدفوعات الموردين', label: 'Suppliers', icon: Users },
    { id: 'expenses', labelAr: 'المصروفات', label: 'Expenses', icon: TrendingDown },
    { id: 'custody', labelAr: 'العهد', label: 'Custody', icon: HandCoins },
    { id: 'vouchers', labelAr: 'السندات', label: 'Vouchers', icon: ReceiptText },
];

const ACCOUNT_TYPES = [
    { id: 'CASH_ON_HAND', ar: 'خزينة رئيسية', en: 'Main cashbox' },
    { id: 'PETTY_CASH', ar: 'خزينة فرعية / نثرية', en: 'Petty cash' },
    { id: 'BANK', ar: 'حساب بنكي', en: 'Bank account' },
    { id: 'MOBILE_WALLET', ar: 'محفظة إلكترونية', en: 'Mobile wallet' },
];

const PAY_METHODS = [
    { id: 'CASH', ar: 'نقدي', en: 'Cash' },
    { id: 'BANK_TRANSFER', ar: 'تحويل بنكي', en: 'Bank transfer' },
    { id: 'CHECK', ar: 'شيك', en: 'Check' },
    { id: 'WALLET', ar: 'محفظة', en: 'Wallet' },
];

const CATEGORY_AR: Record<string, string> = {
    SUPPLIER_PAYMENT: 'سداد مورد', SUPPLIER_ADVANCE: 'دفعة مقدمة', EXPENSE: 'مصروف',
    CUSTODY_ISSUE: 'صرف عهدة', CUSTODY_SETTLEMENT: 'تسوية عهدة', COLLECTION: 'تحصيل',
    SALARY: 'راتب / سلفة', OTHER: 'أخرى',
};

const inputCls = 'w-full px-4 py-2.5 bg-app/50 border border-border/40 rounded-2xl text-sm font-bold outline-none text-main focus:border-indigo-500/60';
const btnPrimary = 'px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-xs shadow-lg hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-40';
const cardCls = 'bg-card border border-border/30 rounded-[2rem] p-6 shadow-xl';

const StatusPill: React.FC<{ status: string; isAr: boolean }> = ({ status, isAr }) => {
    const map: Record<string, string> = {
        PENDING: 'bg-amber-500/10 text-amber-500', COMPLETED: 'bg-emerald-500/10 text-emerald-500',
        REJECTED: 'bg-rose-500/10 text-rose-500', CANCELLED: 'bg-slate-500/10 text-slate-400',
        PAID: 'bg-emerald-500/10 text-emerald-500', PARTIAL: 'bg-amber-500/10 text-amber-500',
        APPROVED: 'bg-blue-500/10 text-blue-500', DRAFT: 'bg-slate-500/10 text-slate-400',
    };
    const ar: Record<string, string> = {
        PENDING: 'معلق', COMPLETED: 'معتمد', REJECTED: 'مرفوض', CANCELLED: 'ملغي',
        PAID: 'مدفوعة', PARTIAL: 'جزئي', APPROVED: 'معتمدة', DRAFT: 'مسودة',
    };
    return (
        <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full whitespace-nowrap ${map[status] || map.DRAFT}`}>
            {isAr ? (ar[status] || status) : status}
        </span>
    );
};

export default function TreasuryHub() {
    const { settings, branches } = useAuthStore();
    const isAr = (settings.language || 'en') === 'ar';
    const currency = settings.currencySymbol || (isAr ? 'ج.م' : 'EGP');
    const branchId = settings.activeBranchId || '';
    const activeBranch = branches.find((b: any) => b.id === branchId);
    const toast = useToast();
    const { confirm } = useConfirm();

    const [tab, setTab] = useState<Tab>('overview');
    const [loading, setLoading] = useState(false);
    const [overview, setOverview] = useState<any>(null);
    const [vouchers, setVouchers] = useState<any[]>([]);
    const [transfers, setTransfers] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
    const [statement, setStatement] = useState<any>(null);
    const [selectedSupplier, setSelectedSupplier] = useState('');

    const fmt = (v: any) => `${currency} ${(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    const accounts: any[] = useMemo(() => overview?.accounts || [], [overview]);

    const refreshAll = async () => {
        if (!branchId) return;
        setLoading(true);
        try {
            const [ov, vs, ts] = await Promise.all([
                treasuryApi.overview(branchId),
                treasuryApi.vouchers(branchId, { limit: 100 }),
                treasuryApi.transfers(branchId),
            ]);
            setOverview(ov);
            setVouchers(Array.isArray(vs) ? vs : []);
            setTransfers(Array.isArray(ts) ? ts : []);
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refreshAll();
        suppliersApi.getAll(true).then((l) => setSuppliers(Array.isArray(l) ? l : [])).catch(() => {});
        usersApi.getAll().then((l) => setUsers(Array.isArray(l) ? l : [])).catch(() => {});
        financeApi.getAccounts().then((acc: any) => {
            const flat: any[] = [];
            const walk = (arr: any[]) => arr?.forEach((a) => { flat.push(a); if (a.children?.length) walk(a.children); });
            walk(Array.isArray(acc) ? acc : acc?.accounts || []);
            setExpenseAccounts(flat.filter((a) => String(a.type || '').toUpperCase() === 'EXPENSE'));
        }).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [branchId]);

    const loadStatement = async (supplierId: string) => {
        setSelectedSupplier(supplierId);
        if (!supplierId) { setStatement(null); return; }
        try {
            setStatement(await treasuryApi.supplierStatement(supplierId));
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    const approveVoucher = async (id: string) => {
        if (!(await confirm({ title: isAr ? 'اعتماد السند؟' : 'Approve voucher?', message: isAr ? 'سيتم ترحيل المبلغ على رصيد الخزينة نهائياً' : 'Amount will post to the treasury balance', confirmText: isAr ? 'اعتماد' : 'Approve', variant: 'warning' }))) return;
        try {
            await treasuryApi.approveVoucher(id);
            toast.success(isAr ? 'تم اعتماد السند' : 'Voucher approved');
            refreshAll();
            if (selectedSupplier) loadStatement(selectedSupplier);
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    const rejectVoucher = async (id: string) => {
        try {
            await treasuryApi.rejectVoucher(id);
            toast.success(isAr ? 'تم رفض السند' : 'Voucher rejected');
            refreshAll();
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    // ── forms ──
    const [acctForm, setAcctForm] = useState({ name: '', accountType: 'CASH_ON_HAND', institution: '', accountNumber: '', openingBalance: '' });
    const [trfForm, setTrfForm] = useState({ fromAccountId: '', toAccountId: '', amount: '', reason: '' });
    const [payForm, setPayForm] = useState({ accountId: '', invoiceId: '', amount: '', paymentMethod: 'CASH', reference: '', description: '' });
    const [advForm, setAdvForm] = useState({ accountId: '', amount: '', paymentMethod: 'CASH', reference: '', description: '' });
    const [expForm, setExpForm] = useState({ accountId: '', expenseAccountCode: '', amount: '', description: '', paymentMethod: 'CASH', reference: '' });
    const [custForm, setCustForm] = useState({ accountId: '', holderUserId: '', holderName: '', amount: '', description: '' });
    const [settleForm, setSettleForm] = useState({ accountId: '', holderUserId: '', amount: '', description: '' });
    const [rcptForm, setRcptForm] = useState({ accountId: '', amount: '', description: '', paymentMethod: 'CASH', reference: '' });

    const submitVoucher = async (data: any, okMsg: string) => {
        if (!data.accountId || !Number(data.amount)) {
            toast.error(isAr ? 'اختر الخزينة وأدخل مبلغاً صحيحاً' : 'Select an account and enter a valid amount');
            return;
        }
        try {
            await treasuryApi.createVoucher({ paymentMethod: 'CASH', ...data, amount: Number(data.amount) });
            toast.success(okMsg);
            refreshAll();
            if (selectedSupplier) loadStatement(selectedSupplier);
            return true;
        } catch (e: any) {
            toast.error(e.message);
            return false;
        }
    };

    const pendingVouchers = vouchers.filter((v) => v.status === 'PENDING');
    const pendingTransfers = transfers.filter((t) => t.status === 'PENDING');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className={`${cardCls} !rounded-[2.5rem] !p-8`}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
                            <Vault size={28} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-main">
                                {isAr ? 'الخزينة' : 'Treasury'}
                                <span className="ms-3 text-[10px] font-black uppercase px-3 py-1 rounded-full bg-amber-500/10 text-amber-500">
                                    {activeBranch?.name || (isAr ? 'الفرع' : 'Branch')}
                                </span>
                            </h1>
                            <p className="text-xs text-muted mt-1">
                                {isAr ? 'حسابات · توريد وتحويل · موردين · مصروفات · عهد · سندات قبض وصرف' : 'Accounts · deposits & transfers · suppliers · expenses · custody · vouchers'}
                            </p>
                        </div>
                    </div>
                    <button onClick={refreshAll} disabled={loading} className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-app/60 border border-border/40 text-sm font-black text-main disabled:opacity-50">
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        {isAr ? 'تحديث' : 'Refresh'}
                    </button>
                </div>
                <div className="flex gap-2 mt-6 overflow-x-auto pb-1">
                    {TABS.map((t) => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-black whitespace-nowrap transition-all ${tab === t.id ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg' : 'bg-app/50 text-muted hover:text-main'}`}>
                            <t.icon size={16} />
                            {isAr ? t.labelAr : t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── OVERVIEW ── */}
            {tab === 'overview' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                        {[
                            { label: isAr ? 'إجمالي الأرصدة' : 'Total balance', value: fmt(overview?.totalBalance), color: '#10b981', icon: Wallet },
                            { label: isAr ? 'مقبوضات اليوم' : 'Today in', value: fmt(overview?.todayIn), color: '#3b82f6', icon: Landmark },
                            { label: isAr ? 'مدفوعات اليوم' : 'Today out', value: fmt(overview?.todayOut), color: '#f43f5e', icon: TrendingDown },
                            { label: isAr ? 'عهد معلقة' : 'Open custody', value: fmt(overview?.custodyTotal), color: '#f59e0b', icon: HandCoins },
                        ].map((m, i) => (
                            <div key={i} className={cardCls}>
                                <div className="flex items-center gap-2 text-xs font-black text-muted"><m.icon size={15} style={{ color: m.color }} />{m.label}</div>
                                <p className="text-xl font-black mt-2 tabular-nums" style={{ color: m.color }}>{m.value}</p>
                            </div>
                        ))}
                    </div>
                    <div className="grid lg:grid-cols-2 gap-6">
                        <div className={cardCls}>
                            <h3 className="font-black text-main mb-4">{isAr ? 'أرصدة الحسابات' : 'Account balances'}</h3>
                            <div className="space-y-2 max-h-80 overflow-auto">
                                {accounts.map((a: any) => (
                                    <div key={a.id} className="flex items-center justify-between bg-app/40 border border-border/30 rounded-2xl px-5 py-3">
                                        <div>
                                            <p className="font-black text-sm">{a.name}</p>
                                            <p className="text-xs text-muted">{ACCOUNT_TYPES.find((t) => t.id === a.accountType)?.ar || a.accountType}{a.institution ? ` · ${a.institution}` : ''}</p>
                                        </div>
                                        <p className="font-black text-emerald-500 tabular-nums">{fmt(a.balance)}</p>
                                    </div>
                                ))}
                                {accounts.length === 0 && <p className="text-sm text-muted">{isAr ? 'أنشئ أول حساب خزينة من تبويب الحسابات' : 'Create your first treasury account'}</p>}
                            </div>
                        </div>
                        <div className={cardCls}>
                            <h3 className="font-black text-main mb-4">{isAr ? 'بانتظار الاعتماد' : 'Pending approval'} ({pendingVouchers.length + pendingTransfers.length})</h3>
                            <div className="space-y-2 max-h-80 overflow-auto">
                                {pendingTransfers.map((t: any) => (
                                    <div key={t.id} className="flex items-center justify-between bg-app/40 border border-amber-500/20 rounded-2xl px-5 py-3">
                                        <div>
                                            <p className="font-black text-sm">{isAr ? 'تحويل بين حسابات' : 'Transfer'} · {fmt(t.amount)}</p>
                                            <p className="text-xs text-muted">{t.reason || ''}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => treasuryApi.approveTransfer(t.id).then(() => { toast.success(isAr ? 'تم اعتماد التحويل' : 'Transfer approved'); refreshAll(); }).catch((e: any) => toast.error(e.message))} className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500"><CheckCircle2 size={15} /></button>
                                            <button onClick={() => treasuryApi.rejectTransfer(t.id).then(() => { toast.success(isAr ? 'تم رفض التحويل' : 'Transfer rejected'); refreshAll(); }).catch((e: any) => toast.error(e.message))} className="p-2 rounded-xl bg-rose-500/10 text-rose-500"><XCircle size={15} /></button>
                                        </div>
                                    </div>
                                ))}
                                {pendingVouchers.slice(0, 10).map((v: any) => (
                                    <div key={v.id} className="flex items-center justify-between bg-app/40 border border-amber-500/20 rounded-2xl px-5 py-3">
                                        <div>
                                            <p className="font-black text-sm">#{v.voucherNo} · {CATEGORY_AR[v.category] || v.category} · {fmt(v.amount)}</p>
                                            <p className="text-xs text-muted">{v.description || ''}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => approveVoucher(v.id)} className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500"><CheckCircle2 size={15} /></button>
                                            <button onClick={() => rejectVoucher(v.id)} className="p-2 rounded-xl bg-rose-500/10 text-rose-500"><XCircle size={15} /></button>
                                        </div>
                                    </div>
                                ))}
                                {pendingVouchers.length === 0 && pendingTransfers.length === 0 && (
                                    <p className="text-sm text-muted flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-500" />{isAr ? 'لا يوجد معلق — كل العمليات معتمدة' : 'Nothing pending'}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── ACCOUNTS ── */}
            {tab === 'accounts' && (
                <div className="grid lg:grid-cols-2 gap-6">
                    <div className={cardCls}>
                        <h3 className="font-black text-main mb-4 flex items-center gap-2"><Plus size={18} />{isAr ? 'حساب خزينة جديد' : 'New treasury account'}</h3>
                        <div className="space-y-3">
                            <input placeholder={isAr ? 'اسم الحساب *' : 'Account name *'} value={acctForm.name} onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })} className={inputCls} />
                            <select value={acctForm.accountType} onChange={(e) => setAcctForm({ ...acctForm, accountType: e.target.value })} className={inputCls}>
                                {ACCOUNT_TYPES.map((t) => <option key={t.id} value={t.id}>{isAr ? t.ar : t.en}</option>)}
                            </select>
                            <div className="grid grid-cols-2 gap-3">
                                <input placeholder={isAr ? 'البنك / الجهة' : 'Institution'} value={acctForm.institution} onChange={(e) => setAcctForm({ ...acctForm, institution: e.target.value })} className={inputCls} />
                                <input placeholder={isAr ? 'رقم الحساب' : 'Account number'} value={acctForm.accountNumber} onChange={(e) => setAcctForm({ ...acctForm, accountNumber: e.target.value })} className={inputCls} />
                            </div>
                            <input type="number" placeholder={isAr ? 'رصيد الافتتاح' : 'Opening balance'} value={acctForm.openingBalance} onChange={(e) => setAcctForm({ ...acctForm, openingBalance: e.target.value })} className={inputCls} />
                            <button onClick={async () => {
                                if (!acctForm.name.trim()) { toast.error(isAr ? 'أدخل اسم الحساب' : 'Enter account name'); return; }
                                try {
                                    await treasuryApi.createBankAccount({ ...acctForm, openingBalance: Number(acctForm.openingBalance || 0), accountType: acctForm.accountType as any });
                                    toast.success(isAr ? 'تم إنشاء الحساب' : 'Account created');
                                    setAcctForm({ name: '', accountType: 'CASH_ON_HAND', institution: '', accountNumber: '', openingBalance: '' });
                                    refreshAll();
                                } catch (e: any) { toast.error(e.message); }
                            }} className={btnPrimary}>{isAr ? 'إنشاء الحساب' : 'Create account'}</button>
                        </div>
                    </div>
                    <div className={cardCls}>
                        <h3 className="font-black text-main mb-4">{isAr ? 'الحسابات والأرصدة الحية' : 'Accounts & live balances'}</h3>
                        <div className="space-y-2 max-h-[26rem] overflow-auto">
                            {accounts.map((a: any) => (
                                <div key={a.id} className="bg-app/40 border border-border/30 rounded-2xl px-5 py-3">
                                    <div className="flex items-center justify-between">
                                        <p className="font-black text-sm">{a.name}</p>
                                        <p className="font-black text-emerald-500 tabular-nums">{fmt(a.balance)}</p>
                                    </div>
                                    <p className="text-xs text-muted mt-1">
                                        {ACCOUNT_TYPES.find((t) => t.id === a.accountType)?.ar || a.accountType}
                                        {a.institution ? ` · ${a.institution}` : ''}{a.accountNumber ? ` · ${a.accountNumber}` : ''}
                                        {` · ${isAr ? 'افتتاحي' : 'opening'} ${fmt(a.openingBalance)}`}
                                    </p>
                                </div>
                            ))}
                            {accounts.length === 0 && <p className="text-sm text-muted">{isAr ? 'لا توجد حسابات بعد' : 'No accounts yet'}</p>}
                        </div>
                    </div>
                </div>
            )}

            {/* ── TRANSFERS ── */}
            {tab === 'transfers' && (
                <div className="grid lg:grid-cols-2 gap-6">
                    <div className={cardCls}>
                        <h3 className="font-black text-main mb-4">{isAr ? 'تحويل / توريد بين الحسابات' : 'Transfer / deposit'}</h3>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {[isAr ? 'توريد يومية للبنك' : 'Daily deposit', isAr ? 'تغذية الخزينة' : 'Fund cashbox', isAr ? 'تحويل بين حسابات' : 'Transfer'].map((r) => (
                                <button key={r} onClick={() => setTrfForm({ ...trfForm, reason: r })} className="text-[11px] font-black px-3 py-1.5 rounded-full bg-app/60 border border-border/40 text-muted hover:text-main">{r}</button>
                            ))}
                        </div>
                        <div className="space-y-3">
                            <select value={trfForm.fromAccountId} onChange={(e) => setTrfForm({ ...trfForm, fromAccountId: e.target.value })} className={inputCls}>
                                <option value="">{isAr ? 'من حساب *' : 'From account *'}</option>
                                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({fmt(a.balance)})</option>)}
                            </select>
                            <select value={trfForm.toAccountId} onChange={(e) => setTrfForm({ ...trfForm, toAccountId: e.target.value })} className={inputCls}>
                                <option value="">{isAr ? 'إلى حساب *' : 'To account *'}</option>
                                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <input type="number" placeholder={isAr ? 'المبلغ *' : 'Amount *'} value={trfForm.amount} onChange={(e) => setTrfForm({ ...trfForm, amount: e.target.value })} className={inputCls} />
                            <input placeholder={isAr ? 'البيان' : 'Reason'} value={trfForm.reason} onChange={(e) => setTrfForm({ ...trfForm, reason: e.target.value })} className={inputCls} />
                            <button onClick={async () => {
                                if (!trfForm.fromAccountId || !trfForm.toAccountId || !Number(trfForm.amount)) { toast.error(isAr ? 'أكمل بيانات التحويل' : 'Complete transfer data'); return; }
                                try {
                                    await treasuryApi.requestTransfer({ ...trfForm, amount: Number(trfForm.amount) });
                                    toast.success(isAr ? 'تم إرسال التحويل للاعتماد' : 'Transfer sent for approval');
                                    setTrfForm({ fromAccountId: '', toAccountId: '', amount: '', reason: '' });
                                    refreshAll();
                                } catch (e: any) { toast.error(e.message); }
                            }} className={btnPrimary}>{isAr ? 'إرسال للاعتماد' : 'Request transfer'}</button>
                        </div>
                    </div>
                    <div className={cardCls}>
                        <h3 className="font-black text-main mb-4">{isAr ? 'سجل التحويلات' : 'Transfer history'}</h3>
                        <div className="space-y-2 max-h-[26rem] overflow-auto">
                            {transfers.map((t: any) => (
                                <div key={t.id} className="bg-app/40 border border-border/30 rounded-2xl px-5 py-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-black text-sm tabular-nums">{fmt(t.amount)}</p>
                                        <StatusPill status={t.status} isAr={isAr} />
                                    </div>
                                    <p className="text-xs text-muted mt-1">{t.reason || ''}</p>
                                    {t.status === 'PENDING' && (
                                        <div className="flex gap-2 mt-2">
                                            <button onClick={() => treasuryApi.approveTransfer(t.id).then(() => { toast.success(isAr ? 'تم الاعتماد' : 'Approved'); refreshAll(); }).catch((e: any) => toast.error(e.message))} className="text-[11px] font-black px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500">{isAr ? 'اعتماد' : 'Approve'}</button>
                                            <button onClick={() => treasuryApi.rejectTransfer(t.id).then(() => { toast.success(isAr ? 'تم الرفض' : 'Rejected'); refreshAll(); }).catch((e: any) => toast.error(e.message))} className="text-[11px] font-black px-4 py-1.5 rounded-full bg-rose-500/10 text-rose-500">{isAr ? 'رفض' : 'Reject'}</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {transfers.length === 0 && <p className="text-sm text-muted">{isAr ? 'لا توجد تحويلات' : 'No transfers'}</p>}
                        </div>
                    </div>
                </div>
            )}

            {/* ── SUPPLIERS ── */}
            {tab === 'suppliers' && (
                <div className="space-y-6">
                    <div className={cardCls}>
                        <h3 className="font-black text-main mb-4">{isAr ? 'كشف حساب مورد' : 'Supplier statement'}</h3>
                        <select value={selectedSupplier} onChange={(e) => loadStatement(e.target.value)} className={`${inputCls} max-w-md`}>
                            <option value="">{isAr ? 'اختر المورد…' : 'Select supplier…'}</option>
                            {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}{s.phone ? ` · ${s.phone}` : ''}</option>)}
                        </select>
                        {statement && (
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
                                {[
                                    { l: isAr ? 'إجمالي الفواتير' : 'Billed', v: statement.totals.billed, c: '#3b82f6' },
                                    { l: isAr ? 'المدفوع' : 'Paid', v: statement.totals.paid, c: '#10b981' },
                                    { l: isAr ? 'المستحق' : 'Due', v: statement.totals.balanceDue, c: '#f43f5e' },
                                    { l: isAr ? 'دفعات مقدمة غير مربوطة' : 'Unapplied advances', v: statement.totals.unappliedAdvances, c: '#f59e0b' },
                                ].map((m, i) => (
                                    <div key={i} className="bg-app/40 border border-border/30 rounded-2xl p-4">
                                        <p className="text-[11px] font-black text-muted">{m.l}</p>
                                        <p className="font-black tabular-nums mt-1" style={{ color: m.c }}>{fmt(m.v)}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {statement && (
                        <div className="grid lg:grid-cols-2 gap-6">
                            <div className={cardCls}>
                                <h3 className="font-black text-main mb-4">{isAr ? 'الفواتير والسداد' : 'Invoices & payment'}</h3>
                                <div className="space-y-2 max-h-72 overflow-auto mb-4">
                                    {(statement.invoices || []).map((inv: any) => (
                                        <button key={inv.id} onClick={() => setPayForm({ ...payForm, invoiceId: inv.id, amount: String(Number(inv.total) - Number(inv.amountPaid || 0)) })}
                                            className={`w-full text-start bg-app/40 border rounded-2xl px-5 py-3 ${payForm.invoiceId === inv.id ? 'border-indigo-500/60' : 'border-border/30'}`}>
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="font-black text-sm">{inv.invoiceNumber || inv.id}</p>
                                                <StatusPill status={inv.status} isAr={isAr} />
                                            </div>
                                            <p className="text-xs text-muted mt-1">
                                                {isAr ? 'الإجمالي' : 'Total'} {fmt(inv.total)} · {isAr ? 'المدفوع' : 'Paid'} {fmt(inv.amountPaid)} · {isAr ? 'المتبقي' : 'Due'} {fmt(inv.remaining)}
                                            </p>
                                        </button>
                                    ))}
                                    {(statement.invoices || []).length === 0 && <p className="text-sm text-muted">{isAr ? 'لا توجد فواتير' : 'No invoices'}</p>}
                                </div>
                                <div className="space-y-3 border-t border-border/20 pt-4">
                                    <p className="text-xs font-black text-muted">{isAr ? 'سداد فاتورة (يخصم من الخزينة بعد الاعتماد)' : 'Pay invoice'}</p>
                                    <select value={payForm.accountId} onChange={(e) => setPayForm({ ...payForm, accountId: e.target.value })} className={inputCls}>
                                        <option value="">{isAr ? 'من خزينة *' : 'From account *'}</option>
                                        {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({fmt(a.balance)})</option>)}
                                    </select>
                                    <div className="grid grid-cols-2 gap-3">
                                        <input type="number" placeholder={isAr ? 'المبلغ *' : 'Amount *'} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className={inputCls} />
                                        <select value={payForm.paymentMethod} onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })} className={inputCls}>
                                            {PAY_METHODS.map((m) => <option key={m.id} value={m.id}>{isAr ? m.ar : m.en}</option>)}
                                        </select>
                                    </div>
                                    <input placeholder={isAr ? 'رقم المستند / الشيك' : 'Reference'} value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} className={inputCls} />
                                    <button onClick={async () => {
                                        if (!payForm.invoiceId) { toast.error(isAr ? 'اختر الفاتورة أولاً' : 'Select an invoice first'); return; }
                                        const ok = await submitVoucher({
                                            kind: 'PAYMENT', category: 'SUPPLIER_PAYMENT', supplierId: selectedSupplier,
                                            invoiceId: payForm.invoiceId, description: payForm.description || `سداد فاتورة مورد`,
                                            ...payForm,
                                        }, isAr ? 'تم إنشاء سند السداد' : 'Payment voucher created');
                                        if (ok) setPayForm({ accountId: '', invoiceId: '', amount: '', paymentMethod: 'CASH', reference: '', description: '' });
                                    }} className={btnPrimary}>{isAr ? 'إنشاء سند سداد' : 'Create payment voucher'}</button>
                                </div>
                            </div>
                            <div className={cardCls}>
                                <h3 className="font-black text-main mb-4">{isAr ? 'دفعة مقدمة + سجل المدفوعات' : 'Advances + history'}</h3>
                                <div className="space-y-3 border-b border-border/20 pb-4 mb-4">
                                    <p className="text-xs font-black text-muted">{isAr ? 'دفعة مقدمة بدون فاتورة' : 'Advance without invoice'}</p>
                                    <select value={advForm.accountId} onChange={(e) => setAdvForm({ ...advForm, accountId: e.target.value })} className={inputCls}>
                                        <option value="">{isAr ? 'من خزينة *' : 'From account *'}</option>
                                        {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({fmt(a.balance)})</option>)}
                                    </select>
                                    <div className="grid grid-cols-2 gap-3">
                                        <input type="number" placeholder={isAr ? 'المبلغ *' : 'Amount *'} value={advForm.amount} onChange={(e) => setAdvForm({ ...advForm, amount: e.target.value })} className={inputCls} />
                                        <input placeholder={isAr ? 'البيان' : 'Note'} value={advForm.description} onChange={(e) => setAdvForm({ ...advForm, description: e.target.value })} className={inputCls} />
                                    </div>
                                    <button onClick={async () => {
                                        const ok = await submitVoucher({
                                            kind: 'PAYMENT', category: 'SUPPLIER_ADVANCE', supplierId: selectedSupplier,
                                            paymentMethod: advForm.paymentMethod, reference: advForm.reference,
                                            accountId: advForm.accountId, amount: advForm.amount, description: advForm.description || 'دفعة مقدمة لمورد',
                                        }, isAr ? 'تم إنشاء سند الدفعة المقدمة' : 'Advance voucher created');
                                        if (ok) setAdvForm({ accountId: '', amount: '', paymentMethod: 'CASH', reference: '', description: '' });
                                    }} className={btnPrimary}>{isAr ? 'إنشاء سند دفعة مقدمة' : 'Create advance'}</button>
                                </div>
                                <div className="space-y-2 max-h-64 overflow-auto">
                                    {(statement.payments || []).map((p: any) => (
                                        <div key={p.id} className="bg-app/40 border border-border/30 rounded-2xl px-5 py-3 flex items-center justify-between">
                                            <div>
                                                <p className="font-black text-sm tabular-nums">{fmt(p.amount)}</p>
                                                <p className="text-xs text-muted">{p.invoiceId ? `${isAr ? 'فاتورة' : 'Invoice'} ${p.invoiceId}` : (isAr ? 'دفعة مقدمة' : 'Advance')} · {p.paymentMethod} · {String(p.createdAt || '').slice(0, 10)}</p>
                                            </div>
                                            <StatusPill status={p.status} isAr={isAr} />
                                        </div>
                                    ))}
                                    {(statement.payments || []).length === 0 && <p className="text-sm text-muted">{isAr ? 'لا توجد مدفوعات مسجلة' : 'No payments recorded'}</p>}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── EXPENSES ── */}
            {tab === 'expenses' && (
                <div className="grid lg:grid-cols-2 gap-6">
                    <div className={cardCls}>
                        <h3 className="font-black text-main mb-4">{isAr ? 'سند صرف مصروف' : 'Expense voucher'}</h3>
                        <div className="space-y-3">
                            <select value={expForm.accountId} onChange={(e) => setExpForm({ ...expForm, accountId: e.target.value })} className={inputCls}>
                                <option value="">{isAr ? 'من خزينة *' : 'From account *'}</option>
                                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({fmt(a.balance)})</option>)}
                            </select>
                            <select value={expForm.expenseAccountCode} onChange={(e) => setExpForm({ ...expForm, expenseAccountCode: e.target.value })} className={inputCls}>
                                <option value="">{isAr ? 'بند المصروف (دليل الحسابات)' : 'Expense GL account'}</option>
                                {expenseAccounts.map((a: any) => <option key={a.id} value={a.code}>{a.code} · {isAr ? (a.nameAr || a.name) : a.name}</option>)}
                            </select>
                            <div className="grid grid-cols-2 gap-3">
                                <input type="number" placeholder={isAr ? 'المبلغ *' : 'Amount *'} value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} className={inputCls} />
                                <select value={expForm.paymentMethod} onChange={(e) => setExpForm({ ...expForm, paymentMethod: e.target.value })} className={inputCls}>
                                    {PAY_METHODS.map((m) => <option key={m.id} value={m.id}>{isAr ? m.ar : m.en}</option>)}
                                </select>
                            </div>
                            <input placeholder={isAr ? 'البيان * (صيانة، كهرباء، نظافة…)' : 'Description *'} value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} className={inputCls} />
                            <button onClick={async () => {
                                if (!expForm.description.trim()) { toast.error(isAr ? 'اكتب بيان المصروف' : 'Enter expense description'); return; }
                                const ok = await submitVoucher({ kind: 'PAYMENT', category: 'EXPENSE', reference: expForm.reference, ...expForm }, isAr ? 'تم إنشاء سند المصروف' : 'Expense voucher created');
                                if (ok) setExpForm({ accountId: '', expenseAccountCode: '', amount: '', description: '', paymentMethod: 'CASH', reference: '' });
                            }} className={btnPrimary}>{isAr ? 'إنشاء سند صرف' : 'Create voucher'}</button>
                        </div>
                    </div>
                    <div className={cardCls}>
                        <h3 className="font-black text-main mb-4">{isAr ? 'مصروفات الخزينة' : 'Treasury expenses'}</h3>
                        <div className="space-y-2 max-h-[26rem] overflow-auto">
                            {vouchers.filter((v) => v.category === 'EXPENSE').map((v: any) => (
                                <div key={v.id} className="bg-app/40 border border-border/30 rounded-2xl px-5 py-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-black text-sm">#{v.voucherNo} · {fmt(v.amount)}</p>
                                        <StatusPill status={v.status} isAr={isAr} />
                                    </div>
                                    <p className="text-xs text-muted mt-1">{v.description || ''}</p>
                                    {v.status === 'PENDING' && (
                                        <div className="flex gap-2 mt-2">
                                            <button onClick={() => approveVoucher(v.id)} className="text-[11px] font-black px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500">{isAr ? 'اعتماد' : 'Approve'}</button>
                                            <button onClick={() => rejectVoucher(v.id)} className="text-[11px] font-black px-4 py-1.5 rounded-full bg-rose-500/10 text-rose-500">{isAr ? 'رفض' : 'Reject'}</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── CUSTODY ── */}
            {tab === 'custody' && (
                <div className="space-y-6">
                    <div className={cardCls}>
                        <h3 className="font-black text-main mb-4">{isAr ? 'العهد المفتوحة' : 'Open custody'}</h3>
                        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                            {(overview?.custodyOutstanding || []).map((c: any, i: number) => (
                                <div key={i} className="bg-app/40 border border-amber-500/20 rounded-2xl p-4">
                                    <p className="font-black text-sm">{c.holderName}</p>
                                    <p className="font-black text-amber-500 tabular-nums mt-1">{fmt(c.outstanding)}</p>
                                    <p className="text-[11px] text-muted mt-1">{isAr ? 'صُرف' : 'Issued'} {fmt(c.issued)} · {isAr ? 'سُوي' : 'Settled'} {fmt(c.settled)}</p>
                                    <button onClick={() => setSettleForm({ ...settleForm, holderUserId: c.holderUserId || '', amount: String(c.outstanding) })} className="mt-2 text-[11px] font-black px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500">{isAr ? 'تسوية' : 'Settle'}</button>
                                </div>
                            ))}
                            {(overview?.custodyOutstanding || []).length === 0 && <p className="text-sm text-muted">{isAr ? 'لا توجد عهد معلقة' : 'No open custody'}</p>}
                        </div>
                    </div>
                    <div className="grid lg:grid-cols-2 gap-6">
                        <div className={cardCls}>
                            <h3 className="font-black text-main mb-4">{isAr ? 'صرف عهدة' : 'Issue custody'}</h3>
                            <div className="space-y-3">
                                <select value={custForm.accountId} onChange={(e) => setCustForm({ ...custForm, accountId: e.target.value })} className={inputCls}>
                                    <option value="">{isAr ? 'من خزينة *' : 'From account *'}</option>
                                    {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({fmt(a.balance)})</option>)}
                                </select>
                                {users.length > 0 ? (
                                    <select value={custForm.holderUserId} onChange={(e) => {
                                        const u = users.find((x: any) => String(x.id) === e.target.value);
                                        setCustForm({ ...custForm, holderUserId: e.target.value, holderName: u ? String(u.name || '') : custForm.holderName });
                                    }} className={inputCls}>
                                        <option value="">{isAr ? 'صاحب العهدة *' : 'Holder *'}</option>
                                        {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                ) : (
                                    <input placeholder={isAr ? 'اسم صاحب العهدة *' : 'Holder name *'} value={custForm.holderName} onChange={(e) => setCustForm({ ...custForm, holderName: e.target.value })} className={inputCls} />
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="number" placeholder={isAr ? 'المبلغ *' : 'Amount *'} value={custForm.amount} onChange={(e) => setCustForm({ ...custForm, amount: e.target.value })} className={inputCls} />
                                    <input placeholder={isAr ? 'الغرض' : 'Purpose'} value={custForm.description} onChange={(e) => setCustForm({ ...custForm, description: e.target.value })} className={inputCls} />
                                </div>
                                <button onClick={async () => {
                                    if (!custForm.holderUserId && !custForm.holderName.trim()) { toast.error(isAr ? 'حدد صاحب العهدة' : 'Select custody holder'); return; }
                                    const ok = await submitVoucher({ kind: 'PAYMENT', category: 'CUSTODY_ISSUE', paymentMethod: 'CASH', ...custForm }, isAr ? 'تم إنشاء سند العهدة' : 'Custody voucher created');
                                    if (ok) setCustForm({ accountId: '', holderUserId: '', holderName: '', amount: '', description: '' });
                                }} className={btnPrimary}>{isAr ? 'صرف العهدة' : 'Issue custody'}</button>
                            </div>
                        </div>
                        <div className={cardCls}>
                            <h3 className="font-black text-main mb-4">{isAr ? 'تسوية عهدة (استلام)' : 'Settle custody'}</h3>
                            <div className="space-y-3">
                                <select value={settleForm.accountId} onChange={(e) => setSettleForm({ ...settleForm, accountId: e.target.value })} className={inputCls}>
                                    <option value="">{isAr ? 'إلى خزينة *' : 'To account *'}</option>
                                    {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                                {users.length > 0 ? (
                                    <select value={settleForm.holderUserId} onChange={(e) => setSettleForm({ ...settleForm, holderUserId: e.target.value })} className={inputCls}>
                                        <option value="">{isAr ? 'صاحب العهدة *' : 'Holder *'}</option>
                                        {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                ) : (
                                    <input placeholder={isAr ? 'اسم صاحب العهدة *' : 'Holder name *'} value={settleForm.holderUserId} onChange={(e) => setSettleForm({ ...settleForm, holderUserId: e.target.value })} className={inputCls} />
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="number" placeholder={isAr ? 'المبلغ المستلم *' : 'Received *'} value={settleForm.amount} onChange={(e) => setSettleForm({ ...settleForm, amount: e.target.value })} className={inputCls} />
                                    <input placeholder={isAr ? 'ملاحظات' : 'Notes'} value={settleForm.description} onChange={(e) => setSettleForm({ ...settleForm, description: e.target.value })} className={inputCls} />
                                </div>
                                <button onClick={async () => {
                                    const holder = users.find((x: any) => String(x.id) === settleForm.holderUserId);
                                    const ok = await submitVoucher({
                                        kind: 'RECEIPT', category: 'CUSTODY_SETTLEMENT', paymentMethod: 'CASH',
                                        holderUserId: settleForm.holderUserId || undefined,
                                        holderName: holder ? String(holder.name) : settleForm.holderUserId,
                                        accountId: settleForm.accountId, amount: settleForm.amount, description: settleForm.description || 'تسوية عهدة',
                                    }, isAr ? 'تم إنشاء سند التسوية' : 'Settlement voucher created');
                                    if (ok) setSettleForm({ accountId: '', holderUserId: '', amount: '', description: '' });
                                }} className={btnPrimary}>{isAr ? 'تسوية' : 'Settle'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── VOUCHERS ── */}
            {tab === 'vouchers' && (
                <div className="space-y-6">
                    <div className={cardCls}>
                        <h3 className="font-black text-main mb-4">{isAr ? 'سند قبض (تحصيل)' : 'Receipt voucher'}</h3>
                        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
                            <select value={rcptForm.accountId} onChange={(e) => setRcptForm({ ...rcptForm, accountId: e.target.value })} className={inputCls}>
                                <option value="">{isAr ? 'إلى خزينة *' : 'To account *'}</option>
                                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <input type="number" placeholder={isAr ? 'المبلغ *' : 'Amount *'} value={rcptForm.amount} onChange={(e) => setRcptForm({ ...rcptForm, amount: e.target.value })} className={inputCls} />
                            <input placeholder={isAr ? 'البيان *' : 'Description *'} value={rcptForm.description} onChange={(e) => setRcptForm({ ...rcptForm, description: e.target.value })} className={inputCls} />
                            <select value={rcptForm.paymentMethod} onChange={(e) => setRcptForm({ ...rcptForm, paymentMethod: e.target.value })} className={inputCls}>
                                {PAY_METHODS.map((m) => <option key={m.id} value={m.id}>{isAr ? m.ar : m.en}</option>)}
                            </select>
                            <button onClick={async () => {
                                if (!rcptForm.description.trim()) { toast.error(isAr ? 'اكتب البيان' : 'Enter description'); return; }
                                const ok = await submitVoucher({ kind: 'RECEIPT', category: 'COLLECTION', reference: rcptForm.reference, ...rcptForm }, isAr ? 'تم إنشاء سند القبض' : 'Receipt created');
                                if (ok) setRcptForm({ accountId: '', amount: '', description: '', paymentMethod: 'CASH', reference: '' });
                            }} className={btnPrimary}>{isAr ? 'إنشاء سند قبض' : 'Create receipt'}</button>
                        </div>
                    </div>
                    <div className={cardCls}>
                        <h3 className="font-black text-main mb-4">{isAr ? 'كل السندات' : 'All vouchers'} ({vouchers.length})</h3>
                        <div className="flex items-center gap-2 mb-4 text-xs font-black text-muted">
                            <Smartphone size={13} />
                            {isAr ? 'القبض أخضر والصرف أحمر — الاعتماد يرحّل على الرصيد فوراً' : 'Green = in, red = out'}
                        </div>
                        <div className="space-y-2 max-h-[30rem] overflow-auto">
                            {vouchers.map((v: any) => (
                                <div key={v.id} className="bg-app/40 border border-border/30 rounded-2xl px-5 py-3">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <p className={`font-black text-sm tabular-nums ${v.kind === 'RECEIPT' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {v.kind === 'RECEIPT' ? '+' : '−'} {fmt(v.amount)}
                                            <span className="ms-2 text-main">#{v.voucherNo} · {CATEGORY_AR[v.category] || v.category}</span>
                                        </p>
                                        <StatusPill status={v.status} isAr={isAr} />
                                    </div>
                                    <p className="text-xs text-muted mt-1">
                                        {v.description || ''}{v.holderName ? ` · ${isAr ? 'العهدة' : 'Holder'}: ${v.holderName}` : ''}{v.reference ? ` · ${isAr ? 'مستند' : 'Ref'}: ${v.reference}` : ''}
                                        {` · ${String(v.createdAt || '').slice(0, 16)}`}
                                    </p>
                                    {v.status === 'PENDING' && (
                                        <div className="flex gap-2 mt-2">
                                            <button onClick={() => approveVoucher(v.id)} className="text-[11px] font-black px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500">{isAr ? 'اعتماد' : 'Approve'}</button>
                                            <button onClick={() => rejectVoucher(v.id)} className="text-[11px] font-black px-4 py-1.5 rounded-full bg-rose-500/10 text-rose-500">{isAr ? 'رفض' : 'Reject'}</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {vouchers.length === 0 && <p className="text-sm text-muted">{isAr ? 'لا توجد سندات بعد' : 'No vouchers yet'}</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
