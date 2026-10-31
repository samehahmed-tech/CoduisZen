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
import RestoFlowCopilotAvatar from './ai/RestoFlowCopilotAvatar';
import '../styles/layout/ai-copilot.css';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  suggestion?: { label: string; view: ViewState };
  route?: { providerId: string; modelId: string; usedFallback: boolean };
}

const isDestructiveAction = (action: any) => ['DELETE_MENU_ITEM', 'DELETE_MENU_CATEGORY'].includes(String(action?.type || '').toUpperCase());

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
    title: 'ZEN AI',
    subtitle: isRtl ? 'زميل تشغيل ذكي يفهم المطعم ويحوّل البيانات لقرارات قابلة للتنفيذ' : 'An operations companion that turns restaurant signals into clear, reviewable decisions',
    eyebrow: isRtl ? 'ذكاء الوردية' : 'SHIFT INTELLIGENCE',
    active: isRtl ? 'متصل بالنظام' : 'SYSTEM LINKED',
    clear: isRtl ? 'بدء محادثة جديدة' : 'Start a new conversation',
    close: isRtl ? 'إغلاق المساعد' : 'Close assistant',
    signalTitle: isRtl ? 'صورة التشغيل الآن' : 'LIVE OPERATING PICTURE',
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
    send: isRtl ? 'إرسال الرسالة' : 'Send message',
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
  const [avatarState, setAvatarState] = useState<'idle' | 'thinking' | 'success' | 'error'>('idle');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pendingActions, setPendingActions] = useState<GuardedAIAction[]>([]);
  const [actionReason, setActionReason] = useState<Record<string, string>>({});
  const [adminPassword, setAdminPassword] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, pendingActions.length]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

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
    setAvatarState('thinking');

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
          route: response.route || undefined,
        },
      ]);
      setAvatarState('success');
      window.setTimeout(() => setAvatarState('idle'), 1200);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-ai-error`,
          sender: 'ai',
          text: error?.message || t.generic_error || 'Something went wrong while contacting the assistant.',
          timestamp: new Date(),
        },
      ]);
      setAvatarState('error');
      window.setTimeout(() => setAvatarState('idle'), 1600);
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
        confirmation: 'AI_EXECUTE',
        ...(isDestructiveAction(guarded.action) ? { adminPassword: adminPassword[guarded.id] || '' } : {}),
      });
      setPendingActions((prev) => prev.filter((a) => a.id !== guarded.id));
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-exec-ok`,
          sender: 'ai',
          text: response?.message || (isRtl ? 'تم التنفيذ والتحقق من النتيجة.' : 'Executed and verified.'),
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

  const riskCount = computedInsights.lowStock + computedInsights.pendingOrders + computedInsights.cancelledOrders;
  const operatingState = isTyping
    ? (isRtl ? 'تحليل حي' : 'Live analysis')
    : riskCount > 0
      ? (isRtl ? `${riskCount} إشارات تحتاج انتباه` : `${riskCount} signals need attention`)
      : (isRtl ? 'كل الإشارات مستقرة' : 'All signals stable');

  return (
    <aside
      className="rf-copilot-shell flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-border bg-app text-main"
      dir={isRtl ? 'rtl' : 'ltr'}
      aria-label={copy.title}
    >
      <header className="rf-copilot-hero">
        <div className="rf-copilot-hero-tools">
          <div className="rf-copilot-kicker">
            <span className="rf-copilot-live-dot" aria-hidden="true" />
            <span>{copy.active}</span>
            <span className="rf-copilot-kicker-state">{isTyping ? (isRtl ? 'يحلل الآن' : 'ANALYZING') : (isRtl ? 'جاهز' : 'READY')}</span>
          </div>
          <div className="rf-copilot-tool-group">
            <button
              onClick={() => {
                const clean = [{ id: `welcome-${Date.now()}`, sender: 'ai' as const, text: t.ai_greeting || copy.subtitle, timestamp: new Date() }];
                setMessages(clean);
                setPendingActions([]);
                sessionStorage.removeItem('restoflow-ai-conversation');
              }}
              className="rf-copilot-tool"
              aria-label={copy.clear}
              title={copy.clear}
            >
              <Trash2 size={17} aria-hidden="true" />
            </button>
            <button
              onClick={() => toggleAssistant(false)}
              className="rf-copilot-tool"
              aria-label={copy.close}
              title={copy.close}
            >
              <X size={19} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="rf-copilot-hero-grid">
          <div className="rf-copilot-character-stage">
            <RestoFlowCopilotAvatar
              state={avatarState}
              reducedMotion={reducedMotion}
              label={isRtl ? 'شخصية ZEN AI التفاعلية' : 'ZEN AI interactive character'}
            />
          </div>
          <div className="rf-copilot-identity-copy">
            <span className="rf-copilot-eyebrow">{copy.eyebrow}</span>
            <h2 className="rf-copilot-title">ZEN <strong>AI</strong></h2>
            <p>{copy.subtitle}</p>
            <div className="rf-copilot-command-strip" aria-live="polite">
              <div>
                <span className="rf-copilot-strip-label">{isRtl ? 'الأولوية' : 'PRIORITY SIGNAL'}</span>
                <strong>{operatingState}</strong>
              </div>
              <div className="rf-copilot-strip-meta">
                <span>{isRtl ? 'تحديث حي' : 'LIVE'}</span>
                <b>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="rf-copilot-signal-rail" aria-label={copy.signalTitle}>
        <div className="rf-copilot-signal-rail-title">
          <Bot size={14} aria-hidden="true" />
          <span>{copy.signalTitle}</span>
        </div>
        {contextChips.map((chip, index) => (
          <div key={chip.label} className="rf-copilot-context-chip">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div><b>{chip.value}</b><small>{chip.label}</small></div>
          </div>
        ))}
      </section>

      {/* ── Data Analysis Panel ── */}
      {computedInsights.totalRevenue > 0 && (
        <section className="rf-copilot-analysis">
          <div className="rf-copilot-section-heading">
            <span><BarChart3 size={15} aria-hidden="true" />{isRtl ? 'نبض الوردية' : 'SHIFT PULSE'}</span>
            <small>{isRtl ? 'قراءة مباشرة' : 'LIVE READ'}</small>
          </div>
          <div className="rf-copilot-analysis-grid">
            <div className="rf-copilot-metric rf-copilot-metric--revenue">
              <span>{isRtl ? 'إيراد اليوم' : 'TODAY REVENUE'}</span>
              <strong>{computedInsights.todayRevenue.toLocaleString()}</strong>
              <small>{settings.currency || 'EGP'}</small>
            </div>
            <div className="rf-copilot-metric rf-copilot-metric--completion">
              <span>{isRtl ? 'اكتمال الطلبات' : 'COMPLETION'}</span>
              <strong>{computedInsights.orderCompletionRate}%</strong>
              <small>{isRtl ? `${computedInsights.completedOrders} مكتمل` : `${computedInsights.completedOrders} complete`}</small>
            </div>
            <div className="rf-copilot-metric rf-copilot-metric--risk">
              <span>{isRtl ? 'إشارات الانتباه' : 'ATTENTION'}</span>
              <strong>{riskCount}</strong>
              <small>{isRtl ? `${computedInsights.lowStock} مخزون · ${computedInsights.pendingOrders} طلب` : `${computedInsights.lowStock} stock · ${computedInsights.pendingOrders} orders`}</small>
            </div>
          </div>
        </section>
      )}

      <div className="rf-copilot-body flex-1 overflow-y-auto">
        <section className="rf-copilot-prompts mb-5">
          <div className="rf-copilot-section-heading">
            <span><Sparkles size={14} aria-hidden="true" />{copy.quickTitle}</span>
            <small>{isRtl ? 'اسأل بضغطة' : 'ONE TAP'}</small>
          </div>
          <div className="rf-copilot-prompt-grid">
            {quickPrompts.map((prompt) => {
              const Icon = prompt.icon;
              return (
                <button
                  key={prompt.id}
                  onClick={() => requestAssistant(prompt.text)}
                  disabled={isTyping}
                  className="rf-copilot-prompt"
                >
                  <span className="rf-copilot-prompt-index">{String(quickPrompts.indexOf(prompt) + 1).padStart(2, '0')}</span>
                  <span className="rf-copilot-prompt-icon">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span>{prompt.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rf-copilot-thread space-y-4" aria-live="polite" aria-label={isRtl ? 'المحادثة' : 'Conversation'}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rf-copilot-message-row flex items-start gap-3 ${message.sender === 'user' ? (isRtl ? 'flex-row' : 'flex-row-reverse') : ''}`}
              data-sender={message.sender}
            >
              <div className="rf-copilot-message-avatar">
                {message.sender === 'ai' ? <Bot size={17} aria-hidden="true" /> : <User size={17} aria-hidden="true" />}
              </div>
              <div className={`rf-copilot-message max-w-[82%] ${message.sender === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
                <div className="rf-copilot-message-bubble">
                  <p className="whitespace-pre-wrap">{message.text}</p>
                </div>
                {message.sender === 'ai' && message.route && (
                  <span className="px-1 text-[9px] font-bold text-muted" title={message.route.usedFallback ? (isRtl ? 'تم استخدام مزود بديل' : 'Fallback provider used') : undefined}>
                    {message.route.providerId} · {message.route.modelId}{message.route.usedFallback ? ` · ${isRtl ? 'بديل' : 'fallback'}` : ''}
                  </span>
                )}
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
            <div className="rf-copilot-approval rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/20">
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

                      {isDestructiveAction(guarded.action) && (
                        <input
                          type="password"
                          value={adminPassword[guarded.id] || ''}
                          onChange={(e) => setAdminPassword((prev) => ({ ...prev, [guarded.id]: e.target.value }))}
                          placeholder={isRtl ? 'كلمة مرور الأدمن مطلوبة للحذف' : 'Admin password required for deletion'}
                          aria-label={isRtl ? 'كلمة مرور الأدمن' : 'Admin password'}
                          className="mt-2 w-full rounded-xl border border-rose-300 bg-elevated px-3 py-2 text-xs font-bold outline-none focus:border-rose-500"
                        />
                      )}

                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          onClick={() => setPendingActions((prev) => prev.filter((a) => a.id !== guarded.id))}
                          className="rounded-xl border border-border px-3 py-2 text-xs font-black text-muted transition hover:bg-elevated"
                        >
                          {copy.dismiss}
                        </button>
                        <button
                          onClick={() => handleApproveAction(guarded)}
                          disabled={!guarded.canExecute || !permissionOk || (isDestructiveAction(guarded.action) && !adminPassword[guarded.id]?.trim())}
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
            <div className="rf-copilot-thinking flex items-center gap-3" role="status">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              {copy.thinking}
            </div>
          )}
          <div ref={messagesEndRef} />
        </section>
      </div>

      <footer className="rf-copilot-composer">
        <label htmlFor="restoflow-copilot-input" className="sr-only">{copy.input}</label>
        <div className="rf-copilot-composer-row">
          <textarea
            id="restoflow-copilot-input"
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
            className="rf-copilot-input"
          />
          <button
            onClick={() => requestAssistant(input)}
            disabled={!input.trim() || isTyping}
            className="rf-copilot-send"
            aria-label={copy.send}
          >
            {isTyping ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
          </button>
        </div>
      </footer>
    </aside>
  );
};

export default AIAssistant;
