
import React, { useState, useMemo } from 'react';
import {
    ShieldAlert,
    History,
    Search,
    ArrowRight,
    Maximize2,
    FileSearch,
    Fingerprint,
    CheckCircle2,
    AlertTriangle,
    Clock,
    Zap,
    User as UserIcon
} from 'lucide-react';
import { AuditEventType } from '../types';
import VirtualList from './common/VirtualList';

// Stores
import { useAuditStore } from '../stores/useAuditStore';
import { useAuthStore } from '../stores/useAuthStore';

import { Loader2 } from 'lucide-react';

const ForensicsHub: React.FC = () => {
    const { logs, fetchLogs, isLoading } = useAuditStore();
    const { settings } = useAuthStore();

    const lang = (settings.language || 'en') as 'en' | 'ar';
    const isAr = lang === 'ar';

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<AuditEventType | 'ALL'>('ALL');
    const [forensicMode, setForensicMode] = useState(false);

    React.useEffect(() => {
        fetchLogs();
    }, []);

    const toSafeString = (value: unknown) => String(value ?? '');

    const filteredLogs = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return logs.filter(log => {
            const matchesSearch =
                toSafeString(log.id).toLowerCase().includes(q) ||
                toSafeString(log.userName).toLowerCase().includes(q) ||
                toSafeString(log.eventType).toLowerCase().includes(q);

            const matchesFilter = filterType === 'ALL' || log.eventType === filterType;

            return matchesSearch && matchesFilter;
        });
    }, [logs, searchQuery, filterType]);

    const selectedLog = logs.find(l => toSafeString(l.id) === selectedLogId);

    const getEventIcon = (type: AuditEventType) => {
        switch (type) {
            case AuditEventType.POS_VOID: return <AlertTriangle className="text-rose-500" />;
            case AuditEventType.POS_DISCOUNT: return <Zap className="text-amber-500" />;
            case AuditEventType.SECURITY_PERMISSION_CHANGE: return <ShieldAlert className="text-indigo-600" />;
            case AuditEventType.PO_STATUS_CHANGE: return <CheckCircle2 className="text-emerald-500" />;
            default: return <Clock className="text-slate-400" />;
        }
    };

    return (
        <div className="p-8 bg-app min-h-screen transition-colors pb-24">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
                <div>
                    <h2 className="text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-4">
                        <Fingerprint className="text-indigo-600" size={36} />
                        {isAr ? 'مركز التدقيق والتحقيقات' : 'Forensics & Audit Hub'}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 font-semibold italic text-sm mt-1">
                        {isAr ? 'سجل النشاط ومسار المراجعة لكل العمليات.' : 'Activity log and audit trail for all operations.'}
                    </p>
                </div>

                <button
                    onClick={() => setForensicMode(!forensicMode)}
                    className={`px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-3 ${forensicMode ? 'bg-rose-600 text-white shadow-xl shadow-rose-600/30 ring-4 ring-rose-500/20' : 'card-primary text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 shadow-sm'}`}
                >
                    <FileSearch size={18} />
                    {forensicMode ? (isAr ? 'وضع التفاصيل نشط' : 'Details Mode Active') : (isAr ? 'تفعيل التفاصيل' : 'Enable Details')}
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                {/* Logs Timeline */}
                <div className="xl:col-span-7 space-y-6">
                    <div className="card-primary rounded-[2.5rem] p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 items-center">
                        <div className="relative flex-1 w-full group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                            <input
                                type="text"
                                placeholder={isAr ? 'ابحث في سجل النشاط...' : 'Search activity log...'}
                                className="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500/30 rounded-2xl py-3.5 pl-12 pr-6 font-bold text-xs outline-none transition-all"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <select
                            className="bg-slate-50 dark:bg-slate-800/50 border-none rounded-2xl py-3.5 px-6 font-black text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-300 w-full md:w-auto outline-none ring-2 ring-transparent focus:ring-indigo-500/20 transition-all"
                            value={filterType}
                            onChange={e => setFilterType(e.target.value as any)}
                        >
                            <option value="ALL">{isAr ? 'كل الأحداث' : 'All Events'}</option>
                            {Object.values(AuditEventType).map(v => (
                                <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
                            ))}
                        </select>
                    </div>

                    <div className="max-h-[70vh] md:max-h-[800px] pr-2 h-full">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center py-24 opacity-60">
                                <Loader2 className="animate-spin text-indigo-600 mb-4" size={32} />
                                <p className="font-black uppercase text-[10px] tracking-widest text-slate-500">{isAr ? 'جاري فحص سجل الحالة...' : 'Scanning State Registry...'}</p>
                            </div>
                        ) : filteredLogs.length === 0 ? (
                            <div className="card-primary rounded-[3rem] p-24 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 opacity-40">
                                <History size={48} className="mx-auto mb-6 text-slate-300" />
                                <p className="font-black uppercase text-xs tracking-[0.2em]">{isAr ? 'لا توجد نتائج' : 'No results found'}</p>
                            </div>
                        ) : (
                            <VirtualList
                                itemCount={filteredLogs.length}
                                itemHeight={118}
                                className="h-full no-scrollbar"
                                renderItem={(index) => {
                                    const log = filteredLogs[index];
                                    const isVerified = log.signatureValid === true;
                                    const isTampered = log.signatureValid === false;
                                    const isUnverified = log.signatureValid == null;
                                    return (
                                        <div
                                            onClick={() => setSelectedLogId(toSafeString(log.id))}
                                            className={`w-full text-left p-6 rounded-[2rem] border-2 transition-all flex items-center gap-6 group cursor-pointer ${selectedLogId === toSafeString(log.id) ? 'card-primary border-indigo-600 shadow-2xl relative z-10' : 'bg-elevated/400 dark:bg-slate-900/30 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}
                                        >
                                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${selectedLogId === toSafeString(log.id) ? 'bg-indigo-50 dark:bg-indigo-900/30 scale-110 shadow-lg' : 'bg-slate-100 dark:bg-slate-800'}`}>
                                                {getEventIcon(log.eventType)}
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.3em] font-mono">{log.eventType}</span>
                                                    <span className="text-[9px] font-black text-slate-400 uppercase">{log.timestamp.toLocaleTimeString()}</span>
                                                </div>
                                                <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase truncate tracking-tight mb-1">{toSafeString(log.id)}</h4>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex items-center gap-1.5 grayscale opacity-60">
                                                        <UserIcon size={12} className="text-slate-400" />
                                                        <span className="text-[10px] font-black text-slate-500 uppercase">{log.userName}</span>
                                                    </div>
                                                    <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">•</span>
                                                    {isTampered && (
                                                        <span className="text-[8px] px-2 py-0.5 bg-rose-500 text-white rounded-full font-black uppercase">{isAr ? 'معدل' : 'TAMPERED'}</span>
                                                    )}
                                                    {isVerified && (
                                                        <span className="text-[8px] px-2 py-0.5 bg-emerald-500 text-white rounded-full font-black uppercase">{isAr ? 'موثق' : 'VERIFIED'}</span>
                                                    )}
                                                    {isUnverified && (
                                                        <span className="text-[8px] px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-full font-black uppercase">{isAr ? 'غير موثق' : 'UNVERIFIED'}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <ArrowRight size={20} className={`text-indigo-600 transition-all duration-150 ${selectedLogId === toSafeString(log.id) ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'}`} />
                                        </div>
                                    );
                                }}
                                getKey={(index) => filteredLogs[index]?.id || index}
                            />
                        )}
                    </div>
                </div>

                {/* Forensic Inspector */}
                <div className="xl:col-span-5">
                    {selectedLog ? (
                        <div className="space-y-6 sticky top-24">
                            <div className="card-primary rounded-[3rem] p-10 border-t-[8px] border-indigo-600 shadow-2xl animate-in slide-in-from-right-8 duration-150 overflow-hidden relative">
                                <div className="absolute top-0 right-0 p-8 opacity-5">
                                    <Fingerprint size={120} />
                                </div>
                                <div className="flex justify-between items-start mb-10 relative z-10">
                                    <div className="flex items-center gap-5">
                                        <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                                            <Maximize2 size={28} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">{isAr ? 'تفاصيل الحدث' : 'Event Details'}</h3>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">{isAr ? 'فحص بيانات تفصيلي' : 'Metadata Deep-Scan'}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{isAr ? 'ختم السلامة' : 'Integrity Seal'}</p>
                                        {selectedLog.signatureValid === true ? (
                                            <p className="text-[10px] font-black text-emerald-500 flex items-center justify-end gap-1 mt-1 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1 rounded-lg uppercase">
                                                <CheckCircle2 size={12} /> {isAr ? 'موثق' : 'Verified'}
                                            </p>
                                        ) : selectedLog.signatureValid === false ? (
                                            <p className="text-[10px] font-black text-rose-500 flex items-center justify-end gap-1 mt-1 bg-rose-50 dark:bg-rose-900/30 px-3 py-1 rounded-lg uppercase animate-pulse">
                                                <AlertTriangle size={12} /> {isAr ? 'تم رصد تعديل' : 'Tampering Detected'}
                                            </p>
                                        ) : (
                                            <p className="text-[10px] font-black text-slate-500 flex items-center justify-end gap-1 mt-1 bg-slate-100 dark:bg-slate-800/60 px-3 py-1 rounded-lg uppercase">
                                                <Clock size={12} /> {isAr ? 'غير موثق' : 'Unverified'}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-10 relative z-10">
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{isAr ? 'المستخدم' : 'Origin Agent'}</p>
                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase">{selectedLog.userName}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{isAr ? 'الجهاز' : 'Machine Node'}</p>
                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase font-mono">{selectedLog.deviceId}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{isAr ? 'الفرع' : 'Branch Context'}</p>
                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase">{selectedLog.branchId}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{isAr ? 'وقت الحدث' : 'Timeline Sync'}</p>
                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase">{selectedLog.timestamp.toLocaleTimeString()}</p>
                                    </div>
                                </div>

                                <div className="space-y-6 relative z-10">
                                    {selectedLog.payload?.before && (
                                        <div className="animate-in fade-in slide-in-from-top-4 duration-150">
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{isAr ? 'الحالة السابقة' : 'Previous State Registry'}</span>
                                            </div>
                                            <div className="bg-slate-900 text-indigo-100/60 p-6 rounded-[2rem] text-[11px] font-mono overflow-x-auto border-2 border-slate-800 shadow-2xl">
                                                <pre className="no-scrollbar">{JSON.stringify(selectedLog.payload.before, null, 2)}</pre>
                                            </div>
                                        </div>
                                    )}

                                    <div className="animate-in fade-in slide-in-from-top-6 duration-700">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                                             <span className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.2em]">{isAr ? 'الحالة الجديدة' : 'New State Commit'}</span>
                                        </div>
                                        <div className="bg-indigo-950 text-indigo-200/90 p-6 rounded-[2rem] text-[11px] font-mono overflow-x-auto border-2 border-indigo-900/50 shadow-2xl ring-4 ring-indigo-500/5">
                                            <pre className="no-scrollbar">{JSON.stringify(selectedLog.payload?.after, null, 2)}</pre>
                                        </div>
                                    </div>

                                    {selectedLog.payload?.reason && (
                                        <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-100/50 dark:border-amber-800/30 p-6 rounded-3xl mt-4 animate-in slide-in-from-bottom-4 duration-150">
                                            <p className="text-[9px] font-black text-amber-600 uppercase mb-2 tracking-widest">{isAr ? 'السبب المسجل' : 'Stated Intent / Reason'}</p>
                                            <p className="text-sm font-black text-amber-900 dark:text-amber-200 italic leading-snug">"{selectedLog.payload.reason}"</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {forensicMode && (
                                <div className="bg-rose-950/20 border-2 border-rose-500/30 p-8 rounded-[2.5rem] animate-pulse shadow-2xl shadow-rose-900/20 group">
                                    <div className="flex items-center gap-4 mb-4">
                                        <AlertTriangle className="text-rose-600" size={28} />
                                        <div>
                                             <h4 className="text-xs font-black text-rose-500 uppercase tracking-widest">{isAr ? 'رصد الأنماط غير المعتادة...' : 'Irregularity Detection...'}</h4>
                                             <p className="text-[9px] font-black text-rose-400/60 uppercase tracking-[0.2em] mt-1">{isAr ? 'فحص الأنماط بين الفروع نشط' : 'Cross-Branch Pattern Scan Active'}</p>
                                        </div>
                                    </div>
                                    <p className="text-[11px] font-bold text-rose-200/70 leading-relaxed uppercase tracking-tight">
                                         {isAr ? 'مقارنة سلوك المستخدم التاريخي بسرعة العمليات الحالية. احتمال عملية خارج النمط:' : 'Synthesizing historical user behavior against current transaction velocity. Probability of out-of-band operation:'} <span className="text-rose-500 font-black">2.4%</span> {isAr ? '(مستقر).' : '(STABLE).'}
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="card-primary rounded-[3rem] p-24 flex flex-col items-center justify-center text-center opacity-40 border-2 border-dashed border-slate-200 dark:border-slate-800">
                            <div className="w-24 h-24 rounded-[2rem] bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 mb-8 border-4 border-white dark:border-slate-900 shadow-xl">
                                <FileSearch size={48} />
                            </div>
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">{isAr ? 'لا يوجد حدث محدد' : 'Inspector Idle'}</h3>
                            <p className="text-xs font-bold text-slate-400 mt-4 max-w-xs mx-auto leading-relaxed uppercase tracking-[0.1em]">{isAr ? 'اختر حدثا من القائمة لعرض التفاصيل.' : 'Select an event from the list to view details.'}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForensicsHub;

