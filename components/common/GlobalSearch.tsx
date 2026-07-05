import React, { useDeferredValue, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    ArrowRight, Brain, Hash, Sparkles, Moon, Zap, Terminal, Command
} from 'lucide-react';
import { useOrderStore } from '../../stores/useOrderStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAIWidgetStore } from '../../stores/useAIWidgetStore';
import { useAutonomousEngine } from '../../stores/useAutonomousEngine';
import { flattenNav } from './navigation';

interface SearchResult {
    id: string;
    type: 'page' | 'order' | 'customer' | 'menu' | 'ai-query' | 'action';
    icon: React.ElementType;
    title: string;
    subtitle?: string;
    path?: string;
    meta?: string;
    actionType?: 'safe' | 'medium' | 'risky';
}

const GlobalSearch: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIdx, setSelectedIdx] = useState(0);
    const deferredQuery = useDeferredValue(query);

    const { settings, updateSettings, hasPermission } = useAuthStore();
    const lang = (settings.language || 'en') as 'en' | 'ar';
    const isDarkMode = settings.isDarkMode;
    
    const orders = useOrderStore((state) => state.orders);
    const addWidget = useAIWidgetStore((state) => state.addWidget);
    const setKPI = useAutonomousEngine((state) => state.setKPI);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setIsOpen((prev) => !prev);
                return;
            }
            if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
                event.preventDefault();
                setIsOpen(true);
                return;
            }
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        setQuery('');
        setSelectedIdx(0);
        const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
        return () => window.cancelAnimationFrame(frame);
    }, [isOpen]);

    useEffect(() => {
        setIsOpen(false);
    }, [location.pathname]);

    // Intelligence Routing & Natural Language Matching
    const results = useMemo((): SearchResult[] => {
        const q = deferredQuery.toLowerCase().trim();
        const resultsList: SearchResult[] = [];

        // 1. Core AI Query Engine (Always top if typed)
        if (q.length > 2) {
            resultsList.push({
                id: 'ai-prompt-smart',
                type: 'ai-query',
                icon: Brain,
                title: lang === 'ar' ? `اسأل المساعد الذكي عن: "${deferredQuery}"` : `Ask Autonomous AI: "${deferredQuery}"`,
                subtitle: lang === 'ar' ? 'اضغط Enter لتحليل الطلب وتوجيهه للوكيل المختص' : 'Press Enter to analyze and route to the correct AI Agent',
                meta: 'Intelligence'
            });
        }

        // 2. Structured Commands & Natural Language Actions
        if (q.includes('close') || q.includes('قفل') || q.includes('اقفال')) {
            resultsList.push({
                id: 'act-close-tabs', type: 'action', icon: Zap, actionType: 'risky',
                title: lang === 'ar' ? 'إغلاق جميع الطلبات المعلقة' : 'Close all open tabs',
                subtitle: lang === 'ar' ? 'إجراء يحتاج لتأكيد' : 'Requires approval', meta: 'Command'
            });
        }
        if (q.includes('dark') || q.includes('ليل')) {
            resultsList.push({ id: 'act-dark', type: 'action', icon: Moon, title: lang === 'ar' ? 'تبديل الوضع الليلي' : 'Toggle Dark Mode', meta: 'Action', actionType: 'safe' });
        }
        if (q.includes('rush') || q.includes('زحمة') || q.includes('ذروة')) {
            resultsList.push({
                id: 'act-rush', type: 'action', icon: Zap, actionType: 'medium',
                title: lang === 'ar' ? 'تفعيل وضع الذروة وتقليل الواجهة' : 'Enable Peak Load UI Mode',
                subtitle: lang === 'ar' ? 'سيتم إخفاء العناصر غير الضرورية' : 'Fades non-critical UI elements', meta: 'Ops Agent'
            });
        }

        // 3. Fallback to normal routing (Pages)
        flattenNav().forEach((page) => {
            if (!hasPermission(page.permission)) return;
            const titleEn = page.label.toLowerCase();
            const titleAr = page.labelAr;
            const keywords = page.keywords || '';
            if (titleEn.includes(q) || titleAr.includes(q) || keywords.includes(q)) {
                resultsList.push({
                    id: `page-${page.path}`, type: 'page', icon: page.icon,
                    title: lang === 'ar' ? page.labelAr : page.label,
                    subtitle: lang === 'ar' ? 'صفحة النظام' : 'System Route', path: page.path,
                });
            }
        });

        // 4. Data Search
        if (resultsList.length < 12 && q.length > 1) {
            orders.slice(0, 50).forEach((order) => {
                if (String(order.orderNumber).includes(q) || order.customerName?.toLowerCase().includes(q)) {
                    resultsList.push({
                        id: `order-${order.id}`, type: 'order', icon: Hash,
                        title: `Order #${order.orderNumber}`, subtitle: `${order.status} · ${order.total}`, meta: 'Data'
                    });
                }
            });
        }

        return resultsList.slice(0, 10);
    }, [deferredQuery, hasPermission, lang, orders]);

    useEffect(() => {
        setSelectedIdx(0);
    }, [results.length]);

    const handleSelect = useCallback((result: SearchResult) => {
        if (result.type === 'ai-query') {
            const isFinance = deferredQuery.includes('revenue') || deferredQuery.includes('مبيعات');
            const isOps = deferredQuery.includes('kitchen') || deferredQuery.includes('مطبخ');
            
            addWidget({
                content: lang === 'ar' 
                    ? `تم تحليل الاستعلام: "${deferredQuery}". جاري استخراج البيانات وتقاطع الـ KPIs...` 
                    : `Analyzed query: "${deferredQuery}". Cross-referencing current KPIs...`,
                type: isFinance ? 'warning' : 'insight',
                actionLabel: lang === 'ar' ? 'عرض التقرير الكامل' : 'View Full Report'
            });
            setIsOpen(false);
            return;
        }

        if (result.type === 'action') {
            if (result.id === 'act-dark') updateSettings({ isDarkMode: !isDarkMode });
            if (result.id === 'act-rush') {
                setKPI('peakLoad', true);
                addWidget({
                    content: 'Peak Load Mode activated. UI constraints enabled.',
                    type: 'action', actionLabel: 'Revert'
                });
            }
            if (result.id === 'act-close-tabs') {
                addWidget({ content: 'Action requires Manager PIN to execute bulk closure.', type: 'warning', actionLabel: 'Approve' });
            }
            setIsOpen(false);
            return;
        }

        if (result.path) {
            navigate(result.path);
            setIsOpen(false);
        }
    }, [deferredQuery, navigate, isDarkMode, updateSettings, addWidget, setKPI, lang]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelectedIdx((prev) => Math.max(prev - 1, 0));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (results[selectedIdx]) {
                handleSelect(results[selectedIdx]);
            }
        } else if (event.key === 'Escape') {
            setIsOpen(false);
        }
    }, [handleSelect, results, selectedIdx]);

    if (!isOpen) return null;

    const isAIPrompt = query.startsWith('/') || query.startsWith('?');
    const TopIcon = isAIPrompt ? Sparkles : Command;

    return (
        <div className="theme-overlay fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] animate-in fade-in duration-150" onClick={() => setIsOpen(false)}>
            <div
                className={`theme-modal-panel w-[600px] max-w-[92vw] overflow-hidden animate-in zoom-in-95 slide-in-from-top-4 duration-150 ${isAIPrompt ? 'ring-1 ring-primary/30' : ''}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Omni Input Core */}
                <div className="theme-modal-header flex items-center gap-4 px-6 py-5 relative overflow-hidden">
                    {isAIPrompt && <div className="absolute inset-0 bg-primary/5 animate-pulse z-0" />}
                    <TopIcon size={24} className={`shrink-0 z-10 transition-colors duration-150 ${isAIPrompt ? 'text-primary' : 'text-muted'}`} />
                    <input
                        ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKeyDown}
                        placeholder={lang === 'ar' ? 'اسأل المساعد الذكي، أو اكتب أمر للتنفيذ...' : 'Ask AI, execute command, or search globally...'}
                        className="flex-1 bg-transparent text-lg font-bold text-main placeholder-muted/70 outline-none z-10"
                    />
                    <kbd className="hidden sm:flex items-center justify-center px-2 py-1 text-[10px] font-black text-muted bg-elevated rounded border border-border/50 uppercase tracking-widest z-10">ESC</kbd>
                </div>

                {/* Suggestions Engine */}
                <div className="max-h-[50vh] overflow-y-auto custom-scrollbar p-2">
                    {results.length === 0 && query.trim() && (
                        <div className="py-12 px-6 text-center">
                            <Brain size={32} className="text-muted/50 mx-auto mb-3" />
                            <p className="text-sm font-bold text-muted">{lang === 'ar' ? 'لم يتم التعرف على الأمر. المساعد الذكي يتدرب باستمرار.' : 'Command not recognized. AI is continuously learning.'}</p>
                        </div>
                    )}

                    {results.map((result, idx) => {
                        const Icon = result.icon;
                        const selected = idx === selectedIdx;
                        
                        // Theme coloring based on Omni Bar constraints
                        let colorClass = 'text-muted bg-transparent';
                        if (result.type === 'ai-query') colorClass = 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20';
                        else if (result.actionType === 'risky') colorClass = 'text-rose-500 bg-rose-500/10 border-rose-500/20';
                        else if (result.type === 'action') colorClass = 'text-amber-500 bg-amber-500/10 border-amber-500/20';
                        else colorClass = 'text-slate-500 bg-slate-500/10 border-slate-500/20';

                        return (
                            <button
                                key={result.id} onClick={() => handleSelect(result)} onMouseEnter={() => setSelectedIdx(idx)}
                                className={`w-full flex items-center justify-between gap-4 px-4 py-3 rounded-[16px] transition-all text-left mb-1 border border-transparent ${selected ? 'theme-active-row shadow-sm translate-x-1' : 'hover:bg-elevated/50'}`}
                            >
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className={`w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 border ${colorClass}`}>
                                        <Icon size={20} className={result.type === 'ai-query' ? 'animate-pulse' : ''} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-[15px] font-bold truncate ${selected ? 'text-main' : 'text-main/80'}`}>{result.title}</p>
                                        {result.subtitle && <p className="text-[11px] font-medium text-muted truncate mt-0.5">{result.subtitle}</p>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    {result.meta && <span className="text-[9px] font-black uppercase tracking-widest text-muted/60 bg-elevated px-2 py-1 rounded">{result.meta}</span>}
                                    {selected && <ArrowRight size={16} className="text-primary animate-in slide-in-from-left-2" />}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Omni Footer */}
                <div className="theme-modal-footer flex items-center justify-between px-6 py-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <Terminal size={12} className="text-primary" />
                        <span className="text-[10px] font-bold text-muted/70 tracking-widest uppercase">Autonomous Brain v5</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GlobalSearch;
