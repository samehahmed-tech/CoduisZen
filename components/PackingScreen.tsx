import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    BellRing,
    CheckCircle2,
    Clock3,
    Loader2,
    Maximize2,
    Megaphone,
    PackageCheck,
    Radio,
    RotateCcw,
    Sparkles,
    Volume2,
    VolumeX,
} from 'lucide-react';
import { Order, OrderStatus, OrderType } from '../types';
import { useAuthStore } from '../stores/useAuthStore';
import { KdsTicket, useKdsStore } from '../stores/useKdsStore';
import { useOrderStore } from '../stores/useOrderStore';
import { apiRequestBlob, getActionableErrorMessage } from '../services/api/core';
import { useToast } from './common/ToastProvider';
import { formatDisplayId } from '../src/utils/idGenerator';
import { socketService } from '../services/socketService';

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
    [OrderType.DINE_IN]: 'صالة',
    [OrderType.TAKEAWAY]: 'تيك أواي',
    [OrderType.DELIVERY]: 'دليفري',
    [OrderType.PICKUP]: 'استلام',
    [OrderType.KIOSK]: 'كشك',
};

const PACKING_ORDER_TYPES = new Set<OrderType>([
    OrderType.TAKEAWAY,
    OrderType.PICKUP,
    OrderType.KIOSK,
]);

const ANNOUNCEMENT_INTERVAL_OPTIONS = [5, 8, 12, 20, 30];

type PackingOrder = Order & {
    ticketIds: string[];
    readyAt: Date;
    queueStatus: 'READY' | 'SERVED';
};

const asDate = (value: unknown) => {
    const date = value instanceof Date ? value : new Date(String(value || ''));
    return Number.isFinite(date.getTime()) ? date : new Date();
};

const getOrderNumber = (order: Order) => {
    if (typeof order.orderNumber === 'number') return order.orderNumber;
    const digits = String(formatDisplayId(order)).replace(/\D/g, '');
    return Number(digits || 0);
};

const displayNumber = (order: Order) => {
    const numeric = getOrderNumber(order);
    return numeric ? numeric.toLocaleString('ar-EG', { useGrouping: false }) : formatDisplayId(order);
};

const getAgeMinutes = (date: Date, now: number) => Math.max(0, Math.floor((now - date.getTime()) / 60000));

const ticketToPackingOrder = (ticket: KdsTicket): PackingOrder => {
    const readyAt = asDate(ticket.bumpedAt || ticket.createdAt);
    return {
        id: ticket.orderId || ticket.id,
        orderNumber: typeof ticket.orderNumber === 'number' ? ticket.orderNumber : Number(ticket.orderNumber || 0) || undefined,
        type: (ticket.type as OrderType) || OrderType.TAKEAWAY,
        branchId: ticket.branchId,
        tableId: ticket.tableId || undefined,
        tableName: ticket.tableName || undefined,
        items: [],
        status: OrderStatus.READY,
        subtotal: 0,
        tax: 0,
        total: 0,
        createdAt: asDate(ticket.createdAt),
        updatedAt: readyAt,
        kitchenNotes: ticket.kitchenNotes || undefined,
        ticketIds: [ticket.id],
        readyAt,
        queueStatus: ticket.status === 'SERVED' ? 'SERVED' : 'READY',
    };
};

const orderToPackingOrder = (order: Order, ticketIds: string[] = []): PackingOrder => ({
    ...order,
    ticketIds,
    readyAt: asDate(order.updatedAt || order.createdAt),
    queueStatus: 'READY',
});

const getCalloutPhrase = (order: Order) => {
    const numeric = getOrderNumber(order);
    const spokenNumber = numeric ? numeric.toLocaleString('ar-EG', { useGrouping: false }) : displayNumber(order);
    return `أوردر رقم ${spokenNumber} جاهز للاستلام`;
};

