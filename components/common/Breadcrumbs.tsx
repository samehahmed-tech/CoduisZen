import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, Mail, Bell, Sparkles, LogOut, User, MapPin, Clock, CalendarDays, Wallet } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useFinanceStore } from '../../stores/useFinanceStore';
import { translations } from '../../services/translations';

// Map of raw paths to generic translation keys
const PATH_MAP: Record<string, string> = {
    'pos': 'pos',
    'kitchen': 'kitchen',
    'orders': 'orders',
    'tables': 'tables',
    'production': 'production',
    'menu': 'menu',
    'inventory': 'inventory',
    'finance': 'finance',
    'reports': 'reports',
    'crm': 'crm',
    'user-management': 'team',
    'call-center': 'call_center',
    'dispatch': 'dispatch',
    'ai-assistant': 'ai_assistant',
    'marketing': 'marketing',
    'settings': 'settings',
};

const HR_PATH_LABELS: Record<string, { ar: string; en: string }> = {
    hr: { ar: 'الموظفون', en: 'Employees' },
    'hr-guide': { ar: 'دليل الموارد البشرية', en: 'HR Guide' },
    'hr-settings': { ar: 'إعدادات الأقسام', en: 'HR Settings' },
    attendance: { ar: 'الحضور والانصراف', en: 'Attendance' },
    payroll: { ar: 'الرواتب والأجور', en: 'Payroll' },
    'biometric-devices': { ar: 'أجهزة البصمة', en: 'Biometric Devices' },
    scheduling: { ar: 'جدولة الورديات', en: 'Scheduling' },
    'shift-tasks': { ar: 'قوائم المهام', en: 'Shift Tasks' },
    forensics: { ar: 'التدقيق والتحقيقات', en: 'Forensics' },
};

