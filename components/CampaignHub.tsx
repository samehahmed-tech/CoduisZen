import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Megaphone, Ticket, Users, TrendingUp, Plus, Calendar,
    Mail,     MessageSquare, Percent, ChevronRight, Filter,
    BarChart2, Clock, PlayCircle, PauseCircle, MessageCircle,
    Bot, Globe, Zap, ToggleLeft, ThumbsUp
} from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { campaignsApi } from '../services/api/campaigns';
import { useToast } from './common/ToastProvider';
import { motion, AnimatePresence } from 'framer-motion';

type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'AUTOMATED' | 'SCHEDULED' | 'PAUSED' | 'COMPLETED';
type CampaignMethod = 'SMS' | 'EMAIL' | 'Email' | 'Push' | 'PUSH' | 'WHATSAPP';

type Campaign = {
    id: string;
    name: string;
    status: CampaignStatus;
    outreach: number;
    conversions: number;
    method: CampaignMethod;
    discount?: string;
};

const CampaignHub: React.FC = () => {
    const { settings } = useAuthStore();
    const lang = (settings.language || 'en') as 'en' | 'ar';
    const tr = (ar: string, en: string) => lang === 'ar' ? ar : en;
    const currencySymbol = settings.currencySymbol || (lang === 'ar' ? 'ج.م' : 'EGP');
    const { success, error: showError } = useToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [creating, setCreating] = useState(false);
    const [dispatchingId, setDispatchingId] = useState<string | null>(null);
    const [platformTab, setPlatformTab] = useState<'whatsapp' | 'facebook' | 'tiktok' | 'sms' | 'chatbot'>('whatsapp');
    const [chatbotEnabled, setChatbotEnabled] = useState(false);
    const [chatbotGreeting, setChatbotGreeting] = useState('');
    const [fbToken, setFbToken] = useState('');
    const [ttToken, setTtToken] = useState('');
    const [waNumber, setWaNumber] = useState('');
    const [waConnected, setWaConnected] = useState(false);
    const [updatingCampaignId, setUpdatingCampaignId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'DRAFT'>('ACTIVE');
    const creatingRef = useRef(false);

    const loadData = async () => {
        try {
            const [list, s] = await Promise.all([campaignsApi.getAll(), campaignsApi.getStats()]);
            setCampaigns(list);
            setStats(s);
        } catch (error) {
            showError(tr('تعذر تحميل الحملات', 'Could not load campaigns'));
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const createCampaign = async () => {
        if (creatingRef.current) return;
        creatingRef.current = true;
        setCreating(true);
        try {
            await campaignsApi.create({
                name: lang === 'ar' ? `حملة نمو ${new Date().toLocaleDateString()}` : `Growth Campaign ${new Date().toLocaleDateString()}`,
                status: 'SCHEDULED',
                method: 'SMS',
                discount: '10%',
                outreach: 0,
                conversions: 0,
            });
            await loadData();
            success(tr('تم إنشاء الحملة', 'Campaign created successfully'));
        } catch (error: any) {
            showError(error?.message || tr('تعذر إنشاء الحملة', 'Could not create campaign'));
        } finally {
            creatingRef.current = false;
            setCreating(false);
        }
    };

    const dispatchCampaign = async (campaign: Campaign) => {
        const fallbackPhone = String(settings?.phone || '').trim();
        const phones = fallbackPhone ? [fallbackPhone] : [];
        if (phones.length === 0) {
            showError(tr('لا يوجد رقم افتراضي في الإعدادات للإرسال التجريبي.', 'No default phone in settings for test dispatch.'));
            return;
        }
        setDispatchingId(campaign.id);
        try {
            await campaignsApi.dispatch(campaign.id, {
                mode: 'SEND',
                phones,
                message: `${campaign.name}${campaign.discount ? ` - ${campaign.discount}` : ''}`,
            });
            await loadData();
            success(tr('تم الإرسال بنجاح', 'Campaign dispatched successfully'));
        } catch (error: any) {
            showError(error?.message || tr('فشل إرسال الحملة', 'Dispatch failed'));
        } finally {
            setDispatchingId(null);
        }
    };

    const updateCampaignStatus = async (campaign: Campaign) => {
        setUpdatingCampaignId(campaign.id);
        try {
            const nextStatus: CampaignStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
            await campaignsApi.update(campaign.id, { status: nextStatus });
            await loadData();
            success(nextStatus === 'ACTIVE' ? tr('تم تفعيل الحملة', 'Campaign activated') : tr('تم إيقاف الحملة مؤقتاً', 'Campaign paused'));
        } catch (error: any) {
            showError(error?.message || tr('تعذر تحديث الحملة', 'Could not update campaign'));
        } finally {
            setUpdatingCampaignId(null);
        }
    };

    const statusClass = (status: CampaignStatus) => {
        if (status === 'ACTIVE') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
        if (status === 'AUTOMATED') return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
        if (status === 'SCHEDULED') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
        if (status === 'COMPLETED') return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
        return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    };

    const statusLabel = (status: CampaignStatus) => {
        const labels: Record<CampaignStatus, { ar: string; en: string }> = {
            DRAFT: { ar: 'مسودة', en: 'Draft' },
            ACTIVE: { ar: 'نشطة', en: 'Active' },
            AUTOMATED: { ar: 'آلية', en: 'Automated' },
            SCHEDULED: { ar: 'مجدولة', en: 'Scheduled' },
            PAUSED: { ar: 'متوقفة', en: 'Paused' },
            COMPLETED: { ar: 'مكتملة', en: 'Completed' },
        };
        return lang === 'ar' ? labels[status]?.ar || status : labels[status]?.en || status;
    };

    const methodLabel = (method: CampaignMethod) => {
        const normalized = String(method).toUpperCase();
        if (normalized === 'EMAIL') return lang === 'ar' ? 'بريد' : 'Email';
        if (normalized === 'PUSH') return lang === 'ar' ? 'تنبيه' : 'Push';
        if (normalized === 'WHATSAPP') return lang === 'ar' ? 'واتساب' : 'WhatsApp';
        return normalized;
    };

    const totalReach = stats?.totalReach || 0;
    const totalConversions = stats?.totalConversions || 0;
    const conversionRate = stats?.conversionRate || 0;
    const campaignRevenueEstimate = stats?.campaignRevenueEstimate || 0;

    const channelMix = useMemo(() => {
        const channels = stats?.channels || {};
        return [
            { label: 'SMS', value: channels.SMS || 0 },
            { label: 'Email', value: channels.EMAIL || channels.Email || 0 },
            { label: 'Push', value: channels.PUSH || channels.Push || 0 },
            { label: 'WHATSAPP', value: channels.WHATSAPP || 0 },
        ];
    }, [stats]);

    const visibleCampaigns = useMemo(
        () => campaigns.filter(cp => statusFilter === 'DRAFT' ? cp.status === 'DRAFT' : cp.status !== 'DRAFT'),
        [campaigns, statusFilter],
    );

    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    } as const;
    
    const cardVariants = {
        hidden: { opacity: 0, y: 30, scale: 0.95 },
        show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } }
    } as const;

    return (
        <div className="relative p-6 lg:p-10 bg-app min-h-screen text-main overflow-hidden pb-32">
            {/* Visual Ambiance */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                 <div className="absolute top-[-10%] right-[-5%] w-[700px] h-[700px] rounded-full bg-primary/5 blur-[120px]" />
                 <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-500/5 blur-[150px] animate-pulse" style={{ animationDelay: '3s' }} />
            </div>

            <header className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 mb-12 border-b border-border/20 pb-8">
                <div>
                    <div className="flex items-center gap-5 mb-3">
                        <div className="relative group">
                            <div className="absolute inset-0 bg-primary rounded-2xl blur-lg opacity-40 group-hover:opacity-70 transition-opacity duration-500" />
                            <div className="relative w-16 h-16 rounded-2xl bg-card border border-border/50 flex items-center justify-center shadow-xl shadow-primary/20">
                                <Megaphone className="w-8 h-8 text-primary" />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-3xl lg:text-4xl font-black text-main uppercase tracking-tight flex items-center gap-3">
                                {lang === 'ar' ? 'الحملات التسويقية' : 'Audience Growth'}
                                <span className="hidden md:flex px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-left duration-700">
                                    {tr('مركز التحكم', 'Nerve Center')}
                                </span>
                            </h2>
                            <p className="text-xs font-bold text-muted mt-2 opacity-60 uppercase tracking-widest flex items-center gap-2">
                                {tr('العروض وبرنامج الولاء', 'Promotions & Automated Sequences')}
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            </p>
                        </div>
                    </div>
                </div>

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={createCampaign}
                    disabled={creating}
                    className="flex items-center gap-3 bg-gradient-to-r from-primary to-indigo-600 text-white px-8 py-5 rounded-[1.5rem] shadow-2xl shadow-primary/30 font-black uppercase text-xs tracking-widest transition-all disabled:opacity-60 relative overflow-hidden group"
                >
                    <div className="absolute inset-0 bg-white/20 w-32 skew-x-12 -translate-x-full group-hover:translate-x-[400%] transition-transform duration-1000" />
                    <Plus size={18} />
                    {creating ? '...' : tr('إنشاء حملة طارئة', 'Initialize Mass Broadcast')}
                </motion.button>
            </header>

            <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12 relative z-10">
                {[
                    { label: tr('الوصول', 'Network Reach'), value: totalReach.toLocaleString(), sub: channelMix.map(c => `${c.label}:${c.value}`).join(' • '), icon: Users, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                    { label: tr('التحويلات', 'Conversions'), value: totalConversions.toLocaleString(), sub: `${conversionRate.toFixed(2)}% ${tr('معدل التحويل', 'Conversion Rate')}`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { label: tr('إيراد منسوب للحملات', 'Attributed Revenue'), value: `${campaignRevenueEstimate.toLocaleString()} ${currencySymbol}`, sub: tr('تأثير تقديري', 'Estimated Impact'), icon: BarChart2, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                    { label: tr('أكواد نشطة', 'Active Codes'), value: String(stats?.activeCoupons || 0), sub: `${campaigns.length} ${tr('حملات مباشرة', 'live campaigns')}`, icon: Ticket, color: 'text-primary', bg: 'bg-primary/10' },
                ].map((stat, i) => (
                    <motion.div variants={cardVariants} key={i} className="bg-card/60 backdrop-blur-3xl border border-border/40 p-8 rounded-[2rem] shadow-xl relative overflow-hidden group hover:border-border/80 transition-colors">
                        <div className={`absolute top-0 right-0 w-24 h-24 ${stat.bg} blur-3xl opacity-50 group-hover:opacity-100 transition-opacity`} />
                        <div className="flex justify-between items-start mb-6 relative z-10">
                            <div className={`p-4 rounded-2xl bg-card border border-border/50 shadow-inner ${stat.color}`}>
                                <stat.icon size={24} />
                            </div>
                            <span className="text-[9px] font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded shadow-sm">{tr('مباشر', 'REAL-TIME')}</span>
                        </div>
                        <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-2">{stat.label}</p>
                        <h4 className="text-3xl font-black text-main tracking-tighter">{stat.value}</h4>
                        <p className="text-[9px] font-bold text-muted mt-3 uppercase tracking-widest opacity-60">{stat.sub}</p>
                    </motion.div>
                ))}
            </motion.div>

            {/* ── Social Media Platform Tabs ── */}
            <div className="relative z-10 -mt-4 mb-6">
                <div className="flex items-center gap-1.5 bg-card/80 border border-border/30 p-1.5 rounded-2xl shadow-sm w-fit">
                    {[
                        { id: 'whatsapp' as const, icon: MessageCircle, label: 'WhatsApp', labelAr: 'واتساب' },
                        { id: 'facebook' as const, icon: ThumbsUp, label: 'Facebook', labelAr: 'فيسبوك' },
                        { id: 'tiktok' as const, icon: Globe, label: 'TikTok', labelAr: 'تيك توك' },
                        { id: 'sms' as const, icon: MessageSquare, label: 'SMS', labelAr: 'رسائل' },
                        { id: 'chatbot' as const, icon: Bot, label: 'Chatbot', labelAr: 'بوت محادثة' },
                    ].map(p => {
                        const active = platformTab === p.id;
                        const Icon = p.icon;
                        return (
                            <button key={p.id} onClick={() => setPlatformTab(p.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${active ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-muted hover:text-main hover:bg-elevated'}`}>
                                <Icon size={14} />
                                <span className="hidden sm:inline">{lang === 'ar' ? p.labelAr : p.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Platform Config Panels ── */}
            {platformTab === 'whatsapp' && (
                <div className="relative z-10 mb-6 bg-card/60 backdrop-blur-3xl border border-border/40 p-6 rounded-[2.5rem] shadow-xl">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"><MessageCircle size={22} /></div>
                        <div>
                            <h3 className="text-lg font-black text-main">{tr('تهيئة واتساب', 'WhatsApp Configuration')}</h3>
                            <p className="text-[10px] font-bold text-muted">{tr('ربط وإرسال الحملات عبر واتساب', 'Connect and blast campaigns via WhatsApp')}</p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${waConnected ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                            <span className="text-[9px] font-black text-muted uppercase tracking-widest">{waConnected ? tr('متصل', 'Connected') : tr('غير متصل', 'Disconnected')}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[9px] font-black text-muted uppercase tracking-wider mb-1.5 block">{tr('رقم واتساب', 'WhatsApp Number')}</label>
                            <input type="text" value={waNumber} onChange={e => setWaNumber(e.target.value)}
                                placeholder="+201234567890"
                                className="w-full bg-card border border-border/40 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500/50" />
                        </div>
                        <div className="flex items-end">
                            <button onClick={() => { setWaConnected(!waConnected); success(waConnected ? tr('تم قطع الاتصال', 'Disconnected') : tr('تم الاتصال', 'Connected')); }}
                                className={`w-full py-3 rounded-xl text-xs font-black border-2 flex items-center justify-center gap-2 transition-all ${waConnected ? 'bg-rose-500/10 border-rose-500/30 text-rose-500' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'}`}>
                                {waConnected ? <><Zap size={14} />{tr('قطع الاتصال', 'Disconnect')}</> : <><Zap size={14} />{tr('اتصال عبر QR', 'Connect via QR')}</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {platformTab === 'facebook' && (
                <div className="relative z-10 mb-6 bg-card/60 backdrop-blur-3xl border border-border/40 p-6 rounded-[2.5rem] shadow-xl">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500"><ThumbsUp size={22} /></div>
                        <div>
                            <h3 className="text-lg font-black text-main">{tr('تهيئة فيسبوك', 'Facebook Integration')}</h3>
                            <p className="text-[10px] font-bold text-muted">{tr('ربط الصفحات وإدارة الإعلانات', 'Connect pages and manage ad campaigns')}</p>
                        </div>
                    </div>
                    <div>
                        <label className="text-[9px] font-black text-muted uppercase tracking-wider mb-1.5 block">Page Access Token</label>
                        <input type="password" value={fbToken} onChange={e => setFbToken(e.target.value)}
                            placeholder="EAABwzLixnjYBO..."
                            className="w-full bg-card border border-border/40 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500/50" />
                        <p className="text-[8px] text-muted mt-1.5">{tr('أدخل رمز الوصول من Facebook Developers', 'Enter token from Facebook Developers Console')}</p>
                    </div>
                </div>
            )}

            {platformTab === 'tiktok' && (
                <div className="relative z-10 mb-6 bg-card/60 backdrop-blur-3xl border border-border/40 p-6 rounded-[2.5rem] shadow-xl">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-500"><Globe size={22} /></div>
                        <div>
                            <h3 className="text-lg font-black text-main">{tr('تهيئة تيك توك', 'TikTok Integration')}</h3>
                            <p className="text-[10px] font-bold text-muted">{tr('ربط الحساب وإدارة الحملات', 'Connect account and manage campaigns')}</p>
                        </div>
                    </div>
                    <div>
                        <label className="text-[9px] font-black text-muted uppercase tracking-wider mb-1.5 block">API Token</label>
                        <input type="password" value={ttToken} onChange={e => setTtToken(e.target.value)}
                            placeholder="TikTok API Token"
                            className="w-full bg-card border border-border/40 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-purple-500/50" />
                        <p className="text-[8px] text-muted mt-1.5">{tr('أدخل رمز API من TikTok for Business', 'Enter token from TikTok for Business')}</p>
                    </div>
                </div>
            )}

            {platformTab === 'chatbot' && (
                <div className="relative z-10 mb-6 bg-card/60 backdrop-blur-3xl border border-border/40 p-6 rounded-[2.5rem] shadow-xl">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500"><Bot size={22} /></div>
                        <div>
                            <h3 className="text-lg font-black text-main">{tr('بوت المحادثة الذكي', 'Smart Chatbot')}</h3>
                            <p className="text-[10px] font-bold text-muted">{tr('رد تلقائي على العملاء عبر واتساب وفيسبوك', 'Auto-reply to customers via WhatsApp & Facebook')}</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-card border border-border/30 rounded-2xl">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl ${chatbotEnabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-elevated text-muted'}`}>
                                    <ToggleLeft size={20} />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-main">{tr('تفعيل البوت', 'Enable Chatbot')}</p>
                                    <p className="text-[9px] text-muted">{tr('الرد التلقائي على العملاء 24/7', '24/7 auto-reply to customer messages')}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setChatbotEnabled(!chatbotEnabled)}
                                className={`w-14 h-7 rounded-full relative transition-all border ${chatbotEnabled ? 'bg-indigo-500 border-indigo-600' : 'bg-elevated border-border/40'}`}
                                aria-label={chatbotEnabled ? tr('تعطيل بوت المحادثة', 'Disable chatbot') : tr('تفعيل بوت المحادثة', 'Enable chatbot')}
                                title={chatbotEnabled ? tr('تعطيل بوت المحادثة', 'Disable chatbot') : tr('تفعيل بوت المحادثة', 'Enable chatbot')}
                            >
                                <div className={`absolute top-[3px] w-5 h-5 bg-white rounded-full shadow-sm transition-all ${chatbotEnabled ? 'right-1' : 'left-1'}`} />
                            </button>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-muted uppercase tracking-wider mb-1.5 block">{tr('رسالة الترحيب', 'Welcome Message')}</label>
                            <textarea value={chatbotGreeting} onChange={e => setChatbotGreeting(e.target.value)}
                                placeholder={tr('مرحباً بك في مطعمنا! كيف يمكننا مساعدتك؟', 'Welcome to our restaurant! How can we help you?')}
                                rows={3}
                                className="w-full bg-card border border-border/40 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500/50 resize-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { label: tr('قائمة الطعام', 'Menu'), icon: MessageSquare, text: tr('أرسل للعميل رابط المنيو وأفضل العروض الحالية.', 'Send the customer the menu link and current best offers.') },
                                { label: tr('ساعات العمل', 'Hours'), icon: Clock, text: tr('نحن متاحون اليوم خلال ساعات العمل المحددة للفرع.', 'We are available today during the branch working hours.') },
                                { label: tr('العروض', 'Offers'), icon: Percent, text: tr('لدينا عروض مميزة اليوم. أخبرنا بما تفضله ونرشح لك الأنسب.', 'We have special offers today. Tell us what you like and we will recommend the best fit.') },
                                { label: tr('الحجز', 'Booking'), icon: Calendar, text: tr('يمكننا مساعدتك في حجز طاولة. أرسل عدد الأفراد والوقت المناسب.', 'We can help reserve a table. Send guest count and preferred time.') },
                            ].map((btn, i) => (
                                <button key={i} onClick={() => setChatbotGreeting(btn.text)} className="p-3 rounded-xl bg-elevated border border-border/30 text-[9px] font-black text-muted hover:text-main hover:border-primary/30 transition-all flex items-center gap-2 uppercase tracking-wider">
                                    <btn.icon size={12} />
                                    {btn.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 relative z-10">
                <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="xl:col-span-2 space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-xl font-black text-main tracking-tight flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-elevated border border-border/50 flex flex-col items-center justify-center">
                                <Calendar size={18} className="text-primary" />
                            </div>
                            {tr('مركز عمليات الإرسال', 'Operation Command Center')}
                        </h3>
                        <div className="flex items-center gap-3 bg-card border border-border/40 p-1.5 rounded-2xl shadow-inner">
                            <button onClick={() => setStatusFilter('ACTIVE')} className={`px-4 py-2 text-[10px] font-black rounded-xl uppercase tracking-widest transition-colors ${statusFilter === 'ACTIVE' ? 'text-main bg-elevated shadow-sm' : 'text-muted hover:text-main'}`}>{tr('نشط', 'Active')}</button>
                            <button onClick={() => setStatusFilter('DRAFT')} className={`px-4 py-2 text-[10px] font-black rounded-xl uppercase tracking-widest transition-colors ${statusFilter === 'DRAFT' ? 'text-main bg-elevated shadow-sm' : 'text-muted hover:text-main'}`}>{tr('مسودة', 'Drafts')}</button>
                            <button
                                className="p-2 text-muted hover:text-main transition-colors"
                                aria-label={tr('تصفية الحملات', 'Filter campaigns')}
                                title={tr('تصفية الحملات', 'Filter campaigns')}
                                onClick={() => setStatusFilter(statusFilter === 'ACTIVE' ? 'DRAFT' : 'ACTIVE')}
                            ><Filter size={16} /></button>
                        </div>
                    </div>

                    <div className="bg-card/60 backdrop-blur-3xl border border-border/40 rounded-[2.5rem] overflow-hidden shadow-2xl">
                        <table className="w-full text-left">
                            <thead className="bg-elevated/40 border-b border-border/30">
                                <tr>
                                    <th className="px-8 py-6 text-[9px] font-black text-muted uppercase tracking-[0.2em]">{tr('الحملة', 'Campaign Asset')}</th>
                                    <th className="px-6 py-6 text-[9px] font-black text-muted uppercase tracking-[0.2em]">{tr('الحالة', 'Status Matrix')}</th>
                                    <th className="px-6 py-6 text-[9px] font-black text-muted uppercase tracking-[0.2em]">{tr('القناة', 'Vector')}</th>
                                    <th className="px-6 py-6 text-[9px] font-black text-muted uppercase tracking-[0.2em]">{tr('معدل التحويل', 'Conversion Rate')}</th>
                                    <th className="px-8 py-6 text-[9px] font-black text-muted text-right uppercase tracking-[0.2em]">{tr('إجراء', 'Action')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                <AnimatePresence>
                                    {visibleCampaigns.map((cp, idx) => (
                                        <motion.tr 
                                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                                            key={cp.id} 
                                            className="hover:bg-elevated/40 transition-colors group cursor-pointer"
                                        >
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-xl bg-card border border-border/60 flex items-center justify-center text-primary shadow-sm group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                                                        {String(cp.method).toUpperCase() === 'SMS' || String(cp.method).toUpperCase() === 'WHATSAPP'
                                                            ? <MessageSquare size={20} />
                                                            : String(cp.method).toUpperCase() === 'EMAIL'
                                                                ? <Mail size={20} />
                                                                : <Megaphone size={20} />}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-main uppercase tracking-tight mb-1">{cp.name}</p>
                                                        <p className="text-[9px] font-bold text-muted uppercase tracking-[0.2em] opacity-80">{tr('الخصم', 'Benefit')}: {cp.discount || '-'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-6">
                                                <span className={`text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest border ${statusClass(cp.status)}`}>
                                                    {statusLabel(cp.status)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-6 font-black text-[11px] text-muted tracking-widest">{methodLabel(cp.method)}</td>
                                            <td className="px-6 py-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1 h-2 bg-app rounded-full w-24 overflow-hidden border border-border/20 shadow-inner">
                                                        <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${Math.min(100, cp.outreach > 0 ? (cp.conversions / cp.outreach) * 100 : 0)}%` }} />
                                                    </div>
                                                    <span className="text-[10px] font-black text-main tabular-nums bg-elevated px-2 py-0.5 rounded border border-border/30">{cp.conversions}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); dispatchCampaign(cp); }}
                                                        disabled={dispatchingId === cp.id || cp.status === 'PAUSED'}
                                                        className="text-[10px] font-black px-4 py-2 rounded-xl bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale disabled:hover:scale-100 flex items-center gap-2"
                                                    >
                                                        {dispatchingId === cp.id ? tr('جاري الإرسال...', 'VERIFYING...') : <><PlayCircle size={14}/> {tr('إرسال', 'BLAST')}</>}
                                                    </button>
                                                     <button
                                                         onClick={(e) => { e.stopPropagation(); updateCampaignStatus(cp); }}
                                                         disabled={updatingCampaignId === cp.id}
                                                         className="w-10 h-10 rounded-xl border border-border text-muted hover:text-primary hover:border-primary/50 flex items-center justify-center transition-all bg-card shadow-sm disabled:opacity-50 disabled:cursor-wait"
                                                         aria-label={cp.status === 'ACTIVE' ? tr(`إيقاف ${cp.name} مؤقتاً`, `Pause ${cp.name}`) : tr(`تفعيل ${cp.name}`, `Activate ${cp.name}`)}
                                                         title={cp.status === 'ACTIVE' ? tr('إيقاف الحملة مؤقتاً', 'Pause campaign') : tr('تفعيل الحملة', 'Activate campaign')}
                                                     >
                                                        {cp.status === 'ACTIVE' ? <PauseCircle size={16} /> : <ChevronRight size={18} />}
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                                {visibleCampaigns.length === 0 && (
                                     <tr>
                                         <td colSpan={5} className="px-8 py-24 text-center text-[10px] font-black text-muted uppercase tracking-[0.3em] opacity-40">
                                            {tr('لا توجد حملات', 'No Campaign Datasets Found')}
                                         </td>
                                     </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="space-y-8">
                    <div className="bg-card/60 backdrop-blur-3xl border border-border/40 p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-32 h-32 bg-amber-500/10 blur-[40px] pointer-events-none" />
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col items-center justify-center text-amber-500 shadow-lg">
                                <Clock size={20} />
                            </div>
                            <h3 className="text-xl font-black text-main tracking-tight">{tr('محفزات الأتمتة', 'Automation Triggers')}</h3>
                        </div>

                        <div className="space-y-4 relative z-10">
                            {[
                                { name: tr('ترحيب العملاء الجدد', 'Welcome Registration Core'), icon: Users, delay: tr('فوري', 'Instant / Real-time'), status: true },
                                { name: tr('استرجاع العملاء الخاملين', 'Dormant Profile Resuscitation'), icon: MessageSquare, delay: tr('30 يوم بدون طلب', '30 Days Inactive'), status: true },
                                { name: tr('عرض عيد الميلاد', 'Birthday Loyalty Treat'), icon: Percent, delay: tr('سنوي', 'Annual / On Date'), status: false },
                            ].map((trigger, i) => (
                                <motion.div whileHover={{ scale: 1.02 }} key={i} className="flex items-center justify-between p-5 bg-card border border-border/50 rounded-2xl transition-all shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2.5 rounded-xl bg-elevated text-muted">
                                            <trigger.icon size={16} />
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-black text-main uppercase tracking-tight mb-1">{trigger.name}</p>
                                            <p className="text-[9px] font-bold text-muted uppercase tracking-widest">{trigger.delay}</p>
                                        </div>
                                    </div>
                                    <div className={`w-12 h-6 rounded-full relative transition-all shadow-inner border border-border/30 cursor-pointer ${trigger.status ? 'bg-emerald-500' : 'bg-elevated/80'}`}>
                                        <div className={`absolute top-[3px] w-4 h-4 bg-white rounded-full transition-all shadow-sm ${trigger.status ? 'right-1' : 'left-1'}`} />
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    <div className="relative overflow-hidden bg-gradient-to-br from-primary to-indigo-700 p-8 rounded-[2.5rem] text-white shadow-2xl shadow-primary/30 group">
                        <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-150 transition-transform duration-1000 rotate-12">
                             <Users size={200} />
                        </div>
                        <div className="flex justify-between items-start mb-6 relative z-10">
                            <div className="p-4 bg-white/10 backdrop-blur border border-white/20 rounded-2xl shadow-lg">
                                <Users size={28} />
                            </div>
                            <button
                                className="h-10 w-10 bg-black/20 hover:bg-black/40 border border-white/10 rounded-xl flex items-center justify-center transition-all backdrop-blur"
                                aria-label={tr('إضافة شريحة ولاء', 'Add loyalty segment')}
                                title={tr('إضافة شريحة ولاء', 'Add loyalty segment')}
                                onClick={() => success(tr('أضف شرائح الولاء من شاشة العملاء.', 'Add loyalty segments from the CRM screen.'))}
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        <h4 className="text-2xl font-black uppercase tracking-tighter mb-2 relative z-10">{tr('فئات الولاء الذكية', 'Loyalty Segments')}</h4>
                        <p className="text-[10px] font-bold text-indigo-100 mb-8 leading-relaxed uppercase tracking-widest relative z-10">
                            {tr('تصنيف العملاء وتجميعهم تلقائياً حسب الطلبات والتفاعل.', 'AI-driven dynamic grouping based on real-time transaction velocities.')}
                        </p>
                        <div className="space-y-3 relative z-10">
                            <div className="flex justify-between items-center px-5 py-4 bg-black/20 backdrop-blur-sm rounded-2xl border border-white/10 group-hover:bg-black/30 transition-all shadow-inner">
                                <span className="text-[11px] font-black uppercase tracking-widest">{tr('عملاء بلاتينيوم', 'Platinum Whale')}</span>
                                <span className="text-[11px] font-black tabular-nums bg-white/10 px-3 py-1 rounded-full">{Math.max(0, Math.round(totalConversions * 0.2))}</span>
                            </div>
                            <div className="flex justify-between items-center px-5 py-4 bg-black/10 backdrop-blur-sm rounded-2xl border border-white/5 opacity-70 hover:opacity-100 transition-opacity">
                                <span className="text-[11px] font-black uppercase tracking-widest">{tr('عملاء خاملين', 'Dormant Sector')}</span>
                                <span className="text-[11px] font-black tabular-nums bg-white/10 px-3 py-1 rounded-full">{Math.max(0, Math.round(totalReach * 0.15))}</span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default CampaignHub;
