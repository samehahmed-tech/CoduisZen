import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-hot-toast';
import {
    Activity,
    AlertTriangle,
    Bot,
    CheckCircle2,
    Clock,
    Gauge,
    Inbox,
    MessageCircle,
    MessageSquareReply,
    Power,
    QrCode,
    RefreshCw,
    RotateCcw,
    Save,
    Search,
    Send,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    User,
    Users,
    Zap,
} from 'lucide-react';
import { useCRMStore } from '../stores/useCRMStore';
import { WhatsAppAutomationConfig, useWhatsAppStore } from '../stores/useWhatsAppStore';

type TabKey = 'overview' | 'inbox' | 'campaigns' | 'automation' | 'settings';
type TargetType = 'ALL' | 'VIP' | 'MANUAL';

const defaultConfig: WhatsAppAutomationConfig = {
    orderCreated: true,
    outForDelivery: true,
    delivered: true,
    feedback: true,
    botEnabled: true,
    humanHandoffKeywords: ['شكوى', 'مشكلة', 'غلط', 'متأخر'],
    feedbackDelayMinutes: 60,
    quietHoursEnabled: false,
    quietHoursFrom: '02:00',
    quietHoursTo: '09:00',
};

const statusMeta = {
    READY: {
        label: 'متصل وجاهز',
        tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
        hint: 'الإرسال والاستقبال يعملان من المحرك الداخلي.',
    },
    AWAITING_SCAN: {
        label: 'مستني Scan',
        tone: 'text-sky-700 bg-sky-50 border-sky-200',
        hint: 'امسح QR من واتساب على الموبايل مرة واحدة.',
    },
    INITIALIZING: {
        label: 'جاري التهيئة',
        tone: 'text-amber-700 bg-amber-50 border-amber-200',
        hint: 'لو فضلت أكتر من دقيقة اضغط إعادة ربط وإظهار QR.',
    },
    DISCONNECTED: {
        label: 'غير متصل',
        tone: 'text-rose-700 bg-rose-50 border-rose-200',
        hint: 'أعد تشغيل المحرك أو امسح الجلسة واظهر QR جديد.',
    },
    AUTH_ERROR: {
        label: 'خطأ مصادقة',
        tone: 'text-rose-700 bg-rose-50 border-rose-200',
        hint: 'امسح الجلسة القديمة واربط الرقم من جديد.',
    },
} as const;

const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
};

const getInitials = (phone: string) => phone.replace(/[^\d]/g, '').slice(-2) || 'WA';