const playAudioBlob = (blob: Blob) => new Promise<void>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    let done = false;

    const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        URL.revokeObjectURL(objectUrl);
        if (ok) resolve();
        else reject(new Error('BLOB_AUDIO_FAILED'));
    };

    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    audio.onstalled = () => finish(false);
    audio.play().catch(() => finish(false));
    window.setTimeout(() => finish(false), 6500);
});

const playServerArabicTts = async (phrase: string) => {
    const blob = await apiRequestBlob(`/tts/ar?text=${encodeURIComponent(phrase)}`);
    await playAudioBlob(blob);
};

const useArabicOrderCallout = () => {
    const [audioEnabled, setAudioEnabled] = useState(false);
    const playingRef = useRef(false);

    const speakWithBrowser = useCallback((phrase: string) => new Promise<void>((resolve) => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
            resolve();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(phrase);
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            resolve();
        };

        utterance.lang = 'ar-EG';
        utterance.rate = 0.86;
        utterance.pitch = 1.02;
        utterance.onend = finish;
        utterance.onerror = finish;

        const voices = window.speechSynthesis.getVoices();
        const arabicVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith('ar'));
        if (arabicVoice) utterance.voice = arabicVoice;

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        window.setTimeout(finish, 5200);
    }), []);

    const speak = useCallback(async (order: Order) => {
        if (!audioEnabled || playingRef.current) return false;
        playingRef.current = true;
        const phrase = getCalloutPhrase(order);
        try {
            await playServerArabicTts(phrase);
        } catch {
            await speakWithBrowser(phrase);
        } finally {
            playingRef.current = false;
        }
        return true;
    }, [audioEnabled, speakWithBrowser]);

    const enableAudio = useCallback(async () => {
        setAudioEnabled(true);
        try {
            await playServerArabicTts('تم تفعيل نداء الطلبات');
        } catch {
            await speakWithBrowser('تم تفعيل نداء الطلبات');
        }
    }, [speakWithBrowser]);

    return { audioEnabled, enableAudio, speak };
};

const QueueBadge = ({ minutes }: { minutes: number }) => {
    if (minutes >= 10) {
        return (
            <span className="inline-flex items-center rounded-[var(--theme-radius-sm)] bg-red-500 px-3 py-1 text-xs font-black text-white">
                متأخر {minutes} د
            </span>
        );
    }

    if (minutes >= 5) {
        return (
            <span className="inline-flex items-center rounded-[var(--theme-radius-sm)] bg-amber-300 px-3 py-1 text-xs font-black text-slate-950">
                منتظر {minutes} د
            </span>
        );
    }

    return (
        <span className="inline-flex items-center rounded-[var(--theme-radius-sm)] bg-[rgba(var(--success),0.14)] px-3 py-1 text-xs font-black text-[rgb(var(--success))]">
            جاهز الآن
        </span>
    );
};

const DisplayNumber = ({ order, compact = false }: { order: PackingOrder; compact?: boolean }) => (
    <span className={[
        'block font-black leading-none tabular-nums tracking-normal',
        compact ? 'text-5xl sm:text-6xl' : 'text-[7rem] sm:text-[9rem] lg:text-[13rem]',
    ].join(' ')}
    >
        {displayNumber(order)}
    </span>
);

