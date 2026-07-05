import React, { useEffect, useState, useMemo } from 'react';
import {
  Search, Plus, Star, Phone, MapPin, UserCheck,
  ShieldCheck, TrendingUp, ShoppingBag, Save, Users as UsersGroup,
  ChevronRight, X, AlertTriangle, Activity, Award, Layers
} from 'lucide-react';
import { Customer } from '../types';
import { useCRMStore } from '../stores/useCRMStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useOrderStore } from '../stores/useOrderStore';
import { useDebounce } from '../hooks';
import { motion, AnimatePresence } from 'framer-motion';

const CRMMetric: React.FC<{
  label: string;
  value: any;
  icon: any;
  color: string;
}> = ({ label, value, icon: Icon, color }) => (
  <motion.div 
    whileHover={{ y: -5, scale: 1.02 }} 
    className="relative group overflow-hidden bg-card/60 backdrop-blur-3xl border border-border/40 rounded-[2rem] p-6 transition-all hover:bg-card/80 hover:shadow-2xl hover:border-border/60"
  >
    <div className={`absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-30 group-hover:opacity-60 transition-opacity duration-500`} style={{ backgroundColor: color }} />
    <div className="flex items-start justify-between relative z-10">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: color }}/> {label}
        </p>
        <h2 className="text-3xl font-black text-main tracking-tighter tabular-nums flex items-end gap-1.5">
          {value}
        </h2>
      </div>
      <div className={`p-4 rounded-2xl border flex items-center justify-center shadow-lg transition-transform duration-500 group-hover:rotate-12`} style={{ borderColor: `${color}30`, backgroundColor: `${color}15`, color }}>
        <Icon size={24} />
      </div>
    </div>
  </motion.div>
);

