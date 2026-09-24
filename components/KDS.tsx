import React, { useOptimistic, useTransition } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Clock, CheckCircle, Volume2, VolumeX, MonitorPlay, AlertTriangle, Play, Truck, Settings, Flame, ChefHat, Sparkles, X, UtensilsCrossed, Search, Zap, Layers, WifiOff, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { OrderStatus } from '../types';
import { advanceKdsTicketIdsOnce, compareKdsTicketPriority, mergeKdsPriority, useKdsStore, KdsTicket } from '../stores/useKdsStore';
import { useAuthStore } from '../stores/useAuthStore';
import { formatDisplayId } from '../src/utils/idGenerator';
import { socketService } from '../services/socketService';
import { getTableDisplayName } from '../src/utils/tableDisplay';
import { kdsApi } from '../services/api/kds';
import { useConfirm } from './common/ConfirmProvider';
import { KDS_FALLBACK_POLL_MS, reconcileKdsPolling } from '../src/utils/kdsPolling';

type Station = 'ALL' | string;
type KdsDisplayMode = 'orders' | 'stations';

/** Order types that flow through the packing/pickup handover screen. */
const HANDOVER_ELIGIBLE_TYPES = new Set(['TAKEAWAY', 'PICKUP', 'KIOSK']);

interface StationConfig {
  name: string;
  keywords: string[];
}

const DEFAULT_STATIONS: StationConfig[] = [
  { name: 'GRILL', keywords: ['grill', 'bbq', 'kebab', 'steak', 'skewer', 'chicken', 'meat'] },
  { name: 'BAR', keywords: ['coffee', 'espresso', 'latte', 'mocha', 'tea', 'juice', 'soda', 'drink', 'bar'] },
  { name: 'DESSERT', keywords: ['dessert', 'cake', 'sweet', 'icecream', 'ice', 'chocolate', 'pudding'] },
  { name: 'FRYER', keywords: ['fries', 'fry', 'fried', 'crispy', 'nugget'] },
  { name: 'SALAD', keywords: ['salad', 'green', 'vegan', 'bowl'] },
  { name: 'BAKERY', keywords: ['bread', 'bakery', 'pastry', 'croissant', 'bun'] },
];

/* ???????????????????????????????????????????????????
   ?? Web Audio Sound Generator
   ??????????????????????????????????????????????????? */
const audioCtxRef = { current: null as AudioContext | null };
const getAudioCtx = () => {
  if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
  return audioCtxRef.current;
};

const playBeep = (frequency: number, duration: number, volume = 0.3, type: OscillatorType = 'sine', when = 0) => {
  try {
    const ctx = getAudioCtx();
    const startAt = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = type;
    gain.gain.setValueAtTime(0.001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, startAt + duration);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.05);
  } catch { /* ignore audio errors */ }
};

/* Long, cutting attention chime (~1.6s): triangle wave carries over kitchen
   noise far better than the old two soft sine blips. */
const playNewOrderSound = () => {
  const V = 0.55;
  playBeep(660, 0.22, V, 'triangle', 0);
  playBeep(880, 0.22, V, 'triangle', 0.24);
  playBeep(1174, 0.34, V, 'triangle', 0.48);
  playBeep(880, 0.22, V, 'triangle', 0.9);
  playBeep(1174, 0.4, V, 'triangle', 1.14);
};

const playUrgentAlertSound = () => {
  playBeep(1200, 0.12, 0.5);
  setTimeout(() => playBeep(1200, 0.12, 0.5), 200);
  setTimeout(() => playBeep(1500, 0.25, 0.6), 400);
};

/* ── Arabic voice announcement ("أوردر جديد، رقم 42") ── */
let arabicVoiceCache: SpeechSynthesisVoice | null | undefined;
const pickArabicVoice = (): SpeechSynthesisVoice | null => {
  try {
    if (arabicVoiceCache !== undefined) return arabicVoiceCache;
    const synth = window.speechSynthesis;
    if (!synth) { arabicVoiceCache = null; return null; }
    arabicVoiceCache = synth.getVoices().find(v => String(v.lang || '').toLowerCase().startsWith('ar')) || null;
    return arabicVoiceCache;
  } catch { return null; }
};

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    // Voices load asynchronously — refresh the cache when they arrive.
    window.speechSynthesis.onvoiceschanged = () => { arabicVoiceCache = undefined; pickArabicVoice(); };
  } catch { /* ignore */ }
}

/** Speak "new order number X" in Arabic. No-op when voice is off or blocked. */
const speakNewOrder = (labels: string[]) => {
  try {
    const synth = window.speechSynthesis;
    if (!synth || labels.length === 0) return;
    const voice = pickArabicVoice();
    // Cap the queue so a burst of tickets never talks for a minute straight.
    for (const label of labels.slice(0, 3)) {
      const utterance = new SpeechSynthesisUtterance(`أوردر جديد، رقم ${label}`);
      utterance.lang = 'ar-SA';
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;
      if (voice) utterance.voice = voice;
      synth.speak(utterance);
    }
  } catch { /* TTS unavailable — chime already played */ }
};

/* ???????????????????????????????????????????????????
   ? Isolated Live Clock — only re-renders itself
   ??????????????????????????????????????????????????? */
const LiveClock = React.memo(() => {
  const [time, setTime] = React.useState(new Date());
  React.useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2">
      <Clock size={14} style={{ color: 'rgb(var(--text-muted))' }} />
      <span
        className="tabular-nums tracking-tight"
        style={{ fontSize: '1.1rem', fontWeight: 900, color: 'rgb(var(--text-main))' }}
      >
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </div>
  );
});

/* ???????????????????????????????????????????????????
   ?? Column Theme Configs — using CSS variable tokens
   ??????????????????????????????????????????????????? */
const COLUMN_THEMES = {
  PENDING: {
    token: '--warning',
    icon: <Flame size={18} />,
    label: 'QUEUE',
    subtitle: 'Waiting to fire',
  },
  PREPARING: {
    token: '--primary',
    icon: <ChefHat size={18} />,
    label: 'FIRE',
    subtitle: 'In the kitchen',
  },
  READY: {
    token: '--success',
    icon: <Sparkles size={18} />,
    label: 'PASS',
    subtitle: 'Ready to serve',
  },
};

/* ???????????????????????????????????????????????????
   SLA Thresholds
   ??????????????????????????????????????????????????? */
const SLA = { warning: 7, risk: 12, critical: 20 };

const getKdsItemDedupeKey = (item: any): string | null => {
  const orderItemId = item?.orderItemId ?? item?.order_item_id ?? item?.order_itemId;
  if (orderItemId !== undefined && orderItemId !== null && String(orderItemId).trim() !== '') {
    return `orderItem:${String(orderItemId)}`;
  }
  // Legacy rows without orderItemId: fall back to a content signature so the
  // same logical line (menu item + size + modifiers + notes + quantity) merges
  // instead of rendering twice when an order spans several station tickets.
  const menuId = String(item?.menuItemId ?? item?.menu_item_id ?? item?.itemName ?? item?.name ?? '').trim();
  const size = String(getKdsItemSize(item) || '').trim();
  const mods = (getKdsItemModifiers(item) || []).map(String).sort().join('|');
  const notes = String(getKdsItemNotes(item) || '').trim();
  const qty = String(item?.quantity ?? 1);
  const signature = `${menuId}__${size}__${mods}__${notes}__${qty}`;
  return signature.trim() === '______1' ? null : `sig:${signature}`;
};

const dedupeKdsItems = (items: any[]) => {
  const seen = new Set<string>();
  const result: any[] = [];
  for (const item of items || []) {
    const key = getKdsItemDedupeKey(item);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(item);
  }
  return result;
};

const mergeTicketsByOrder = (tickets: KdsTicket[]) => {
  const groups = new Map<string, any>();

  for (const ticket of tickets) {
    const groupKey = ticket.orderId || ticket.id;
    const existing = groups.get(groupKey);
    const ticketItems = dedupeKdsItems((ticket.items || []).map((item: any) => ({
      ...item,
      kdsTicketId: item.kdsTicketId || ticket.id,
      routingStation: ticket.routingStation,
    })));

    if (!existing) {
      groups.set(groupKey, {
        ...ticket,
        id: `order:${groupKey}`,
        primaryTicketId: ticket.id,
        ticketIds: [ticket.id],
        routingStations: [ticket.routingStation],
        routingStation: 'ALL',
        items: ticketItems,
        createdAt: ticket.createdAt,
      });
      continue;
    }

    existing.ticketIds.push(ticket.id);
    if (!existing.routingStations.includes(ticket.routingStation)) {
      existing.routingStations.push(ticket.routingStation);
    }
    // The same order item can live in several station tickets (multi-printer
    // routing or a retried dispatch). In the merged "orders" view it must
    // appear once — otherwise items with options look duplicated.
    const seenKeys = new Set(
      (existing.items || []).map((item: any) => getKdsItemDedupeKey(item)).filter(Boolean),
    );
    for (const item of ticketItems) {
      const key = getKdsItemDedupeKey(item);
      if (key && seenKeys.has(key)) continue;
      if (key) seenKeys.add(key);
      existing.items.push(item);
    }
    existing.priority = mergeKdsPriority([existing.priority, ticket.priority]);
    if (new Date(ticket.createdAt).getTime() < new Date(existing.createdAt).getTime()) {
      existing.createdAt = ticket.createdAt;
    }

    const statuses = [...existing.ticketIds.map((id: string) => {
      if (id === ticket.id) return ticket.status;
      const original = tickets.find(t => t.id === id);
      return original?.status;
    }).filter(Boolean)];
    existing.status = statuses.every(status => status === OrderStatus.READY)
      ? OrderStatus.READY
      : statuses.some(status => status === OrderStatus.READY || status === OrderStatus.PREPARING)
        ? OrderStatus.PREPARING
        : OrderStatus.PENDING;
  }

  return Array.from(groups.values()).map(order => ({
    ...order,
    routingStation: order.routingStations.length > 1 ? 'MULTI' : (order.routingStations[0] || 'KITCHEN'),
  }));
};

const isKdsItemDone = (item: any) => Boolean(item?._done || item?.isBumped);

const getKdsItemTicketId = (order: any, item: any) =>
  item?.kdsTicketId || order?.primaryTicketId || order?.id;

const getKdsOrderNumberText = (order: any) => {
  const value = order?.orderNumber ?? order?.order_number;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : '';
};

const looksBrokenText = (value?: string) => {
  if (!value) return true;
  const text = String(value);
  const questionMarks = (text.match(/\?/g) || []).length;
  return text.includes('\uFFFD') || questionMarks >= Math.max(3, Math.floor(text.length / 2));
};

const getKdsItemDisplayName = (item: any) => {
  const candidates = [
    item?.nameAr,
    item?.name_ar,
    item?.arabicName,
    item?.itemNameAr,
    item?.item_name_ar,
    item?.name,
    item?.itemName,
  ].filter(Boolean).map(String);
  const firstClean = candidates.find(candidate => !looksBrokenText(candidate));
  return firstClean || candidates[0] || 'Item';
};

const markPendingItemsDone = async (order: any, toggleItemState: (ticketId: string, itemId: number) => Promise<void>) => {
  const pendingItems = (order.items || []).filter((item: any) => !isKdsItemDone(item));
  for (const item of pendingItems) {
    await toggleItemState(getKdsItemTicketId(order, item), item.id);
  }
};

const kdsText = (isArabic: boolean, en: string, ar: string) => isArabic ? ar : en;

/**
 * Modifier payloads can come from different KDS/API generations:
 * JSON arrays, a single JSON object, or legacy plain text. Normalize all
 * supported shapes before rendering so a malformed payload cannot crash KDS.
 */
const JUNK_MODIFIER_TEXT = /\[object\s*object\]|\uFFFD/i;

/** Resolves a human label from any modifier payload shape (objects, localized maps, nested options). */
const resolveModifierLabel = (value: any, depth = 0): string => {
  if (value === null || value === undefined || depth > 4) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return '';
  if (typeof value === 'string') {
    const text = value.trim();
    return !text || JUNK_MODIFIER_TEXT.test(text) ? '' : text;
  }
  if (Array.isArray(value)) {
    const labels = value.map((entry) => resolveModifierLabel(entry, depth + 1)).filter(Boolean);
    return labels.join('، ');
  }
  if (typeof value === 'object') {
    const candidates = [
      value.optionName, value.option_name, value.nameAr, value.name_ar,
      value.arabicName, value.itemNameAr, value.name, value.itemName,
      value.title, value.label, value.value, value.ar, value.en,
    ];
    for (const candidate of candidates) {
      const label = resolveModifierLabel(candidate, depth + 1);
      if (label) return label;
    }
    for (const nested of [value.option, value.choice, value.modifier, value.group]) {
      if (nested) {
        const label = resolveModifierLabel(nested, depth + 1);
        if (label) return label;
      }
    }
    return '';
  }
  return '';
};

