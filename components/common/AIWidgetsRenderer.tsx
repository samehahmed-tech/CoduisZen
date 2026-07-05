import React, { useEffect } from 'react';
import { useAIWidgetStore } from '../../stores/useAIWidgetStore';
import { Brain, AlertTriangle, Lightbulb, X, ArrowRight, Zap, Target } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAutonomousEngine } from '../../stores/useAutonomousEngine';

// AI Response Behavior from rules.md:
// - Spawn as bounded Bento widget
// - Max active widgets: 2
// - Auto-dismiss: 6-10 seconds inactivity
// - Always anchored

const AIWidgetsRenderer: React.FC = () => {
    const { widgets, removeWidget } = useAIWidgetStore();
    const lang = useAuthStore(s => s.settings.language || 'en');
    const { kpis, decisionEngine } = useAutonomousEngine();

    useEffect(() => {
        if (widgets.length === 0) return;

        const interval = setInterval(() => {
            const now = Date.now();
            widgets.forEach(w => {
                if (now - w.timestamp > 8000) { // 8 seconds auto-dismiss
                    removeWidget(w.id);
                }
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [widgets, removeWidget]);

    if (widgets.length === 0) return null;

    return (
        <div className="fixed bottom-24 right-6 z-[150] flex flex-col gap-4 pointer-events-none">
            {widgets.map(w => {
                const isWarning = w.type === 'warning';
                const isAction = w.type === 'action';
                const Icon = isWarning ? AlertTriangle : isAction ? Zap : Brain;
                
                // Identify the agent responsible
                const agentName = isWarning ? 'Finance Agent' : isAction ? 'Ops Agent' : 'Kitchen Agent';
                
                return (
                    <div 
                        key={w.id} 
                        className="pointer-events-auto theme-card animate-slide-up w-80 p-4 border border-border/20 shadow-xl overflow-hidden relative group"
                    >
                        {/* Shimmer sweep effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-[150%] skew-x-[-15deg] group-hover:animate-[glassLightSweep_1s_ease-out] z-0" />
                        
                        <div className="relative z-10">
                            <div className="flex items-start justify-between mb-2">
                                <div className={`flex items-center gap-2 ${isWarning ? 'text-amber-500' : 'text-primary'}`}>
                                    <Icon size={16} className={isWarning ? 'animate-pulse' : ''} />
                                    <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                        <Target size={10} className="opacity-50" />
                                        {lang === 'ar' ? agentName : agentName}
                                    </span>
                                </div>
                                <button 
                                    onClick={() => removeWidget(w.id)}
                                    className="text-muted hover:text-main transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                            
                            <p className="text-sm font-medium text-main mb-3 leading-relaxed">
                                {w.content}
                            </p>
                            
                            {w.actionLabel && (
                                <button
                                    onClick={() => {
                                        w.onAction?.();
                                        removeWidget(w.id);
                                    }}
                                    className="w-full flex items-center justify-between px-3 py-2 bg-elevated rounded-lg hover:bg-primary/10 transition-colors text-xs font-bold text-primary border border-primary/20"
                                >
                                    <span>{w.actionLabel}</span>
                                    <ArrowRight size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default AIWidgetsRenderer;
