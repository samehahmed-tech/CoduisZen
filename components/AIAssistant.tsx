import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  PackageSearch,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
  User,
  X,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ViewState } from '../types';

import { useAuthStore } from '../stores/useAuthStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useOrderStore } from '../stores/useOrderStore';
import { useMenuStore } from '../stores/useMenuStore';
import { useFinanceStore } from '../stores/useFinanceStore';
import { useAIWidgetStore } from '../stores/useAIWidgetStore';

import { translations } from '../services/translations';
import { GuardedAIAction } from '../services/aiActionGuard';
import { aiApi } from '../services/api/ai';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  suggestion?: { label: string; view: ViewState };
}

type QuickPrompt = {
  id: string;
  label: string;
  text: string;
  icon: React.ElementType;
};

const VALID_ACTION_TYPES = new Set([
  'UPDATE_INVENTORY',
  'UPDATE_MENU_ITEM',
  'UPDATE_MENU_PRICE',
  'CREATE_MENU_ITEM',
  'CREATE_MENU_CATEGORY',
  'DELETE_MENU_ITEM',
  'DELETE_MENU_CATEGORY',
  'UPDATE_MENU_CATEGORY',
  'CREATE_CUSTOMER',
  'CREATE_USER',
  'ANALYZE_MENU',
  'ANALYZE_INVENTORY',
  'SHOW_REPORT',
  'UPDATE_THRESHOLD',
  'RESTOCK_TRIGGER',
  'MARK_ITEM_STATUS',
]);

const normalizeActionType = (raw: any) => {
  const type = String(raw || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    ADD_MENU_ITEM: 'CREATE_MENU_ITEM',
    CREATE_ITEM: 'CREATE_MENU_ITEM',
    ADD_CATEGORY: 'CREATE_MENU_CATEGORY',
    CREATE_CATEGORY: 'CREATE_MENU_CATEGORY',
    DELETE_ITEM: 'DELETE_MENU_ITEM',
    REMOVE_ITEM: 'DELETE_MENU_ITEM',
    DELETE_CATEGORY: 'DELETE_MENU_CATEGORY',
    REMOVE_CATEGORY: 'DELETE_MENU_CATEGORY',
    UPDATE_CATEGORY: 'UPDATE_MENU_CATEGORY',
    EDIT_MENU_ITEM: 'UPDATE_MENU_ITEM',
    CREATE_STAFF: 'CREATE_USER',
    ADD_USER: 'CREATE_USER',
    OPEN_REPORT: 'SHOW_REPORT',
  };
  return aliases[type] || type;
};

const normalizeClientAction = (action: any) => {
  if (!action || typeof action !== 'object') return action;
  const type = normalizeActionType(action.type || action.actionType || action.action);
  return type ? { ...action, type } : action;
};