/** Size/variant label is a first-class field — never hide it inside modifiers. */
const getKdsItemSize = (item: any): string => {
  const direct = item?.sizeLabel ?? item?.size ?? item?.sizeName ?? item?.size_name
    ?? item?.selectedSizeName ?? item?.selectedSize?.name ?? item?.selectedSize?.nameAr
    ?? item?.variantName ?? item?.variant;
  if (direct && String(direct).trim()) return String(direct).trim();
  // Legacy fallback: size may be encoded as a modifier with group "Size"/"الحجم"
  return '';
};

const SIZE_GROUP_NAMES = new Set(['size', 'sizes', 'variant', 'variants', 'الحجم', 'المقاس', 'مقاس']);

const describeModifierOption = (mod: any): { group: string; option: string } => {
  if (mod === null || mod === undefined) return { group: '', option: '' };
  if (typeof mod === 'string' || typeof mod === 'number') {
    const option = resolveModifierLabel(mod);
    return { group: '', option };
  }
  if (typeof mod === 'object') {
    const quantity = Number((mod as any).quantity || 1);
    const optionBase = resolveModifierLabel(mod);
    const option = optionBase && quantity > 1 ? `${optionBase} ×${quantity}` : optionBase;
    const group = String((mod as any).groupName || (mod as any).group_name || (mod as any).group || '').trim();
    return { group, option };
  }
  return { group: '', option: '' };
};

const parseModifierPayload = (raw: any, depth = 0): string[] => {
  if (!raw || depth > 3) return [];
  let payload = raw;
  if (typeof payload === 'string') {
    const text = payload.trim();
    if (!text) return [];
    try {
      payload = JSON.parse(text);
    } catch {
      return JUNK_MODIFIER_TEXT.test(text) ? [] : [text];
    }
  }
  if (Array.isArray(payload)) return payload.flatMap((entry: any) => parseModifierPayload(entry, depth + 1));
  if (typeof payload === 'object') {
    // A size object mistakenly stored as modifier — surface it as size elsewhere
    const groupName = String((payload as any).groupName || (payload as any).group || '').toLowerCase();
    if (SIZE_GROUP_NAMES.has(groupName)) {
      const label = resolveModifierLabel((payload as any).optionName ?? payload);
      return label ? [`__SIZE__:${label}`] : [];
    }
    const label = resolveModifierLabel(payload);
    if (!label) return [];
    const group = String((payload as any).groupName || (payload as any).group_name || '').trim();
    const display = group && group.toLowerCase() !== label.toLowerCase() ? `${group}: ${label}` : label;
    const quantity = Number((payload as any).quantity || 1);
    return [quantity > 1 ? `${display} ×${quantity}` : display];
  }
  return [];
};

/**
 * Modifier payloads come from several client generations: POS cart objects
 * ({groupName, optionName}), platform JSON, plain text notes, and legacy rows
 * corrupted into "[object Object]" by the old nvarchar column. Normalize every
 * shape into clean display labels and drop anything unusable.
 */
const getKdsItemModifiers = (item: any): string[] => {
  const labels = [
    ...parseModifierPayload(item?.modifiersText),
    ...parseModifierPayload(item?.selectedModifiers),
    ...parseModifierPayload(item?.modifiers),
  ].filter(Boolean);
  return Array.from(new Set(labels));
};

/** Grouped view for the kitchen: extras grouped under their group name. */
const getKdsItemModifierGroups = (item: any): { group: string; options: string[] }[] => {
  const rawLists = [item?.modifiersText, item?.selectedModifiers, item?.modifiers];
  const entries: { group: string; option: string }[] = [];
  for (const raw of rawLists) {
    let payload: any = raw;
    if (typeof payload === 'string') {
      const text = payload.trim();
      if (!text) continue;
      try { payload = JSON.parse(text); } catch {
        if (!JUNK_MODIFIER_TEXT.test(text)) entries.push({ group: '', option: text });
        continue;
      }
    }
    const list = Array.isArray(payload) ? payload : [payload];
    for (const mod of list) {
      if (!mod) continue;
      const { group, option } = describeModifierOption(mod);
      if (!option) continue;
      if (group && SIZE_GROUP_NAMES.has(group.toLowerCase())) continue; // rendered as size badge
      entries.push({ group, option });
    }
  }
  const grouped = new Map<string, string[]>();
  const seenOption = new Set<string>();
  const normalizeOptionKey = (value: string) =>
    String(value || '')
      .replace(/\s×\d+\s*$/, '')
      .trim()
      .toLocaleLowerCase();
  // Prefer the named group when the same option arrives from several payload
  // generations (plain text + objects): sort named groups first.
  const sortedEntries = [...entries].sort((a, b) => Number(!b.group) - Number(!a.group));
  for (const { group, option } of sortedEntries) {
    const optionKey = normalizeOptionKey(option);
    if (optionKey && seenOption.has(optionKey)) continue;
    if (optionKey) seenOption.add(optionKey);
    const key = group || '';
    if (!grouped.has(key)) grouped.set(key, []);
    const bucket = grouped.get(key)!;
    if (!bucket.includes(option)) bucket.push(option);
  }
  return Array.from(grouped.entries()).map(([group, options]) => ({ group, options }));
};

/** Per-item kitchen note (never merge into modifiers). */
const getKdsItemNotes = (item: any): string => {
  const note = item?.notes ?? item?.itemNotes ?? item?.item_notes ?? '';
  return String(note || '').trim();
};

const orderTypeLabel = (type: string | undefined, isArabic: boolean) => {
  const normalized = String(type || 'ORDER').toUpperCase();
  const labels: Record<string, string> = {
    DINE_IN: kdsText(isArabic, 'Dine In', 'صالة'),
    TAKEAWAY: kdsText(isArabic, 'Takeaway', 'استلام'),
    DELIVERY: kdsText(isArabic, 'Delivery', 'توصيل'),
    ORDER: kdsText(isArabic, 'Order', 'طلب')
  };
  return labels[normalized] || type || labels.ORDER;
};

const statusLabel = (status: OrderStatus | string, isArabic: boolean) => {
  if (status === OrderStatus.READY) return kdsText(isArabic, 'Ready', 'جاهز');
  if (status === OrderStatus.PREPARING) return kdsText(isArabic, 'Cooking', 'قيد التحضير');
  return kdsText(isArabic, 'Queued', 'في الانتظار');
};

const columnCopy = (key: keyof typeof COLUMN_THEMES, isArabic: boolean) => {
  const copy = {
    PENDING: {
      label: kdsText(isArabic, 'Queue', 'الطابور'),
      subtitle: kdsText(isArabic, 'Waiting to fire', 'في انتظار التحضير')
    },
    PREPARING: {
      label: kdsText(isArabic, 'Cooking', 'قيد التحضير'),
      subtitle: kdsText(isArabic, 'In the kitchen', 'داخل المطبخ')
    },
    READY: {
      label: kdsText(isArabic, 'Ready', 'جاهز'),
      subtitle: kdsText(isArabic, 'Ready to serve', 'جاهز للتسليم')
    }
  };
  return copy[key];
};

/* ???????????????????????????????????????????????????
   ?? KDS — Main Component (Performance Optimized)
   ??????????????????????????????????????????????????? */
