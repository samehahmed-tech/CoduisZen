import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Clock, EyeOff, MapPin, MonitorPlay, Package, Search, Truck, UtensilsCrossed, Volume2, Zap } from 'lucide-react';
import { Order, OrderStatus, OrderType } from '../types';
import { useOrderStore } from '../stores/useOrderStore';
import { useAuthStore } from '../stores/useAuthStore';
import { formatDisplayId } from '../src/utils/idGenerator';
import { apiRequestBlob, getActionableErrorMessage } from '../services/api/core';
import { kdsApi } from '../services/api/kds';
import LiveClock from './common/LiveClock';
import { socketService } from '../services/socketService';
import { useToast } from './common/ToastProvider';
import { getTableDisplayName } from '../src/utils/tableDisplay';

const pCtxRef = { current: null as AudioContext | null };
const getPickupCtx = () => {
  if (!pCtxRef.current) pCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
  return pCtxRef.current;
};

const playChime = () => {
  try {
    const ctx = getPickupCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    [659.25, 880, 1174.66].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.13;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(frequency, start);
      osc.type = 'triangle';
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.5, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.32);
      osc.start(start);
      osc.stop(start + 0.34);
    });
  } catch { /* ignore audio errors */ }
};

const playAudioBlob = (blob: Blob) => new Promise<void>((resolve, reject) => {
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  let done = false;

  const finish = (ok: boolean) => {
    if (done) return;
    done = true;
    URL.revokeObjectURL(objectUrl);
    ok ? resolve() : reject(new Error('AUDIO_PLAY_FAILED'));
  };

  audio.onended = () => finish(true);
  audio.onerror = () => finish(false);
  audio.onstalled = () => finish(false);
  audio.play().catch(() => finish(false));
  window.setTimeout(() => finish(false), 6500);
});

const getOrderNumber = (order: any) => {
  const value = order?.orderNumber ?? order?.order_number;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const getOrderNumberText = (order: any) => {
  const numeric = getOrderNumber(order);
  return numeric ? String(numeric) : '';
};

const clearQuickEntry = (
  setQuickInput: React.Dispatch<React.SetStateAction<string>>,
  quickInputValueRef: React.MutableRefObject<string>,
) => {
  quickInputValueRef.current = '';
  setQuickInput('');
};

const getOrderItems = (order: any) => Array.isArray(order?.items) ? order.items : [];

const isPickupHandoverOrder = (order: any) => {
  return [OrderType.TAKEAWAY, OrderType.PICKUP, OrderType.KIOSK].includes(order?.type);
};

const getOrderItemName = (item: any, isAr: boolean) => {
  const name = isAr
    ? (item?.nameAr || item?.name_ar || item?.arabicName || item?.name)
    : (item?.name || item?.nameEn || item?.name_en || item?.nameAr);
  return String(name || '').trim();
};

const getCalloutPhrase = (order: any) => {
  const numeric = getOrderNumber(order);
  const spokenNumber = numeric ? numeric.toLocaleString('ar-EG', { useGrouping: false }) : formatDisplayId(order);
  return `اوردر رقم ${spokenNumber} جاهز للاستلام`;
};

const playServerArabicTts = async (phrase: string) => {
  const blob = await apiRequestBlob(`/tts/ar?text=${encodeURIComponent(phrase)}`);
  await playAudioBlob(blob);
};

const usePickupCallout = () => {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const playingRef = useRef(false);

  const activateAudio = useCallback(async () => {
    setAudioEnabled(true);
    try {
      const ctx = getPickupCtx();
      if (ctx.state === 'suspended') await ctx.resume();
    } catch { /* ignore audio unlock errors */ }
  }, []);

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
    utterance.rate = 0.82;
    utterance.pitch = 1.08;
    utterance.volume = 1;
    utterance.onend = finish;
    utterance.onerror = finish;

    const voices = window.speechSynthesis.getVoices();
    const arabicVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith('ar'));
    if (arabicVoice) utterance.voice = arabicVoice;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    window.setTimeout(finish, 5200);
  }), []);

  const speak = useCallback(async (order: any) => {
    if (playingRef.current) return false;
    playingRef.current = true;
    await activateAudio();
    const phrase = getCalloutPhrase(order);
    try {
      playChime();
      await new Promise(resolve => window.setTimeout(resolve, 650));
      await playServerArabicTts(phrase);
    } catch {
      try {
        playChime();
        await new Promise(resolve => window.setTimeout(resolve, 650));
        await speakWithBrowser(phrase);
      } catch {
        playChime();
      }
    } finally {
      playingRef.current = false;
    }
    return true;
  }, [activateAudio, speakWithBrowser]);

  return { audioEnabled, activateAudio, speak };
};

