import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

interface KdsTicketProps {
    orderId: string;
    items: { id: string; name: string; quantity: number }[];
    createdAt: Date;
    standardPrepTimeMinutes?: number;
    status: 'pending' | 'preparing' | 'ready';
    onComplete: (orderId: string) => void;
}

const TicketCard: React.FC<KdsTicketProps> = ({ 
    orderId, 
    items, 
    createdAt, 
    standardPrepTimeMinutes = 15,
    status,
    onComplete 
}) => {
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    useEffect(() => {
        if (status === 'ready') return;
        
        const tick = () => {
            const now = new Date();
            const diff = Math.floor((now.getTime() - createdAt.getTime()) / 1000);
            setElapsedSeconds(diff);
        };
        
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [createdAt, status]);

    const elapsedMinutes = elapsedSeconds / 60;
    
    // Color thresholds: < 50% = green, < 80% = yellow/orange, >= 80% = red/danger
    let statusColor = 'bg-card border-border/30';
    let headerColor = 'bg-primary/10 text-primary';
    let timeColor = 'text-primary';

    if (status !== 'ready') {
        const thresholdPercent = elapsedMinutes / standardPrepTimeMinutes;
        
        if (thresholdPercent > 0.8) {
            statusColor = 'bg-rose-500/5 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/30';
            headerColor = 'bg-rose-500 text-white shadow-md';
            timeColor = 'text-white';
        } else if (thresholdPercent > 0.5) {
            statusColor = 'bg-warning/5 border-warning/50';
            headerColor = 'bg-warning text-white';
            timeColor = 'text-white';
        } else {
            statusColor = 'bg-success/5 border-success/30';
            headerColor = 'bg-success/20 text-success';
            timeColor = 'text-success';
        }
    } else {
        statusColor = 'bg-card border-border opacity-60 grayscale';
    }

    const m = Math.floor(elapsedSeconds / 60);
    const s = Math.floor(elapsedSeconds % 60);
    const displayTime = `${m}:${s.toString().padStart(2, '0')}`;

    return (
        <motion.div 
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex flex-col w-64 rounded-xl border overflow-hidden transition-all duration-500 ${statusColor}`}
        >
            <div className={`px-3 py-2 flex items-center justify-between transition-colors duration-500 ${headerColor}`}>
                <span className="font-extrabold text-sm uppercase">#{orderId.slice(-5)}</span>
                <div className="flex items-center gap-1 font-bold tabular-nums">
                    <Clock size={14} className={timeColor} />
                    <span className={timeColor}>{displayTime}</span>
                </div>
            </div>
            
            <div className="p-3 flex-1 overflow-y-auto">
                <ul className="space-y-2">
                    {items.map(item => (
                        <li key={item.id} className="flex justify-between items-start text-sm">
                            <span className="font-bold text-main">{item.quantity}x</span>
                            <span className="flex-1 ml-2 text-main font-medium">{item.name}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {status !== 'ready' && (
                <div className="p-2 mt-auto">
                    <button 
                        onClick={() => onComplete(orderId)}
                        className="w-full py-2 bg-primary/10 hover:bg-primary/20 text-primary font-bold rounded-lg transition-colors"
                    >
                        Mark Ready
                    </button>
                </div>
            )}
        </motion.div>
    );
};

export default TicketCard;