const KDS: React.FC = () => {
  const { tickets: storeOrders, bumpTicket: updateOrderStatus, fetchTickets: fetchOrders, toggleItemState, recallTicket } = useKdsStore(useShallow((state) => ({
    tickets: state.tickets,
    bumpTicket: state.bumpTicket,
    fetchTickets: state.fetchTickets,
    toggleItemState: state.toggleItemState,
    recallTicket: state.recallTicket,
  })));
  // Optimistic tickets: status taps apply to the UI in the same frame (the
  // reducer sets an explicit target status, so re-applying on top of the
  // server-confirmed base is idempotent — no double-advance possible).
  // Rollback is automatic: when the transition settles without a base change,
  // React discards the optimistic layer.
  const [orders, bumpOptimistic] = useOptimistic(
    storeOrders,
    (state: KdsTicket[], action: { id: string; status: KdsTicket['status'] }) =>
      state.map(t => (t.id === action.id ? { ...t, status: action.status, bumpedAt: new Date().toISOString() } : t))
  );
  const [, startTicketTransition] = useTransition();
  const settings = useAuthStore((state) => state.settings);
  const { confirm } = useConfirm();
  const isArabic = settings.language === 'ar';
  const activeBranchId = settings.activeBranchId;

  const [nowTick, setNowTick] = React.useState(Date.now());
  const [activeStatus, setActiveStatus] = React.useState<'ALL' | OrderStatus>('ALL');
  const [activeStations, setActiveStations] = React.useState<Set<Station>>(new Set(['ALL']));
  const [soundMode, setSoundMode] = React.useState<'ALL' | 'OFF'>(() => {
    try { return localStorage.getItem('kds_sound_mode') === 'OFF' ? 'OFF' : 'ALL'; }
    catch { return 'ALL'; }
  });
  // Voice announcement toggle (master-muted by soundMode anyway).
  const [voiceEnabled, setVoiceEnabled] = React.useState(() => {
    try { return localStorage.getItem('kds_voice') !== 'OFF'; }
    catch { return true; }
  });
  // Local display theme: kitchen screens pick their own look without
  // touching the global app theme. 'auto' follows the system theme.
  const [kdsTheme, setKdsTheme] = React.useState<'auto' | 'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('kds_theme');
      return saved === 'dark' || saved === 'light' ? saved : 'auto';
    } catch { return 'auto'; }
  });
  // Offline-banner grace: a fresh mount / 1-second blip must not scream
  // OFFLINE. Polling already covers data instantly; the banner appears only
  // if the socket stays down past the grace window.
  const [offlineGracePassed, setOfflineGracePassed] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [showStationSettings, setShowStationSettings] = React.useState(false);
  const [pendingBump, setPendingBump] = React.useState<string | null>(null);
  const [highlightedIdx, setHighlightedIdx] = React.useState(-1);
  const [displayMode, setDisplayMode] = React.useState<KdsDisplayMode>(() => {
    try {
      const saved = localStorage.getItem('kds_display_mode') as KdsDisplayMode | null;
      return saved === 'stations' ? 'stations' : 'orders';
    } catch { return 'orders'; }
  });
  const [kdsMode, setKdsMode] = React.useState<'simple' | 'advanced' | 'summary'>(() => {
    try { return (localStorage.getItem('kds_mode') as any) || 'simple'; } catch { return 'simple'; }
  });
  const [quickInput, setQuickInput] = React.useState('');
  const quickInputRef = React.useRef<HTMLInputElement>(null);
  const quickInputValueRef = React.useRef('');
  const [recentBumps, setRecentBumps] = React.useState<{id: string, ticketIds: string[], timeoutId: ReturnType<typeof setTimeout>}[]>([]);
  const completingOrderIdsRef = React.useRef<Set<string>>(new Set());
  const knownTicketIdsRef = React.useRef<Set<string>>(new Set());
  const lastUrgentAlertAtRef = React.useRef(0);

  const [stations, setStations] = React.useState<StationConfig[]>(DEFAULT_STATIONS);
  // Connection visibility: kitchen must KNOW when it runs on polling fallback.
  const [socketOnline, setSocketOnline] = React.useState(() => socketService.isConnected());
  const [lastSyncAt, setLastSyncAt] = React.useState<number>(Date.now());

  React.useEffect(() => {
    if (socketOnline) { setOfflineGracePassed(false); return; }
    const timer = window.setTimeout(() => setOfflineGracePassed(true), 5000);
    return () => window.clearTimeout(timer);
  }, [socketOnline]);

  // Browsers gate audio + speech behind a user gesture: unlock both on the
  // first tap/keypress so the first order of the day still announces.
  React.useEffect(() => {
    const unlock = () => {
      try {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      } catch { /* ignore */ }
      try { pickArabicVoice(); } catch { /* ignore */ }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    kdsApi.getMeta(activeBranchId || undefined)
      .then(meta => {
        if (cancelled) return;
        const stationRows = Array.isArray(meta?.stations) ? meta.stations : [];
        const serverStations = stationRows
          .map(station => String(station.name || '').trim().toUpperCase())
          .filter(Boolean)
          .map(name => ({ name, keywords: [] }));
        setStations(serverStations.length ? serverStations : DEFAULT_STATIONS);
      })
      .catch(() => {
        if (!cancelled) setStations(DEFAULT_STATIONS);
      });
    return () => { cancelled = true; };
  }, [activeBranchId]);

  React.useEffect(() => {
    quickInputValueRef.current = quickInput;
  }, [quickInput]);

  // Fetch orders on mount + listen for events
  React.useEffect(() => {
    const station = activeStations.has('ALL') ? undefined : Array.from(activeStations)[0];
    const params = { branchId: activeBranchId || undefined, station };
    let cancelled = false;
    let refreshInFlight = false;
    let pollingTimer: number | null = null;
    const refreshTickets = async (announceNewTickets: boolean) => {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        await fetchOrders(params);
        if (cancelled) return;
        setLastSyncAt(Date.now());
        const nextTickets = useKdsStore.getState().tickets.filter((ticket) =>
          (!activeBranchId || ticket.branchId === activeBranchId) &&
          (!station || ticket.routingStation === station)
        );
        const freshTickets = announceNewTickets
          ? nextTickets.filter((ticket) => !knownTicketIdsRef.current.has(ticket.id))
          : [];
        knownTicketIdsRef.current = new Set(nextTickets.map((ticket) => ticket.id));
        if (freshTickets.length > 0 && soundMode === 'ALL') {
          playNewOrderSound();
          if (voiceEnabled) {
            // One announcement per order — sibling tickets arrive together.
            const seenOrders = new Set<string>();
            const labels: string[] = [];
            for (const ticket of freshTickets) {
              const key = String(ticket.orderId || ticket.id);
              if (seenOrders.has(key)) continue;
              seenOrders.add(key);
              const num = ticket.orderNumber ?? formatDisplayId(ticket).replace(/^#/, '');
              labels.push(String(num));
            }
            speakNewOrder(labels);
          }
        }
      } finally {
        refreshInFlight = false;
      }
    };
    const handleKdsUpdate = () => { void refreshTickets(true); };
    const handleConnectionChange = (connected: boolean) => {
      setSocketOnline(connected);
      pollingTimer = reconcileKdsPolling(
        connected,
        pollingTimer,
        () => window.setInterval(() => { void refreshTickets(false); }, KDS_FALLBACK_POLL_MS),
        timer => window.clearInterval(timer),
      );
      if (connected) void refreshTickets(false);
    };

    socketService.on('kds:update', handleKdsUpdate);
    socketService.onConnectionChange(handleConnectionChange);
    return () => {
       cancelled = true;
       socketService.off('kds:update', handleKdsUpdate);
       socketService.offConnectionChange(handleConnectionChange);
       if (pollingTimer !== null) window.clearInterval(timer);
    };
  }, [fetchOrders, soundMode, voiceEnabled, activeBranchId, activeStations]);

  // Timer tick — every 5s for elapsed time calculations
  React.useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Fullscreen listener
  React.useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Screen Wake Lock — kitchen displays must never sleep mid-rush. Re-acquire
  // on visibility change (the OS releases the lock when hidden). Silent
  // no-op where unsupported; always released on unmount.
  React.useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (!wl || document.visibilityState !== 'visible') return;
        lock = await wl.request('screen');
      } catch {
        lock = null;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (lock) void lock.release().catch(() => undefined);
      lock = null;
    };
  }, []);

  const toggleFullscreen = React.useCallback(async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { }
  }, []);

  const getStationForItem = React.useCallback((item: any, order?: any) => {
    if (item?.routingStation) return item.routingStation;
    if (order && order.routingStation && order.routingStation !== 'MULTI') return order.routingStation;
    return stations[0]?.name || 'GENERAL';
  }, [stations]);

  const toggleStation = React.useCallback((station: Station) => {
    setActiveStations(prev => {
      const next = new Set(prev);
      if (station === 'ALL') return new Set(['ALL']);
      next.delete('ALL');
      if (next.has(station)) next.delete(station);
      else next.add(station);
      if (next.size === 0) return new Set(['ALL']);
      return next;
    });
  }, []);

  // Filter & sort orders — filter stale orders (>24h)
  const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
  const activeTicketRows = React.useMemo(() => {
    let base = orders.filter(o =>
      o.status !== OrderStatus.DELIVERED &&
      o.status !== OrderStatus.CANCELLED &&
      o.status !== 'SERVED' &&
      (!activeBranchId || o.branchId === activeBranchId) &&
      (Date.now() - new Date(o.createdAt).getTime()) < MAX_AGE_MS
    );
    if (!activeStations.has('ALL')) base = base.filter(o => activeStations.has(o.routingStation));
    return base.sort(compareKdsTicketPriority);
  }, [orders, activeStations, activeBranchId, nowTick]);

  const activeOrders = React.useMemo(() => {
    const displayRows = displayMode === 'orders'
      ? mergeTicketsByOrder(activeTicketRows)
      : activeTicketRows;
    const filtered = activeStatus === 'ALL'
      ? displayRows
      : displayRows.filter(o => o.status === activeStatus);
    return filtered.sort(compareKdsTicketPriority);
  }, [activeTicketRows, activeStatus, displayMode]);

  const getElapsedMins = React.useCallback((createdAt: any) =>
    Math.floor((nowTick - new Date(createdAt).getTime()) / 60000), [nowTick]);

  // Urgent sound alert
  React.useEffect(() => {
    if (soundMode === 'OFF') return;
    const hasCritical = activeOrders.some(o => getElapsedMins(o.createdAt) >= SLA.critical && o.status !== OrderStatus.READY);
    if (hasCritical && Date.now() - lastUrgentAlertAtRef.current >= 60_000) {
      lastUrgentAlertAtRef.current = Date.now();
      playUrgentAlertSound();
    }
  }, [nowTick, soundMode, activeOrders, getElapsedMins]);

  const toggleSoundMode = React.useCallback(() => {
    setSoundMode((previous) => {
      const next = previous === 'OFF' ? 'ALL' : 'OFF';
      try { localStorage.setItem('kds_sound_mode', next); } catch {}
      if (next === 'ALL') {
        const audioContext = getAudioCtx();
        if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
      } else {
        try { window.speechSynthesis?.cancel(); } catch {}
      }
      return next;
    });
  }, []);

  const toggleVoice = React.useCallback(() => {
    setVoiceEnabled((previous) => {
      const next = !previous;
      try { localStorage.setItem('kds_voice', next ? 'ON' : 'OFF'); } catch {}
      if (!next) {
        try { window.speechSynthesis?.cancel(); } catch {}
      }
      return next;
    });
  }, []);

  const cycleKdsTheme = React.useCallback(() => {
    setKdsTheme((previous) => {
      const next = previous === 'auto' ? 'dark' : previous === 'dark' ? 'light' : 'auto';
      try { localStorage.setItem('kds_theme', next); } catch {}
      return next;
    });
  }, []);

  const setKdsThemeMode = React.useCallback((mode: 'auto' | 'dark' | 'light') => {
    setKdsTheme(mode);
    try { localStorage.setItem('kds_theme', mode); } catch {}
  }, []);

  const stationWorkload = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const order of activeTicketRows) {
      const station = order.routingStation;
      for (const item of order.items || []) {
        map[station] = (map[station] || 0) + Math.max(1, Number(item?.quantity || 1));
      }
    }
    return map;
  }, [activeTicketRows]);

  const bumpActorId = settings.currentUser?.id;
  const bumpActorName = settings.currentUser?.name;
  const advanceOrder = React.useCallback(async (order: any) => {
    setPendingBump(null);
    const ticketIds = Array.isArray(order.ticketIds) && order.ticketIds.length > 0
      ? order.ticketIds
      : [order.id];
    const idsToAdvance = order.status === OrderStatus.READY
      ? ticketIds
      : ticketIds.filter((ticketId: string) => {
        const ticket = orders.find(t => t.id === ticketId);
        return ticket?.status !== OrderStatus.READY;
      });
    // Who completed it travels with the bump so staff performance is reportable.
    const actor = (bumpActorId || bumpActorName) ? { id: bumpActorId, name: bumpActorName } : undefined;

    // Instant paint first, server confirm in the background.
    startTicketTransition(async () => {
      idsToAdvance.forEach((ticketId: string) => bumpOptimistic({ id: ticketId, status: 'READY' }));
      for (const ticketId of idsToAdvance) {
        await updateOrderStatus(ticketId, actor);
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    });

    if (order.status !== OrderStatus.READY) {
        // Add to recent bumps for undo while the ticket is in PASS/READY.
        const tid = setTimeout(() => {
            setRecentBumps(prev => prev.filter(b => b.id !== order.id));
        }, 8000);
        setRecentBumps(prev => [...prev, { id: order.id, ticketIds: idsToAdvance, timeoutId: tid }]);
    }
  }, [orders, updateOrderStatus, startTicketTransition, bumpOptimistic, bumpActorId, bumpActorName]);

  const completeKitchenOrder = React.useCallback(async (order: any) => {
    if (!order?.id || completingOrderIdsRef.current.has(order.id)) return;
    setPendingBump(null);
    completingOrderIdsRef.current.add(order.id);

    const ticketIds = Array.isArray(order.ticketIds) && order.ticketIds.length > 0
      ? order.ticketIds
      : [order.primaryTicketId || order.id];

    try {
      startTicketTransition(async () => {
        ticketIds.forEach((ticketId: string) => bumpOptimistic({ id: ticketId, status: 'READY' }));
        await advanceKdsTicketIdsOnce(ticketIds, updateOrderStatus);
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
      });
    } finally {
      completingOrderIdsRef.current.delete(order.id);
    }
  }, [updateOrderStatus, startTicketTransition, bumpOptimistic]);

  const handleUndoBump = React.useCallback(async (id: string) => {
      const bump = recentBumps.find(b => b.id === id);
      if (bump) clearTimeout(bump.timeoutId);
      setRecentBumps(prev => prev.filter(b => b.id !== id));
      const ticketIds = bump?.ticketIds?.length ? bump.ticketIds : [id];
      startTicketTransition(async () => {
        ticketIds.forEach((ticketId: string) => bumpOptimistic({ id: ticketId, status: 'PREPARING' }));
        for (const ticketId of ticketIds) {
          await recallTicket(ticketId);
        }
      });
  }, [recentBumps, recallTicket, startTicketTransition, bumpOptimistic]);

  const completeReadyBatch = React.useCallback(async () => {
    const readyOrders = activeOrders.filter(o => o.status === OrderStatus.READY);
    for (const order of readyOrders) await completeKitchenOrder(order);
  }, [activeOrders, completeKitchenOrder]);

  const completeAllKitchenOrders = React.useCallback(async () => {
    if (activeOrders.length === 0 || typeof window === 'undefined') return;
    const confirmed = await confirm({
      title: isArabic ? 'إنهاء وتسليم الطلبات' : 'Finish & hand over',
      message: kdsText(
        isArabic,
        `Finish and hand over ${activeOrders.length} kitchen orders?`,
        `إنهاء وتسليم كل طلبات المطبخ (${activeOrders.length})؟`,
      ),
      confirmText: isArabic ? 'تنفيذ' : 'Confirm',
      cancelText: isArabic ? 'إلغاء' : 'Cancel',
      variant: 'info',
    });
    if (!confirmed) return;
    for (const order of activeOrders) {
      await completeKitchenOrder(order);
      // After finishing, also hand the order over (pickup flow) so it clears
      // the packing screen instead of waiting there in READY state.
      const rawId = String(order.id || '');
      const orderId = order.orderId || (!rawId.startsWith('order:') ? order.id : null);
      const type = String(order.type || '').toUpperCase();
      if (orderId && HANDOVER_ELIGIBLE_TYPES.has(type)) {
        try {
          await kdsApi.handoverOrder(String(orderId));
        } catch { /* keep finishing the remaining orders */ }
      }
    }
  }, [activeOrders, completeKitchenOrder, confirm, isArabic]);

  // Live match preview — find order as user types
  const matchedOrder = React.useMemo(() => {
    const trimmed = quickInput.trim();
    if (!trimmed) return null;
    return activeOrders.find(o => getKdsOrderNumberText(o) === trimmed) || null;
  }, [quickInput, activeOrders]);

  // Quick-complete confirmed match (Simple Mode) — chain through statuses
  const confirmQuickComplete = React.useCallback(async () => {
    const trimmed = quickInputValueRef.current.trim();
    const order = trimmed ? activeOrders.find(o => getKdsOrderNumberText(o) === trimmed) : null;
    if (!order) {
      quickInputValueRef.current = '';
      setQuickInput('');
      return;
    }
    try {
      await completeKitchenOrder(order);
    } catch { /* ignore transition errors */ }
    quickInputValueRef.current = '';
    setQuickInput('');
  }, [activeOrders, completeKitchenOrder]);

  const setKdsDisplayMode = React.useCallback((mode: KdsDisplayMode) => {
    setDisplayMode(mode);
    try { localStorage.setItem('kds_display_mode', mode); } catch {}
  }, []);

  const toggleKdsMode = React.useCallback(() => {
    setKdsMode(prev => {
      const next = prev === 'simple' ? 'advanced' : prev === 'advanced' ? 'summary' : 'simple';
      localStorage.setItem('kds_mode', next);
      return next;
    });
  }, []);

  const getTimerUrgency = React.useCallback((mins: number, status: OrderStatus): 'ok' | 'warning' | 'risk' | 'critical' | 'ready' => {
    if (status === OrderStatus.READY) return 'ready';
    if (mins >= SLA.critical) return 'critical';
    if (mins >= SLA.risk) return 'risk';
    if (mins >= SLA.warning) return 'warning';
    return 'ok';
  }, []);

  // Derived counts
  const pendingOrders = React.useMemo(() => activeOrders.filter(o => o.status === OrderStatus.PENDING), [activeOrders]);
  const preparingOrders = React.useMemo(() => activeOrders.filter(o => o.status === OrderStatus.PREPARING), [activeOrders]);
  const readyOrders = React.useMemo(() => activeOrders.filter(o => o.status === OrderStatus.READY), [activeOrders]);

  const showPending = activeStatus === 'ALL' || activeStatus === OrderStatus.PENDING;
  const showPreparing = activeStatus === 'ALL' || activeStatus === OrderStatus.PREPARING;
  const showReady = activeStatus === 'ALL' || activeStatus === OrderStatus.READY;

  const totalStationLoad = Object.values(stationWorkload).reduce((a, b) => a + b, 0);
  const maxStationLoad = Math.max(1, ...Object.values(stationWorkload));

  const statusFilters = React.useMemo(() => [
    { key: 'ALL' as const, label: isArabic ? 'الكل' : 'ALL', count: activeOrders.length },
    { key: OrderStatus.PENDING, label: isArabic ? 'الطابور' : 'QUEUE', count: pendingOrders.length },
    { key: OrderStatus.PREPARING, label: isArabic ? 'تحضير' : 'FIRE', count: preparingOrders.length },
    { key: OrderStatus.READY, label: isArabic ? 'جاهز' : 'PASS', count: readyOrders.length },
  ], [activeOrders.length, isArabic, pendingOrders.length, preparingOrders.length, readyOrders.length]);

  // ?? Keyboard shortcuts
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showStationSettings) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        setQuickInput(prev => {
          const next = `${prev}${e.key}`.replace(/\D/g, '').slice(0, 8);
          quickInputValueRef.current = next;
          return next;
        });
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        setQuickInput(prev => {
          const next = prev.slice(0, -1);
          quickInputValueRef.current = next;
          return next;
        });
        return;
      }

      if (e.key === 'Escape') {
        quickInputValueRef.current = '';
        setQuickInput('');
        return;
      }

      switch (e.key) {
        case 'f': case 'F': toggleFullscreen(); break;
        case 'm': case 'M': toggleSoundMode(); break;
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIdx(p => Math.min(p + 1, activeOrders.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIdx(p => Math.max(p - 1, 0));
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (e.key === 'Enter' && quickInputValueRef.current.trim()) {
            confirmQuickComplete();
          } else if (highlightedIdx >= 0 && highlightedIdx < activeOrders.length) {
            completeKitchenOrder(activeOrders[highlightedIdx]);
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showStationSettings, toggleFullscreen, activeOrders, highlightedIdx, completeKitchenOrder, confirmQuickComplete, toggleSoundMode]);

  // Local theme scope: 'dark' forces the shared dark tokens on this subtree,
  // 'light' re-declares light tokens (doubled class beats runtime themes),
  // 'auto' inherits the global app theme untouched.
  const themeScopeClass = kdsTheme === 'dark'
    ? 'dark kds-scope-dark'
    : kdsTheme === 'light'
      ? 'kds-scope-light kds-scope-light'
      : '';

  return (
    <div
      className={`ops-fast flex flex-col h-screen w-full font-sans ${themeScopeClass}`}
      style={{ background: 'rgb(var(--bg-app))', color: 'rgb(var(--text-main))' }}
    >
      <AnimatePresence>
        {quickInput && (
          <motion.div
            key="kds-keyboard-buffer"
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            className="pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-2xl border px-8 py-4 text-center shadow-2xl backdrop-blur-xl"
            style={{
              background: matchedOrder ? 'rgba(var(--success), 0.14)' : 'rgba(var(--warning), 0.14)',
              borderColor: matchedOrder ? 'rgba(var(--success), 0.45)' : 'rgba(var(--warning), 0.45)',
              color: matchedOrder ? 'rgb(var(--success))' : 'rgb(var(--warning))',
            }}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: 'rgb(var(--text-muted))' }}>
              {isArabic ? 'رقم الأوردر' : 'Order Number'}
            </p>
            <p className="mt-1 text-5xl font-black tabular-nums tracking-tight">#{quickInput}</p>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ??? TOP ACCENT LINE — themed gradient ??? */}
      <div
        className="shrink-0"
        style={{
          height: 3,
          background: `linear-gradient(90deg, rgb(var(--warning)), rgb(var(--primary)), rgb(var(--success)))`,
          opacity: 0.7,
        }}
      />
      {/* Connection banner — kitchen must never silently run on stale polling.
         Grace window hides mount flicker and 1-second blips; polling already
         covers data from the first second. */}
      {!socketOnline && offlineGracePassed && (
        <div
          className="shrink-0 flex items-center justify-center gap-2 px-3 py-1.5 text-center"
          style={{ background: 'rgba(var(--danger), 0.14)', borderBottom: '1px solid rgba(var(--danger), 0.4)', color: 'rgb(var(--danger))', fontSize: 12, fontWeight: 900 }}
        >
          <WifiOff size={14} />
          <span className="uppercase tracking-widest">
            {kdsText(isArabic,
              `Offline — polling fallback · last sync ${new Date(lastSyncAt).toLocaleTimeString()}`,
              `غير متصل — وضع التحديث الاحتياطي · آخر مزامنة ${new Date(lastSyncAt).toLocaleTimeString()}`)}
          </span>
        </div>
      )}

      {/* ??? HEADER BAR ??? */}
      <div
        className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-2"
        style={{
          background: 'rgba(var(--bg-card), 0.88)',
          backdropFilter: 'blur(var(--theme-blur, 16px))',
          borderBottom: '1px solid rgba(var(--border-color), 0.2)',
        }}
      >
        {/* Left: Brand + Clock + Active count */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex items-center justify-center"
              style={{
                width: 34, height: 34,
                borderRadius: 'var(--theme-radius-sm, 8px)',
                background: `linear-gradient(135deg, rgb(var(--primary)), rgba(var(--primary), 0.6))`,
                boxShadow: '0 4px 12px rgba(var(--primary), 0.25)',
              }}
            >
              <ChefHat size={16} className="text-white" />
            </div>
            <div>
              <h1 style={{ fontSize: 13, fontWeight: 900, letterSpacing: isArabic ? 0 : '0.18em', color: 'rgb(var(--text-main))' }} className="uppercase leading-none">
                {isArabic ? 'المطبخ' : 'KITCHEN'}
              </h1>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'rgb(var(--text-muted))', letterSpacing: isArabic ? 0 : '0.12em' }} className="uppercase">
                {isArabic ? 'شاشة التحضير' : 'DISPLAY SYSTEM'}
              </p>
            </div>
          </div>

          <div style={{ width: 1, height: 24, background: 'rgba(var(--border-color), 0.25)' }} />
          <LiveClock />
          <div style={{ width: 1, height: 24, background: 'rgba(var(--border-color), 0.25)' }} />

          {/* Active ticket counter */}
          <div
            className="flex items-center gap-2 px-3 py-1.5"
            style={{
              borderRadius: 'var(--theme-radius-sm, 8px)',
              background: 'rgba(var(--bg-elevated), 0.6)',
              border: '1px solid rgba(var(--border-color), 0.2)',
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'rgb(var(--success))' }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'rgb(var(--success))' }} />
            </span>
            <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 900 }}>{activeOrders.length}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgb(var(--text-muted))' }} className="uppercase">
              {isArabic ? 'نشط' : 'active'}
            </span>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <div
            className="flex items-center gap-1 p-1"
            style={{
              borderRadius: 'var(--theme-radius-sm, 8px)',
              background: 'rgba(var(--bg-elevated), 0.45)',
              border: '1px solid rgba(var(--border-color), 0.2)',
            }}
          >
            {([
              { key: 'orders' as const, label: isArabic ? 'شامل' : 'ORDERS', icon: <Layers size={13} /> },
              { key: 'stations' as const, label: isArabic ? 'محطات' : 'STATIONS', icon: <ChefHat size={13} /> },
            ]).map(option => {
              const isActive = displayMode === option.key;
              return (
                <button
                  key={option.key}
                  onClick={() => setKdsDisplayMode(option.key)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 uppercase transition-all duration-200"
                  style={{
                    borderRadius: 'var(--theme-radius-sm, 6px)',
                    fontSize: 10,
                    fontWeight: 900,
                    background: isActive ? 'rgba(var(--primary), 0.14)' : 'transparent',
                    color: isActive ? 'rgb(var(--primary))' : 'rgb(var(--text-muted))',
                  }}
                  title={option.key === 'orders' ? kdsText(isArabic, 'One card per order', 'كارت واحد لكل طلب') : kdsText(isArabic, 'Split cards by station', 'تقسيم الكروت حسب المحطة')}
                >
                  {option.icon}
                  {option.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={completeAllKitchenOrders}
            disabled={activeOrders.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 uppercase transition-all duration-200 disabled:cursor-default disabled:opacity-40"
            style={{
              borderRadius: 'var(--theme-radius-sm, 8px)',
              fontSize: 10,
              fontWeight: 900,
              background: 'rgba(var(--success), 0.12)',
              color: 'rgb(var(--success))',
              border: '1px solid rgba(var(--success), 0.25)',
            }}
            title={kdsText(isArabic, 'Finish and hand over all kitchen orders', 'إنهاء وتسليم كل طلبات المطبخ')}
          >
            <CheckCircle size={14} />
            <span className="hidden sm:inline">{isArabic ? 'إنهاء الكل' : 'FINISH ALL'}</span>
          </button>

          {/* Mode toggle */}
          <button
            onClick={toggleKdsMode}
            className="flex items-center gap-1.5 px-3 py-2 uppercase transition-all duration-200"
            style={{
              borderRadius: 'var(--theme-radius-sm, 8px)',
              fontSize: 10, fontWeight: 900,
              background: kdsMode === 'simple' ? 'rgba(var(--success), 0.12)' : 'rgba(var(--primary), 0.12)',
              color: kdsMode === 'simple' ? 'rgb(var(--success))' : 'rgb(var(--primary))',
              border: `1px solid ${kdsMode === 'simple' ? 'rgba(var(--success), 0.25)' : 'rgba(var(--primary), 0.25)'}`,
            }}
          >
            {kdsMode === 'simple' ? <Zap size={14} /> : kdsMode === 'summary' ? <Layers size={14} /> : <Settings size={14} />}
            {kdsMode === 'simple'
              ? (isArabic ? 'سريع' : 'SIMPLE')
              : kdsMode === 'summary'
                ? (isArabic ? 'ملخص' : 'SUMMARY')
                : (isArabic ? 'متقدم' : 'ADVANCED')}
          </button>

          {/* Quick complete input (Simple mode) */}
          {kdsMode === 'simple' && (
            <div className="relative">
              <div className="flex items-center" style={{
                borderRadius: 'var(--theme-radius-sm, 8px)',
                background: matchedOrder ? 'rgba(var(--success), 0.1)' : 'rgba(var(--bg-elevated), 0.6)',
                border: `1px solid ${matchedOrder ? 'rgba(var(--success), 0.35)' : quickInput && !matchedOrder ? 'rgba(var(--danger), 0.3)' : 'rgba(var(--border-color), 0.25)'}`,
                overflow: 'hidden',
                transition: 'all 0.2s',
              }}>
                <Search size={14} style={{ margin: '0 8px', color: matchedOrder ? 'rgb(var(--success))' : 'rgb(var(--text-muted))' }} />
                <input
                  ref={quickInputRef}
                  value={quickInput}
                  onChange={e => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, 8);
                    quickInputValueRef.current = next;
                    setQuickInput(next);
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmQuickComplete(); } if (e.key === 'Escape') { quickInputValueRef.current = ''; setQuickInput(''); } }}
                  placeholder={isArabic ? 'رقم الطلب' : 'Order #'}
                  className="bg-transparent outline-none"
                  style={{
                    width: 110, padding: '6px 8px 6px 0',
                    fontSize: 12, fontWeight: 700,
                    color: 'rgb(var(--text-main))',
                  }}
                />
                {matchedOrder && (
                  <div className="flex items-center gap-1.5 pr-2 shrink-0" style={{ color: 'rgb(var(--success))', fontSize: 11, fontWeight: 900 }}>
                    <span>{formatDisplayId(matchedOrder)}</span>
                    <span style={{ fontSize: 9, opacity: 0.7 }}>OK</span>
                  </div>
                )}
                {quickInput && !matchedOrder && (
                  <div className="pr-2 shrink-0" style={{ color: 'rgb(var(--danger))', fontSize: 10, fontWeight: 700 }}>NO</div>
                )}
              </div>
            </div>
          )}

          <button
            onClick={toggleSoundMode}
            className="flex items-center gap-1.5 px-3 py-2 uppercase transition-all duration-200"
            style={{
              borderRadius: 'var(--theme-radius-sm, 8px)',
              fontSize: 10, fontWeight: 900,
              background: soundMode === 'OFF' ? 'rgba(var(--danger), 0.12)' : 'rgba(var(--success), 0.12)',
              color: soundMode === 'OFF' ? 'rgb(var(--danger))' : 'rgb(var(--success))',
              border: `1px solid ${soundMode === 'OFF' ? 'rgba(var(--danger), 0.2)' : 'rgba(var(--success), 0.2)'}`,
            }}
          >
            {soundMode === 'OFF' ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span className="hidden sm:inline">{soundMode === 'OFF' ? (isArabic ? 'صامت' : 'MUTED') : (isArabic ? 'صوت' : 'LIVE')}</span>
          </button>
          {/* Local display theme: auto (system) → dark → light */}
          <button
            onClick={cycleKdsTheme}
            className="flex items-center gap-1.5 px-3 py-2 uppercase transition-all duration-200"
            style={{
              borderRadius: 'var(--theme-radius-sm, 8px)',
              fontSize: 10, fontWeight: 900,
              background: kdsTheme === 'auto' ? 'rgba(var(--bg-elevated), 0.5)' : 'rgba(var(--warning), 0.12)',
              color: kdsTheme === 'auto' ? 'rgb(var(--text-muted))' : 'rgb(var(--warning))',
              border: `1px solid ${kdsTheme === 'auto' ? 'rgba(var(--border-color), 0.2)' : 'rgba(var(--warning), 0.25)'}`,
            }}
            title={kdsText(isArabic, 'Display theme: follow system / dark / light', 'ثيم الشاشة: تلقائي / داكن / فاتح')}
          >
            {kdsTheme === 'dark' ? <Moon size={14} /> : kdsTheme === 'light' ? <Sun size={14} /> : <Sparkles size={14} />}
            <span className="hidden sm:inline">{kdsTheme === 'dark' ? (isArabic ? 'داكن' : 'DARK') : kdsTheme === 'light' ? (isArabic ? 'فاتح' : 'LIGHT') : (isArabic ? 'تلقائي' : 'AUTO')}</span>
          </button>
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 px-3 py-2 uppercase transition-all duration-200"
            style={{
              borderRadius: 'var(--theme-radius-sm, 8px)',
              fontSize: 10, fontWeight: 900,
              background: 'rgba(var(--bg-elevated), 0.5)',
              color: 'rgb(var(--text-muted))',
              border: '1px solid rgba(var(--border-color), 0.2)',
            }}
          >
            <MonitorPlay size={14} /> <span className="hidden sm:inline">{isFullscreen ? (isArabic ? 'خروج' : 'EXIT') : (isArabic ? 'ملء' : 'FULL')}</span>
          </button>
          <button
            onClick={() => setShowStationSettings(true)}
            className="flex items-center justify-center transition-all duration-200"
            style={{
              width: 36, height: 36,
              borderRadius: 'var(--theme-radius-sm, 8px)',
              background: 'rgba(var(--bg-elevated), 0.5)',
              color: 'rgb(var(--text-muted))',
              border: '1px solid rgba(var(--border-color), 0.2)',
            }}
              title={kdsText(isArabic, 'View routing stations', 'عرض محطات التوجيه')}
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* ??? MAIN CONTENT — Simple or Advanced ??? */}
      {kdsMode === 'simple' ? (
        <SimpleGrid
          orders={activeOrders.filter(o => o.status !== OrderStatus.READY && o.status !== OrderStatus.DELIVERED)}
          readyOrders={readyOrders}
          getElapsedMins={getElapsedMins}
          getTimerUrgency={getTimerUrgency}
          getStationForItem={getStationForItem}
          updateOrderStatus={completeKitchenOrder}
          toggleItemState={toggleItemState}
          isArabic={isArabic}
        />
      ) : kdsMode === 'summary' ? (
        <SummaryGrid orders={activeOrders.filter(o => o.status !== OrderStatus.READY && o.status !== OrderStatus.DELIVERED)} isArabic={isArabic} />
      ) : (
        <>
          {/* ??? FILTER RIBBON (Advanced only) ??? */}
          <div
            className="shrink-0 flex items-center gap-3 px-5 py-2 overflow-x-auto no-scrollbar"
            style={{
              background: 'rgba(var(--bg-card), 0.5)',
              backdropFilter: 'blur(8px)',
              borderBottom: '1px solid rgba(var(--border-color), 0.12)',
            }}
          >
            <div className="flex items-center gap-1.5">
              {statusFilters.map(f => (
                <button
                  key={f.key}
                  onClick={() => setActiveStatus(f.key as any)}
                  className="flex items-center gap-1.5 uppercase tracking-wider transition-all duration-200"
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--theme-radius-sm, 8px)',
                    fontSize: 10, fontWeight: 900,
                    background: activeStatus === f.key ? 'rgb(var(--primary))' : 'rgba(var(--bg-elevated), 0.4)',
                    color: activeStatus === f.key ? 'white' : 'rgb(var(--text-muted))',
                    boxShadow: activeStatus === f.key ? '0 4px 12px rgba(var(--primary), 0.25)' : 'none',
                  }}
                >
                  {f.label}
                  <span className="tabular-nums" style={{ padding: '1px 6px', borderRadius: 'var(--theme-radius-sm, 6px)', fontSize: 9, fontWeight: 900, background: activeStatus === f.key ? 'rgba(255,255,255,0.2)' : 'rgba(var(--bg-app), 0.6)' }}>
                    {f.count}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ width: 1, height: 20, background: 'rgba(var(--border-color), 0.15)' }} />
            <div className="flex items-center gap-1">
              {['ALL', ...stations.map(s => s.name)].map(station => {
                const isActive = activeStations.has(station as Station);
                const load = station !== 'ALL' ? stationWorkload[station] || 0 : totalStationLoad;
                return (
                  <button key={station} onClick={() => toggleStation(station as Station)}
                    className="flex items-center gap-1 uppercase tracking-wider transition-all duration-200"
                    style={{ padding: '5px 10px', borderRadius: 'var(--theme-radius-sm, 8px)', fontSize: 9, fontWeight: 900, background: isActive ? 'rgba(var(--success), 0.12)' : 'transparent', color: isActive ? 'rgb(var(--success))' : 'rgb(var(--text-muted))', border: isActive ? '1px solid rgba(var(--success), 0.25)' : '1px solid transparent' }}
                  >
                    {station}
                    {load > 0 && <span className="flex items-center justify-center tabular-nums" style={{ width: 18, height: 18, borderRadius: '50%', fontSize: 8, fontWeight: 900, background: load > 5 ? 'rgba(var(--danger), 0.2)' : 'rgba(var(--bg-elevated), 0.8)', color: load > 5 ? 'rgb(var(--danger))' : 'inherit' }}>{load}</span>}
                  </button>
                );
              })}
            </div>
            {totalStationLoad > 0 && (
              <>
                <div style={{ width: 1, height: 20, background: 'rgba(var(--border-color), 0.15)' }} />
                <div className="flex items-center gap-2 ml-auto">
                  <span className="flex items-center gap-1 uppercase tracking-widest" style={{ fontSize: 9, fontWeight: 700, color: 'rgb(var(--text-muted))' }}><AlertTriangle size={10} /> {kdsText(isArabic, 'Load', 'الحمل')}</span>
                  <div className="flex items-end gap-px" style={{ height: 16 }}>
                    {stations.map(st => {
                      const load = stationWorkload[st.name] || 0;
                      if (load === 0) return null;
                      const pct = Math.min(100, (load / maxStationLoad) * 100);
                      return (<div key={st.name} title={`${st.name}: ${load}`}><div className="rounded-full transition-all" style={{ width: 5, height: `${Math.max(4, pct * 0.16)}px`, background: load > 5 ? 'rgb(var(--danger))' : load > 3 ? 'rgb(var(--warning))' : 'rgb(var(--success))' }} /></div>);
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ??? KANBAN COLUMNS ??? */}
          <div className={`flex-1 min-h-0 flex ${isArabic ? 'flex-row-reverse' : 'flex-row'} gap-2.5 p-2.5`}>
            {showPending && <KanbanColumn theme={COLUMN_THEMES.PENDING} themeKey="PENDING" orders={pendingOrders} actionLabel={kdsText(isArabic, 'Complete oldest', 'إنهاء الأقدم')} actionIcon={<CheckCircle size={12} />} onAction={pendingOrders.length > 0 ? () => completeKitchenOrder(pendingOrders[0]) : undefined} getElapsedMins={getElapsedMins} getTimerUrgency={getTimerUrgency} advanceOrder={completeKitchenOrder} getStationForItem={getStationForItem} toggleItemState={toggleItemState} isArabic={isArabic} pendingBump={pendingBump} highlightedId={highlightedIdx >= 0 ? activeOrders[highlightedIdx]?.id : null} />}
            {showPreparing && <KanbanColumn theme={COLUMN_THEMES.PREPARING} themeKey="PREPARING" orders={preparingOrders} actionLabel={kdsText(isArabic, 'Complete oldest', 'إنهاء الأقدم')} actionIcon={<CheckCircle size={12} />} onAction={preparingOrders.length > 0 ? () => completeKitchenOrder(preparingOrders[0]) : undefined} getElapsedMins={getElapsedMins} getTimerUrgency={getTimerUrgency} advanceOrder={completeKitchenOrder} getStationForItem={getStationForItem} toggleItemState={toggleItemState} isArabic={isArabic} pendingBump={pendingBump} highlightedId={highlightedIdx >= 0 ? activeOrders[highlightedIdx]?.id : null} />}
            {showReady && <KanbanColumn theme={COLUMN_THEMES.READY} themeKey="READY" orders={readyOrders} actionLabel={kdsText(isArabic, 'Deliver all', 'تسليم الكل')} actionIcon={<Truck size={12} />} onAction={readyOrders.length > 0 ? completeReadyBatch : undefined} getElapsedMins={getElapsedMins} getTimerUrgency={getTimerUrgency} advanceOrder={completeKitchenOrder} getStationForItem={getStationForItem} toggleItemState={toggleItemState} isArabic={isArabic} pendingBump={pendingBump} highlightedId={highlightedIdx >= 0 ? activeOrders[highlightedIdx]?.id : null} />}
          </div>
        </>
      )}

      {/* ??? Undo Toasts ??? */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 pointer-events-none">
        <AnimatePresence>
            {recentBumps.map(bump => (
                <motion.div
                    key={bump.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl pointer-events-auto shadow-2xl"
                    style={{ background: 'rgb(var(--bg-card))', border: '1px solid rgba(var(--border-color), 0.2)' }}
                >
                    <span className="uppercase text-sm font-bold text-[rgb(var(--success))]">{kdsText(isArabic, 'Ticket marked ready', 'تم تجهيز التذكرة')}</span>
                    <button
                        onClick={() => handleUndoBump(bump.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg uppercase tracking-wider text-xs font-black transition-colors"
                        style={{ background: 'rgba(var(--warning), 0.1)', color: 'rgb(var(--warning))' }}
                    >
                        <X size={14} /> {kdsText(isArabic, 'Undo', 'تراجع')}
                    </button>
                </motion.div>
            ))}
        </AnimatePresence>
      </div>

      {/* ??? Station Settings Modal ??? */}
      <AnimatePresence>
        {showStationSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}
            onClick={() => setShowStationSettings(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', duration: 0.15 }}
              className="w-full max-w-lg space-y-4 overflow-y-auto pos-scroll"
              style={{
                background: 'rgb(var(--bg-card))',
                borderRadius: 'var(--theme-radius-lg, 16px)',
                border: '1px solid rgba(var(--border-color), 0.25)',
                 maxHeight: 'calc(100dvh - 1rem)',
                 padding: 20,
                boxShadow: 'var(--theme-shadow-elevated)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center pb-4" style={{ borderBottom: '1px solid rgba(var(--border-color), 0.15)' }}>
                <h3 className="flex items-center gap-2 uppercase tracking-wider" style={{ fontSize: 14, fontWeight: 900, color: 'rgb(var(--text-main))' }}>
                  <Settings size={16} style={{ color: 'rgb(var(--primary))' }} /> {kdsText(isArabic, 'Routing Stations', 'محطات التوجيه')}
                </h3>
                <button
                  onClick={() => setShowStationSettings(false)}
                  className="flex items-center justify-center transition-colors"
                  style={{
                    width: 32, height: 32,
                    borderRadius: 'var(--theme-radius-sm, 8px)',
                    background: 'rgba(var(--bg-elevated), 0.5)',
                    color: 'rgb(var(--text-muted))',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="space-y-2.5 overflow-y-auto pr-1" style={{ maxHeight: '60vh' }}>
                {/* Display: local theme + voice announcement */}
                <div style={{ background: 'rgba(var(--bg-elevated), 0.5)', borderRadius: 'var(--theme-radius, 12px)', padding: 14, border: '1px solid rgba(var(--border-color), 0.15)' }}>
                  <p className="uppercase" style={{ color: 'rgb(var(--text-main))', fontWeight: 900, fontSize: 12, marginBottom: 10 }}>
                    {kdsText(isArabic, 'Display', 'الشاشة')}
                  </p>
                  <div className="flex items-center gap-1.5" style={{ marginBottom: 10 }}>
                    {([
                      { key: 'auto' as const, label: isArabic ? 'تلقائي' : 'AUTO', icon: <Sparkles size={13} /> },
                      { key: 'dark' as const, label: isArabic ? 'داكن' : 'DARK', icon: <Moon size={13} /> },
                      { key: 'light' as const, label: isArabic ? 'فاتح' : 'LIGHT', icon: <Sun size={13} /> },
                    ]).map(option => {
                      const isActive = kdsTheme === option.key;
                      return (
                        <button
                          key={option.key}
                          onClick={() => setKdsThemeMode(option.key)}
                          className="flex flex-1 items-center justify-center gap-1.5 uppercase"
                          style={{
                            padding: '8px 6px', borderRadius: 'var(--theme-radius-sm, 8px)',
                            fontSize: 10, fontWeight: 900,
                            background: isActive ? 'rgba(var(--warning), 0.14)' : 'transparent',
                            color: isActive ? 'rgb(var(--warning))' : 'rgb(var(--text-muted))',
                            border: `1px solid ${isActive ? 'rgba(var(--warning), 0.3)' : 'rgba(var(--border-color), 0.2)'}`,
                          }}
                        >
                          {option.icon}
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={toggleVoice}
                    className="flex w-full items-center justify-between"
                    style={{
                      padding: '9px 12px', borderRadius: 'var(--theme-radius-sm, 8px)',
                      background: voiceEnabled ? 'rgba(var(--success), 0.1)' : 'rgba(var(--bg-elevated), 0.4)',
                      border: `1px solid ${voiceEnabled ? 'rgba(var(--success), 0.25)' : 'rgba(var(--border-color), 0.2)'}`,
                    }}
                  >
                    <span className="flex items-center gap-2" style={{ fontSize: 11, fontWeight: 900, color: 'rgb(var(--text-main))' }}>
                      {voiceEnabled ? <Volume2 size={14} style={{ color: 'rgb(var(--success))' }} /> : <VolumeX size={14} style={{ color: 'rgb(var(--text-muted))' }} />}
                      {kdsText(isArabic, 'Voice announcement (order number)', 'الإعلان الصوتي (رقم الأوردر)')}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 900, color: voiceEnabled ? 'rgb(var(--success))' : 'rgb(var(--text-muted))' }}>
                      {voiceEnabled ? (isArabic ? 'يعمل' : 'ON') : (isArabic ? 'متوقف' : 'OFF')}
                    </span>
                  </button>
                </div>
                <p className="text-xs font-bold leading-relaxed text-muted">
                  {kdsText(isArabic, 'Stations come from active printer routing for this branch.', 'المحطات تُقرأ من توجيه الطابعات الفعّال لهذا الفرع.')}
                </p>
                {stations.map((s) => (
                  <div
                    key={s.name}
                    style={{
                      background: 'rgba(var(--bg-elevated), 0.5)',
                      borderRadius: 'var(--theme-radius, 12px)',
                      padding: 14,
                      border: '1px solid rgba(var(--border-color), 0.15)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <ChefHat size={15} style={{ color: 'rgb(var(--primary))' }} />
                      <span className="uppercase" style={{ color: 'rgb(var(--text-main))', fontWeight: 900, fontSize: 13 }}>
                        {s.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ???????????????????????????????????????????????????
   ?? Kanban Column — Themed, memoized
   ??????????????????????????????????????????????????? */
const KanbanColumn = React.memo(({
  theme, themeKey, orders, actionLabel, actionIcon, onAction,
  getElapsedMins, getTimerUrgency, advanceOrder, getStationForItem, toggleItemState, isArabic, pendingBump, highlightedId,
}: any) => {
  const copy = columnCopy(themeKey, isArabic);
  return (
  <div
    className="flex-1 flex flex-col overflow-hidden"
    style={{
      borderRadius: 'var(--theme-radius-lg, 16px)',
      border: '1px solid rgba(var(--border-color), 0.12)',
      background: 'rgba(var(--bg-card), 0.45)',
      backdropFilter: 'blur(var(--theme-blur, 12px))',
      boxShadow: 'var(--theme-shadow-card)',
    }}
  >
    {/* Column Header */}
    <div
      className="shrink-0 flex items-center justify-between px-4 py-3"
      style={{
        background: `linear-gradient(135deg, rgba(var(${theme.token}), 0.12), rgba(var(${theme.token}), 0.04))`,
        borderBottom: '1px solid rgba(var(--border-color), 0.1)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <span style={{ color: `rgb(var(${theme.token}))` }}>{theme.icon}</span>
        <div>
          <div className="flex items-center gap-2">
              <h2 className="uppercase tracking-wider" style={{ fontSize: 13, fontWeight: 900, color: `rgb(var(${theme.token}))` }}>
              {copy.label}
            </h2>
            <span
              className="tabular-nums"
              style={{
                padding: '2px 8px',
                borderRadius: 'var(--theme-radius-sm, 6px)',
                fontSize: 10, fontWeight: 900,
                background: `rgba(var(${theme.token}), 0.12)`,
                color: `rgb(var(${theme.token}))`,
                border: `1px solid rgba(var(${theme.token}), 0.2)`,
              }}
            >
              {orders.length}
            </span>
          </div>
          <p className="uppercase tracking-widest" style={{ fontSize: 9, fontWeight: 700, color: 'rgb(var(--text-muted))' }}>
            {copy.subtitle}
          </p>
        </div>
      </div>
      {onAction && (
        <button
          onClick={onAction}
          className="flex items-center gap-1 uppercase tracking-wider active:scale-95 transition-all"
          style={{
            padding: '10px 16px',
            borderRadius: 'var(--theme-radius, 10px)',
            fontSize: 12, fontWeight: 900,
            minHeight: 44,
            background: `linear-gradient(135deg, rgb(var(${theme.token})), rgba(var(${theme.token}), 0.8))`,
            color: 'white',
            boxShadow: `0 4px 12px rgba(var(${theme.token}), 0.3)`,
          }}
        >
          {actionIcon} {actionLabel}
        </button>
      )}
    </div>

    {/* Scrollable ticket area */}
    <div className="flex-1 overflow-y-auto p-2.5 space-y-2 no-scrollbar relative">
      <AnimatePresence mode="sync">
        {orders.map((order: any) => (
          <TicketCard
            key={order.id}
            order={order}
            getElapsedMins={getElapsedMins}
            getTimerUrgency={getTimerUrgency}
            advanceOrder={advanceOrder}
            getStationForItem={getStationForItem}
            toggleItemState={toggleItemState}
            isArabic={isArabic}
            isPendingBump={pendingBump === order.id}
            isHighlighted={highlightedId === order.id}
          />
        ))}
      </AnimatePresence>
      {orders.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-16 opacity-25">
          <UtensilsCrossed size={32} style={{ color: 'rgb(var(--text-muted))' }} />
          <p className="uppercase tracking-widest mt-3" style={{ fontSize: 10, fontWeight: 900, color: 'rgb(var(--text-muted))' }}>
            {kdsText(isArabic, 'No tickets', 'لا توجد تذاكر')}
          </p>
          <p className="mt-1" style={{ fontSize: 9, fontWeight: 600, color: 'rgb(var(--text-muted))', opacity: 0.6 }}>
            {kdsText(isArabic, 'Orders will appear here', 'الطلبات ستظهر هنا')}
          </p>
        </div>
      )}
    </div>
  </div>
  );
});

const TableOrTypeLabel = ({ order, isArabic }: { order: KdsTicket; isArabic: boolean }) => {
  const tableName = getTableDisplayName(order);
  return (
    <>
      <span className="block uppercase tracking-widest" style={{ fontSize: 9, fontWeight: 700, color: 'rgb(var(--text-muted))' }}>
        {tableName ? kdsText(isArabic, 'Table', 'طاولة') : kdsText(isArabic, 'Type', 'النوع')}
      </span>
      <span className="uppercase leading-none" style={{ fontSize: 15, fontWeight: 900, color: 'rgb(var(--primary))' }}>
        {tableName || order.type}
      </span>
    </>
  );
};

/**
 * Kitchen item details: size badge + grouped extras + per-item note.
 * Sizes and extras were previously rendered as one faint "+ ..." line and
 * sizes were dropped entirely on the server — now each is visually distinct.
 */
const KdsItemDetails = React.memo(({ item, isArabic, station }: { item: any; isArabic: boolean; station?: string }) => {
  const rawSize = getKdsItemSize(item);
  const sizeFromMods = (getKdsItemModifiers(item) || []).find((label) => label.startsWith('__SIZE__:'));
  const size = rawSize || (sizeFromMods ? sizeFromMods.replace('__SIZE__:', '') : '');
  const groups = getKdsItemModifierGroups(item);
  const note = getKdsItemNotes(item);
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex items-start justify-between gap-1.5">
        <span className="uppercase line-clamp-2 leading-snug" style={{ fontSize: 14, fontWeight: 900, color: 'rgb(var(--text-main))' }}>
          {getKdsItemDisplayName(item)}
        </span>
        {station && (
          <span
            className="shrink-0 mt-0.5 uppercase tracking-widest"
            style={{
              padding: '1px 4px',
              borderRadius: 'var(--theme-radius-sm, 4px)',
              fontSize: 7, fontWeight: 900,
              background: 'rgba(var(--bg-app), 0.8)',
              color: 'rgb(var(--text-muted))',
              border: '1px solid rgba(var(--border-color), 0.15)',
            }}
          >
            {station}
          </span>
        )}
      </div>

      {size ? (
        <span
          className="mt-1 inline-flex w-fit items-center uppercase tracking-widest"
          style={{
            padding: '2px 8px',
            borderRadius: 'var(--theme-radius-sm, 6px)',
            fontSize: 11, fontWeight: 900,
            background: 'rgba(var(--primary), 0.16)',
            color: 'rgb(var(--primary))',
            border: '1px solid rgba(var(--primary), 0.35)',
          }}
        >
          {kdsText(isArabic, 'Size', 'الحجم')}: {size}
        </span>
      ) : null}

      {groups.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1 rounded-lg p-1.5" style={{ background: 'rgba(var(--warning), 0.08)', border: '1px solid rgba(var(--warning), 0.22)' }}>
          {groups.map((group, gIdx) => (
            <div key={gIdx} className="flex flex-col">
              {group.group ? (
                <span className="uppercase tracking-widest" style={{ fontSize: 9, fontWeight: 900, color: 'rgb(var(--warning))' }}>
                  {group.group}
                </span>
              ) : null}
              {group.options.map((option, oIdx) => (
                <span key={oIdx} className="uppercase leading-snug" style={{ fontSize: 12, fontWeight: 800, color: 'rgb(var(--text-main))' }}>
                  + {option}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
      {note ? (
        <span
          className="mt-1 block uppercase leading-snug rounded-md px-1.5 py-1"
          style={{
            background: 'rgba(var(--danger), 0.08)',
            borderLeft: '2px solid rgba(var(--danger), 0.6)',
            color: 'rgb(var(--danger))',
            fontSize: 11, fontWeight: 800,
          }}
        >
          ! {note}
        </span>
      ) : null}
    </div>
  );
});

/* ???????????????????????????????????????????????????
   ?? Ticket Card — Themed, with progress bar
   ??????????????????????????????????????????????????? */
const TicketCard = React.memo(({ order, getElapsedMins, getTimerUrgency, advanceOrder, getStationForItem, toggleItemState, isArabic, isPendingBump, isHighlighted }: any) => {
  const elapsed = getElapsedMins(order.createdAt);
  const urgency = getTimerUrgency(elapsed, order.status);
  const isReady = order.status === OrderStatus.READY;
  const pendingItemsCount = (order.items || []).filter((item: any) => !isKdsItemDone(item)).length;

  // Progress bar: 0-100% based on SLA critical threshold
  const progressPct = Math.min(100, (elapsed / SLA.critical) * 100);

  const isRush = order.priority === 'RUSH';
  const isRemake = order.priority === 'REMAKE';

  // 3-step urgency scale readable at distance: warning (amber) → risk
  // (orange, thicker border) → critical (red pulse). Risk previously shared
  // danger red with critical, making 12m and 20m indistinguishable.
  const urgencyToken = (isRush || isRemake) ? '--danger'
    : urgency === 'critical' ? '--danger'
    : urgency === 'risk' ? '--warning'
      : urgency === 'warning' ? '--warning'
        : urgency === 'ready' ? '--success'
          : '--success';
  const urgencyPulse = urgency === 'critical' || isRush || isRemake;

  const cardBg = isReady
    ? 'rgba(var(--success), 0.06)'
    : urgency === 'critical'
      ? 'rgba(var(--danger), 0.10)'
      : urgency === 'risk'
        ? 'rgba(var(--warning), 0.10)'
        : 'rgba(var(--bg-elevated), 0.5)';

  const cardBorder = isReady
    ? 'rgba(var(--success), 0.2)'
    : urgencyPulse
      ? 'rgba(var(--danger), 0.5)'
      : urgency === 'risk'
        ? '2px solid rgba(var(--warning), 0.55)'
        : 'rgba(var(--border-color), 0.15)';

  const markAllDone = React.useCallback(async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (pendingItemsCount === 0) return;
    await markPendingItemsDone(order, toggleItemState);
  }, [order, pendingItemsCount, toggleItemState]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.96, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', duration: 0.15 }}
      className="kds-ticket w-full text-left block overflow-hidden transition-all group backdrop-blur-xl"
      data-urgency={isReady ? 'ready' : (urgency || 'normal')}
      style={{
        contentVisibility: 'auto',
        borderRadius: 'var(--theme-radius, 12px)',
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        outline: isPendingBump ? `2px solid rgb(var(--primary))` : isHighlighted ? `2px solid rgb(var(--accent))` : 'none',
        outlineOffset: isPendingBump || isHighlighted ? 2 : 0,
        boxShadow: urgencyPulse ? '0 0 30px rgba(var(--danger), 0.3)' : urgency === 'risk' ? '0 0 18px rgba(var(--warning), 0.22)' : isReady ? '0 0 20px rgba(var(--success), 0.15)' : '0 4px 20px rgba(0,0,0,0.1)',
      }}
    >
      {/* ?? Progress bar at top ?? */}
      <div style={{ height: 3, background: 'rgba(var(--border-color), 0.1)', position: 'relative', overflow: 'hidden' }}>
        <div
          className="transition-all duration-1000"
          style={{
            position: 'absolute', top: 0, left: 0, height: '100%',
            width: `${isReady ? 100 : progressPct}%`,
            background: isReady
              ? `rgb(var(--success))`
              : `linear-gradient(90deg, rgb(var(--success)), rgb(var(${urgencyToken})))`,
            borderRadius: '0 2px 2px 0',
          }}
        />
      </div>

      {/* ?? Timer + Type strip ?? */}
      <div
        className="flex justify-between items-center px-3 py-1.5"
        style={{
          background: `rgba(var(${urgencyToken}), ${urgency === 'critical' ? 0.15 : 0.08})`,
        }}
      >
        <div className="flex items-center gap-1 tabular-nums uppercase" style={{ fontSize: urgency === 'risk' || urgency === 'critical' ? 15 : 12, fontWeight: 900, color: `rgb(var(${urgencyToken}))` }}>
          <Clock size={urgency === 'risk' || urgency === 'critical' ? 14 : 12} /> {elapsed}m
          {urgencyPulse && <span className="animate-pulse">!</span>}
          {urgency === 'risk' && !urgencyPulse && <span>•</span>}
        </div>
        <div className="uppercase tracking-widest flex items-center gap-2" style={{ fontSize: 9, fontWeight: 900, color: `rgb(var(${urgencyToken}))`, opacity: 0.8 }}>
          {isRemake && <span className="bg-red-500 text-white px-1.5 py-0.5 rounded opacity-100">{kdsText(isArabic, 'Remake', 'إعادة')}</span>}
          {isRush && <span className="bg-red-500 text-white px-1.5 py-0.5 rounded opacity-100 animate-pulse">{kdsText(isArabic, 'Rush', 'عاجل')}</span>}
          <span>{orderTypeLabel(order.type, isArabic)}</span>
        </div>
      </div>

      {/* ?? Order identifiers ?? */}
      <div
        className="flex justify-between items-center px-3 py-2"
        style={{ borderBottom: '1px solid rgba(var(--border-color), 0.08)' }}
      >
        <div>
          <span className="block uppercase tracking-widest" style={{ fontSize: 9, fontWeight: 700, color: 'rgb(var(--text-muted))' }}>
            {order.orderNumber ? `${kdsText(isArabic, 'Order', 'طلب')} #${order.orderNumber}` : kdsText(isArabic, 'Order', 'طلب')}
          </span>
          <span
            className="uppercase tracking-tight leading-none tabular-nums"
            style={{
              fontSize: '1.75rem', fontWeight: 900,
              color: isReady ? 'rgb(var(--success))' : 'rgb(var(--text-main))',
            }}
          >
            {formatDisplayId(order)}
          </span>
        </div>
        <div className="text-right">
          <TableOrTypeLabel order={order} isArabic={isArabic} />
        </div>
      </div>

      {/* ?? Notes ?? */}
      {(order.kitchenNotes || order.notes) && (
        <div
          className="flex items-start gap-1 px-3 py-1.5 uppercase leading-snug"
          style={{
            background: 'rgba(var(--warning), 0.06)',
            borderBottom: '1px solid rgba(var(--warning), 0.1)',
            color: 'rgb(var(--warning))',
            fontSize: 10, fontWeight: 700,
          }}
        >
          <span className="shrink-0 mt-px">!</span>
          <span className="line-clamp-2">{order.kitchenNotes || order.notes}</span>
        </div>
      )}

      {/* ?? Items ?? */}
      <div style={{ padding: 10 }}>
        <ul className="space-y-1.5">
          {order.items.map((item: any, idx: number) => {
            const isDone = item._done || item.isBumped;

            return (
              <li key={idx} className={`flex gap-2 transition-colors ${isDone ? 'opacity-30' : ''}`}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleItemState(getKdsItemTicketId(order, item), item.id);
                  }}
                  className="shrink-0 flex items-center justify-center transition-all"
                  style={{
                    width: 40, height: 40,
                      minWidth: 40,
                      minHeight: 40,
                    borderRadius: 'var(--theme-radius-sm, 6px)',
                    fontSize: 13, fontWeight: 900,
                    background: isDone ? 'rgb(var(--success))' : item.quantity > 1 ? 'rgba(var(--primary), 0.1)' : 'rgba(var(--bg-elevated), 0.6)',
                    border: `1px solid ${isDone ? 'rgb(var(--success))' : item.quantity > 1 ? 'rgba(var(--primary), 0.3)' : 'rgba(var(--border-color), 0.25)'}`,
                    color: isDone ? 'white' : item.quantity > 1 ? 'rgb(var(--primary))' : 'rgb(var(--text-main))',
                  }}
                  title={kdsText(isArabic, 'Mark item done', 'تعليم الصنف كمكتمل')}
                >
                  {isDone ? 'OK' : item.quantity}
                </button>
                <div className={isDone ? 'flex-1 min-w-0 line-through' : 'flex-1 min-w-0'}>
                  <KdsItemDetails item={item} isArabic={isArabic} station={getStationForItem(item, order)} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ?? Footer — Bump hint ?? */}
      <div className="px-3 pb-2">
<button
          type="button"
          onClick={markAllDone}
          disabled={pendingItemsCount === 0}
          className="w-full flex items-center justify-center gap-1.5 uppercase transition-all"
          style={{
            minHeight: 44,
            borderRadius: 'var(--theme-radius-sm, 8px)',
            fontSize: 12,
            fontWeight: 900,
            background: pendingItemsCount === 0 ? 'rgba(var(--success), 0.1)' : 'rgba(var(--success), 0.16)',
            color: pendingItemsCount === 0 ? 'rgba(var(--success), 0.7)' : 'rgb(var(--success))',
            border: '1px solid rgba(var(--success), 0.22)',
            cursor: pendingItemsCount === 0 ? 'default' : 'pointer',
          }}
          title={isArabic ? (pendingItemsCount === 0 ? 'كل الأصناف مكتملة' : 'تعليم كل أصناف الطلب كمكتملة') : (pendingItemsCount === 0 ? 'All items already done' : 'Mark every item in this order as done')}
        >
          <CheckCircle size={14} />
          {pendingItemsCount === 0
            ? (isArabic ? 'كل الأصناف مكتملة' : 'ALL ITEMS DONE')
            : (isArabic ? `إنهاء الكل (${pendingItemsCount})` : `MARK ALL DONE (${pendingItemsCount})`)}
        </button>
      </div>

      <button
        type="button"
        onClick={() => advanceOrder(order)}
        className="w-full py-3.5 text-center uppercase transition-all active:scale-[0.99]"
        style={{
          minHeight: 56,
          fontSize: 13, fontWeight: 900, letterSpacing: '0.15em',
          background: isPendingBump
            ? 'rgb(var(--primary))'
            : isReady
              ? 'rgba(var(--success), 0.12)'
              : 'rgba(var(--bg-elevated), 0.3)',
          color: isPendingBump
            ? 'white'
            : isReady
              ? 'rgb(var(--success))'
              : 'rgb(var(--text-muted))',
        }}
      >
        {isReady
          ? kdsText(isArabic, 'Deliver order', 'تسليم الطلب')
          : kdsText(isArabic, 'Complete order', 'إنهاء الطلب')}
      </button>
    </motion.div>
  );
});

/* ???????????????????????????????????????????????????
   ? Simple Grid — Flat view, one-tap-to-complete
   ??????????????????????????????????????????????????? */
const SimpleGrid = React.memo(({ orders, readyOrders, getElapsedMins, getTimerUrgency, getStationForItem, updateOrderStatus, toggleItemState, isArabic }: any) => {
  const allOrders = React.useMemo(() => [...orders, ...readyOrders], [orders, readyOrders]);

  // Chain through proper status transitions: PENDING -> PREPARING -> READY
  const completeOrder = React.useCallback(async (order: any) => {
    try {
      await updateOrderStatus(order);
    } catch { /* ignore if already transitioned */ }
  }, [updateOrderStatus]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 no-scrollbar">
      {allOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full opacity-25">
          <UtensilsCrossed size={48} style={{ color: 'rgb(var(--text-muted))' }} />
          <p className="uppercase mt-4" style={{ fontSize: 14, fontWeight: 900, letterSpacing: isArabic ? 0 : '0.2em', color: 'rgb(var(--text-muted))' }}>
            {isArabic ? 'لا توجد طلبات نشطة' : 'No active orders'}
          </p>
          <p className="mt-1" style={{ fontSize: 11, color: 'rgb(var(--text-muted))', opacity: 0.6 }}>
            {isArabic ? 'الطلبات الجديدة ستظهر هنا تلقائيا' : 'New orders will appear here automatically'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          <AnimatePresence mode="sync">
            {allOrders.map((order: any) => {
              const elapsed = getElapsedMins(order.createdAt);
              const urgency = getTimerUrgency(elapsed, order.status);
              const isReady = order.status === OrderStatus.READY;
              const urgencyToken = urgency === 'critical' ? '--danger' : urgency === 'risk' ? '--danger' : urgency === 'warning' ? '--warning' : urgency === 'ready' ? '--success' : '--success';
              const pendingItemsCount = (order.items || []).filter((item: any) => !isKdsItemDone(item)).length;

              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                  className="overflow-hidden transition-all hover:scale-[1.01]"
                  style={{
                    contentVisibility: 'auto',
                    borderRadius: 'var(--theme-radius-lg, 16px)',
                    background: isReady ? 'rgba(var(--success), 0.08)' : urgency === 'critical' ? 'rgba(var(--danger), 0.06)' : 'rgba(var(--bg-card), 0.65)',
                    border: `2px solid ${isReady ? 'rgba(var(--success), 0.3)' : urgency === 'critical' ? 'rgba(var(--danger), 0.3)' : 'rgba(var(--border-color), 0.15)'}`,
                    backdropFilter: 'blur(var(--theme-blur, 8px))',
                    boxShadow: urgency === 'critical' ? '0 0 24px rgba(var(--danger), 0.12)' : 'var(--theme-shadow-card)',
                  }}
                >
                  {/* Progress bar */}
                  <div style={{ height: 4, background: 'rgba(var(--border-color), 0.08)' }}>
                    <div className="transition-all duration-1000" style={{
                      height: '100%',
                      width: `${isReady ? 100 : Math.min(100, (elapsed / SLA.critical) * 100)}%`,
                      background: isReady ? 'rgb(var(--success))' : `linear-gradient(90deg, rgb(var(--success)), rgb(var(${urgencyToken})))`,
                    }} />
                  </div>

                  {/* ?? BIG ORDER NUMBER ?? */}
                  <div className="px-4 pt-3 pb-2 flex items-start justify-between">
                    <div>
                      <span className="block uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 700, color: 'rgb(var(--text-muted))' }}>
                        {orderTypeLabel(order.type, isArabic)}
                      </span>
                      <span className="block tabular-nums" style={{
                        fontSize: '2.5rem', fontWeight: 900, lineHeight: 1,
                        color: isReady ? 'rgb(var(--success))' : 'rgb(var(--text-main))',
                        letterSpacing: '-0.02em',
                      }}>
                        {formatDisplayId(order)}
                      </span>
                    </div>
                    <div className="text-right">
                      {/* Timer */}
                      <div className="flex items-center gap-1 justify-end tabular-nums" style={{
                        fontSize: 13, fontWeight: 900,
                        color: `rgb(var(${urgencyToken}))`,
                      }}>
                        <Clock size={14} />
                        {elapsed}m
                        {urgency === 'critical' && <span className="animate-pulse">!</span>}
                      </div>
                      {/* Table/Mode */}
                      {(() => {
                        const tableName = getTableDisplayName(order);
                        return tableName ? (
                          <span className="block mt-1 uppercase" style={{ fontSize: 11, fontWeight: 900, color: 'rgb(var(--primary))' }}>
                            {kdsText(isArabic, 'Table', 'طاولة')} {tableName}
                          </span>
                        ) : null;
                      })()}
                      {/* Status badge */}
                      <span className="inline-block mt-1 uppercase tracking-wider" style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--theme-radius-sm, 6px)',
                        fontSize: 9, fontWeight: 900,
                        background: isReady ? 'rgba(var(--success), 0.15)' : `rgba(var(${urgencyToken}), 0.12)`,
                        color: isReady ? 'rgb(var(--success))' : `rgb(var(${urgencyToken}))`,
                      }}>
                        {statusLabel(order.status, isArabic)}
                      </span>
                    </div>
                  </div>

                  {/* ?? Notes ?? */}
                  {(order.kitchenNotes || order.notes) && (
                    <div className="mx-4 mb-2 flex items-start gap-1.5 uppercase" style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--theme-radius-sm, 8px)',
                      background: 'rgba(var(--warning), 0.08)',
                      border: '1px solid rgba(var(--warning), 0.15)',
                      color: 'rgb(var(--warning))',
                      fontSize: 11, fontWeight: 700, lineHeight: 1.4,
                    }}>
                      <span className="shrink-0">!</span>
                      <span className="line-clamp-3">{order.kitchenNotes || order.notes}</span>
                    </div>
                  )}

                  {/* ?? Items list ?? */}
                  <div className="px-4 pb-2" style={{ borderTop: '1px solid rgba(var(--border-color), 0.08)', paddingTop: 8 }}>
                    {order.items.map((item: any, idx: number) => {
                      const isDone = item._done || item.isBumped;
                      return (
                        <div key={idx} className={`flex items-start gap-2 py-1 transition-colors ${isDone ? 'opacity-30' : ''}`} onClick={(e) => {
                          e.stopPropagation();
                          toggleItemState(getKdsItemTicketId(order, item), item.id);
                        }}>
                          <span className="shrink-0 flex items-center justify-center tabular-nums cursor-pointer" style={{
                            width: 24, height: 24,
                            borderRadius: 'var(--theme-radius-sm, 6px)',
                            fontSize: 13, fontWeight: 900,
                            background: isDone ? 'rgb(var(--success))' : item.quantity > 1 ? 'rgba(var(--primary), 0.12)' : 'rgba(var(--bg-elevated), 0.6)',
                            color: isDone ? 'white' : item.quantity > 1 ? 'rgb(var(--primary))' : 'rgb(var(--text-main))',
                            border: `1px solid ${isDone ? 'rgb(var(--success))' : item.quantity > 1 ? 'rgba(var(--primary), 0.2)' : 'rgba(var(--border-color), 0.2)'}`,
                          }}>
                            {isDone ? 'OK' : item.quantity}
                          </span>
                          <div className={isDone ? 'flex-1 min-w-0 line-through' : 'flex-1 min-w-0'}>
                            <KdsItemDetails item={item} isArabic={isArabic} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="px-4 pb-2">
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (pendingItemsCount === 0) return;
                        await markPendingItemsDone(order, toggleItemState);
                      }}
                      disabled={pendingItemsCount === 0}
                      className="w-full flex items-center justify-center gap-1.5 uppercase transition-all"
                      style={{
                        minHeight: 34,
                        borderRadius: 'var(--theme-radius-sm, 8px)',
                        fontSize: 10,
                        fontWeight: 900,
                        background: pendingItemsCount === 0 ? 'rgba(var(--success), 0.1)' : 'rgba(var(--success), 0.16)',
                        color: pendingItemsCount === 0 ? 'rgba(var(--success), 0.7)' : 'rgb(var(--success))',
                        border: '1px solid rgba(var(--success), 0.22)',
                        cursor: pendingItemsCount === 0 ? 'default' : 'pointer',
                      }}
                      title={isArabic ? (pendingItemsCount === 0 ? 'كل الأصناف مكتملة' : 'تعليم كل أصناف الطلب كمكتملة') : (pendingItemsCount === 0 ? 'All items already done' : 'Mark every item in this order as done')}
                    >
                      <CheckCircle size={14} />
                      {pendingItemsCount === 0
                        ? (isArabic ? 'كل الأصناف مكتملة' : 'ALL ITEMS DONE')
                        : (isArabic ? `إنهاء الكل (${pendingItemsCount})` : `MARK ALL DONE (${pendingItemsCount})`)}
                    </button>
                  </div>

                  {/* ?? Footer ?? */}
                  <button
                    type="button"
                    onClick={() => completeOrder(order)}
                    className="w-full py-3.5 text-center uppercase active:scale-[0.99]"
                    style={{
                    minHeight: 56,
                    fontSize: 13, fontWeight: 900, letterSpacing: '0.15em',
                    background: isReady ? 'rgba(var(--success), 0.12)' : 'rgba(var(--bg-elevated), 0.3)',
                    color: isReady ? 'rgb(var(--success))' : 'rgb(var(--text-muted))',
                  }}>
                    {isReady
                      ? kdsText(isArabic, 'Deliver order', 'تسليم الطلب')
                      : kdsText(isArabic, 'Complete order', 'إنهاء الطلب')}
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
});

const SummaryGrid = React.memo(({ orders, isArabic }: any) => {
  const itemSummaries = React.useMemo(() => {
    const hash: Record<string, { name: string; size: string; quantity: number; mods: any[] }> = {};
    for (const order of orders) {
      for (const item of order.items || []) {
        if (item.isBumped) continue;
        const mods = getKdsItemModifiers(item).filter((label) => !label.startsWith('__SIZE__:'));
        const size = getKdsItemSize(item)
          || (getKdsItemModifiers(item).find((label) => label.startsWith('__SIZE__:')) || '').replace('__SIZE__:', '');

        // Group by name + size + mods so different sizes never merge
        const modsKey = mods.map(String).sort().join('|');
        const displayName = getKdsItemDisplayName(item);
        const key = `${displayName}__${size}__${modsKey}`;

        if (!hash[key]) {
          hash[key] = { name: displayName, size, quantity: 0, mods };
        }
        hash[key].quantity += Number(item.quantity || 1);
      }
    }
    return Object.values(hash).sort((a, b) => b.quantity - a.quantity);
  }, [orders]);

  if (itemSummaries.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 opacity-40">
        <Layers size={48} style={{ color: 'rgb(var(--text-muted))' }} />
        <h2 className="uppercase font-black mt-4 tracking-widest text-lg" style={{ color: 'rgb(var(--text-muted))' }}>
          {kdsText(isArabic, 'No items to prep', 'لا توجد أصناف للتحضير')}
        </h2>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {itemSummaries.map((summary, idx) => (
          <div
            key={idx}
            className="flex items-center gap-4 p-4 transition-all hover:scale-[1.02]"
            style={{
              background: 'rgba(var(--bg-card), 0.8)',
              border: '1px solid rgba(var(--border-color), 0.2)',
              borderRadius: 'var(--theme-radius-lg, 16px)',
              boxShadow: 'var(--theme-shadow-card)',
            }}
          >
            <div
              className="shrink-0 flex items-center justify-center tabular-nums"
              style={{
                width: 54, height: 54,
                borderRadius: 'var(--theme-radius-sm, 12px)',
                background: summary.quantity >= 5 ? 'rgba(var(--danger), 0.15)' : summary.quantity > 2 ? 'rgba(var(--warning), 0.15)' : 'rgba(var(--primary), 0.1)',
                color: summary.quantity >= 5 ? 'rgb(var(--danger))' : summary.quantity > 2 ? 'rgb(var(--warning))' : 'rgb(var(--primary))',
                fontSize: 24, fontWeight: 900,
                border: `2px solid ${summary.quantity >= 5 ? 'rgba(var(--danger), 0.3)' : summary.quantity > 2 ? 'rgba(var(--warning), 0.3)' : 'rgba(var(--primary), 0.2)'}`,
              }}
            >
              {summary.quantity}
            </div>
            <div className="flex-1 min-w-0">
              <span className="block uppercase font-black text-lg leading-tight truncate" style={{ color: 'rgb(var(--text-main))' }}>
                {summary.name}
              </span>
              {summary.size ? (
                <span
                  className="mt-1 inline-block uppercase tracking-widest"
                  style={{
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 11, fontWeight: 900,
                    background: 'rgba(var(--primary), 0.16)',
                    color: 'rgb(var(--primary))',
                    border: '1px solid rgba(var(--primary), 0.35)',
                  }}
                >
                  {kdsText(isArabic, 'Size', 'الحجم')}: {summary.size}
                </span>
              ) : null}
              {summary.mods.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {summary.mods.map((label: string, i: number) => (
                    <span
                      key={i}
                      className="uppercase tracking-wider"
                      style={{
                        padding: '3px 8px',
                        background: 'rgba(var(--warning), 0.1)',
                        border: '1px solid rgba(var(--warning), 0.25)',
                        borderRadius: 4,
                        fontSize: 11, fontWeight: 800,
                        color: 'rgb(var(--text-main))',
                      }}
                    >
                      + {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default KDS;