export const PickupScreen: React.FC = () => {
  const { orders, fetchOrders } = useOrderStore();
  const { settings } = useAuthStore();
  const { success, error } = useToast();
  const lang = settings.language || 'en';
  const isAr = lang === 'ar';

  const [lastTick, setLastTick] = useState(Date.now());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [quickInput, setQuickInput] = useState('');
  const quickInputValueRef = useRef('');
  const [announcementQueue, setAnnouncementQueue] = useState<any[]>([]);
  const [callingOrderId, setCallingOrderId] = useState<string | null>(null);
  const [pendingHandoverIds, setPendingHandoverIds] = useState<Set<string>>(new Set());
  const readyOrdersRef = useRef<any[]>([]);
  const { audioEnabled, activateAudio, speak } = usePickupCallout();

  useEffect(() => {
    quickInputValueRef.current = quickInput;
  }, [quickInput]);

  const refreshPickupOrders = useCallback(() => {
    return fetchOrders(settings.activeBranchId ? { branch_id: settings.activeBranchId, limit: 100 } : { limit: 100 });
  }, [fetchOrders, settings.activeBranchId]);

  useEffect(() => {
    refreshPickupOrders();
    socketService.on('kds:update', refreshPickupOrders);
    socketService.on('order:status', refreshPickupOrders);
    const timer = setInterval(() => setLastTick(Date.now()), 10000);
    return () => {
      clearInterval(timer);
      socketService.off('kds:update', refreshPickupOrders);
      socketService.off('order:status', refreshPickupOrders);
    };
  }, [refreshPickupOrders]);

  useEffect(() => {
    const unlock = () => {
      activateAudio();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [activateAudio]);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { /* ignore fullscreen errors */ }
  }, []);

  const { preparingOrders, readyOrders, deliveryReadyOrders } = useMemo(() => {
    const preparing: any[] = [];
    const ready: any[] = [];
    const deliveryReady: any[] = [];
    const branchOrders = settings.activeBranchId ? orders.filter(o => o.branchId === settings.activeBranchId) : orders;

    for (const order of branchOrders) {
      if (order.status === OrderStatus.PREPARING) {
        preparing.push(order);
      } else if (order.status === OrderStatus.READY) {
        if (order.type === OrderType.DELIVERY) {
          deliveryReady.push(order);
        } else if (isPickupHandoverOrder(order)) {
          ready.push(order);
        }
      }
    }

    return {
      preparingOrders: preparing.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      readyOrders: ready.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      deliveryReadyOrders: deliveryReady.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    };
  }, [orders, settings.activeBranchId, lastTick]);

  useEffect(() => {
    readyOrdersRef.current = readyOrders;
    const readyIds = new Set(readyOrders.map(order => order.id));
    setAnnouncementQueue(prev => [
      ...prev.filter(order => readyIds.has(order.id)),
      ...readyOrders.filter(order => !prev.some(item => item.id === order.id) && order.id !== callingOrderId),
    ]);
  }, [callingOrderId, readyOrders]);

  useEffect(() => {
    if (!audioEnabled || announcementQueue.length === 0 || callingOrderId) return;
    const [nextOrder] = announcementQueue;
    setAnnouncementQueue(prev => prev.slice(1));
    setCallingOrderId(nextOrder.id);
    speak(nextOrder).finally(() => {
      window.setTimeout(() => {
        setCallingOrderId(null);
        setAnnouncementQueue(prev => prev.length > 0 ? prev : readyOrdersRef.current);
      }, 1800);
    });
  }, [announcementQueue, audioEnabled, callingOrderId, speak]);

  const handleCall = useCallback((order: any) => {
    setCallingOrderId(order.id);
    speak(order).finally(() => setCallingOrderId(null));
  }, [speak]);

  const handleHandover = useCallback(async (order: any) => {
    if (!order?.id || pendingHandoverIds.has(order.id)) return;
    setPendingHandoverIds(prev => new Set(prev).add(order.id));
    try {
      await kdsApi.handoverOrder(order.id);
      setAnnouncementQueue(prev => prev.filter(item => item.id !== order.id));
      clearQuickEntry(setQuickInput, quickInputValueRef);
      await refreshPickupOrders();
      success(isAr ? 'تم تسليم الطلب' : 'Order handed over');
    } catch (handoverError) {
      error(getActionableErrorMessage(handoverError, isAr ? 'ar' : 'en'));
    } finally {
      setPendingHandoverIds(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  }, [error, isAr, pendingHandoverIds, refreshPickupOrders, success]);

  const matchedOrder = useMemo(() => {
    const trimmed = quickInput.trim();
    if (!trimmed) return null;
    return readyOrders.find(order => getOrderNumberText(order) === trimmed) || null;
  }, [quickInput, readyOrders]);

  const confirmQuickHandover = useCallback(() => {
    const trimmed = quickInputValueRef.current.trim();
    const order = trimmed ? readyOrders.find(item => getOrderNumberText(item) === trimmed) : null;
    clearQuickEntry(setQuickInput, quickInputValueRef);
    if (order) handleHandover(order);
  }, [handleHandover, readyOrders]);

  useEffect(() => {
    const handleGlobalOrderKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        setQuickInput(prev => {
          const next = `${prev}${event.key}`.replace(/\D/g, '').slice(0, 8);
          quickInputValueRef.current = next;
          return next;
        });
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        setQuickInput(prev => {
          const next = prev.slice(0, -1);
          quickInputValueRef.current = next;
          return next;
        });
        return;
      }

      if (event.key === 'Escape') {
        quickInputValueRef.current = '';
        setQuickInput('');
        return;
      }

      if (event.key === 'Enter' && quickInputValueRef.current.trim()) {
        event.preventDefault();
        confirmQuickHandover();
      }
    };

    window.addEventListener('keydown', handleGlobalOrderKeys);
    return () => window.removeEventListener('keydown', handleGlobalOrderKeys);
  }, [confirmQuickHandover]);

  const getElapsedMins = (dateStr: string | Date) => Math.floor((lastTick - new Date(dateStr).getTime()) / 60000);

  return (
    <div className="flex flex-col h-screen w-full bg-app text-main font-sans overflow-hidden">
      <div className="shrink-0 h-1.5 bg-gradient-to-r from-emerald-400 via-emerald-500 to-indigo-500 shadow-lg shadow-emerald-500/20" />

      <header className="shrink-0 flex flex-col items-stretch justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:gap-4 bg-card/60 backdrop-blur-2xl border-b border-border/20 z-10 shadow-sm relative">
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 ring-1 ring-white/20">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-widest text-main">
              {isAr ? 'شاشة التسليم' : 'Expediter Pickup'}
            </h1>
            <p className="text-xs font-bold text-muted uppercase tracking-[0.2em] mt-0.5">
              {isAr ? 'الطلبات الجاهزة للاستلام' : 'Orders Ready For Handover'}
            </p>
          </div>
        </div>

        <div className="hidden xl:flex flex-col items-center justify-center absolute left-1/2 -translate-x-1/2">
          <LiveClock />
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3 lg:w-auto lg:flex-nowrap">
          <div className="relative min-w-[180px] flex-1 lg:flex-none">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={quickInput}
              onChange={event => {
                const next = event.target.value.replace(/\D/g, '').slice(0, 8);
                quickInputValueRef.current = next;
                setQuickInput(next);
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  confirmQuickHandover();
                }
                if (event.key === 'Escape') {
                  quickInputValueRef.current = '';
                  setQuickInput('');
                }
              }}
              placeholder={isAr ? 'رقم الأوردر ثم Enter' : 'Order # then Enter'}
              className="h-12 w-full rounded-2xl border border-border/30 bg-elevated/60 pl-10 pr-4 text-sm font-black text-main outline-none transition focus:border-emerald-500/60 lg:w-56"
              style={{ borderColor: matchedOrder ? 'rgba(16,185,129,0.65)' : undefined }}
            />
          </div>

          <div className="flex flex-col items-end">
            <span className="text-3xl font-black tabular-nums leading-none text-amber-500">{preparingOrders.length}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted">{isAr ? 'قيد التحضير' : 'Preparing'}</span>
          </div>

          <div className="flex flex-col items-end mr-1">
            <span className="text-3xl font-black tabular-nums leading-none text-emerald-500">{readyOrders.length}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted">{isAr ? 'جاهز' : 'Ready'}</span>
          </div>

          {deliveryReadyOrders.length > 0 && (
            <div className="flex flex-col items-end">
              <span className="text-3xl font-black tabular-nums leading-none text-sky-500">{deliveryReadyOrders.length}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted">{isAr ? 'دليفري' : 'Delivery'}</span>
            </div>
          )}

          <button
            type="button"
            onClick={activateAudio}
            className={`w-12 h-12 rounded-2xl border border-border/30 flex items-center justify-center transition-all shadow-sm active:scale-95 ${audioEnabled ? 'bg-emerald-500 text-white' : 'bg-elevated text-muted hover:text-main hover:bg-main/5'}`}
            title={isAr ? 'تفعيل صوت النداء' : 'Enable callout audio'}
          >
            <Volume2 size={20} />
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="w-12 h-12 rounded-2xl bg-elevated border border-border/30 flex items-center justify-center text-muted hover:text-main hover:bg-main/5 transition-all shadow-sm active:scale-95"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            <MonitorPlay size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden p-6 gap-6 relative z-0">
        <AnimatePresence>
          {quickInput && (
            <motion.div
              key="pickup-keyboard-buffer"
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              className={`pointer-events-none fixed left-1/2 top-24 z-50 -translate-x-1/2 rounded-2xl border px-8 py-4 text-center shadow-2xl backdrop-blur-xl ${matchedOrder ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-500' : 'border-amber-400/45 bg-amber-500/15 text-amber-500'}`}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted">{isAr ? 'رقم الأوردر' : 'Order Number'}</p>
              <p className="mt-1 text-5xl font-black tabular-nums tracking-tight">#{quickInput}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <section className="flex-1 flex flex-col bg-card/40 backdrop-blur-sm rounded-[2rem] border border-border/20 shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between shadow-inner">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-2">
              <Zap size={18} className="animate-pulse" />
              {isAr ? 'جاهز للتسليم الآن' : 'Ready For Handover'}
            </h2>
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-600 rounded-lg text-xs font-black uppercase tracking-widest border border-emerald-500/20">
              {audioEnabled ? (isAr ? 'النداء يعمل' : 'CALLS ON') : (isAr ? 'الصوت يحتاج تفعيل' : 'AUDIO NEEDS TAP')}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <AnimatePresence>
              {readyOrders.length === 0 && deliveryReadyOrders.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col items-center justify-center text-muted/60">
                  <CheckCircle2 size={64} className="mb-4 opacity-50" />
                  <p className="text-sm font-black uppercase tracking-widest">{isAr ? 'لا توجد طلبات جاهزة' : 'All caught up! No pending orders.'}</p>
                </motion.div>
              ) : (
                <div className="space-y-5">
                  {readyOrders.length > 0 && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {readyOrders.map((order) => (
                        <PickupCard
                          key={order.id}
                          order={order}
                          onCall={() => handleCall(order)}
                          onHandover={() => handleHandover(order)}
                          isAr={isAr}
                          elapsed={getElapsedMins(order.createdAt)}
                          isReady
                          isCalling={callingOrderId === order.id}
                          isPending={pendingHandoverIds.has(order.id)}
                        />
                      ))}
                    </div>
                  )}

                  {deliveryReadyOrders.length > 0 && (
                    <div>
                      <div className="mb-3 flex items-center justify-between rounded-xl border border-sky-500/20 bg-sky-500/8 px-4 py-3">
                        <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-sky-600">
                          <Truck size={16} />
                          {isAr ? 'جاهز للتوصيل' : 'Ready For Delivery Dispatch'}
                        </h3>
                        <span className="rounded-lg border border-sky-500/20 bg-sky-500/15 px-3 py-1 text-xs font-black text-sky-600">
                          {deliveryReadyOrders.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {deliveryReadyOrders.map((order) => (
                          <PickupCard
                            key={order.id}
                            order={order}
                            onCall={() => undefined}
                            onHandover={() => undefined}
                            isAr={isAr}
                            elapsed={getElapsedMins(order.createdAt)}
                            isReady={false}
                            isDeliveryReady
                            isCalling={false}
                            isPending={false}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {preparingOrders.length > 0 && (
          <section className="w-full lg:w-[340px] xl:w-[450px] shrink-0 flex flex-col bg-card/60 backdrop-blur-xl rounded-[2rem] border border-amber-500/20 shadow-2xl overflow-hidden relative">
            <div className="px-6 py-4 border-b border-amber-500/10 bg-amber-500/10 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-widest text-amber-600 flex items-center gap-2">
                <Clock size={16} />
                {isAr ? 'قيد التحضير في المطبخ' : 'Preparing In Kitchen'}
              </h2>
              <span className="rounded-lg border border-amber-500/20 bg-amber-500/15 px-3 py-1 text-xs font-black text-amber-600">
                {preparingOrders.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
              {preparingOrders.map((order) => (
                <PickupCard
                  key={order.id}
                  order={order}
                  onCall={() => undefined}
                  onHandover={() => undefined}
                  isAr={isAr}
                  elapsed={getElapsedMins(order.createdAt)}
                  isReady={false}
                  isPreparing
                  isCalling={false}
                  isPending={false}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

const PickupCard = React.memo(({
  order,
  onCall,
  onHandover,
  isAr,
  elapsed,
  isReady,
  isPreparing = false,
  isDeliveryReady = false,
  isCalling,
  isPending,
}: {
  order: Order;
  onCall: () => void;
  onHandover: () => void;
  isAr: boolean;
  elapsed: number;
  isReady: boolean;
  isPreparing?: boolean;
  isDeliveryReady?: boolean;
  isCalling: boolean;
  isPending: boolean;
}) => {
  let typeIcon = <UtensilsCrossed size={16} />;
  if (order.type === OrderType.DELIVERY) typeIcon = <Truck size={16} />;
  if (order.type === OrderType.TAKEAWAY || order.type === OrderType.PICKUP) typeIcon = <Package size={16} />;
  const items = getOrderItems(order);
  const visibleItems = items.slice(0, 4);
  const extraItemsCount = Math.max(items.length - visibleItems.length, 0);
  const itemUnits = items.reduce((sum, item: any) => {
    const quantity = Number(item?.quantity);
    return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
  }, 0);
  const typeLabel = isAr
    ? order.type === OrderType.DELIVERY
      ? 'دليفري'
      : order.type === OrderType.TAKEAWAY
        ? 'تيك أواي'
        : order.type === OrderType.PICKUP
          ? 'استلام'
          : 'صالة'
    : order.type;
  const customerLabel = order.customerName || (isAr ? 'عميل' : 'Customer');
  const canHandover = isReady && !isPending;
  const cardTone = isReady
    ? {
      border: 'border-emerald-500/35',
      header: 'border-emerald-500/10 bg-emerald-500/5',
      icon: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30',
      text: 'text-emerald-600',
      number: 'text-emerald-500',
    }
    : isPreparing
      ? {
        border: 'border-amber-500/35',
        header: 'border-amber-500/10 bg-amber-500/5',
        icon: 'bg-amber-500 text-white shadow-lg shadow-amber-500/20',
        text: 'text-amber-600',
        number: 'text-amber-500',
      }
      : isDeliveryReady
        ? {
          border: 'border-sky-500/35',
          header: 'border-sky-500/10 bg-sky-500/5',
          icon: 'bg-sky-500 text-white shadow-lg shadow-sky-500/20',
          text: 'text-sky-600',
          number: 'text-sky-500',
        }
      : {
        border: 'border-border/10',
        header: 'border-border/10',
        icon: 'bg-muted/10 text-muted',
        text: 'text-muted',
        number: 'text-main/50',
      };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      onDoubleClick={() => canHandover && onHandover()}
      onKeyDown={(event) => {
        if (!canHandover) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onHandover();
        }
      }}
      role={isReady ? 'button' : undefined}
      tabIndex={isReady ? 0 : undefined}
      className={`relative flex flex-col overflow-hidden rounded-2xl border ${cardTone.border} ${isReady || isPreparing || isDeliveryReady ? 'bg-card' : 'bg-elevated/30 opacity-80'}`}
      style={isReady ? { boxShadow: '0 14px 38px rgba(16,185,129,0.12), 0 2px 10px rgba(0,0,0,0.05)' } : isPreparing ? { boxShadow: '0 12px 30px rgba(245,158,11,0.1), 0 2px 10px rgba(0,0,0,0.04)' } : isDeliveryReady ? { boxShadow: '0 12px 30px rgba(14,165,233,0.1), 0 2px 10px rgba(0,0,0,0.04)' } : {}}
    >
      <div className={`flex items-start justify-between gap-3 border-b px-4 py-3 ${cardTone.header}`}>
        <div className="flex min-w-0 items-center gap-2">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cardTone.icon}`}>
            {typeIcon}
          </div>
          <div className="min-w-0">
            <p className={`text-[10px] font-black uppercase tracking-widest ${cardTone.text}`}>{typeLabel}</p>
            <div className="flex min-w-0 items-center gap-1.5 text-sm font-black text-main">
              <span className="truncate">{customerLabel}</span>
              {order.customerPhone && <span className="shrink-0 opacity-50 font-normal">({order.customerPhone.slice(-4)})</span>}
            </div>
          </div>
        </div>
        <p className={`shrink-0 text-4xl font-black tabular-nums tracking-tighter ${cardTone.number}`}>
          {formatDisplayId(order)}
        </p>
      </div>

      <div className="px-4 py-3 pb-4 flex-1">
        {getTableDisplayName(order) && (
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-500/10 px-2.5 py-1 rounded-lg w-max border border-indigo-500/20">
            <MapPin size={12} /> {getTableDisplayName(order)}
          </div>
        )}

        <div className="mt-3 min-h-[96px] rounded-xl border border-border/20 bg-elevated/35 p-3">
          {visibleItems.length === 0 ? (
            <div className="flex min-h-[72px] items-center justify-center text-center text-xs font-black text-amber-600">
              {isAr ? 'لا توجد أصناف محفوظة لهذا الطلب' : 'No saved items on this order'}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleItems.map((item: any, index: number) => {
                const name = getOrderItemName(item, isAr) || (isAr ? 'صنف بدون اسم' : 'Unnamed item');
                const quantity = Number(item?.quantity) || 1;
                return (
                  <div key={`${order.id}-${item?.cartId || item?.menuItemId || item?.id || index}`} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate font-black text-main">{name}</span>
                    <span className="shrink-0 rounded-lg bg-main/5 px-2 py-0.5 text-xs font-black tabular-nums text-muted">x{quantity}</span>
                  </div>
                );
              })}
              {extraItemsCount > 0 && (
                <p className="pt-1 text-[11px] font-black text-muted">
                  {isAr ? `+ ${extraItemsCount} أصناف أخرى` : `+ ${extraItemsCount} more items`}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-muted">
            <Clock size={12} />
            {isReady ? (
              <span className={elapsed > 10 ? 'text-rose-500 animate-pulse' : ''}>
                {isAr ? 'انتظار: ' : 'Wait: '}{elapsed}m
              </span>
            ) : isPreparing ? (
              <span className={elapsed > 15 ? 'text-amber-600 animate-pulse' : 'text-amber-600'}>
                {isAr ? 'في المطبخ: ' : 'Kitchen: '}{elapsed}m
              </span>
            ) : isDeliveryReady ? (
              <span className={elapsed > 10 ? 'text-sky-600 animate-pulse' : 'text-sky-600'}>
                {isAr ? 'للديسباتش: ' : 'Dispatch: '}{elapsed}m
              </span>
            ) : (
              <span>{isAr ? 'تم التسليم' : 'Handed Off'}</span>
            )}
          </div>
          <p className="text-[10px] font-black uppercase text-muted tracking-widest">
            {itemUnits || items.length || 0} {isAr ? 'وحدة' : 'Units'}
          </p>
        </div>
      </div>

      {isReady ? (
        <div className="grid grid-cols-[1fr_1.3fr] border-t border-border/10">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCall();
            }}
            className={`flex items-center justify-center gap-2 px-4 py-4 text-xs font-black uppercase tracking-[0.16em] transition-all active:scale-95 ${isCalling ? 'bg-emerald-600 text-white' : 'bg-elevated text-main hover:bg-emerald-500 hover:text-white'}`}
            disabled={isPending}
          >
            <Volume2 size={18} />
            {isCalling ? (isAr ? 'جاري النداء' : 'Calling') : (isAr ? 'نداء' : 'Call')}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (canHandover) onHandover();
            }}
            className="flex items-center justify-center gap-2 bg-emerald-600 px-4 py-4 text-xs font-black uppercase tracking-[0.16em] text-white transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-muted/30"
            disabled={!canHandover}
          >
            <CheckCircle2 size={18} />
            {isPending ? (isAr ? 'جاري التسليم' : 'Handing off') : (isAr ? 'تسليم الآن' : 'Handover')}
          </button>
        </div>
      ) : isPreparing ? (
        <div className="flex items-center justify-center gap-2 border-t border-amber-500/10 bg-amber-500/10 px-6 py-4 text-xs font-black uppercase tracking-[0.18em] text-amber-600">
          <Clock size={16} />
          {isAr ? 'قيد التحضير في المطبخ' : 'Preparing in kitchen'}
        </div>
      ) : isDeliveryReady ? (
        <div className="flex items-center justify-center gap-2 border-t border-sky-500/10 bg-sky-500/10 px-6 py-4 text-xs font-black uppercase tracking-[0.18em] text-sky-600">
          <Truck size={16} />
          {isAr ? 'يتسلم من شاشة التوصيل' : 'Send from dispatch screen'}
        </div>
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onHandover();
          }}
          className="w-full py-4 px-6 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.2em] transition-all active:scale-95 bg-elevated text-muted hover:bg-border border-t border-border/10"
        >
          <EyeOff size={16} />
          {isAr ? 'تراجع' : 'Undo Handover'}
        </button>
      )}
    </motion.div>
  );
});
