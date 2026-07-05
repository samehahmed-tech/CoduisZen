import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Headset, RefreshCw, Users, Bike, AlertTriangle, Shield, WifiOff, Calendar, Download, Server,
    Activity, Volume2, VolumeX, Hash, MapPin, Phone, Send, X, Star, BarChart3
} from 'lucide-react';
import { useCallCenterState } from './callcenter/useCallCenterState';

import { OverviewTab } from './callcenter/OverviewTab';
import { AgentsTab } from './callcenter/AgentsTab';
import { DriversTab } from './callcenter/DriversTab';
import { EscalationsTab } from './callcenter/EscalationsTab';
import { QualityTab } from './callcenter/QualityTab';
import { BranchesTab } from './callcenter/BranchesTab';
import { FailedTab } from './callcenter/FailedTab';
import { DailyTab } from './callcenter/DailyTab';

const tabAnimations = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } }
};

const CallCenterManager: React.FC = () => {
    const state = useCallCenterState();
    const {
        activeTab, setActiveTab, lang, autoRefresh, setAutoRefresh, soundEnabled, setSoundEnabled, exportCSV,
        showFilters, setShowFilters, selectedBranch, setSelectedBranch, branches, fromDate, setFromDate, toDate, setToDate,
        load, isLoading, lastRefresh, timeAgo, detailOrder, setOrderDetailId, getOrderNumber, getOrderStatus, getOrderDate,
        escalatedOrderIds, getCustomerName, getCustomerPhone, getDeliveryAddress, customerProfile, isLoadingCustomer,
        loadCustomer, fmtMoney, getOrderDiscount, getOrderTotal, createEscalation, tabs
    } = state;
    const tr = (ar: string, en: string) => lang === 'ar' ? ar : en;

    return (
        <div className="flex flex-col h-screen bg-app font-neo overflow-hidden relative z-10 selection:bg-primary/20">
            {/* Theme Native Animated Background */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-30">
                <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.2),transparent_60%)] blur-[100px] rounded-full animate-relative-pulse" />
                <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[60%] bg-[radial-gradient(ellipse_at_center,rgba(236,72,153,0.15),transparent_60%)] blur-[100px] rounded-full animate-relative-pulse delay-75" style={{ animationDelay: '2s' }} />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(var(--text-main),0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--text-main),0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
            </div>

            {/* Header Area */}
            <header className="flex-shrink-0 border-b border-border/40 bg-card/80 backdrop-blur-xl sticky top-0 z-30 shadow-sm flex flex-col">
                <div className="px-6 md:px-8 py-5 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                    <div className="flex items-center gap-5 focus:outline-none">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 transition-all duration-700 shadow-xl shadow-indigo-500/20 flex items-center justify-center text-white border border-white/10 shrink-0">
                            <Headset size={28} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-black text-main flex items-center gap-3 tracking-tighter uppercase leading-none drop-shadow-sm">
                                {lang === 'ar' ? 'مركز التحكم' : 'Command Center'}
                            </h1>
                            <div className="flex items-center gap-3 mt-2.5">
                                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase bg-app px-2.5 py-1 rounded-md border border-border/40">
                                    <Activity size={12} className={autoRefresh ? 'text-emerald-500 animate-pulse' : 'text-muted'} />
                                    {autoRefresh ? (lang === 'ar' ? 'البث متصل' : 'Live Sync') : (lang === 'ar' ? 'متوقف' : 'Paused')}
                                </span>
                                <span className="w-1 h-1 rounded-full bg-border" />
                                <span className="text-[10px] text-muted font-bold tracking-widest uppercase flex items-center gap-1.5">
                                    {tr('آخر فحص:', 'Last Check:')} {timeAgo(lastRefresh)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 bg-app/50 p-1.5 rounded-2xl border border-border/30 shadow-inner">
                        <button onClick={() => setAutoRefresh((p: boolean) => !p)} className={`p-2.5 rounded-xl transition-colors group relative ${autoRefresh ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shadow-sm' : 'hover:bg-elevated/50 text-muted hover:text-main'}`}>
                            <RefreshCw size={18} className={autoRefresh ? 'animate-spin' : ''} />
                        </button>
                        <div className="w-px h-5 bg-border/50" />
                        <button onClick={() => setSoundEnabled((p: boolean) => !p)} className={`p-2.5 rounded-xl transition-colors group relative ${soundEnabled ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-sm' : 'hover:bg-elevated/50 text-muted hover:text-main'}`}>
                            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                        </button>
                        <div className="w-px h-5 bg-border/50" />
                        <button onClick={exportCSV} className="p-2.5 rounded-xl text-success hover:bg-success/10 transition-colors group relative">
                            <Download size={18} />
                        </button>
                    </div>
                </div>

                {/* Filter Toolbar */}
                <div className="px-6 md:px-8 py-3 bg-app/40 border-t border-border/30 flex flex-wrap items-center gap-3">
                     <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted mr-2">
                         {tr('الفلاتر:', 'Filters:')}
                     </div>
                     <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} className="bg-card border border-border/60 p-1 pl-3 pr-2 rounded-lg shadow-sm text-[11px] font-bold text-main outline-none focus:text-primary min-w-[120px] cursor-pointer appearance-none">
                         <option value="">{lang === 'ar' ? 'كل الشبكات' : 'Global Net'}</option>
                         {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                     </select>
                     <div className="flex items-center gap-2 bg-card border border-border/60 p-1 px-3 rounded-lg shadow-sm">
                         <Calendar size={14} className="text-primary" />
                         <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-transparent text-[11px] font-bold text-main outline-none cursor-pointer" />
                         <span className="text-muted">—</span>
                         <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-transparent text-[11px] font-bold text-main outline-none cursor-pointer" />
                     </div>
                     <button onClick={() => load()} disabled={isLoading} className="px-5 py-2 rounded-lg bg-primary text-[10px] font-black uppercase tracking-widest text-white hover:bg-primary-hover transition-all shadow-md flex items-center gap-2">
                        {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <span>{tr('فحص الشبكة', 'Scan Network')}</span>}
                     </button>
                </div>
            </header>

            {/* Scrollable Content Area */}
            <div className="flex-1 w-full overflow-hidden flex flex-col md:flex-row relative z-10">
                {/* Advanced Side Tabs Menu */}
                <div className="w-full md:w-[240px] flex-shrink-0 bg-sidebar/90 backdrop-blur-3xl border-r border-border/40 flex flex-col shadow-2xl z-20">
                     <nav className="flex-1 w-full overflow-y-auto pos-scroll p-3 space-y-1.5 hide-scrollbar">
                        {tabs.map((t: any) => {
                             const isActive = activeTab === t.id;
                             return (
                                 <button
                                     key={t.id}
                                     onClick={() => setActiveTab(t.id)}
                                     className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden ${isActive ? 'bg-primary/10 border border-primary/20' : 'hover:bg-elevated/50 border border-transparent'}`}
                                 >
                                     <div className="flex items-center gap-3">
                                         <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${isActive ? 'bg-primary shadow-md text-white' : 'bg-app text-slate-500 dark:text-slate-400 group-hover:bg-elevated group-hover:text-slate-900 dark:group-hover:text-white'}`}>
                                             <t.icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                                         </div>
                                         <span className={`relative z-10 text-[11px] font-black uppercase tracking-widest leading-none ${isActive ? 'text-primary' : 'text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`}>
                                             {t.label}
                                         </span>
                                     </div>
                                     {t.badge !== undefined && t.badge > 0 && (
                                         <span className={`relative z-10 flex items-center justify-center min-w-[20px] h-5 px-1 rounded-md text-[10px] font-black ${isActive ? 'bg-primary text-white shadow-sm' : 'bg-elevated text-main border border-border/50'}`}>
                                             {t.badge > 99 ? '99+' : t.badge}
                                         </span>
                                     )}
                                 </button>
                             )
                        })}
                     </nav>
                </div>

                {/* Main Views */}
                <div className="flex-1 overflow-y-auto pos-scroll bg-gradient-to-br from-app to-app/50 p-6 md:p-8">
                    <AnimatePresence mode="wait">
                        <motion.div key={activeTab} {...tabAnimations} className="h-full max-w-7xl mx-auto space-y-6">
                            {activeTab === 'overview' && <OverviewTab state={state} />}
                            {activeTab === 'agents' && <AgentsTab state={state} />}
                            {activeTab === 'drivers' && <DriversTab state={state} />}
                            {activeTab === 'escalations' && <EscalationsTab state={state} />}
                            {activeTab === 'quality' && <QualityTab state={state} />}
                            {activeTab === 'branches' && <BranchesTab state={state} />}
                            {activeTab === 'failed' && <FailedTab state={state} />}
                            {activeTab === 'daily' && <DailyTab state={state} />}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Modal: Order Details */}
            {detailOrder && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-app/80 backdrop-blur-md" onClick={(e) => { if (e.target === e.currentTarget) setOrderDetailId(null); }}>
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-2xl bg-card border border-border/50 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="bg-elevated/40 p-5 px-6 border-b border-border/50 flex justify-between items-center z-10 sticky top-0">
                             <div className="flex items-center gap-3">
                                 <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner border border-primary/20"><Hash size={20} /></div>
                                 <h2 className="text-lg font-black uppercase tracking-tighter text-main">{tr('طلب', 'Order')} {getOrderNumber(detailOrder)}</h2>
                             </div>
                             <button onClick={() => setOrderDetailId(null)} className="p-2 rounded-xl border border-border/50 hover:bg-danger/10 hover:border-danger/30 hover:text-danger text-muted transition-all"><X size={18} /></button>
                        </div>
                        <div className="p-6 overflow-y-auto pos-scroll flex-1 space-y-6 bg-app/30">
                            {/* Same beautiful details layout */}
                             <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
                                 <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-3">{tr('بيانات الطلب', 'Order Specs')}</h4>
                                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                     <div>
                                         <p className="text-[10px] uppercase text-muted font-bold">{tr('الحالة', 'Status')}</p>
                                         <p className="text-sm font-black text-main">{getOrderStatus(detailOrder)}</p>
                                     </div>
                                     <div>
                                         <p className="text-[10px] uppercase text-muted font-bold">{tr('الوقت', 'Time')}</p>
                                         <p className="text-sm font-black text-main">{getOrderDate(detailOrder).toLocaleTimeString()}</p>
                                     </div>
                                     <div>
                                         <p className="text-[10px] uppercase text-muted font-bold">{tr('الإجمالي', 'Total')}</p>
                                         <p className="text-sm font-black text-primary">{fmtMoney(getOrderTotal(detailOrder))}</p>
                                     </div>
                                 </div>
                             </div>
                             <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
                                 <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-3">{tr('بيانات العميل', 'Identity Details')}</h4>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div>
                                         <p className="text-[10px] uppercase text-muted font-bold">{tr('الاسم', 'Name')}</p>
                                         <p className="text-sm font-black text-main">{getCustomerName(detailOrder)}</p>
                                     </div>
                                     <div>
                                         <p className="text-[10px] uppercase text-muted font-bold">{tr('الهاتف', 'Phone')}</p>
                                         <p className="text-sm font-black text-main">{getCustomerPhone(detailOrder) || '---'}</p>
                                     </div>
                                     <div className="col-span-2">
                                         <p className="text-[10px] uppercase text-muted font-bold">{tr('العنوان', 'Address')}</p>
                                         <p className="text-sm font-black text-main flex gap-2 items-center"><MapPin size={14} className="text-primary" /> {getDeliveryAddress(detailOrder)}</p>
                                     </div>
                                 </div>
                             </div>
                        </div>
                        <div className="bg-elevated/40 p-5 px-6 border-t border-border/50 flex justify-end gap-3 sticky bottom-0">
                           <button onClick={() => setOrderDetailId(null)} className="px-5 py-2.5 rounded-xl border border-border/50 text-xs font-bold text-main hover:bg-border/30 transition-all">{tr('إغلاق', 'Close Viewer')}</button>
                           <button onClick={() => { createEscalation(detailOrder); setOrderDetailId(null); }} className="px-5 py-2.5 rounded-xl bg-danger text-xs font-black uppercase tracking-widest text-white hover:bg-danger-hover shadow-md flex items-center gap-2 transition-all"><AlertTriangle size={14}/> {tr('تصعيد تنبيه', 'Escalate Alert')} </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default CallCenterManager;