const ReadyOrderCard = ({
    order,
    index,
    isNext,
    isCalling,
    minutesReady,
    pending,
    onCall,
    onHandover,
}: {
    order: PackingOrder;
    index: number;
    isNext: boolean;
    isCalling: boolean;
    minutesReady: number;
    pending: boolean;
    onCall: (order: PackingOrder) => void;
    onHandover: (order: PackingOrder) => void;
}) => {
    const typeLabel = ORDER_TYPE_LABELS[order.type] || order.type;

    return (
        <motion.article
            layout
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className={[
                'theme-card relative overflow-hidden rounded-[var(--theme-radius-lg)] border',
                isNext
                    ? 'border-[rgba(var(--success),0.42)] bg-[rgba(var(--bg-card),0.92)] shadow-[0_26px_90px_rgba(16,185,129,0.18)]'
                    : 'border-[rgba(var(--border-color),0.46)] bg-[rgba(var(--bg-card),0.72)]',
            ].join(' ')}
        >
            {isNext ? (
                <>
                    <motion.div
                        aria-hidden="true"
                        className="absolute inset-x-0 top-0 h-1.5 bg-[rgb(var(--success))]"
                        animate={{ opacity: [0.28, 1, 0.28] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                        aria-hidden="true"
                        className="absolute -left-20 -top-28 h-72 w-72 rounded-full bg-[rgba(var(--success),0.18)] blur-3xl"
                        animate={{ scale: [1, 1.12, 1], opacity: [0.55, 0.95, 0.55] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                </>
            ) : null}

            <div className={isNext ? 'relative grid gap-5 p-5 sm:p-7' : 'relative grid gap-4 p-4'}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-[var(--theme-radius-sm)] bg-[rgba(var(--primary),0.11)] px-3 py-1 text-xs font-black text-[rgb(var(--primary))]">
                            {isCalling ? 'جاري النداء' : isNext ? 'التالي للاستلام' : `دور ${index + 1}`}
                        </span>
                        <QueueBadge minutes={minutesReady} />
                        <span className="rounded-[var(--theme-radius-sm)] bg-[rgba(var(--bg-elevated),0.72)] px-3 py-1 text-xs font-black text-[rgb(var(--text-muted))]">
                            {typeLabel}
                        </span>
                    </div>
                    {isCalling ? (
                        <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(var(--success),0.14)] px-3 py-1 text-xs font-black text-[rgb(var(--success))]">
                            <Radio size={14} />
                            نداء مباشر
                        </span>
                    ) : null}
                </div>

                <div className={isNext ? 'grid items-end gap-5 xl:grid-cols-[minmax(0,1fr)_240px]' : 'grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_190px]'}>
                    <div className="min-w-0">
                        <p className="mb-2 text-sm font-black text-[rgb(var(--text-muted))]">أوردر رقم</p>
                        <DisplayNumber order={order} compact={!isNext} />
                    </div>

                    <div className="grid gap-2">
                        <button
                            type="button"
                            onClick={() => onCall(order)}
                            className="theme-icon-button inline-flex h-12 items-center justify-center gap-2 rounded-[var(--theme-radius)] border border-[rgba(var(--border-color),0.48)] bg-[rgba(var(--bg-elevated),0.66)] px-4 text-sm font-black text-[rgb(var(--text-main))] transition hover:bg-[rgba(var(--primary),0.10)]"
                        >
                            <Megaphone size={18} />
                            نداء
                        </button>
                        <button
                            type="button"
                            onClick={() => onHandover(order)}
                            disabled={pending}
                            className="theme-btn-primary inline-flex h-[52px] min-h-[52px] items-center justify-center gap-2 rounded-[var(--theme-radius)] px-4 text-base font-black text-white transition disabled:cursor-wait disabled:opacity-70"
                        >
                            {pending ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={19} />}
                            تم التسليم
                        </button>
                    </div>
                </div>
            </div>
        </motion.article>
    );
};

const CustomerNumberTile = ({ order, isCalling }: { order: PackingOrder; isCalling: boolean }) => (
    <motion.div
        layout
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={[
            'relative flex min-h-[112px] items-center justify-center overflow-hidden rounded-[var(--theme-radius-lg)] border bg-[rgba(var(--bg-card),0.70)] px-3',
            isCalling ? 'border-[rgba(var(--success),0.58)]' : 'border-[rgba(var(--border-color),0.46)]',
        ].join(' ')}
    >
        {isCalling ? <span className="absolute inset-x-0 top-0 h-1 bg-[rgb(var(--success))]" /> : null}
        <DisplayNumber order={order} compact />
    </motion.div>
);

const PreparingRow = ({ order, ageMinutes }: { order: PackingOrder; ageMinutes: number }) => (
    <motion.div
        layout
        initial={{ opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -14 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="grid min-h-[70px] grid-cols-[1fr_auto] items-center gap-3 rounded-[var(--theme-radius)] border border-[rgba(var(--border-color),0.36)] bg-[rgba(var(--bg-card),0.50)] px-4 py-3"
    >
        <div className="min-w-0">
            <span className="block truncate text-4xl font-black leading-none tabular-nums">{displayNumber(order)}</span>
            <span className="mt-1 block text-xs font-bold text-[rgb(var(--text-muted))]">{ORDER_TYPE_LABELS[order.type] || order.type}</span>
        </div>
        <div className="flex flex-col items-end gap-2">
            <span className="inline-flex h-8 items-center gap-2 rounded-[var(--theme-radius-sm)] bg-[rgba(var(--warning),0.14)] px-3 text-xs font-black text-[rgb(var(--warning))]">
                <Clock3 size={14} />
                قيد التحضير
            </span>
            <span className="text-xs font-bold text-[rgb(var(--text-muted))]">{ageMinutes} د</span>
        </div>
    </motion.div>
);

export const PackingScreen: React.FC = () => {
    const { orders, fetchOrders } = useOrderStore();
    const { tickets, fetchTickets, handoverOrder } = useKdsStore();
    const { settings, branches } = useAuthStore();
    const { audioEnabled, enableAudio, speak } = useArabicOrderCallout();
    const { error } = useToast();
    const [now, setNow] = useState(Date.now());
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [pendingHandoverId, setPendingHandoverId] = useState<string | null>(null);
    const [callingOrderId, setCallingOrderId] = useState<string | null>(null);
    const [announcementIntervalSeconds, setAnnouncementIntervalSeconds] = useState(() => {
        if (typeof window === 'undefined') return 8;
        const stored = Number(window.localStorage.getItem('packing_announcement_interval_seconds') || 8);
        return ANNOUNCEMENT_INTERVAL_OPTIONS.includes(stored) ? stored : 8;
    });
    const [announcementQueue, setAnnouncementQueue] = useState<PackingOrder[]>([]);
    const announcedReadyIds = useRef<Set<string>>(new Set());
    const audioBaselineReadyIds = useRef<Set<string>>(new Set());
    const audioBaselineAppliedRef = useRef(false);
    const speakingRef = useRef(false);
    const announcementDelayRef = useRef<number | null>(null);

    const refreshPacking = useCallback(() => {
        fetchOrders({ limit: 120 });
        fetchTickets({ includeServed: true });
    }, [fetchOrders, fetchTickets]);

    useEffect(() => {
        refreshPacking();
        socketService.on('kds:update', refreshPacking);
        socketService.on('order:status', refreshPacking);
        const refresh = window.setInterval(refreshPacking, 30000);
        const clock = window.setInterval(() => setNow(Date.now()), 1000);
        return () => {
            socketService.off('kds:update', refreshPacking);
            socketService.off('order:status', refreshPacking);
            window.clearInterval(refresh);
            window.clearInterval(clock);
        };
    }, [refreshPacking]);

    useEffect(() => {
        const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    useEffect(() => () => {
        if (announcementDelayRef.current) window.clearTimeout(announcementDelayRef.current);
    }, []);

    useEffect(() => {
        window.localStorage.setItem('packing_announcement_interval_seconds', String(announcementIntervalSeconds));
    }, [announcementIntervalSeconds]);

    const branchOrders = useMemo(() => {
        const activeBranchId = settings.activeBranchId;
        return activeBranchId ? orders.filter((order) => order.branchId === activeBranchId) : orders;
    }, [orders, settings.activeBranchId]);

    const branchTickets = useMemo(() => {
        const activeBranchId = settings.activeBranchId;
        return activeBranchId ? tickets.filter((ticket) => ticket.branchId === activeBranchId) : tickets;
    }, [tickets, settings.activeBranchId]);

    const readyOrders = useMemo(() => {
        const ticketIdsByOrder = new Map<string, string[]>();
        const byId = new Map<string, PackingOrder>();

        for (const ticket of branchTickets) {
            if (ticket.status !== 'READY' && ticket.status !== 'SERVED') continue;
            const orderId = ticket.orderId || ticket.id;
            const packed = ticketToPackingOrder(ticket);
            if (!PACKING_ORDER_TYPES.has(packed.type)) continue;
            ticketIdsByOrder.set(orderId, [...(ticketIdsByOrder.get(orderId) || []), ticket.id]);
            const existing = byId.get(orderId);
            if (!existing || packed.readyAt.getTime() < existing.readyAt.getTime()) byId.set(orderId, packed);
        }

        for (const order of branchOrders) {
            if (order.status !== OrderStatus.READY) continue;
            if (!PACKING_ORDER_TYPES.has(order.type)) continue;
            if (!byId.has(order.id)) byId.set(order.id, orderToPackingOrder(order, ticketIdsByOrder.get(order.id) || []));
        }

        return Array.from(byId.values())
            .sort((a, b) => a.readyAt.getTime() - b.readyAt.getTime())
            .slice(0, 12);
    }, [branchOrders, branchTickets]);

    const preparingOrders = useMemo(() => {
        const byId = new Map<string, PackingOrder>();

        for (const order of branchOrders) {
            if (!PACKING_ORDER_TYPES.has(order.type)) continue;
            if ([OrderStatus.PENDING, OrderStatus.PREPARING].includes(order.status)) {
                byId.set(order.id, orderToPackingOrder(order));
            }
        }

        for (const ticket of branchTickets) {
            if (ticket.status !== 'PENDING' && ticket.status !== 'PREPARING') continue;
            const orderId = ticket.orderId || ticket.id;
            const packed = ticketToPackingOrder(ticket);
            if (!PACKING_ORDER_TYPES.has(packed.type)) continue;
            if (!byId.has(orderId)) byId.set(orderId, packed);
        }

        return Array.from(byId.values())
            .sort((a, b) => asDate(a.createdAt).getTime() - asDate(b.createdAt).getTime())
            .slice(0, 8);
    }, [branchOrders, branchTickets]);

    useEffect(() => {
        if (!audioEnabled) {
            setAnnouncementQueue([]);
            audioBaselineAppliedRef.current = false;
            return;
        }

        if (!audioBaselineAppliedRef.current) {
            const currentReadyIds = new Set(readyOrders.map((order) => order.id));
            audioBaselineReadyIds.current = currentReadyIds;
            for (const id of currentReadyIds) announcedReadyIds.current.add(id);
            audioBaselineAppliedRef.current = true;
            return;
        }

        const unseen = readyOrders.filter((order) => (
            !audioBaselineReadyIds.current.has(order.id) &&
            !announcedReadyIds.current.has(order.id)
        ));
        if (!unseen.length) return;

        for (const order of unseen) announcedReadyIds.current.add(order.id);
        setAnnouncementQueue((queue) => {
            const queuedIds = new Set(queue.map((order) => order.id));
            return [...queue, ...unseen.filter((order) => !queuedIds.has(order.id))];
        });
    }, [audioEnabled, readyOrders]);

    useEffect(() => {
        if (!audioEnabled || speakingRef.current || announcementQueue.length === 0) return;

        const [nextOrder] = announcementQueue;
        speakingRef.current = true;
        setCallingOrderId(nextOrder.id);
        speak(nextOrder).then((spoken) => {
            announcementDelayRef.current = window.setTimeout(() => {
                if (spoken) setAnnouncementQueue((queue) => queue.slice(1));
                setCallingOrderId(null);
                speakingRef.current = false;
                announcementDelayRef.current = null;
            }, spoken ? announcementIntervalSeconds * 1000 : 900);
        });
    }, [announcementIntervalSeconds, announcementQueue, audioEnabled, speak]);

    const toggleFullscreen = async () => {
        try {
            if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
            else await document.exitFullscreen();
        } catch {
            // Fullscreen is optional for browsers that restrict it.
        }
    };

    const handleManualCall = (order: PackingOrder) => {
        if (speakingRef.current) return;
        if (announcementDelayRef.current) {
            window.clearTimeout(announcementDelayRef.current);
            announcementDelayRef.current = null;
        }
        speakingRef.current = true;
        setCallingOrderId(order.id);
        speak(order).finally(() => {
            window.setTimeout(() => {
                setCallingOrderId(null);
                speakingRef.current = false;
            }, 700);
        });
    };

    const handleHandover = async (order: PackingOrder) => {
        setPendingHandoverId(order.id);
        try {
            await handoverOrder(order.id);
            announcedReadyIds.current.delete(order.id);
            setAnnouncementQueue((queue) => queue.filter((queuedOrder) => queuedOrder.id !== order.id));
            await Promise.all([fetchOrders({ limit: 120 }), fetchTickets({ includeServed: true })]);
        } catch (handoverError) {
            error(getActionableErrorMessage(handoverError, 'ar'));
        } finally {
            setPendingHandoverId(null);
        }
    };

    const nextOrder = readyOrders[0] || null;
    const displayReadyOrders = readyOrders.slice(nextOrder ? 1 : 0, 9);
    const activeBranchName = branches.find((branch) => branch.id === settings.activeBranchId)?.name || settings.restaurantName || 'Coduis Zen';
    const currentTime = new Date(now).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    return (
        <div
            className="relative min-h-screen overflow-hidden bg-[rgb(var(--bg-app))] text-[rgb(var(--text-main))]"
            dir="rtl"
        >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[rgba(var(--primary),0.14)] blur-3xl" />
                <div className="absolute -bottom-36 left-10 h-[28rem] w-[28rem] rounded-full bg-[rgba(var(--success),0.12)] blur-3xl" />
                <div className="absolute inset-x-0 top-0 h-px bg-[rgba(var(--border-color),0.72)]" />
            </div>

            <div className="relative flex min-h-screen flex-col">
                <header className="shrink-0 border-b border-[rgba(var(--border-color),0.42)] bg-[rgba(var(--bg-card),0.64)] px-4 py-3 backdrop-blur-xl lg:px-7">
                    <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-center lg:gap-4">
                        <div className="flex min-w-0 items-center gap-4">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--theme-radius)] bg-[rgb(var(--primary))] text-white shadow-[0_18px_38px_rgba(37,99,235,0.22)]">
                                <PackageCheck size={25} />
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h1 className="truncate text-2xl font-black leading-tight sm:text-3xl lg:text-4xl">شاشة الاستلام</h1>
                                    <span className="rounded-full bg-[rgba(var(--success),0.13)] px-3 py-1 text-xs font-black text-[rgb(var(--success))]">
                                        شاشة العملاء
                                    </span>
                                </div>
                                <p className="mt-1 truncate text-sm font-bold text-[rgb(var(--text-muted))]">{activeBranchName}</p>
                            </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                            <div className="hidden min-w-[112px] rounded-[var(--theme-radius)] border border-[rgba(var(--border-color),0.38)] bg-[rgba(var(--bg-elevated),0.48)] px-4 py-2 text-left sm:block">
                                <p className="text-lg font-black tabular-nums">{currentTime}</p>
                                <p className="text-xs font-bold text-[rgb(var(--text-muted))]">{readyOrders.length} جاهز</p>
                            </div>
                            <button
                                type="button"
                                onClick={audioEnabled ? undefined : enableAudio}
                                disabled={audioEnabled}
                                title={audioEnabled ? 'الصوت مفعل' : 'تفعيل الصوت'}
                                className="theme-icon-button flex h-11 w-11 items-center justify-center rounded-[var(--theme-radius)]"
                            >
                                {audioEnabled ? <Volume2 size={20} className="text-[rgb(var(--success))]" /> : <VolumeX size={20} />}
                            </button>
                            <label className="hidden h-11 items-center gap-2 rounded-[var(--theme-radius)] border border-[rgba(var(--border-color),0.38)] bg-[rgba(var(--bg-elevated),0.48)] px-3 text-xs font-black text-[rgb(var(--text-muted))] md:inline-flex">
                                <span>فاصل النداء</span>
                                <select
                                    value={announcementIntervalSeconds}
                                    onChange={(event) => setAnnouncementIntervalSeconds(Number(event.target.value))}
                                    className="theme-input h-8 rounded-[var(--theme-radius-sm)] border border-[rgba(var(--border-color),0.42)] bg-[rgba(var(--bg-card),0.70)] px-2 text-xs font-black text-[rgb(var(--text-main))] outline-none"
                                >
                                    {ANNOUNCEMENT_INTERVAL_OPTIONS.map((seconds) => (
                                        <option key={seconds} value={seconds}>{seconds} ث</option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="button"
                                onClick={refreshPacking}
                                title="تحديث"
                                className="theme-icon-button flex h-11 w-11 items-center justify-center rounded-[var(--theme-radius)]"
                            >
                                <RotateCcw size={19} />
                            </button>
                            <button
                                type="button"
                                onClick={toggleFullscreen}
                                title={isFullscreen ? 'إلغاء ملء الشاشة' : 'ملء الشاشة'}
                                className="theme-icon-button flex h-11 w-11 items-center justify-center rounded-[var(--theme-radius)]"
                            >
                                <Maximize2 size={20} />
                            </button>
                        </div>
                    </div>
                </header>

                <main className="grid flex-1 gap-4 overflow-y-auto p-3 sm:p-4 xl:grid-cols-[minmax(0,1.42fr)_minmax(340px,0.58fr)] xl:overflow-hidden xl:p-6">
                    <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
                        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px] xl:gap-4">
                            <div className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-black text-[rgb(var(--primary))]">
                                    <Radio size={17} />
                                    النداء من الأقدم للأحدث
                                </div>
                                <h2 className="text-balance text-3xl font-black leading-tight sm:text-4xl xl:text-6xl">
                                    {nextOrder ? 'طلبك جاهز للاستلام' : 'لا توجد طلبات جاهزة الآن'}
                                </h2>
                            </div>
                            <div className="theme-card flex items-center gap-3 rounded-[var(--theme-radius-lg)] border border-[rgba(var(--border-color),0.38)] bg-[rgba(var(--bg-card),0.62)] px-4 py-3">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--theme-radius)] bg-[rgba(var(--success),0.14)] text-[rgb(var(--success))]">
                                    <BellRing size={21} />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-black">{audioEnabled ? 'النداء التلقائي يعمل' : 'الصوت يحتاج تفعيل'}</p>
                                    <p className="mt-0.5 truncate text-xs font-bold text-[rgb(var(--text-muted))]">
                                        {announcementQueue.length ? `${announcementQueue.length} في انتظار النداء` : 'كل طلب جديد سيتم نداؤه تلقائيا'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="min-h-0 overflow-hidden">
                            <AnimatePresence mode="popLayout">
                                {nextOrder ? (
                                    <motion.div key="active-ready" className="grid h-full min-h-0 gap-4 xl:grid-rows-[auto_minmax(0,1fr)]">
                                        <ReadyOrderCard
                                            order={nextOrder}
                                            index={0}
                                            isNext
                                            isCalling={nextOrder.id === callingOrderId}
                                            minutesReady={getAgeMinutes(nextOrder.readyAt, now)}
                                            pending={pendingHandoverId === nextOrder.id}
                                            onCall={handleManualCall}
                                            onHandover={handleHandover}
                                        />

                                        <div className="min-h-0 overflow-hidden rounded-[var(--theme-radius-lg)] border border-[rgba(var(--border-color),0.34)] bg-[rgba(var(--bg-card),0.36)] p-3 xl:p-4">
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <h3 className="text-lg font-black">طلبات جاهزة أخرى</h3>
                                                <span className="rounded-full bg-[rgba(var(--bg-elevated),0.72)] px-3 py-1 text-xs font-black text-[rgb(var(--text-muted))]">
                                                    {displayReadyOrders.length}
                                                </span>
                                            </div>
                                             <div className="grid max-h-full grid-cols-2 gap-2 overflow-y-auto md:grid-cols-3 xl:grid-cols-4 xl:gap-3">
                                                <AnimatePresence mode="popLayout">
                                                    {displayReadyOrders.length ? displayReadyOrders.map((order) => (
                                                        <CustomerNumberTile
                                                            key={order.id}
                                                            order={order}
                                                            isCalling={order.id === callingOrderId}
                                                        />
                                                    )) : (
                                                        <motion.div
                                                            key="no-secondary-ready"
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            className="col-span-full flex min-h-[116px] items-center justify-center rounded-[var(--theme-radius)] border border-dashed border-[rgba(var(--border-color),0.48)] text-center text-sm font-black text-[rgb(var(--text-muted))]"
                                                        >
                                                            لا توجد طلبات أخرى جاهزة
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="empty-ready"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="theme-card flex h-full min-h-[320px] xl:min-h-[520px] items-center justify-center rounded-[var(--theme-radius-lg)] border border-[rgba(var(--border-color),0.38)] bg-[rgba(var(--bg-card),0.58)] px-6 text-center"
                                    >
                                        <div>
                                            <span className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-[rgba(var(--success),0.12)] text-[rgb(var(--success))]">
                                                <CheckCircle2 size={58} />
                                            </span>
                                            <p className="text-3xl font-black leading-tight xl:text-6xl">كل الطلبات اتسلمت</p>
                                            <p className="mx-auto mt-3 xl:mt-4 max-w-xl text-base xl:text-lg font-bold text-[rgb(var(--text-muted))]">
                                                الطلبات الجاهزة ستظهر هنا فور خروجها من المطبخ.
                                            </p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </section>

                    <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[var(--theme-radius-lg)] border border-[rgba(var(--border-color),0.42)] bg-[rgba(var(--bg-card),0.52)] backdrop-blur-xl">
                        <div className="border-b border-[rgba(var(--border-color),0.34)] px-5 py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2 text-sm font-black text-[rgb(var(--warning))]">
                                        <Sparkles size={16} />
                                        في الطريق
                                    </div>
                                    <h3 className="mt-1 text-3xl font-black leading-tight">قيد التحضير</h3>
                                </div>
                                <span className="flex h-14 min-w-14 items-center justify-center rounded-[var(--theme-radius)] bg-[rgba(var(--warning),0.16)] px-4 text-2xl font-black text-[rgb(var(--warning))]">
                                    {preparingOrders.length}
                                </span>
                            </div>
                        </div>

                        <div className="min-h-0 overflow-hidden p-3 xl:p-4">
                            <div className="grid max-h-full gap-3 overflow-y-auto">
                                <AnimatePresence mode="popLayout">
                                    {preparingOrders.length ? preparingOrders.map((order) => (
                                        <PreparingRow
                                            key={order.id}
                                            order={order}
                                            ageMinutes={getAgeMinutes(asDate(order.createdAt), now)}
                                        />
                                    )) : (
                                        <motion.div
                                            key="empty-preparing"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="flex min-h-[180px] items-center justify-center rounded-[var(--theme-radius)] border border-dashed border-[rgba(var(--border-color),0.48)] px-5 text-center text-base font-black text-[rgb(var(--text-muted))]"
                                        >
                                            لا توجد طلبات قيد التحضير
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </aside>
                </main>
            </div>
        </div>
    );
};

export default PackingScreen;