const ToggleRow = ({
    title,
    description,
    checked,
    onChange,
}: {
    title: string;
    description: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) => (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-card px-4 py-3">
        <span>
            <span className="block text-sm font-black text-main">{title}</span>
            <span className="mt-1 block text-xs font-bold text-muted">{description}</span>
        </span>
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`relative h-7 w-12 rounded-full border transition ${checked ? 'border-emerald-500 bg-emerald-500' : 'border-border bg-elevated'}`}
            aria-pressed={checked}
        >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'right-6' : 'right-1'}`} />
        </button>
    </label>
);

export const WhatsAppHub = () => {
    const {
        statusData,
        qrCode,
        inbox,
        escalations,
        automationConfig,
        isLoading,
        error,
        fetchStatus,
        fetchInbox,
        fetchEscalations,
        fetchAutomationConfig,
        saveAutomationConfig,
        restartEngine,
        resetSession,
        sendCampaign,
        sendDirectMessage,
        subscribeSocket,
        unsubscribeSocket,
    } = useWhatsAppStore();
    const { customers, fetchCustomers } = useCRMStore();

    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [targetType, setTargetType] = useState<TargetType>('ALL');
    const [manualPhones, setManualPhones] = useState('');
    const [campaignText, setCampaignText] = useState('');
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [chatSearch, setChatSearch] = useState('');
    const [testPhone, setTestPhone] = useState('');
    const [testMessage, setTestMessage] = useState('أهلاً، دي رسالة اختبار من نظام المطعم.');
    const [configDraft, setConfigDraft] = useState<WhatsAppAutomationConfig>(defaultConfig);

    useEffect(() => {
        fetchStatus();
        fetchInbox();
        fetchEscalations();
        fetchAutomationConfig();
        fetchCustomers();
        subscribeSocket();
        const interval = setInterval(() => {
            fetchStatus(true);
            fetchInbox();
            fetchEscalations();
        }, 15000);
        return () => {
            clearInterval(interval);
            unsubscribeSocket();
        };
    }, [fetchStatus, fetchInbox, fetchEscalations, fetchAutomationConfig, fetchCustomers, subscribeSocket, unsubscribeSocket]);

    useEffect(() => {
        if (automationConfig) setConfigDraft({ ...defaultConfig, ...automationConfig });
    }, [automationConfig]);

    const currentStatus = statusData?.status || 'INITIALIZING';
    const meta = statusMeta[currentStatus] || statusMeta.INITIALIZING;
    const isReady = currentStatus === 'READY';
    const scanValue = qrCode || statusData?.qr || '';

    const chats = useMemo(() => {
        const grouped: Record<string, any[]> = {};
        for (const msg of Array.isArray(inbox) ? inbox : []) {
            const phone = String(msg.from || '').trim();
            if (!phone) continue;
            if (!grouped[phone]) grouped[phone] = [];
            grouped[phone].push(msg);
        }
        for (const key of Object.keys(grouped)) {
            grouped[key].sort((a, b) => new Date(b.receivedAt || b.timestamp || 0).getTime() - new Date(a.receivedAt || a.timestamp || 0).getTime());
        }
        return grouped;
    }, [inbox]);

    const chatPhones = useMemo(() => {
        const q = chatSearch.trim();
        return Object.keys(chats).filter((phone) => !q || phone.includes(q) || chats[phone].some((m) => String(m.text || '').includes(q)));
    }, [chats, chatSearch]);

    const selectedMessages = selectedChat ? chats[selectedChat] || [] : [];
    const vipCount = customers.filter((c: any) => c.loyaltyTier === 'GOLD' || c.loyaltyTier === 'PLATINUM').length;

    const targetPhones = useMemo(() => {
        const phones = targetType === 'ALL' ? customers.map((c: any) => c.phone).filter(Boolean)
            : targetType === 'VIP' ? customers
            .filter((c: any) => c.loyaltyTier === 'GOLD' || c.loyaltyTier === 'PLATINUM')
            .map((c: any) => c.phone)
            .filter(Boolean)
            : manualPhones.split(/[,،\n]/).map((p) => p.trim()).filter(Boolean);
        return Array.from(new Set(phones.map((p: string) => p.trim()).filter(Boolean)));
    }, [customers, manualPhones, targetType]);

    const handleCampaign = async () => {
        if (!campaignText.trim()) return toast.error('اكتب نص الحملة الأول');
        if (targetPhones.length === 0) return toast.error('مفيش أرقام مستهدفة');
        const ok = await sendCampaign(targetPhones, campaignText.trim(), true);
        if (ok) {
            toast.success(`تمت جدولة ${targetPhones.length} رسالة`);
            setCampaignText('');
        }
    };

    const handleReply = async () => {
        if (!selectedChat || !replyText.trim()) return;
        const ok = await sendDirectMessage(selectedChat, replyText.trim());
        if (ok) {
            toast.success('تم إرسال الرد');
            setReplyText('');
            fetchInbox();
        }
    };

    const handleTest = async () => {
        if (!testPhone.trim() || !testMessage.trim()) return toast.error('اكتب الرقم والرسالة');
        const ok = await sendDirectMessage(testPhone.trim(), testMessage.trim());
        if (ok) toast.success('تم إرسال رسالة الاختبار');
    };

    const handleSaveConfig = async () => {
        const ok = await saveAutomationConfig(configDraft);
        if (ok) toast.success('تم حفظ إعدادات الواتساب');
    };

    const tabs: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
        { key: 'overview', label: 'التشغيل والربط', icon: Gauge },
        { key: 'inbox', label: 'المحادثات', icon: Inbox },
        { key: 'campaigns', label: 'الحملات', icon: Send },
        { key: 'automation', label: 'البوت والأتمتة', icon: Bot },
        { key: 'settings', label: 'الإعدادات', icon: Settings2 },
    ];
    const targetCards: Array<{ key: TargetType; title: string; count: string; icon: React.ElementType }> = [
        { key: 'ALL', title: 'كل العملاء', count: `${customers.length} رقم`, icon: Users },
        { key: 'VIP', title: 'العملاء المميزين', count: `${vipCount} رقم`, icon: ShieldCheck },
        { key: 'MANUAL', title: 'إدخال يدوي', count: 'أرقام مخصصة', icon: SlidersHorizontal },
    ];

    return (
        <div className="min-h-screen bg-app p-4 text-main lg:p-6" dir="rtl">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
                <header className="rounded-2xl border border-border/60 bg-card px-5 py-4 shadow-sm">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                                <MessageCircle className="h-7 w-7" />
                            </div>
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h1 className="text-2xl font-black tracking-tight lg:text-3xl">مركز تشغيل واتساب</h1>
                                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${meta.tone}`}>{meta.label}</span>
                                </div>
                                <p className="mt-1 text-sm font-bold text-muted">ربط الرقم، رسائل الدليفري، الفيدباك، البوت، الحملات، والردود من مكان واحد.</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => fetchStatus()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-elevated px-4 text-sm font-black text-main transition hover:bg-card">
                                <RefreshCw className="h-4 w-4" />
                                إعادة فحص
                            </button>
                            <button onClick={restartEngine} disabled={isLoading} className="inline-flex h-11 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-black text-sky-700 transition hover:bg-sky-100 disabled:opacity-60">
                                <Power className="h-4 w-4" />
                                إعادة تشغيل
                            </button>
                            <button onClick={resetSession} disabled={isLoading} className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-800 transition hover:bg-amber-100 disabled:opacity-60">
                                <QrCode className="h-4 w-4" />
                                إعادة ربط وإظهار QR
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                        <div className="rounded-xl border border-border/50 bg-elevated/40 px-4 py-3">
                            <div className="text-xs font-bold text-muted">Provider</div>
                            <div className="mt-1 truncate text-sm font-black ltr">{statusData?.provider || 'whatsapp-web.js'}</div>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-elevated/40 px-4 py-3">
                            <div className="text-xs font-bold text-muted">Session</div>
                            <div className="mt-1 truncate text-sm font-black ltr">{statusData?.sessionName || '-'}</div>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-elevated/40 px-4 py-3">
                            <div className="text-xs font-bold text-muted">Queue</div>
                            <div className="mt-1 text-sm font-black">{statusData?.queueCount ?? 0} رسالة</div>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-elevated/40 px-4 py-3">
                            <div className="text-xs font-bold text-muted">Inbox</div>
                            <div className="mt-1 text-sm font-black">{statusData?.inboxCount ?? inbox.length} رسالة</div>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-elevated/40 px-4 py-3">
                            <div className="text-xs font-bold text-muted">تصعيدات مفتوحة</div>
                            <div className="mt-1 text-sm font-black">{statusData?.openEscalations ?? escalations.length}</div>
                        </div>
                    </div>
                </header>

                {(error || statusData?.reason) && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                        {error || statusData?.reason}
                    </div>
                )}

                <div className="flex flex-wrap gap-2 rounded-2xl border border-border/60 bg-card p-2 shadow-sm">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-black transition ${active ? 'bg-main text-app shadow-sm' : 'text-muted hover:bg-elevated hover:text-main'}`}
                            >
                                <Icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {activeTab === 'overview' && (
                    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
                        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-black">ربط الرقم</h2>
                                    <p className="mt-1 text-xs font-bold text-muted">{meta.hint}</p>
                                </div>
                                <span className={`rounded-full border px-3 py-1 text-xs font-black ${meta.tone}`}>{meta.label}</span>
                            </div>

                            <div className="mt-5 flex min-h-[330px] items-center justify-center rounded-2xl border border-dashed border-border bg-elevated/30 p-5">
                                {scanValue ? (
                                    <div className="text-center">
                                        <div className="mx-auto w-fit rounded-2xl bg-white p-4 shadow-sm">
                                            <QRCodeSVG value={scanValue} size={245} />
                                        </div>
                                        <div className="mt-4 text-sm font-black">افتح واتساب من الموبايل وامسح الكود</div>
                                        <div className="mt-1 text-xs font-bold text-muted">Linked devices ثم Link a device</div>
                                    </div>
                                ) : isReady ? (
                                    <div className="text-center">
                                        <CheckCircle2 className="mx-auto h-20 w-20 text-emerald-600" />
                                        <div className="mt-4 text-xl font-black text-emerald-700">الرقم مربوط وجاهز</div>
                                        <div className="mt-2 text-xs font-bold text-muted">تقدر تبعت حملات، رسائل أوردرات، وفيدباك.</div>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <AlertTriangle className="mx-auto h-16 w-16 text-amber-600" />
                                        <div className="mt-4 text-xl font-black">مفيش QR ظاهر حاليًا</div>
                                        <div className="mt-2 text-sm font-bold text-muted">اضغط "إعادة ربط وإظهار QR" لمسح الجلسة القديمة وإنشاء Scan جديد.</div>
                                        <button onClick={resetSession} disabled={isLoading} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-amber-600 px-5 text-sm font-black text-white transition hover:bg-amber-700 disabled:opacity-60">
                                            <RotateCcw className="h-4 w-4" />
                                            اعمل Scan جديد
                                        </button>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="grid gap-5 lg:grid-cols-2">
                            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                                <h2 className="flex items-center gap-2 text-lg font-black"><Zap className="h-5 w-5 text-emerald-600" /> تدفقات الدليفري</h2>
                                <div className="mt-4 space-y-3">
                                    {[
                                        ['الأوردر الجديد', 'يبعت تفاصيل الطلب للعميل أول ما يتسجل.'],
                                        ['خرج للتوصيل', 'رسالة تلقائية لما الحالة تتحول إلى Out for delivery.'],
                                        ['تم التسليم', 'رسالة انتهاء الطلب وتجهيز سؤال الفيدباك.'],
                                        ['الفيدباك', 'بعد المدة المحددة يطلب تقييم العميل ويرصد الشكاوى.'],
                                    ].map(([title, desc]) => (
                                        <div key={title} className="flex items-start gap-3 rounded-xl border border-border/50 bg-elevated/30 p-3">
                                            <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" />
                                            <div>
                                                <div className="text-sm font-black">{title}</div>
                                                <div className="mt-1 text-xs font-bold text-muted">{desc}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                                <h2 className="flex items-center gap-2 text-lg font-black"><Activity className="h-5 w-5 text-sky-600" /> نبض التشغيل</h2>
                                <div className="mt-4 space-y-3 text-sm font-bold">
                                    <div className="flex items-center justify-between rounded-xl bg-elevated/40 px-4 py-3">
                                        <span className="text-muted">بدأ التشغيل</span>
                                        <span>{formatDateTime(statusData?.startedAt)}</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl bg-elevated/40 px-4 py-3">
                                        <span className="text-muted">آخر Webhook</span>
                                        <span>{formatDateTime(statusData?.lastWebhookAt)}</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl bg-elevated/40 px-4 py-3">
                                        <span className="text-muted">آخر فحص</span>
                                        <span>{formatDateTime(statusData?.checkedAt)}</span>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'inbox' && (
                    <div className="grid min-h-[680px] gap-5 xl:grid-cols-[360px_1fr_300px]">
                        <aside className="rounded-2xl border border-border/60 bg-card shadow-sm">
                            <div className="border-b border-border/60 p-4">
                                <h2 className="text-lg font-black">المحادثات</h2>
                                <div className="relative mt-3">
                                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
                                    <input value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="ابحث برقم أو رسالة" className="h-10 w-full rounded-xl border border-border bg-elevated px-4 pl-9 text-sm font-bold outline-none focus:border-sky-400" />
                                </div>
                            </div>
                            <div className="max-h-[610px] overflow-y-auto p-2">
                                {chatPhones.length === 0 ? (
                                    <div className="p-8 text-center text-sm font-bold text-muted">مفيش رسائل واردة لسه</div>
                                ) : chatPhones.map((phone) => {
                                    const latest = chats[phone][0];
                                    const active = selectedChat === phone;
                                    return (
                                        <button key={phone} onClick={() => setSelectedChat(phone)} className={`mb-2 flex w-full items-center gap-3 rounded-xl border p-3 text-right transition ${active ? 'border-sky-300 bg-sky-50' : 'border-transparent hover:border-border hover:bg-elevated/60'}`}>
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-main text-sm font-black text-app ltr">{getInitials(phone)}</div>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-black ltr">{phone}</div>
                                                <div className="mt-1 truncate text-xs font-bold text-muted">{latest?.text || '-'}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>

                        <section className="flex rounded-2xl border border-border/60 bg-card shadow-sm">
                            {selectedChat ? (
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <div className="flex items-center justify-between border-b border-border/60 p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                                                <User className="h-6 w-6" />
                                            </div>
                                            <div>
                                                <div className="font-black ltr">{selectedChat}</div>
                                                <div className="text-xs font-bold text-muted">جلسة دعم ومتابعة</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-1 space-y-3 overflow-y-auto bg-elevated/30 p-5">
                                        {selectedMessages.slice().reverse().map((msg: any) => (
                                            <div key={msg.id || msg.waMessageId} className="max-w-[78%] rounded-2xl rounded-tr-sm border border-border/60 bg-card p-4 shadow-sm">
                                                <div className="whitespace-pre-wrap text-sm font-bold leading-7">{msg.text}</div>
                                                <div className="mt-2 text-left text-[11px] font-bold text-muted">{formatDateTime(msg.receivedAt || msg.timestamp)}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="border-t border-border/60 p-4">
                                        <div className="flex gap-3">
                                            <input value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleReply()} placeholder="اكتب رد للعميل..." className="h-12 flex-1 rounded-xl border border-border bg-elevated px-4 text-sm font-bold outline-none focus:border-sky-400" />
                                            <button onClick={handleReply} disabled={!isReady || isLoading} className="inline-flex h-12 items-center gap-2 rounded-xl bg-main px-5 text-sm font-black text-app transition hover:opacity-90 disabled:opacity-50">
                                                <Send className="h-4 w-4" />
                                                إرسال
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                                    <MessageSquareReply className="h-16 w-16 text-muted" />
                                    <div className="mt-4 text-lg font-black">اختار محادثة</div>
                                    <div className="mt-2 text-sm font-bold text-muted">تقدر تتابع العميل وترد يدويًا من هنا.</div>
                                </div>
                            )}
                        </section>

                        <aside className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                            <h2 className="flex items-center gap-2 text-lg font-black"><AlertTriangle className="h-5 w-5 text-amber-600" /> تصعيدات</h2>
                            <div className="mt-4 space-y-3">
                                {escalations.length === 0 ? (
                                    <div className="rounded-xl bg-elevated/40 p-4 text-sm font-bold text-muted">مفيش شكاوى مفتوحة.</div>
                                ) : escalations.slice(0, 8).map((item: any) => (
                                    <div key={item.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                                        <div className="text-xs font-black ltr">{item.from}</div>
                                        <div className="mt-2 text-xs font-bold leading-6">{item.text}</div>
                                    </div>
                                ))}
                            </div>
                        </aside>
                    </div>
                )}

                {activeTab === 'campaigns' && (
                    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
                        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                            <h2 className="flex items-center gap-2 text-lg font-black"><Sparkles className="h-5 w-5 text-emerald-600" /> حملة واتساب</h2>
                            <div className="mt-5 grid gap-3 md:grid-cols-3">
                                {targetCards.map(({ key, title, count, icon: Icon }) => {
                                    const active = targetType === key;
                                    return (
                                        <button key={key} onClick={() => setTargetType(key)} className={`rounded-xl border p-4 text-right transition ${active ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-border bg-elevated/30 hover:bg-elevated'}`}>
                                            <Icon className="h-5 w-5" />
                                            <div className="mt-3 text-sm font-black">{title}</div>
                                            <div className="mt-1 text-xs font-bold text-muted">{count}</div>
                                        </button>
                                    );
                                })}
                            </div>
                            {targetType === 'MANUAL' && (
                                <textarea value={manualPhones} onChange={(e) => setManualPhones(e.target.value)} placeholder="رقم في كل سطر أو مفصول بفاصلة" className="mt-4 min-h-[95px] w-full rounded-xl border border-border bg-elevated p-4 text-sm font-bold outline-none focus:border-emerald-400" />
                            )}
                            <textarea value={campaignText} onChange={(e) => setCampaignText(e.target.value)} placeholder="اكتب رسالة الحملة. مثال: أهلاً {name} عندنا عرض النهاردة..." className="mt-4 min-h-[220px] w-full rounded-xl border border-border bg-elevated p-4 text-sm font-bold leading-7 outline-none focus:border-emerald-400" />
                            <button onClick={handleCampaign} disabled={!isReady || isLoading || targetPhones.length === 0} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50">
                                <Send className="h-4 w-4" />
                                جدولة الحملة لـ {targetPhones.length} رقم
                            </button>
                        </section>

                        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                            <h2 className="text-lg font-black">سياسة الإرسال</h2>
                            <div className="mt-4 space-y-3 text-sm font-bold text-muted">
                                <div className="rounded-xl border border-border/50 bg-elevated/40 p-4">الحملات تدخل Queue وتتوزع بتأخير عشوائي لتقليل ضغط الإرسال.</div>
                                <div className="rounded-xl border border-border/50 bg-elevated/40 p-4">رسائل الأوردر والفيدباك لها أولوية أعلى من الحملات التسويقية.</div>
                                <div className="rounded-xl border border-border/50 bg-elevated/40 p-4">لو الرقم غير مربوط أو مش جاهز، الزر يتقفل لحد ما الحالة تبقى جاهزة.</div>
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'automation' && (
                    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
                        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                            <h2 className="flex items-center gap-2 text-lg font-black"><Bot className="h-5 w-5 text-violet-600" /> البوت والرسائل التلقائية</h2>
                            <div className="mt-5 grid gap-3 md:grid-cols-2">
                                <ToggleRow title="رسالة الأوردر الجديد" description="تفاصيل الطلب والعميل والإجمالي عند إنشاء أوردر دليفري." checked={configDraft.orderCreated} onChange={(v) => setConfigDraft({ ...configDraft, orderCreated: v })} />
                                <ToggleRow title="رسالة خرج للتوصيل" description="إبلاغ العميل عند خروج الطلب مع المندوب." checked={configDraft.outForDelivery} onChange={(v) => setConfigDraft({ ...configDraft, outForDelivery: v })} />
                                <ToggleRow title="رسالة التسليم" description="رسالة شكر بعد اكتمال الطلب." checked={configDraft.delivered} onChange={(v) => setConfigDraft({ ...configDraft, delivered: v })} />
                                <ToggleRow title="طلب الفيدباك" description="سؤال تقييم بعد التسليم بالمدة المحددة." checked={configDraft.feedback} onChange={(v) => setConfigDraft({ ...configDraft, feedback: v })} />
                                <ToggleRow title="الرد الآلي" description="الرد على المنيو، حالة الطلب، والتقييمات الأساسية." checked={configDraft.botEnabled} onChange={(v) => setConfigDraft({ ...configDraft, botEnabled: v })} />
                                <ToggleRow title="ساعات هدوء" description="إيقاف الحملات في وقت النوم مع استمرار رسائل الأوردرات المهمة." checked={configDraft.quietHoursEnabled} onChange={(v) => setConfigDraft({ ...configDraft, quietHoursEnabled: v })} />
                            </div>

                            <div className="mt-5 grid gap-4 md:grid-cols-3">
                                <label className="block">
                                    <span className="text-xs font-black text-muted">تأخير الفيدباك بالدقائق</span>
                                    <input type="number" min={1} value={configDraft.feedbackDelayMinutes} onChange={(e) => setConfigDraft({ ...configDraft, feedbackDelayMinutes: Number(e.target.value || 1) })} className="mt-2 h-11 w-full rounded-xl border border-border bg-elevated px-4 text-sm font-bold outline-none" />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-black text-muted">بداية ساعات الهدوء</span>
                                    <input type="time" value={configDraft.quietHoursFrom} onChange={(e) => setConfigDraft({ ...configDraft, quietHoursFrom: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-border bg-elevated px-4 text-sm font-bold outline-none" />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-black text-muted">نهاية ساعات الهدوء</span>
                                    <input type="time" value={configDraft.quietHoursTo} onChange={(e) => setConfigDraft({ ...configDraft, quietHoursTo: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-border bg-elevated px-4 text-sm font-bold outline-none" />
                                </label>
                            </div>

                            <label className="mt-5 block">
                                <span className="text-xs font-black text-muted">كلمات التصعيد للدعم البشري</span>
                                <input value={configDraft.humanHandoffKeywords.join(', ')} onChange={(e) => setConfigDraft({ ...configDraft, humanHandoffKeywords: e.target.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean) })} className="mt-2 h-11 w-full rounded-xl border border-border bg-elevated px-4 text-sm font-bold outline-none" />
                            </label>

                            <button onClick={handleSaveConfig} disabled={isLoading} className="mt-5 inline-flex h-12 items-center gap-2 rounded-xl bg-main px-5 text-sm font-black text-app transition hover:opacity-90 disabled:opacity-50">
                                <Save className="h-4 w-4" />
                                حفظ إعدادات البوت
                            </button>
                        </section>

                        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                            <h2 className="text-lg font-black">سيناريوهات الرد</h2>
                            <div className="mt-4 space-y-3">
                                {[
                                    ['العميل كتب: منيو', 'يبعت رد مختصر ويوجه العميل يكتب طلبه أو يستعلم عن الطلب.'],
                                    ['العميل كتب: حالة الطلب', 'يبحث بآخر طلب مربوط بنفس رقم الهاتف ويرجع الحالة والإجمالي.'],
                                    ['العميل كتب تقييم 1-5', 'يسجل رد شكر أو اعتذار ويصعد لو التقييم قليل.'],
                                    ['كلمات شكوى', 'تظهر في التصعيدات عشان الإدارة تتدخل.'],
                                ].map(([title, desc]) => (
                                    <div key={title} className="rounded-xl border border-border/50 bg-elevated/40 p-4">
                                        <div className="text-sm font-black">{title}</div>
                                        <div className="mt-1 text-xs font-bold leading-6 text-muted">{desc}</div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
                        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                            <h2 className="text-lg font-black">رسالة اختبار مباشرة</h2>
                            <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="رقم العميل 010..." className="mt-4 h-11 w-full rounded-xl border border-border bg-elevated px-4 text-sm font-bold outline-none focus:border-sky-400" />
                            <textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} className="mt-3 min-h-[140px] w-full rounded-xl border border-border bg-elevated p-4 text-sm font-bold leading-7 outline-none focus:border-sky-400" />
                            <button onClick={handleTest} disabled={!isReady || isLoading} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-black text-white transition hover:bg-sky-700 disabled:opacity-50">
                                <Send className="h-4 w-4" />
                                إرسال اختبار
                            </button>
                        </section>

                        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                            <h2 className="text-lg font-black">تشخيص وتشغيل</h2>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <div className="rounded-xl border border-border/50 bg-elevated/40 p-4">
                                    <div className="flex items-center gap-2 text-sm font-black"><Clock className="h-4 w-4" /> طريقة الربط</div>
                                    <p className="mt-2 text-xs font-bold leading-6 text-muted">النظام يعمل بمحرك داخلي مبني على WhatsApp Web. امسح QR مرة واحدة وبعدها تفضل الجلسة محفوظة على السيرفر.</p>
                                </div>
                                <div className="rounded-xl border border-border/50 bg-elevated/40 p-4">
                                    <div className="flex items-center gap-2 text-sm font-black"><ShieldCheck className="h-4 w-4" /> حدود التشغيل</div>
                                    <p className="mt-2 text-xs font-bold leading-6 text-muted">الإرسال المكثف يحتاج أرقام حقيقية ورسائل مفيدة وتوزيع زمني. مفيش ضمان ضد حظر واتساب لو حصل إساءة استخدام.</p>
                                </div>
                            </div>
                            <div className="mt-5 flex flex-wrap gap-2">
                                <button onClick={restartEngine} disabled={isLoading} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-elevated px-4 text-sm font-black">
                                    <Power className="h-4 w-4" />
                                    Restart Engine
                                </button>
                                <button onClick={resetSession} disabled={isLoading} className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-800">
                                    <RotateCcw className="h-4 w-4" />
                                    Reset Session + QR
                                </button>
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WhatsAppHub;