const Breadcrumbs: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { settings, logout, branches } = useAuthStore();
    const { activeShift } = useFinanceStore();
    
    const currentUser = settings.currentUser;
    const activeBranch = branches.find(b => b.id === settings.activeBranchId);
    const language = (settings.language || 'en') as 'en' | 'ar';
    const isRtl = language === 'ar';
    const t = translations[language];

    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const [showMessagesPanel, setShowMessagesPanel] = useState(false);
    const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const userInitials = currentUser?.name?.substring(0, 2).toUpperCase() || 'RF';
    const systemDateLabel = new Intl.DateTimeFormat(isRtl ? 'ar-EG' : 'en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(currentTime);

    const breadcrumbs = useMemo(() => {
        const pathnames = location.pathname.split('/').filter((x) => x);
        const crumbs = [];

        // Always add Home
        crumbs.push({
            name: isRtl ? 'الرئيسية' : 'Home',
            path: '/',
            isLast: pathnames.length === 0,
        });

        let currentPath = '';

        pathnames.forEach((segment, index) => {
            currentPath += `/${segment}`;
            const isLast = index === pathnames.length - 1;

            // Try to translate the segment, otherwise capitalize
            let name = segment;
            const hrLabel = HR_PATH_LABELS[segment];
            const mappedKey = PATH_MAP[segment];
            if (hrLabel) {
                name = hrLabel[language];
            } else if (mappedKey && (t as any)[mappedKey]) {
                name = (t as any)[mappedKey];
            } else if (segment.length === 36 && segment.includes('-')) {
                name = isRtl ? 'تفاصيل' : 'Details'; // UUID detection
            } else {
                name = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
            }

            crumbs.push({
                name,
                path: currentPath,
                isLast,
            });
        });

        return crumbs;
    }, [location.pathname, t, isRtl]);

    if (location.pathname === '/pos' || location.pathname === '/kitchen') {
        return null; // Less clutter on operational screens
    }

    return (
        <nav
            aria-label="Breadcrumb"
            className={`px-4 sm:px-6 pt-4 pb-2 flex items-center gap-2 sm:gap-4 max-lg:ps-14 ${isRtl ? 'flex-row-reverse' : ''}`}
        >
            <div className={`workspace-breadcrumbs flex-1 min-w-0 flex flex-col gap-2 ${isRtl ? 'workspace-breadcrumbs-rtl' : ''}`}>
                <div className={`flex flex-wrap items-center gap-3 ${isRtl ? 'flex-row' : ''}`}>
                    <div className="flex items-center gap-1.5 bg-elevated/40 border border-border/10 px-2.5 py-1 rounded-lg">
                        <MapPin size={14} className="text-primary" />
                        <span className="max-w-[82px] truncate text-[11px] font-bold text-main sm:max-w-none sm:text-xs">
                            {activeBranch?.name || (isRtl ? 'الفرع الرئيسي' : 'Main Branch')}
                        </span>
                    </div>

                    <div className="hidden sm:flex items-center gap-1.5 bg-elevated/40 border border-border/10 px-2.5 py-1 rounded-lg">
                        <CalendarDays size={14} className="text-muted" />
                        <span className="flex flex-col leading-tight">
                            <span className="text-[11px] sm:text-xs font-semibold text-muted">
                                {new Intl.DateTimeFormat(isRtl ? 'ar-EG' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' }).format(currentTime)}
                            </span>
                            <span className="text-[9px] font-black text-muted/70">
                                {isRtl ? 'تاريخ السيستم: ' : 'System: '}{systemDateLabel}
                            </span>
                        </span>
                        <div className="w-[1px] h-3 bg-border/40 mx-0.5" />
                        <Clock size={14} className="text-muted" />
                        <span className="text-[11px] sm:text-xs font-semibold text-muted">
                            {new Intl.DateTimeFormat(isRtl ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: 'numeric', hour12: true }).format(currentTime)}
                        </span>
                    </div>

                    <div className={`hidden md:flex items-center gap-1.5 ${activeShift ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'} border px-2.5 py-1 rounded-lg shadow-sm`}>
                        <Wallet size={14} className={activeShift ? 'text-emerald-500' : 'text-amber-500'} />
                        <span className={`text-[11px] sm:text-xs font-bold ${activeShift ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {activeShift 
                                ? (isRtl ? `الوردية #${activeShift.id.slice(-4)}` : `Shift #${activeShift.id.slice(-4)}`)
                                : (isRtl ? 'لا توجد وردية' : 'No Active Shift')}
                        </span>
                    </div>
                </div>

                <ol className="hidden w-full flex-wrap items-center gap-1.5 sm:flex sm:gap-2.5">
                {breadcrumbs.map((crumb, index) => {
                    const isFirst = index === 0;

                    return (
                        <li key={crumb.path} className={`flex items-center ${isRtl && index > 0 ? 'flex-row-reverse' : ''}`}>
                            {index > 0 && (
                                <ChevronRight
                                    size={14}
                                    className={`text-muted/40 mx-1 shrink-0 ${isRtl ? 'rotate-180' : ''}`}
                                    aria-hidden="true"
                                />
                            )}

                            {crumb.isLast ? (
                                <span className="text-[11px] sm:text-[13px] font-bold text-main flex items-center gap-1.5 transition-colors">
                                    {isFirst && <Home size={14} className="text-muted/70" />}
                                    {crumb.name}
                                </span>
                            ) : (
                                <Link
                                    to={crumb.path}
                                    className="text-[11px] sm:text-[13px] font-semibold text-muted hover:text-primary transition-colors flex items-center gap-1.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                >
                                    {isFirst && <Home size={14} className={isRtl ? 'ml-1' : 'mr-1'} />}
                                    {crumb.name}
                                </Link>
                            )}
                        </li>
                    );
                })}
                </ol>
            </div>

            {/* Right Side: Communication & User Profile */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                {/* Messages & Notifications */}
                <div className="flex items-center gap-1.5 p-1 bg-elevated/40 border border-border/10 rounded-xl relative">
                    <button 
                        onClick={() => { setShowMessagesPanel(!showMessagesPanel); setShowNotificationsPanel(false); setShowUserMenu(false); }}
                        className="p-2 rounded-lg text-muted hover:text-main hover:bg-elevated transition-colors relative"
                        title={isRtl ? 'الرسائل الداخلية' : 'Internal Messages'}
                        aria-label={isRtl ? 'الرسائل الداخلية' : 'Internal Messages'}
                    >
                        <Mail size={16} />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-card" />
                    </button>
                    <div className="w-[1px] h-5 bg-border/20" />
                    <button 
                        onClick={() => { setShowNotificationsPanel(!showNotificationsPanel); setShowMessagesPanel(false); setShowUserMenu(false); }}
                        className="p-2 rounded-lg text-muted hover:text-main hover:bg-elevated transition-colors relative"
                        title={isRtl ? 'الإشعارات' : 'Notifications'}
                        aria-label={isRtl ? 'الإشعارات' : 'Notifications'}
                    >
                        <Bell size={16} />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full border-2 border-card" />
                    </button>

                    {/* Messages Popup */}
                    {showMessagesPanel && (
                        <div className={`theme-popover absolute top-full mt-3 w-80 z-[999] overflow-hidden ${isRtl ? 'left-0' : 'right-0'}`}>
                            <div className="theme-modal-header p-3 flex justify-between items-center">
                                <span className="font-bold text-sm tracking-wide text-main">{isRtl ? 'البريد الداخلي' : 'Internal Inbox'}</span>
                                <span className="text-[10px] text-white bg-rose-500 px-2.5 py-0.5 rounded-full font-bold shadow-sm shadow-rose-500/30">1 {isRtl ? 'جديد' : 'New'}</span>
                            </div>
                            <div className="p-8 text-center text-muted/60 text-xs flex flex-col items-center gap-3">
                                <Mail size={32} className="opacity-20" />
                                <span>{isRtl ? 'جاري التحضير وربط المحادثات من قاعدة البيانات...' : 'Loading messages...'}</span>
                            </div>
                        </div>
                    )}

                    {/* Notifications Popup */}
                    {showNotificationsPanel && (
                        <div className={`theme-popover absolute top-full mt-3 w-80 z-[999] overflow-hidden ${isRtl ? 'left-0' : 'right-0'}`}>
                            <div className="theme-modal-header p-3 flex justify-between items-center">
                                <span className="font-bold text-sm tracking-wide text-main">{isRtl ? 'الإشعارات' : 'System Alerts'}</span>
                                <span className="text-[10px] text-white bg-amber-500 px-2.5 py-0.5 rounded-full font-bold shadow-sm shadow-amber-500/30">1 {isRtl ? 'جديد' : 'New'}</span>
                            </div>
                            <div className="flex flex-col">
                                <div className="p-3 border-b border-border/5 hover:bg-elevated/50 cursor-pointer flex gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                                        <Sparkles size={14} className="text-emerald-500" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-main">{isRtl ? 'تم تفعيل نظام المراسلات' : 'Messaging Active'}</div>
                                        <div className="text-[10px] text-muted mt-1 leading-relaxed">
                                            {isRtl ? 'الآن يمكن مشاهدة الإشعارات. جاري العمل على استكمال الواجهات الخاصة بصندوق البريد.' : 'System functionality is mapped and rolling out.'}
                                        </div>
                                    </div>
                                </div>
                                <button className="w-full py-2.5 text-center text-xs font-bold text-primary hover:bg-elevated/50 transition-colors uppercase tracking-wider">
                                    {isRtl ? 'عرض الكل' : 'View All'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* User Dropdown Profile */}
                <div className="relative">
                    <button
                        type="button"
                        aria-label={isRtl ? 'فتح قائمة المستخدم' : 'Open user menu'}
                        onClick={() => { setShowUserMenu(!showUserMenu); setShowMessagesPanel(false); setShowNotificationsPanel(false); }}
                        className="group flex items-center gap-0 rounded-xl border border-border/10 bg-elevated/40 p-1.5 shadow-sm transition-all hover:bg-elevated sm:gap-2.5 sm:pr-3 sm:rtl:pl-3 sm:rtl:pr-1.5"
                    >
                        <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white font-bold text-[11px] shrink-0 overflow-hidden shadow-inner group-hover:scale-105 transition-transform">
                            {userInitials}
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-card" />
                        </div>
                        <div className="hidden min-w-0 flex-col items-start pr-1 text-left rtl:text-right sm:flex">
                            <span className="text-xs font-bold text-main leading-none truncate max-w-[100px]">{currentUser?.name || 'User'}</span>
                            <span className="text-[9px] font-semibold text-muted/60 uppercase tracking-widest mt-1 truncate">{currentUser?.role}</span>
                        </div>
                    </button>

                    {showUserMenu && (
                        <div className={`theme-popover absolute top-full mt-3 w-56 z-[999] overflow-hidden flex flex-col ${isRtl ? 'left-0' : 'right-0'}`}>
                            <div className="theme-modal-header px-4 py-4 flex flex-col items-center">
                                <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-lg mb-2 border-2 border-primary/20">
                                    {userInitials}
                                </div>
                                <div className="text-sm font-bold text-main truncate text-center">{currentUser?.name || 'User'}</div>
                                <div className="text-[10px] text-muted/60 uppercase tracking-widest mt-0.5 text-center">{currentUser?.role || 'Staff'}</div>
                            </div>
                            
                            <div className="p-2 flex flex-col gap-1">
                                <button
                                    type="button"
                                    onClick={() => { setShowUserMenu(false); navigate('/settings'); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold text-muted hover:text-main hover:bg-elevated/50 rounded-xl transition-colors"
                                >
                                    <User size={14} className="text-primary" />
                                    <span>{isRtl ? 'حسابي وإعداداتي' : 'My Account Settings'}</span>
                                </button>
                                
                                <div className="h-[1px] bg-border/10 my-1 mx-2" />

                                <button type="button" onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors mt-1 shadow-sm">
                                    <LogOut size={14} />
                                    <span>{isRtl ? 'تسجيل الخروج' : 'Sign Out'}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Breadcrumbs;