const CRM: React.FC = () => {
  const { customers, addCustomer, fetchCustomers } = useCRMStore();
  const { settings } = useAuthStore();
  const lang = settings.language || 'en';
  const isAr = lang === 'ar';
  const tr = (en: string, ar: string) => isAr ? ar : en;

  const { orders } = useOrderStore();

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formError, setFormError] = useState('');

  const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({ name: '', phone: '', address: '' });

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c =>
      c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      c.phone.includes(debouncedSearch) ||
      (c.loyaltyTier && c.loyaltyTier.toLowerCase().includes(debouncedSearch.toLowerCase()))
    );
  }, [customers, debouncedSearch]);

  const activeLoyaltyMembers = useMemo(() => customers.filter(c => c.loyaltyPoints > 0).length, [customers]);
  const avgLTV = useMemo(() => customers.length > 0 ? customers.reduce((s, c) => s + c.totalSpent, 0) / customers.length : 0, [customers]);
  const atRiskProfiles = useMemo(() => customers.filter(c => {
    if (!c.createdAt) return false;
    const daysSince = (Date.now() - new Date(c.createdAt).getTime()) / (1000 * 3600 * 24);
    return c.visits < 2 && daysSince > 30;
  }).length, [customers]);

  const isPhoneValid = (phone?: string) => {
    if (!phone) return false;
    const cleaned = phone.replace(/[\s\-()]/g, '');
    return /^01[0-9]{9}$/.test(cleaned) || /^\+201[0-9]{9}$/.test(cleaned);
  };

  const cleanPhone = (phone: string) => phone.replace(/[\s\-()]/g, '');

  const handleSaveCustomer = async () => {
    const name = newCustomer.name?.trim() || '';
    const phone = newCustomer.phone?.trim() || '';

    if (!name || !phone) {
      setFormError(tr('Customer name and phone are required.', 'اسم العميل ورقم الهاتف مطلوبان.'));
      return;
    }

    if (!isPhoneValid(phone)) {
      setFormError(tr('Enter a valid Egyptian mobile number.', 'ادخل رقم موبايل مصري صحيح.'));
      return;
    }

    try {
      await addCustomer({
        name,
        phone: cleanPhone(phone),
        address: newCustomer.address?.trim(),
        loyaltyPoints: 0,
        totalSpent: 0,
        visits: 0,
        loyaltyTier: 'Bronze'
      });
      setFormError('');
      setShowAddModal(false);
      setNewCustomer({ name: '', phone: '', address: '' });
    } catch (error) {
      setFormError(tr('Could not save customer. Try again.', 'تعذر حفظ العميل. حاول مرة أخرى.'));
    }
  };

  const getTierColor = (tier?: string) => {
    switch (tier?.toLowerCase()) {
      case 'platinum': return 'text-violet-500 bg-violet-500/10 border-violet-500/30';
      case 'gold': return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
      case 'silver': return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
      default: return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
    }
  };

  const tierLabel = (tier?: string) => {
    const normalizedTier = (tier || 'Bronze').toLowerCase();
    const labels: Record<string, string> = {
      platinum: tr('Platinum', 'بلاتيني'),
      gold: tr('Gold', 'ذهبي'),
      silver: tr('Silver', 'فضي'),
      bronze: tr('Bronze', 'برونزي')
    };
    return labels[normalizedTier] || tier || labels.bronze;
  };

  const orderStatusLabel = (status?: string) => {
    const normalizedStatus = (status || '').toLowerCase();
    const labels: Record<string, string> = {
      pending: tr('Pending', 'قيد الانتظار'),
      confirmed: tr('Confirmed', 'مؤكد'),
      preparing: tr('Preparing', 'قيد التحضير'),
      ready: tr('Ready', 'جاهز'),
      completed: tr('Completed', 'مكتمل'),
      cancelled: tr('Cancelled', 'ملغي')
    };
    return labels[normalizedStatus] || status || '-';
  };

  const getAITag = (customer: Customer) => {
    if (customer.totalSpent > 5000) return { label: tr('High Value', 'عميل عالي القيمة'), color: 'text-violet-500 border-violet-500/30' };
    if (customer.visits > 10) return { label: tr('Frequent', 'عميل متكرر'), color: 'text-emerald-500 border-emerald-500/30' };
    if (customer.visits === 1) return { label: tr('One Visit', 'زيارة واحدة'), color: 'text-amber-500 border-amber-500/30' };
    return { label: tr('Standard', 'سلوك عادي'), color: 'text-slate-400 border-slate-400/30' };
  };

  const customerInsight = selectedCustomer && selectedCustomer.visits > 5
    ? tr(
        'High engagement profile. Weekend demand is strong, so prioritize loyalty perks.',
        'العميل عالي التفاعل. الطلب في نهاية الأسبوع قوي، لذلك يفضل منحه مزايا ولاء.'
      )
    : tr(
        'Profile is still developing. Send a retention message before the next campaign.',
        'ملف العميل ما زال في بدايته. ارسل رسالة استبقاء قبل الحملة القادمة.'
      );

  const listVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } }
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300 } }
  } as const;

  return (
    <div className="relative min-h-screen bg-app text-main overflow-hidden pb-32">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] rounded-full bg-indigo-500/5 blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[700px] h-[700px] rounded-full bg-violet-500/5 blur-[120px]" />
      </div>

      <div className="relative z-10 p-6 lg:p-10 mx-auto max-w-[2000px] space-y-8">
        
        {/* Header */}
        <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 pb-6 border-b border-border/20">
          <div className="flex items-center gap-5">
            <div className="relative group">
               <div className="absolute inset-0 bg-indigo-500 rounded-2xl blur-lg opacity-40 group-hover:opacity-70 transition-opacity duration-500" />
               <div className="relative w-16 h-16 rounded-2xl bg-card border border-border/50 flex items-center justify-center shadow-xl shadow-indigo-500/20">
                 <ShieldCheck className="w-8 h-8 text-indigo-500" />
               </div>
            </div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-black uppercase tracking-tight flex items-center gap-3">
                {tr('CRM Intelligence', 'مركز العملاء')}
                <span className="hidden md:flex flex-col items-center justify-center px-3 py-1 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded-full text-[10px] uppercase tracking-widest">
                  {tr('Active', 'نشط')}
                </span>
              </h1>
              <p className="text-xs font-bold text-muted mt-2 opacity-60 uppercase tracking-widest">
                {tr('Holistic Customer Database & Velocity Metrics', 'إدارة علاقات العملاء وتحليل السلوك الشامل')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { setFormError(''); setShowAddModal(true); }}
                className="relative overflow-hidden group h-14 flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-8 rounded-2xl shadow-xl shadow-indigo-500/30 transition-all font-black text-[10px] uppercase tracking-[0.2em]"
              >
                <div className="absolute inset-0 bg-white/20 w-32 skew-x-12 -translate-x-full group-hover:translate-x-[400%] transition-transform duration-1000" />
                <Plus size={18} /> {tr('Add Customer', 'إضافة عميل')}
              </motion.button>
              <button
                onClick={() => window.location.reload()}
                className="h-14 w-14 rounded-2xl bg-card border border-border/40 text-muted flex items-center justify-center hover:text-indigo-500 transition-all shadow-sm"
                aria-label={tr('Refresh customers', 'تحديث العملاء')}
                title={tr('Refresh customers', 'تحديث العملاء')}
              >
                <Activity size={20} />
              </button>
          </div>
        </header>

        {/* Metrics Row */}
        <motion.section initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <CRMMetric label={tr('Customers', 'العملاء')} value={customers.length.toLocaleString()} icon={UsersGroup} color="#6366f1" />
          <CRMMetric label={tr('Active Loyalty', 'أعضاء الولاء')} value={activeLoyaltyMembers.toLocaleString()} icon={Award} color="#10b981" />
          <CRMMetric label={tr('Average Spend', 'متوسط الإنفاق')} value={`${avgLTV.toFixed(0)} LE`} icon={TrendingUp} color="#0ea5e9" />
          <CRMMetric label={tr('At Risk', 'معرضون للتسرب')} value={atRiskProfiles} icon={AlertTriangle} color="#f43f5e" />
        </motion.section>

        {/* Search & Filter */}
        <div className="relative w-full group">
          <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none z-10">
            <Search className="text-muted group-focus-within:text-indigo-500 transition-colors w-6 h-6" />
          </div>
          <input
            type="text"
            placeholder={tr('Search by name, phone, or loyalty tier...', 'بحث بالاسم أو الهاتف أو مستوى الولاء...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-16 pr-8 py-5 bg-card/60 backdrop-blur-md border border-border/40 rounded-[2rem] outline-none focus:border-indigo-500/50 transition-all font-black text-sm shadow-inner group-focus-within:bg-card"
          />
        </div>

        {/* Dynamic Data Grid */}
        <div className="bg-card/60 backdrop-blur-3xl rounded-[2.5rem] border border-border/40 overflow-hidden shadow-2xl relative">
          <table className="w-full text-left">
            <thead className="bg-elevated/40 border-b border-border/30 text-[9px] font-black uppercase tracking-[0.2em] text-muted">
              <tr>
                <th className="px-8 py-6">{tr('Customer', 'العميل')}</th>
                <th className="px-6 py-6">{tr('Contact', 'بيانات الاتصال')}</th>
                <th className="px-6 py-6">{tr('Loyalty Tier', 'مستوى الولاء')}</th>
                <th className="px-6 py-6">{tr('Value & Visits', 'القيمة والزيارات')}</th>
                <th className="px-8 py-6 text-right">{tr('Profile', 'الملف')}</th>
              </tr>
            </thead>
            <motion.tbody variants={listVariants} initial="hidden" animate="show" className="divide-y divide-border/30">
              <AnimatePresence>
                {filteredCustomers.map((customer) => {
                  const aiTag = getAITag(customer);
                  return (
                    <motion.tr 
                      variants={itemVariants} 
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={customer.id} 
                      className="hover:bg-elevated/40 transition-colors group cursor-pointer" 
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-5">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl border transition-all shadow-sm group-hover:scale-110 ${getTierColor(customer.loyaltyTier)}`}>
                            {customer.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-black text-sm uppercase tracking-tight mb-1 group-hover:text-indigo-400 transition-colors">{customer.name}</div>
                            <span className={`text-[8px] font-black uppercase tracking-widest opacity-80 ${aiTag.color}`}>{aiTag.label}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3 text-muted font-black text-xs tabular-nums tracking-widest">
                          <Phone size={14} className="text-indigo-500" /> {customer.phone}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className={`flex items-center gap-2 font-black w-fit px-3 py-1.5 rounded-xl border shadow-sm ${getTierColor(customer.loyaltyTier)}`}>
                          <Star size={12} className={['Gold', 'Platinum'].includes(customer.loyaltyTier || '') ? 'fill-current' : ''} />
                          <span className="text-[9px] uppercase tracking-[0.2em]">{tierLabel(customer.loyaltyTier)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="font-black tracking-tight text-emerald-500 tabular-nums">{(customer.totalSpent || 0).toLocaleString()} LE</span>
                          <span className="text-[9px] font-bold text-muted mt-1 uppercase tracking-widest opacity-60">
                            {customer.visits} {tr('Visits', 'زيارة')}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button
                          className="text-muted group-hover:text-indigo-500 transition-all p-3 rounded-xl bg-card border border-border/50 shadow-sm active:scale-90"
                          aria-label={tr(`Open ${customer.name} profile`, `فتح ملف ${customer.name}`)}
                          title={tr('Open customer profile', 'فتح ملف العميل')}
                        >
                          <ChevronRight size={18} />
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {filteredCustomers.length === 0 && (
                <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <td colSpan={5} className="px-8 py-32 text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted opacity-30">
                      {tr('No customer profiles found', 'لا توجد ملفات عملاء')}
                    </p>
                  </td>
                </motion.tr>
              )}
            </motion.tbody>
          </table>
        </div>
      </div>

      {/* Deep Profile Drawer */}
      <AnimatePresence>
        {selectedCustomer && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" onClick={() => setSelectedCustomer(null)} />
            <motion.div 
              initial={{ x: lang === 'ar' ? '-100%' : '100%' }} 
              animate={{ x: 0 }} 
              exit={{ x: lang === 'ar' ? '-100%' : '100%' }} 
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed inset-y-0 ${lang === 'ar' ? 'left-0' : 'right-0'} w-full max-w-lg bg-card border-${lang === 'ar' ? 'r' : 'l'} border-border/40 shadow-2xl z-[101] flex flex-col`}
            >
               <div className="p-8 border-b border-border/30 flex justify-between items-center bg-elevated/30 backdrop-blur">
                <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
                    <Activity size={20} />
                  </div>
                  {tr('Customer Profile', 'ملف العميل')}
                </h3>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setSelectedCustomer(null)}
                  className="p-3 bg-card border border-border/50 text-muted rounded-xl hover:text-rose-500 hover:border-rose-500/30 transition-colors"
                  aria-label={tr('Close customer profile', 'إغلاق ملف العميل')}
                  title={tr('Close', 'إغلاق')}
                >
                  <X size={20} />
                </motion.button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar relative">
                <div className="text-center relative z-10">
                  <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-32 h-32 mx-auto rounded-[2.5rem] flex items-center justify-center text-5xl font-black mb-6 shadow-xl border-4 ${getTierColor(selectedCustomer.loyaltyTier)}`}>
                    {selectedCustomer.name.charAt(0)}
                  </motion.div>
                  <h2 className="text-3xl font-black tracking-tighter uppercase">{selectedCustomer.name}</h2>
                  <div className="flex justify-center gap-4 mt-4">
                     <p className="font-black tracking-[0.2em] uppercase text-[10px] flex items-center gap-2 bg-card px-4 py-2 rounded-full border border-border/50 shadow-inner">
                        <Phone size={12} className="text-indigo-500" /> {selectedCustomer.phone}
                     </p>
                  </div>
                </div>

                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="relative p-8 rounded-[2rem] bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-2xl overflow-hidden group">
                   <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-150 transition-transform duration-1000 rotate-12">
                      <Layers size={150} />
                   </div>
                   <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-200 mb-4 flex items-center gap-2 relative z-10">
                      <TrendingUp size={14} /> {tr('Smart Insight', 'تحليل ذكي')}
                   </h4>
                   <p className="font-bold text-sm leading-relaxed tracking-tight relative z-10">
                      {customerInsight}
                   </p>
                </motion.div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="p-6 rounded-3xl border border-border/40 bg-elevated/40">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-2">{tr('Total Spend', 'إجمالي الإنفاق')}</p>
                    <p className="text-2xl font-black text-emerald-500 tabular-nums">{selectedCustomer.totalSpent.toLocaleString()} <span className="text-xs">LE</span></p>
                  </div>
                  <div className="p-6 rounded-3xl border border-border/40 bg-elevated/40">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-2">{tr('Visits', 'الزيارات')}</p>
                    <p className="text-2xl font-black tabular-nums">{selectedCustomer.visits}</p>
                  </div>
                  <div className="p-6 rounded-3xl border border-border/40 bg-elevated/40 col-span-2">
                    <div className="flex justify-between items-end mb-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted">{tr('Loyalty Points', 'نقاط الولاء')}</p>
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${getTierColor(selectedCustomer.loyaltyTier)}`}>
                        {tierLabel(selectedCustomer.loyaltyTier)}
                      </span>
                    </div>
                    <div className="w-full h-3 bg-card rounded-full overflow-hidden border border-border/50 shadow-inner">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (selectedCustomer.loyaltyPoints / 1000) * 100)}%` }} transition={{ duration: 1, delay: 0.2 }} className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full" />
                    </div>
                    <div className="flex justify-between mt-3">
                       <p className="text-[10px] font-black tabular-nums">{selectedCustomer.loyaltyPoints} {tr('PTS', 'نقطة')}</p>
                       <p className="text-[9px] font-black text-muted uppercase tracking-widest opacity-60">{tr('Next Target: 1,000', 'الهدف التالي: ١,٠٠٠')}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted flex items-center gap-2 mb-4">
                     <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> {tr('Order History', 'سجل الطلبات')}
                  </h4>
                  {orders.filter(o => o.customerId === selectedCustomer.id).length === 0 ? (
                     <div className="p-8 text-center bg-elevated/30 rounded-3xl border border-dashed border-border/50">
                        <p className="text-[9px] font-black text-muted uppercase tracking-[0.2em] opacity-40">
                          {tr('No orders recorded for this customer.', 'لا توجد طلبات مسجلة لهذا العميل.')}
                        </p>
                     </div>
                  ) : (
                    <div className="grid gap-3">
                      {orders.filter(o => o.customerId === selectedCustomer.id).slice(0, 5).map((o, idx) => (
                        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * idx }} key={o.id} className="flex items-center justify-between p-5 rounded-2xl bg-card border border-border/40 hover:bg-elevated/60 transition-colors shadow-sm">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-tighter">#{o.id}</p>
                            <p className="text-[9px] font-bold text-muted mt-1 uppercase tracking-widest">{new Date(o.createdAt).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-emerald-500">{o.total?.toFixed(2)} LE</p>
                            <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mt-1">{orderStatusLabel(o.status)}</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-8 border-t border-border/30 bg-elevated/30 backdrop-blur">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full h-16 bg-main text-app rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-black/20 flex items-center justify-center gap-3 transition-colors">
                  <ShoppingBag size={18} /> {tr('Start New Order', 'بدء طلب جديد')}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Profile Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4" onClick={() => setShowAddModal(false)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', damping: 25 }} className="bg-card border border-border/50 rounded-[2.5rem] w-full max-w-xl shadow-2xl relative overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              
              <header className="p-8 border-b border-border/30 flex justify-between items-center bg-elevated/30 backdrop-blur relative z-10">
                <div>
                  <h3 className="text-2xl font-black tracking-tighter flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 border border-indigo-500/20">
                      <UserCheck size={20} />
                    </div>
                    {tr('Add Customer', 'إضافة عميل')}
                  </h3>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowAddModal(false)}
                  className="p-3 bg-card border border-border/50 text-muted rounded-xl hover:text-rose-500 hover:border-rose-500/30 transition-colors shadow-sm"
                  aria-label={tr('Close add customer modal', 'إغلاق نافذة إضافة عميل')}
                  title={tr('Close', 'إغلاق')}
                >
                  <X size={20} />
                </motion.button>
              </header>

              <div className="p-8 space-y-6 relative z-10">
                <div className="space-y-3">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-muted pl-1">{tr('Customer Name', 'اسم العميل')}</label>
                  <div className="relative">
                     <UserCheck className="absolute left-5 top-1/2 -translate-y-1/2 text-muted w-5 h-5 z-10" />
                     <input
                       className="w-full pl-14 pr-6 py-5 bg-elevated border border-border/50 rounded-2xl font-black text-sm outline-none focus:border-indigo-500 transition-all shadow-inner relative z-0"
                       value={newCustomer.name}
                       onChange={(e) => { setFormError(''); setNewCustomer({ ...newCustomer, name: e.target.value }); }}
                       placeholder={tr('Full name...', 'الاسم بالكامل...')}
                     />
                  </div>
                </div>
                
                <div className="space-y-3">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-muted pl-1">{tr('Phone Number', 'رقم الهاتف')}</label>
                  <div className="relative">
                     <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-muted w-5 h-5 z-10" />
                     <input
                       className="w-full pl-14 pr-6 py-5 bg-elevated border border-border/50 rounded-2xl font-black text-sm tabular-nums outline-none focus:border-indigo-500 transition-all shadow-inner relative z-0"
                       value={newCustomer.phone}
                       onChange={(e) => { setFormError(''); setNewCustomer({ ...newCustomer, phone: e.target.value }); }}
                       placeholder={tr('Phone number...', 'رقم الهاتف...')}
                     />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-muted pl-1">{tr('Address', 'العنوان')}</label>
                  <div className="relative">
                     <MapPin className="absolute left-5 top-6 text-muted w-5 h-5 z-10" />
                     <textarea
                       className="w-full pl-14 pr-6 py-5 bg-elevated border border-border/50 rounded-2xl font-black text-sm outline-none focus:border-indigo-500 transition-all resize-none h-32 shadow-inner relative z-0"
                       value={newCustomer.address}
                       onChange={(e) => { setFormError(''); setNewCustomer({ ...newCustomer, address: e.target.value }); }}
                       placeholder={tr('Address or delivery notes...', 'العنوان أو ملاحظات التوصيل...')}
                     />
                  </div>
                </div>
                {formError && (
                  <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-xs font-black text-rose-500">
                    {formError}
                  </p>
                )}
              </div>

              <div className="p-8 border-t border-border/30 bg-elevated/30 flex gap-4 relative z-10">
                <button
                  onClick={() => { setFormError(''); setShowAddModal(false); }}
                  className="flex-1 h-14 text-[10px] font-black uppercase tracking-[0.2em] text-muted hover:bg-card bg-elevated border border-border/50 rounded-2xl transition-all shadow-sm"
                >
                  {tr('Cancel', 'إلغاء')}
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveCustomer}
                  className="flex-[2] h-14 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-white/20 w-32 skew-x-12 -translate-x-full group-hover:translate-x-[300%] transition-transform duration-1000" />
                  <Save size={18} />
                  {tr('Save Customer', 'حفظ العميل')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CRM;
