import React, { useState, useEffect } from 'react';
import { 
    CheckSquare, Plus, Save, Clock, Users, Building2, ChevronDown, ListTodo, ShieldAlert
} from 'lucide-react';
import { apiRequest } from '../../../../services/api/core';
const api = {
    get: (url: string) => apiRequest<any>(url.replace(/^\/api(?=\/|$)/, '')).then(d => ({ data: d })),
    post: (url: string, data: any) => apiRequest<any>(url.replace(/^\/api(?=\/|$)/, ''), { method: 'POST', body: JSON.stringify(data) }).then(d => ({ data: d })),
    put: (url: string, data: any) => apiRequest<any>(url.replace(/^\/api(?=\/|$)/, ''), { method: 'PUT', body: JSON.stringify(data) }).then(d => ({ data: d }))
};
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/useAuthStore';

export default function TaskChecklistManager() {
    const { branchId } = useAuthStore();
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'LIST' | 'CREATE'>('LIST');
    const [formData, setFormData] = useState({ name: '', description: '', type: 'DAILY', requiresVerification: false, isActive: true });

    useEffect(() => { loadTasks(); }, [branchId]);

    const loadTasks = async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/api/hr-extended/shift-tasks${branchId ? `?branchId=${branchId}` : ''}`);
            setTasks(data || []);
        } catch { toast.error('فشل في تحميل المهام'); }
        finally { setLoading(false); }
    };

    const handleSave = async () => {
        if (!formData.name) return toast.error('يرجى إدخال اسم المهمة');
        try {
            await api.post('/api/hr-extended/shift-tasks', { ...formData, branchId: branchId || 'HQ' });
            toast.success('تم الحفظ بنجاح');
            setView('LIST');
            loadTasks();
            setFormData({ name: '', description: '', type: 'DAILY', requiresVerification: false, isActive: true });
        } catch { toast.error('فشل في حفظ المهمة'); }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'OPENING': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
            case 'CLOSING': return 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20';
            case 'CLEANING': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
            default: return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
        }
    };

    const itemVariants = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: 'spring', damping: 25 } } } as const;

    return (
        <div className="relative min-h-screen bg-app text-main overflow-hidden pb-32" dir="rtl">
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] right-[20%] w-[600px] h-[600px] rounded-full bg-violet-500/5 blur-[150px] animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-fuchsia-600/5 blur-[120px]" />
            </div>

            <div className="relative z-10 p-6 lg:p-10 mx-auto max-w-5xl space-y-8">
                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-border/20">
                    <div className="flex items-center gap-5">
                        <div className="relative group">
                            <div className="absolute inset-0 bg-violet-500 rounded-2xl blur-lg opacity-40 group-hover:opacity-70 transition-opacity duration-500" />
                            <div className="relative w-16 h-16 rounded-2xl bg-card border border-border/50 flex items-center justify-center shadow-xl shadow-violet-500/20">
                                <ListTodo className="w-8 h-8 text-violet-500" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
                                مهام التشغيل والورديات
                            </h1>
                            <p className="text-xs font-bold text-muted mt-2 opacity-60 uppercase tracking-widest">
                                إعداد قوائم الإجراءات (Checklists) والتأكد من إنجازها
                            </p>
                        </div>
                    </div>

                    <AnimatePresence mode="wait">
                        {view === 'LIST' ? (
                            <motion.button key="btn-add" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setView('CREATE')}
                                className="relative overflow-hidden group h-14 flex items-center gap-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-8 rounded-2xl shadow-xl shadow-violet-500/30 font-black text-[10px] uppercase tracking-[0.2em]"
                            >
                                <Plus size={18} /> إضافة مهمة جديدة
                            </motion.button>
                        ) : (
                            <div key="btn-group" className="flex gap-3">
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setView('LIST')}
                                    className="h-14 px-8 rounded-2xl bg-card border border-border/40 text-muted font-black text-[10px] uppercase tracking-[0.2em] hover:text-main"
                                >
                                    إلغاء
                                </motion.button>
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleSave}
                                    className="h-14 px-8 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-emerald-500/30 flex items-center gap-2"
                                >
                                    <Save size={18} /> حفظ
                                </motion.button>
                            </div>
                        )}
                    </AnimatePresence>
                </header>

                <AnimatePresence mode="wait">
                    {view === 'LIST' ? (
                        <motion.div key="list" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                            {tasks.map((task) => (
                                <motion.div variants={itemVariants} key={task.id} className="bg-card/60 backdrop-blur-3xl border border-border/40 rounded-[2rem] p-6 shadow-xl flex flex-col md:flex-row gap-6 justify-between items-start md:items-center hover:bg-card/80 transition-all">
                                    <div className="flex items-start gap-5">
                                        <div className="w-12 h-12 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center border border-violet-500/20 flex-shrink-0 mt-1 cursor-pointer hover:bg-violet-500/20 transition-colors">
                                            <CheckSquare size={24} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="font-black text-lg uppercase tracking-tight">{task.name}</h3>
                                                <span className={`px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest ${getTypeColor(task.type)}`}>
                                                    {task.type}
                                                </span>
                                            </div>
                                            <p className="text-xs font-bold text-muted uppercase tracking-wider">{task.description || 'لا يوجد وصف للمهمة'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest px-4 py-3 bg-elevated/40 rounded-2xl border border-border/30">
                                        {task.requiresVerification ? (
                                            <span className="flex items-center gap-2 text-amber-500"><ShieldAlert size={14} /> تحتاج تحقق المشرف</span>
                                        ) : (
                                            <span className="flex items-center gap-2 text-emerald-500"><Users size={14} /> تنفذ ذاتياً</span>
                                        )}
                                        <div className="w-px h-4 bg-border/50" />
                                        <span className={task.isActive ? 'text-main' : 'text-rose-500'}>
                                            {task.isActive ? 'مفعلة' : 'معطلة'}
                                        </span>
                                    </div>
                                </motion.div>
                            ))}

                            {!loading && tasks.length === 0 && (
                                <div className="text-center p-16 bg-card/30 border border-dashed border-border/40 rounded-[2.5rem]">
                                    <ListTodo className="w-16 h-16 text-muted mx-auto mb-4 opacity-50" />
                                    <p className="text-sm text-muted font-black tracking-widest uppercase">لم يتم تعريف أي مهام تشغيل بعد</p>
                                    <p className="text-[10px] text-muted opacity-60 uppercase tracking-widest mt-2">قم بإنشاء قوائم الإغلاق والفتح من الزر في الأعلى</p>
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, y: 20 }}
                            className="bg-card/60 backdrop-blur-3xl border border-border/40 rounded-[2.5rem] p-8 shadow-2xl space-y-6"
                        >
                            <div>
                                <label className="block text-[10px] font-black tracking-[0.3em] uppercase text-muted mb-2">اسم المهمة</label>
                                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="مثال: تعقيم ماكينة الإسبريسو" className="w-full bg-elevated/50 border border-border/30 rounded-2xl px-6 py-4 outline-none focus:border-violet-500/50 transition-colors font-bold text-sm" />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black tracking-[0.3em] uppercase text-muted mb-2">الوصف والإرشادات</label>
                                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} placeholder="ما هي الخطوات المطلوبة لإنهاء هذه المهمة..." className="w-full bg-elevated/50 border border-border/30 rounded-2xl px-6 py-4 outline-none focus:border-violet-500/50 transition-colors font-bold text-sm resize-none custom-scrollbar" />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black tracking-[0.3em] uppercase text-muted mb-2">نوع المهمة (وقت التنفيذ)</label>
                                    <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full bg-elevated/50 border border-border/30 rounded-2xl px-6 py-4 outline-none focus:border-violet-500/50 transition-colors font-bold text-sm appearance-none">
                                        <option value="DAILY">يومية (متكررة)</option>
                                        <option value="OPENING">عن فتح الفرع</option>
                                        <option value="CLOSING">عند إغلاق الفرع</option>
                                        <option value="CLEANING">حملات نظافة</option>
                                    </select>
                                </div>
                                
                                <div className="space-y-4 pt-8">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className={`w-6 h-6 flex items-center justify-center rounded-md border transition-colors ${formData.requiresVerification ? 'bg-violet-500 border-violet-500 text-white' : 'border-border/50 text-transparent group-hover:border-violet-500/50'}`}>
                                            <CheckSquare size={16} />
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-widest">يجب تحقق مشرف الوردية لإغلاقها</span>
                                        <input type="checkbox" className="hidden" checked={formData.requiresVerification} onChange={e => setFormData({...formData, requiresVerification: e.target.checked})} />
                                    </label>

                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className={`w-6 h-6 flex items-center justify-center rounded-md border transition-colors ${formData.isActive ? 'bg-violet-500 border-violet-500 text-white' : 'border-border/50 text-transparent group-hover:border-violet-500/50'}`}>
                                            <CheckSquare size={16} />
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-widest">تفعيل فوري للمهمة</span>
                                        <input type="checkbox" className="hidden" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} />
                                    </label>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