const buildFallbackGuard = (action: any, reason: string): GuardedAIAction => ({
  id: `AI-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
  action,
  label: String(action?.type || action?.actionType || 'UNKNOWN_ACTION'),
  canExecute: false,
  reason,
  auditType: 'SETTINGS_CHANGE' as any,
});

const pathMap: Partial<Record<ViewState, string>> = {
  DASHBOARD: '/',
  POS: '/pos',
  INVENTORY: '/inventory',
  REPORTS: '/reports',
  SETTINGS: '/settings',
  MENU_MANAGER: '/menu',
  CRM: '/crm',
  FINANCE: '/finance',
  AI_INSIGHTS: '/ai-insights',
  KDS: '/kds',
  CALL_CENTER: '/call-center',
  DISPATCH: '/dispatch',
  RECIPES: '/recipes',
  PRINTERS: '/printers',
  PRODUCTION: '/production',
  PEOPLE: '/user-management',
};

const AIAssistant: React.FC = () => {
  const navigate = useNavigate();
  const toggleAssistant = useAIWidgetStore((state) => state.toggleAssistant);

  const { settings, branches } = useAuthStore();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const { inventory } = useInventoryStore();
  const { orders } = useOrderStore();
  const { categories } = useMenuStore();
  const { accounts } = useFinanceStore();

  const menuItems = categories.flatMap((cat) => cat.items);
  const lang = (settings.language || 'en') as 'en' | 'ar';
  const isRtl = lang === 'ar';
  const t = translations[lang] || translations.en;

  const copy = {
    title: isRtl ? 'المساعد الذكي' : 'AI Assistant',
    subtitle: isRtl ? 'اسأل، حلّل، أو اطلب مهمة — التنفيذ بعد مراجعتك' : 'Ask, analyze, or request a task — execution waits for your approval',
    quickTitle: isRtl ? 'اختصارات سريعة' : 'Quick prompts',
    contextTitle: isRtl ? 'سياق النظام' : 'System context',
    pendingTitle: isRtl ? 'إجراءات تحتاج موافقة' : 'Actions awaiting approval',
    thinking: isRtl ? 'المساعد بيحلل البيانات...' : 'Assistant is analyzing...',
    input: isRtl ? 'اسأل عن المبيعات، المخزون، الطيارين، الإقفال...' : 'Ask about sales, stock, drivers, closing...',
    blocked: isRtl ? 'موقوف' : 'Blocked',
    permission: isRtl ? 'صلاحية مطلوبة' : 'Permission required',
    before: isRtl ? 'قبل' : 'Before',
    after: isRtl ? 'بعد' : 'After',
    dismiss: isRtl ? 'إلغاء' : 'Dismiss',
    approve: isRtl ? 'موافقة وتشغيل' : 'Approve and run',
    reason: isRtl ? 'سبب الموافقة أو ملاحظة للمراجعة' : 'Approval reason or audit note',
    goTo: isRtl ? 'افتح' : 'Open',
  };

  const quickPrompts = useMemo<QuickPrompt[]>(() => [
    {
      id: 'sales_today',
      label: isRtl ? 'مبيعات اليوم' : 'Today sales',
      text: isRtl ? 'حلل مبيعات اليوم واكتب أهم 3 ملاحظات تشغيلية.' : 'Analyze today sales and give the top 3 operational notes.',
      icon: BarChart3,
    },
    {
      id: 'stock_risks',
      label: isRtl ? 'نواقص المخزون' : 'Stock risks',
      text: isRtl ? 'راجع المخزون وحدد الأصناف المعرضة للنقص أو الهالك.' : 'Review inventory and identify shortage or wastage risks.',
      icon: PackageSearch,
    },
    {
      id: 'late_orders',
      label: isRtl ? 'أوردرات متأخرة' : 'Late orders',
      text: isRtl ? 'اظهر الأوردرات المتأخرة واقترح إجراء لكل حالة.' : 'Find late orders and suggest an action for each case.',
      icon: Clock,
    },
    {
      id: 'drivers',
      label: isRtl ? 'أداء الطيارين' : 'Driver performance',
      text: isRtl ? 'حلل أداء الطيارين وحالات الخروج والرجوع للمطعم.' : 'Analyze driver performance, dispatch, delivery, and return status.',
      icon: Truck,
    },
    {
      id: 'day_close',
      label: isRtl ? 'مشاكل الإقفال' : 'Closing issues',
      text: isRtl ? 'راجع مشاكل إقفال اليوم والمدفوعات والشفتات قبل التسليم.' : 'Review day close issues across payments and shifts.',
      icon: ShieldCheck,
    },
    {
      id: 'branch_summary',
      label: isRtl ? 'ملخص الفرع' : 'Branch summary',
      text: isRtl ? 'اعمل ملخص تنفيذي لحالة الفرع الآن: مبيعات، مخزون، عمليات، ومخاطر.' : 'Create an executive branch summary covering sales, stock, operations, and risks.',
      icon: Building2,
    },
  ], [isRtl]);

  const contextChips = [
    { label: isRtl ? 'فروع' : 'Branches', value: branches.length },
    { label: isRtl ? 'أوردرات' : 'Orders', value: orders.length },
    { label: isRtl ? 'أصناف منيو' : 'Menu items', value: menuItems.length },
    { label: isRtl ? 'مخزون' : 'Stock', value: inventory.length },
  ];

  const computedInsights = useMemo(() => {
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
    const lowStock = inventory.filter((i: any) => Number(i.quantity || 0) <= (i.threshold || 5)).length;
    const pendingOrders = orders.filter((o: any) => o.status === 'PENDING' || o.status === 'preparing').length;
    const completedOrders = orders.filter((o: any) => o.status === 'DELIVERED' || o.status === 'completed').length;
    const cancelledOrders = orders.filter((o: any) => o.status === 'CANCELLED' || o.status === 'cancelled').length;
    const todayRevenue = orders
      .filter((o: any) => new Date(o.createdAt || o.date).toDateString() === new Date().toDateString())
      .reduce((sum, o) => sum + Number(o.total || 0), 0);
    const menuItemCount = menuItems.length;
    const totalAccounts = accounts.length;
    const totalCash = accounts
      .filter((a: any) => a.type === 'cash' || a.type === 'CASH')
      .reduce((sum, a) => sum + Number(a.balance || 0), 0);
    return {
      totalRevenue, avgOrderValue, lowStock, pendingOrders,
      completedOrders, cancelledOrders, todayRevenue,
      menuItemCount, totalAccounts, totalCash,
      orderCompletionRate: orders.length > 0 ? ((completedOrders / orders.length) * 100).toFixed(1) : '0',
      lowStockRatio: inventory.length > 0 ? ((lowStock / inventory.length) * 100).toFixed(1) : '0',
    };
  }, [orders, inventory, menuItems, accounts]);

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('restoflow-ai-conversation') || '[]');
      if (Array.isArray(saved) && saved.length) return saved.slice(-30).map((message) => ({ ...message, timestamp: new Date(message.timestamp) }));
    } catch { /* start a clean conversation */ }
    return [{ id: 'welcome', sender: 'ai', text: t.ai_greeting || copy.subtitle, timestamp: new Date() }];
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [pendingActions, setPendingActions] = useState<GuardedAIAction[]>([]);
  const [actionReason, setActionReason] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, pendingActions.length]);

  useEffect(() => {
    sessionStorage.setItem('restoflow-ai-conversation', JSON.stringify(messages.slice(-30)));
  }, [messages]);

  const requestAssistant = async (text: string) => {
    const clean = text.trim();
    if (!clean || isTyping) return;

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      sender: 'user',
      text: clean,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await aiApi.chat({
        message: clean,
        lang,
        context: {
          inventory,
          orders,
          menuItems,
          categories,
          accounts,
          branches,
          settings,
          history: messages.slice(-8).map((message) => ({ sender: message.sender, text: message.text })),
        },
      });

      const actions = Array.isArray(response.actions) ? response.actions.map(normalizeClientAction) : [];
      const guarded = await Promise.all(
        actions.map(async (action: any) => {
          if (!VALID_ACTION_TYPES.has(String(action?.type || '').toUpperCase())) {
            return buildFallbackGuard(action, t.unsupported_action || 'Unsupported action');
          }
          try {
            const preview = await aiApi.previewAction({ action });
            return preview.guarded as GuardedAIAction;
          } catch (error: any) {
            return buildFallbackGuard(action, error?.message || 'Preview failed');
          }
        }),
      );

      if (guarded.length > 0) {
        setPendingActions((prev) => [...guarded, ...prev]);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-ai`,
          sender: 'ai',
          text: response.text,
          timestamp: new Date(),
          suggestion: response.suggestion,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-ai-error`,
          sender: 'ai',
          text: t.generic_error || 'Something went wrong while contacting the assistant.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleApproveAction = async (guarded: GuardedAIAction) => {
    if (!guarded.canExecute) return;
    if (guarded.permission && !hasPermission(guarded.permission)) return;

    try {
      const response = await aiApi.actionExecute({
        action: guarded.action as any,
        explanation: actionReason[guarded.id] || 'Approved via AI Assistant',
      });
      if (String((guarded.action as any)?.type || '').toUpperCase() === 'SHOW_REPORT') {
        navigate('/reports');
      }
      setPendingActions((prev) => prev.filter((a) => a.id !== guarded.id));
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-exec-ok`,
          sender: 'ai',
          text: response?.message || t.action_executed || 'Action executed.',
          timestamp: new Date(),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-exec-fail`,
          sender: 'ai',
          text: err?.message || t.action_failed || 'Action failed.',
          timestamp: new Date(),
        },
      ]);
    }
  };

  const handleSuggestion = (view: ViewState) => {
    navigate(pathMap[view] || '/');
  };

  return (
    <aside
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-border bg-app text-main shadow-2xl"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <header className="border-b border-border bg-card px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black leading-tight text-main">{copy.title}</h2>
              <p className="mt-1 text-xs font-bold leading-5 text-muted">{copy.subtitle}</p>
            </div>
          </div>
          <button
            onClick={() => {
              const clean = [{ id: `welcome-${Date.now()}`, sender: 'ai' as const, text: t.ai_greeting || copy.subtitle, timestamp: new Date() }];
              setMessages(clean);
              setPendingActions([]);
              sessionStorage.removeItem('restoflow-ai-conversation');
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition hover:bg-elevated hover:text-main"
            aria-label={isRtl ? 'محادثة جديدة' : 'New conversation'}
            title={isRtl ? 'محادثة جديدة' : 'New conversation'}
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={() => toggleAssistant(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition hover:bg-elevated hover:text-rose-500"
            aria-label="Close assistant"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <section className="border-b border-border bg-elevated/35 px-5 py-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-muted">
          <Bot size={14} />
          {copy.contextTitle}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {contextChips.map((chip) => (
            <div key={chip.label} className="rounded-xl border border-border bg-card px-3 py-2">
              <div className="text-[10px] font-bold text-muted">{chip.label}</div>
              <div className="mt-1 text-sm font-black text-main tabular-nums">{chip.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Data Analysis Panel ── */}
      {computedInsights.totalRevenue > 0 && (
        <section className="border-b border-border bg-card/50 px-5 py-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-muted">
            <BarChart3 size={14} />
            {isRtl ? 'تحليل فوري للبيانات' : 'Real-time Data Analysis'}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-elevated/40 border border-border/30 px-3 py-2">
              <div className="text-[8px] font-bold text-muted uppercase">{isRtl ? 'إيراد اليوم' : 'Today Rev'}</div>
              <div className="text-sm font-black text-emerald-500 tabular-nums">{computedInsights.todayRevenue.toLocaleString()}</div>
            </div>
            <div className="rounded-xl bg-elevated/40 border border-border/30 px-3 py-2">
              <div className="text-[8px] font-bold text-muted uppercase">{isRtl ? 'متوسط الأوردر' : 'Avg Order'}</div>
              <div className="text-sm font-black text-indigo-500 tabular-nums">{computedInsights.avgOrderValue.toLocaleString()}</div>
            </div>
            <div className="rounded-xl bg-elevated/40 border border-border/30 px-3 py-2">
              <div className="text-[8px] font-bold text-muted uppercase">{isRtl ? 'الإتمام' : 'Completion'}</div>
              <div className="text-sm font-black text-cyan-500 tabular-nums">{computedInsights.orderCompletionRate}%</div>
            </div>
            <div className="rounded-xl bg-elevated/40 border border-border/30 px-3 py-2">
              <div className="text-[8px] font-bold text-muted uppercase">{isRtl ? 'معلق' : 'Pending'}</div>
              <div className="text-sm font-black text-amber-500 tabular-nums">{computedInsights.pendingOrders}</div>
            </div>
            <div className="rounded-xl bg-elevated/40 border border-border/30 px-3 py-2">
              <div className="text-[8px] font-bold text-muted uppercase">{isRtl ? 'نواقص' : 'Low Stock'}</div>
              <div className="text-sm font-black text-rose-500 tabular-nums">{computedInsights.lowStock} ({computedInsights.lowStockRatio}%)</div>
            </div>
            <div className="rounded-xl bg-elevated/40 border border-border/30 px-3 py-2">
              <div className="text-[8px] font-bold text-muted uppercase">{isRtl ? 'ملغي' : 'Cancelled'}</div>
              <div className="text-sm font-black text-rose-500 tabular-nums">{computedInsights.cancelledOrders}</div>
            </div>
          </div>
        </section>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <section className="mb-5">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-muted">
            <Sparkles size={14} />
            {copy.quickTitle}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {quickPrompts.map((prompt) => {
              const Icon = prompt.icon;
              return (
                <button
                  key={prompt.id}
                  onClick={() => requestAssistant(prompt.text)}
                  disabled={isTyping}
                  className="flex min-h-[68px] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-start text-xs font-black text-main transition hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-60 dark:hover:bg-indigo-950/30"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    <Icon size={16} />
                  </span>
                  <span className="leading-5">{prompt.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-3 ${message.sender === 'user' ? (isRtl ? 'flex-row' : 'flex-row-reverse') : ''}`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
                message.sender === 'ai' ? 'bg-indigo-600 text-white' : 'bg-elevated text-muted'
              }`}>
                {message.sender === 'ai' ? <Bot size={17} /> : <User size={17} />}
              </div>
              <div className={`max-w-[82%] ${message.sender === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
                <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold leading-6 shadow-sm ${
                  message.sender === 'ai'
                    ? 'border-border bg-card text-main'
                    : 'border-indigo-600 bg-indigo-600 text-white'
                }`}>
                  <p className="whitespace-pre-wrap">{message.text}</p>
                </div>
                {message.suggestion && (
                  <button
                    onClick={() => handleSuggestion(message.suggestion!.view)}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                  >
                    <CheckCircle2 size={14} />
                    {copy.goTo} {message.suggestion.label}
                  </button>
                )}
                <span className="px-1 text-[10px] font-bold text-muted">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {pendingActions.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/20">
              <div className="mb-3 flex items-center gap-2 text-xs font-black text-amber-800 dark:text-amber-200">
                <ShieldCheck size={16} />
                {copy.pendingTitle}
              </div>
              <div className="space-y-3">
                {pendingActions.map((guarded) => {
                  const permissionOk = guarded.permission ? hasPermission(guarded.permission) : true;
                  return (
                    <div key={guarded.id} className="rounded-2xl border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-main">{guarded.label}</div>
                          {guarded.reason && <div className="mt-1 text-xs font-bold text-muted">{guarded.reason}</div>}
                        </div>
                        {(!guarded.canExecute || !permissionOk) && (
                          <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-black text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                            {!permissionOk ? copy.permission : copy.blocked}
                          </span>
                        )}
                      </div>

                      {(guarded.before !== undefined || guarded.after !== undefined) && (
                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                          <div className="rounded-xl bg-elevated p-3">
                            <div className="mb-2 text-[10px] font-black text-muted">{copy.before}</div>
                            <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-main">{JSON.stringify(guarded.before, null, 2)}</pre>
                          </div>
                          <div className="rounded-xl bg-elevated p-3">
                            <div className="mb-2 text-[10px] font-black text-muted">{copy.after}</div>
                            <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-main">{JSON.stringify(guarded.after, null, 2)}</pre>
                          </div>
                        </div>
                      )}

                      <input
                        type="text"
                        value={actionReason[guarded.id] || ''}
                        onChange={(e) => setActionReason((prev) => ({ ...prev, [guarded.id]: e.target.value }))}
                        placeholder={copy.reason}
                        className="mt-3 w-full rounded-xl border border-border bg-elevated px-3 py-2 text-xs font-bold outline-none focus:border-indigo-400"
                      />

                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          onClick={() => setPendingActions((prev) => prev.filter((a) => a.id !== guarded.id))}
                          className="rounded-xl border border-border px-3 py-2 text-xs font-black text-muted transition hover:bg-elevated"
                        >
                          {copy.dismiss}
                        </button>
                        <button
                          onClick={() => handleApproveAction(guarded)}
                          disabled={!guarded.canExecute || !permissionOk}
                          className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {copy.approve}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isTyping && (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-xs font-black text-muted">
              <Loader2 size={16} className="animate-spin text-indigo-600" />
              {copy.thinking}
            </div>
          )}
          <div ref={messagesEndRef} />
        </section>
      </div>

      <footer className="border-t border-border bg-card p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                requestAssistant(input);
              }
            }}
            placeholder={copy.input}
            rows={2}
            className="min-h-[48px] flex-1 resize-none rounded-2xl border border-border bg-elevated px-4 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-indigo-400"
          />
          <button
            onClick={() => requestAssistant(input)}
            disabled={!input.trim() || isTyping}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-slate-800"
            aria-label="Send message"
          >
            {isTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </footer>
    </aside>
  );
};

export default AIAssistant;
