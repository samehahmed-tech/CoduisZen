import React, { memo, useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

const OnlineStatus: React.FC = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [showBanner, setShowBanner] = useState(false);
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

    return (
        <div className={`fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center py-2 px-4 text-xs font-black uppercase tracking-widest transition-all duration-150 ${isOnline ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
            <div className="flex items-center gap-2">
                {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                {isOnline ? 'Connection restored' : 'You are offline - some features may not work'}
            </div>
        </div>
    );
};

export default memo(OnlineStatus);
