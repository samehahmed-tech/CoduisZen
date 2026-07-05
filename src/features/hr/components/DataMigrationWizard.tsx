import React, { useRef, useState } from 'react';
import { 
    FileText, UploadCloud, CheckCircle, AlertTriangle, Database,
    Users, Clock, X, ArrowRight, Sparkles
} from 'lucide-react';
import { apiRequest } from '../../../../services/api/core';
const api = {
    get: (url: string) => apiRequest<any>(url.replace(/^\/api(?=\/|$)/, '')).then(d => ({ data: d })),
    post: (url: string, data: any, options?: any) => apiRequest<any>(url.replace(/^\/api(?=\/|$)/, ''), { method: 'POST', body: data ? (typeof data === 'string' ? data : JSON.stringify(data)) : undefined, ...options }).then(d => ({ data: d })),
    put: (url: string, data: any) => apiRequest<any>(url.replace(/^\/api(?=\/|$)/, ''), { method: 'PUT', body: JSON.stringify(data) }).then(d => ({ data: d }))
};
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

type MigrationType = 'attendance' | 'users';

const ENTITY_OPTIONS: { key: MigrationType; label: string; labelAr: string; description: string; icon: any; color: string; fields: string }[] = [
    { key: 'attendance', label: 'Historical Attendance', labelAr: 'بيانات الحضور التاريخية', description: 'استيراد سجلات البصمة من النظام القديم', icon: Clock, color: '#f59e0b', fields: 'employee_id, device_id, punch_time, punch_type' },
    { key: 'users', label: 'Employee Roster', labelAr: 'كشف الموظفين', description: 'استيراد بيانات الموظفين الأساسية', icon: Users, color: '#3b82f6', fields: 'name, email, pin, role' },
];

export default function DataMigrationWizard() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [migrationType, setMigrationType] = useState<MigrationType>('attendance');

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setResult(null);
        try {
            const text = await file.text();
            const response = await api.post(`/api/migration/${migrationType}/upload`, text, {
                headers: { 'Content-Type': 'text/plain' }
            });
            setResult(response.data);
            toast.success('تم الاستيراد بنجاح');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'فشل الاستيراد');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const selectedEntity = ENTITY_OPTIONS.find(o => o.key === migrationType)!;

    return (
        <div className="relative min-h-screen bg-app text-main overflow-hidden pb-32" dir="rtl">
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-15%] right-[-5%] w-[600px] h-[600px] rounded-full bg-indigo-500/5 blur-[140px] animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-violet-500/5 blur-[120px]" />
            </div>

            <div className="relative z-10 p-6 lg:p-10 mx-auto max-w-4xl space-y-8">
                {/* Header */}
                <header className="flex items-center gap-5 pb-6 border-b border-border/20">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-indigo-500 rounded-2xl blur-lg opacity-40 group-hover:opacity-70 transition-opacity duration-500" />
                        <div className="relative w-16 h-16 rounded-2xl bg-card border border-border/50 flex items-center justify-center shadow-xl shadow-indigo-500/20">
                            <Database className="w-8 h-8 text-indigo-500" />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
                            استيراد البيانات
                            <span className="px-3 py-1 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded-full text-[10px] uppercase tracking-widest font-black">CSV Import</span>
                        </h1>
                        <p className="text-xs font-bold text-muted mt-2 opacity-60 uppercase tracking-widest">
                            نقل البيانات من الأنظمة القديمة إلى Coduis Zen
                        </p>
                    </div>
                </header>

                {/* Entity Selection */}
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted mb-5 flex items-center gap-2">
                        <Sparkles size={12} /> اختر نوع البيانات
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {ENTITY_OPTIONS.map((entity) => (
                            <motion.button key={entity.key} whileHover={{ y: -3, scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                onClick={() => { setMigrationType(entity.key); setResult(null); }}
                                className={`relative overflow-hidden p-6 text-right rounded-[2rem] border-2 transition-all ${migrationType === entity.key ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-border/40 bg-card/60 hover:border-border/80'}`}
                            >
                                <div className="absolute top-0 left-0 w-20 h-20 blur-[40px] opacity-30" style={{ backgroundColor: entity.color }} />
                                <div className="relative z-10 flex items-center gap-4">
                                    <div className="p-4 rounded-2xl border" style={{ borderColor: `${entity.color}30`, backgroundColor: `${entity.color}15`, color: entity.color }}>
                                        <entity.icon size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-sm uppercase tracking-tight mb-1">{entity.labelAr}</h3>
                                        <p className="text-[9px] font-bold text-muted">{entity.description}</p>
                                    </div>
                                </div>
                                {migrationType === entity.key && (
                                    <motion.div layoutId="entitySelection" className="absolute inset-0 border-2 border-indigo-500/40 rounded-[2rem] pointer-events-none" />
                                )}
                            </motion.button>
                        ))}
                    </div>
                </div>

                {/* Required Fields */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="p-5 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl"
                >
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500 mb-2">الحقول المطلوبة في ملف CSV</p>
                    <p className="text-xs font-bold text-muted dir-ltr font-mono">{selectedEntity.fields}</p>
                </motion.div>

                {/* Upload Zone */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="relative bg-card/60 backdrop-blur-3xl border-2 border-dashed border-border/50 rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center hover:border-indigo-500/40 transition-all group shadow-xl cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/3 to-violet-500/3 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[2.5rem]" />
                    
                    <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}
                        className="p-6 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 mb-6 shadow-xl shadow-indigo-500/10"
                    >
                        <UploadCloud size={40} />
                    </motion.div>

                    <h3 className="text-lg font-black uppercase tracking-tight mb-3">ارفع ملف CSV</h3>
                    <p className="text-[10px] font-bold text-muted uppercase tracking-widest max-w-md leading-relaxed mb-8">
                        اسحب الملف وأفلته هنا أو اضغط لاستعراض الملفات. الملفات الكبيرة ({'>'}5MB) قد تأخذ عدة ثوانٍ.
                    </p>

                    <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        className={`px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl ${uploading ? 'bg-indigo-500/20 text-indigo-300' : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-indigo-500/30'}`}
                    >
                        {uploading ? (
                            <span className="flex items-center gap-3">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                جارٍ التحليل والاستيراد...
                            </span>
                        ) : (
                            <span className="flex items-center gap-3">
                                <FileText size={16} /> اختر ملف CSV
                            </span>
                        )}
                    </motion.div>
                </motion.div>

                {/* Results */}
                <AnimatePresence>
                    {result && (
                        <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-emerald-500/5 border border-emerald-500/20 rounded-[2.5rem] p-8 shadow-xl"
                        >
                            <div className="flex items-start gap-5 mb-6">
                                <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex-shrink-0">
                                    <CheckCircle size={28} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tight text-emerald-500 mb-2">تم الاستيراد بنجاح</h3>
                                    <p className="text-sm font-bold text-muted">
                                        تم إدراج <span className="text-emerald-500 font-black">{result.imported || 0}</span> سجل بنجاح
                                    </p>
                                </div>
                            </div>

                            {(result.failed > 0 || result.skipped > 0) && (
                                <div className="p-5 bg-rose-500/5 border border-rose-500/20 rounded-2xl flex items-center gap-4">
                                    <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                                    <p className="text-[11px] font-bold text-rose-500">
                                        تم تخطي {result.failed || result.skipped || 0} سجل بسبب أخطاء في التنسيق أو تكرار
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
