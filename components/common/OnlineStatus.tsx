import React, { memo, useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export type OfflineCapabilityCopy = {
    title: string;
    capabilities: string[];
    restored: string;
};

export const getOfflineCapabilityCopy = (lang: 'ar' | 'en' = 'en'): OfflineCapabilityCopy => lang === 'ar'
    ? {
        title: 'الاتصال غير متاح — هذه حدود التشغيل الآن',
        capabilities: [
            'الطلبات الجديدة تعمل بالنقد فقط وتنتظر المزامنة قبل اعتماد الدفع.',
            'البطاقات والمحافظ والمرتجعات التي تحتاج السيرفر تُستكمل بعد عودة الاتصال.',
            'طابعات LOCAL/WINDOWS/USB تعمل عبر الجسر المحلي؛ طابعات الشبكة تنتظر الطابور المركزي.',
            'أي تعارض أو عملية مرفوضة تظهر في مركز تعارضات المزامنة ولا تُعتبر مكتملة تلقائيًا.',
        ],
        restored: 'عاد الاتصال — ستستأنف المزامنة الآمنة تلقائيًا.',
    }
    : {
        title: 'Offline — current operating limits',
        capabilities: [
            'New orders support cash only and remain pending until the server confirms sync.',
            'Cards, wallets, and server-dependent refunds resume after connectivity returns.',
            'LOCAL/WINDOWS/USB printers use the local bridge; network printers remain server-queued.',
            'Rejected or conflicting changes stay visible in Offline Conflict Center and are not marked complete.',
        ],
        restored: 'Connection restored — safe sync will resume automatically.',
    };

type OnlineStatusProps = { lang?: 'ar' | 'en' };

const OnlineStatus: React.FC<OnlineStatusProps> = ({ lang = 'en' }) => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    // The browser may load the app while already offline, before an `offline`
    // event can fire; show the operating contract immediately in that case.
    const [showBanner, setShowBanner] = useState(() => !navigator.onLine);
    const wasOfflineRef = useRef(false);
    const hideTimerRef = useRef<number | null>(null);

    useEffect(() => {
        const clearHideTimer = () => {
            if (hideTimerRef.current !== null) {
                window.clearTimeout(hideTimerRef.current);
                hideTimerRef.current = null;
            }
        };

        const goOnline = () => {
            setIsOnline(true);
            if (wasOfflineRef.current) {
                setShowBanner(true);
                clearHideTimer();
                hideTimerRef.current = window.setTimeout(() => setShowBanner(false), 3000);
            }
        };

        const goOffline = () => {
            setIsOnline(false);
            wasOfflineRef.current = true;
            setShowBanner(true);
        };

        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);

        return () => {
            clearHideTimer();
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    if (!showBanner) return null;

    const copy = getOfflineCapabilityCopy(lang);
    return (
        <div
            className={`fixed top-0 left-0 right-0 z-[9999] px-4 py-2 text-xs font-black transition-all duration-150 ${isOnline ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}
            role="status"
            aria-live="polite"
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
        >
            <div className="mx-auto flex max-w-5xl items-start justify-center gap-2">
                {isOnline ? <Wifi size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> : <WifiOff size={14} className="mt-0.5 shrink-0" aria-hidden="true" />}
                <div className="min-w-0">
                    <p className="font-black">{isOnline ? copy.restored : copy.title}</p>
                    {!isOnline && (
                        <ul className="mt-1 list-disc space-y-0.5 ps-5 font-medium normal-case tracking-normal">
                            {copy.capabilities.map((capability) => <li key={capability}>{capability}</li>)}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default memo(OnlineStatus);
