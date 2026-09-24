import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuthStore, type LoginMode } from '../stores/useAuthStore';
import { KeyRound, AtSign, Globe, ArrowRight, ShieldCheck, Eye, EyeOff, Sparkles, Fingerprint, Sun, Moon, Lock, Delete } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api/auth';
import { INITIAL_ROLE_PERMISSIONS, User, UserRole } from '../types';

/* ??????????? CSS-in-JS keyframes for the animated gradient ??????????? */
const gradientKeyframes = `
@keyframes aurora {
  0%,100% { background-position: 0% 50%; }
  25%     { background-position: 100% 0%; }
  50%     { background-position: 100% 100%; }
  75%     { background-position: 0% 100%; }
}
@keyframes float {
  0%,100% { transform: translateY(0) scale(1); }
  50%     { transform: translateY(-20px) scale(1.05); }
}
@keyframes shimmer {
  0%   { opacity: 0.4; }
  50%  { opacity: 1; }
  100% { opacity: 0.4; }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-stagger-1 { animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both; }
.animate-stagger-2 { animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both; }
.animate-stagger-3 { animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both; }
.animate-stagger-4 { animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both; }
/* Login is a forced-dark glass page: shield its fields from the global
   light-theme input backgrounds (theme-overrides repaints ALL inputs with
   light vars in light mode while this page forces white text). */
#login-form .login-field {
  background: rgba(255, 255, 255, 0.06) !important;
  color: #ffffff !important;
  border-color: rgba(255, 255, 255, 0.10) !important;
  caret-color: #fbbf24;
}
#login-form .login-field::placeholder {
  color: #64748b !important;
  opacity: 1;
}
#login-form .login-field:focus {
  background: rgba(255, 255, 255, 0.08) !important;
  border-color: rgba(251, 191, 36, 0.35) !important;
}
/* Fix: browser autofill paints inputs white while text stays white -> unreadable */
#login-form input:-webkit-autofill,
#login-form input:-webkit-autofill:hover,
#login-form input:-webkit-autofill:focus,
#login-form input:-webkit-autofill:active {
  -webkit-text-fill-color: #ffffff !important;
  -webkit-box-shadow: 0 0 0 1000px #151d2b inset !important;
  box-shadow: 0 0 0 1000px #151d2b inset !important;
  background-color: #151d2b !important;
  caret-color: #fbbf24;
  transition: background-color 9999s ease-in-out 0s;
}
`;
/* ??????????? Curated halal-safe restaurant backgrounds ??????????? */
const LOGIN_BACKGROUNDS = [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=2500&auto=format&fit=crop', // elegant restaurant interior
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80&w=2500&auto=format&fit=crop', // fine dining plate
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=2500&auto=format&fit=crop', // modern restaurant
    'https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?q=80&w=2500&auto=format&fit=crop', // warm cafe interior
    'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?q=80&w=2500&auto=format&fit=crop', // cozy bistro ambiance
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=2500&auto=format&fit=crop', // overhead food spread
    'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?q=80&w=2500&auto=format&fit=crop', // vibrant dish close-up
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=2500&auto=format&fit=crop', // upscale restaurant setting
    'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?q=80&w=2500&auto=format&fit=crop', // beautifully plated food
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?q=80&w=2500&auto=format&fit=crop', // restaurant exterior night
    'https://images.unsplash.com/photo-1590846406792-0adc7f938f1d?q=80&w=2500&auto=format&fit=crop', // warm kitchen glow
    'https://images.unsplash.com/photo-1551218808-94e220e084d2?q=80&w=2500&auto=format&fit=crop', // chef plating in kitchen
];

const Login: React.FC = () => {
    const { loginWithPassword, settings, updateSettings } = useAuthStore();
    const navigate = useNavigate();
    const location = useLocation();

    const [loginMode, setLoginMode] = useState<'password' | 'pin'>('pin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [pin, setPin] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [mfaRequired, setMfaRequired] = useState(false);
    const [mfaToken, setMfaToken] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const [kickNotice, setKickNotice] = useState<string | undefined>();
    const [pressedKey, setPressedKey] = useState<string | null>(null);
    const [timeStr, setTimeStr] = useState('');
    const [bgImage] = useState(() => LOGIN_BACKGROUNDS[Math.floor(Math.random() * LOGIN_BACKGROUNDS.length)]);

    const pinInputRef = useRef<HTMLInputElement>(null);
    const isArabic = settings.language === 'ar';

    // One-time kick-out notice: if the app logged out on its own (expired /
    // revoked session), explain it instead of a silent login form.
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem('coduiszen:auth-kick');
            sessionStorage.removeItem('coduiszen:auth-kick');
            if (!raw) return;
            const { code, at } = JSON.parse(raw);
            if (Date.now() - Number(at || 0) > 10 * 60 * 1000) return;
            const c = String(code || 'UNKNOWN');
            if (c === 'SESSION_EXPIRED') {
                setKickNotice(isArabic ? 'انتهت مدة الجلسة بسبب عدم النشاط — سجل الدخول مجددًا.' : 'Session expired after inactivity — please sign in again.');
            } else if (c === 'SESSION_REVOKED') {
                setKickNotice(isArabic ? 'تم إنهاء جلستك من الإدارة أو جهاز آخر — سجل الدخول مجددًا.' : 'Your session was ended by management or another device — please sign in again.');
            } else if (c === 'USER_INACTIVE') {
                setKickNotice(isArabic ? 'تم تعطيل هذا الحساب — تواصل مع الإدارة.' : 'This account was deactivated — contact management.');
            } else {
                setKickNotice(isArabic ? 'انتهت الجلسة الحالية — سجل الدخول مجددًا.' : 'Previous session ended — please sign in again.');
            }
        } catch {
            // ignore malformed payloads
        }
    }, [isArabic]);

    // Live clock
    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setTimeStr(now.toLocaleTimeString(isArabic ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }));
        };
        tick();
        const id = setInterval(tick, 30000);
        return () => clearInterval(id);
    }, [isArabic]);


    const t = {
        en: {
            welcome: 'Welcome Back',
            subtitle: 'Sign in to your workspace',
            email: 'Email Address',
            password: 'Password',
            login: 'Sign In',
            verify: 'Verify Code',
            forgot: 'Forgot Password?',
            footer: 'Coduis Zen • v3.0',
            switch: 'العربية',
            invalidCredentials: 'Invalid credentials',
            invalidMfaCode: 'Invalid verification code',
            invalidPin: 'Invalid PIN code',
            remember: 'Remember me',
            mfaCode: '6-digit verification code',
            pinLogin: 'Quick PIN',
            emailLogin: 'Email Login',
            enterPin: 'Enter your PIN code',
            pinHint: 'Type on keyboard or tap the pad',
        },
        ar: {
            welcome: 'مرحباً بعودتك',
            subtitle: 'سجل دخولك إلى نظامك',
            email: 'البريد الإلكتروني',
            password: 'كلمة المرور',
            login: 'تسجيل الدخول',
            verify: 'تحقق من الكود',
            forgot: 'نسيت كلمة المرور؟',
            footer: 'Coduis Zen • v3.0',
            switch: 'English',
            invalidCredentials: 'بيانات الدخول غير صحيحة',
            invalidMfaCode: 'كود التحقق غير صحيح',
            invalidPin: 'كود PIN غير صحيح',
            remember: 'تذكرني',
            mfaCode: 'كود التحقق 6 أرقام',
            pinLogin: 'كود سريع',
            emailLogin: 'إيميل وباسوورد',
            enterPin: 'أدخل كود PIN الخاص بك',
            pinHint: 'اكتب من الكيبورد أو اضغط الأزرار',
        },
    }[settings.language];

    const navigateByRole = (role: string) => {
        if (role === 'CASHIER') navigate('/pos');
        else if (role === 'KITCHEN_STAFF') navigate('/kds');
        else if (role === 'PICKUP_STAFF') navigate('/pickup');
        else if (role === 'ACCOUNTANT') navigate('/finance');
        else navigate('/');
    };

    const getPostLoginPath = (fallback: string) => {
        const from = (location.state as { from?: unknown } | null)?.from;
        if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return fallback;
        if (from === '/login' || from === '/setup') return fallback;
        return from;
    };

    const rolePath = (role: string, defaultPage?: string) => defaultPage || (role === 'KITCHEN_STAFF' ? '/kds' : role === 'PICKUP_STAFF' ? '/pickup' : role === 'ACCOUNTANT' ? '/finance' : role === 'CASHIER' ? '/pos' : '/');

    const handleLoginSuccess = (token: string, refreshToken: string | undefined, user: any) => {
        localStorage.setItem('auth_token', token);
        if (refreshToken) localStorage.setItem('auth_refresh_token', refreshToken);
        const mappedUser: User = {
            id: user.id, name: user.name, email: user.email,
            role: user.role as UserRole,
            permissions: user.permissions || INITIAL_ROLE_PERMISSIONS[user.role as UserRole] || [],
            isActive: user.isActive !== false,
            assignedBranchId: user.assignedBranchId,
            allowedBranches: user.allowedBranches || [],
            defaultPage: user.defaultPage,
            mfaEnabled: user.mfaEnabled === true,
        };
        useAuthStore.setState((state) => ({
            token, settings: { ...state.settings, currentUser: mappedUser, activeBranchId: mappedUser.assignedBranchId || state.branches[0]?.id },
            isAuthenticated: true, isLoading: false,
        }));
        navigate(getPostLoginPath(rolePath(mappedUser.role, mappedUser.defaultPage)), { replace: true });
    };

    const handlePasswordLogin = async () => {
        try {
            setError(undefined);
            const user = await loginWithPassword(email, password);
            navigate(getPostLoginPath(rolePath(user.role, user.defaultPage)), { replace: true });
        } catch (err: any) {
            if (err?.code === 'MFA_REQUIRED' && err?.mfaToken) { setMfaToken(err.mfaToken); setMfaRequired(true); return; }
            if (err?.details && Array.isArray(err.details)) { setError(err.details.map((d: any) => d.message || d).join('\n')); }
            else { setError(t.invalidCredentials); }
        }
    };

    const handlePinLogin = async () => {
        try {
            setError(undefined);
            const result = await authApi.pinLogin(pin);
            if (result.token && result.user) { handleLoginSuccess(result.token, result.refreshToken, result.user); }
            else { setError(t.invalidPin); }
        } catch (err: any) {
            if (err?.code === 'MFA_REQUIRED' && err?.mfaToken) { setMfaToken(err.mfaToken); setMfaRequired(true); return; }
            setError(t.invalidPin);
        }
    };

    const handleMfaVerify = async () => {
        if (!mfaToken || mfaCode.length !== 6) return;
        try {
            setError(undefined);
            const deviceName = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown-device';
            const result = await authApi.verifyMfa(mfaToken, mfaCode, deviceName);
            handleLoginSuccess(result.token, result.refreshToken, result.user);
        } catch { setError(t.invalidMfaCode); }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setTimeout(async () => {
            if (mfaRequired) await handleMfaVerify();
            else if (loginMode === 'pin') await handlePinLogin();
            else await handlePasswordLogin();
            setIsSubmitting(false);
        }, 300);
    };

    const handlePinDigit = useCallback((digit: string) => {
        setPressedKey(digit);
        setTimeout(() => setPressedKey(null), 150);
        setPin(prev => prev.length < 6 ? prev + digit : prev);
    }, []);

    const handlePinBackspace = useCallback(() => {
        setPressedKey('back');
        setTimeout(() => setPressedKey(null), 150);
        setPin(prev => prev.slice(0, -1));
    }, []);

    // Robust global keyboard listener for PIN input
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (loginMode !== 'pin' || mfaRequired) return;
            
            // Ignore if typing in another explicit input (just in case)
            if (document.activeElement?.tagName === 'INPUT' && document.activeElement !== pinInputRef.current) return;

            if (/^\d$/.test(e.key)) {
                e.preventDefault();
                handlePinDigit(e.key);
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                handlePinBackspace();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const form = document.getElementById('login-form') as HTMLFormElement;
                if (form) form.requestSubmit();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [loginMode, mfaRequired, handlePinDigit, handlePinBackspace]);

    // ???????????????????????????????????????????????????????????
    // THEME HELPERS
    // ???????????????????????????????????????????????????????????
  const lt = false; // Forced dark mode for the premium glossy aesthetic

    // Accent color pair
    const accentRing = 'ring-amber-400/25';

    // ???????????????????????????????????????????????????????????
    // RENDER
    // ???????????????????????????????????????????????????????????
    return (
        <>
            <style>{gradientKeyframes}</style>
            <div className={`flex h-[100dvh] w-full overflow-hidden ${isArabic ? 'rtl' : 'ltr'} relative bg-black`}>

                {/* ??? FULLSCREEN BACKGROUND IMAGES FOR TRUE GLASSMORPHISM ??? */}
                <div
                    className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-[40s] hover:scale-105"
                    style={{
                        backgroundImage: `url('${bgImage}')`,
                    }}
                />
                {/* Global subtle texture */}
                <div className="absolute inset-0 z-0 bg-black/20 mix-blend-multiply" />

                {/* ???????????????????? LEFT PANEL — VISUAL SHOWCASE (TRANSPARENT) ???????????????????? */}
                <div className="relative hidden lg:flex lg:w-[50%] flex-col justify-between p-10 xl:p-14 overflow-hidden z-10">
                   {/* We let the beautiful background image shine here cleanly */}
                    <div className="absolute inset-0 z-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

                    {/* Floating glass orbs */}
                    <div className={`absolute top-[10%] left-[15%] w-72 h-72 rounded-full blur-3xl pointer-events-none ${lt ? 'bg-blue-300/25' : 'bg-violet-600/15'}`} style={{ animation: 'float 8s ease-in-out infinite' }} />
                    <div className={`absolute bottom-[5%] right-[10%] w-96 h-96 rounded-full blur-3xl pointer-events-none ${lt ? 'bg-indigo-200/30' : 'bg-cyan-500/10'}`} style={{ animation: 'float 12s ease-in-out infinite 2s' }} />
                    <div className={`absolute top-[50%] right-[30%] w-48 h-48 rounded-full blur-2xl pointer-events-none ${lt ? 'bg-violet-200/20' : 'bg-fuchsia-500/10'}`} style={{ animation: 'float 10s ease-in-out infinite 4s' }} />

                    {/* Decorative grid */}
                    <div className="absolute inset-0 z-[1] pointer-events-none" style={{
                        backgroundImage: lt
                            ? 'radial-gradient(circle, rgba(99,102,241,0.06) 1px, transparent 1px)'
                            : 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
                        backgroundSize: '32px 32px',
                    }} />

                    {/* ?? Top: Brand identity — wide banner shown in its natural shape ?? */}
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="h-16 rounded-[1.25rem] flex items-center justify-center px-4 ring-2 ring-amber-300/60" style={{ background: 'linear-gradient(135deg,#0b1b30 0%,#020617 100%)', boxShadow: '0 10px 34px rgba(0,0,0,0.35), 0 0 28px rgba(201,162,39,0.35)' }}>
                            <img src="/logo.png?v=2" alt="Logo" className="h-11 w-auto max-w-[230px] object-contain" draggable={false} />
                        </div>
                        <div>
                            <h2 className={`text-xl font-extrabold tracking-[0.15em] uppercase ${lt ? 'text-slate-800' : 'text-white'}`}>Coduis Zen</h2>
                            <p className={`text-[9px] font-bold tracking-[0.25em] uppercase ${lt ? 'text-slate-500' : 'text-white/40'}`}>
                                {isArabic ? 'نظام تحكم المطاعم' : 'Restaurant Control OS'}
                            </p>
                        </div>
                    </div>

                    {/* ?? Center: Hero copy ?? */}
                    <div className="relative z-10 max-w-lg -mt-8">
                        {/* Badge */}
                        <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border  mb-8 ${lt ? 'bg-blue-50/60 border-blue-100/80' : 'bg-white/5 border-white/10'}`}>
                            <Sparkles size={13} className={lt ? 'text-teal-600' : 'text-amber-300'} style={{ animation: 'shimmer 3s infinite' }} />
                            <span className={`text-[10px] font-bold tracking-[0.2em] uppercase ${lt ? 'text-teal-700' : 'text-white/60'}`}>
                                {isArabic ? 'مركز قيادة المطعم' : 'Restaurant Command Center'}
                            </span>
                        </div>

                        <h1 className={`text-[2.75rem] xl:text-[3.25rem] font-black leading-[1.1] tracking-tight mb-5 ${lt ? 'text-slate-900' : 'text-white'}`}>
                            {isArabic ? 'ارتقِ بعملك' : 'Elevate Your'} <br />
                            <span className={`text-transparent bg-clip-text bg-gradient-to-r ${lt ? 'from-teal-700 via-emerald-600 to-amber-600' : 'from-teal-300 via-emerald-200 to-amber-300'}`}>
                                {isArabic ? 'مساحة العمل' : 'Workspace'}
                            </span>
                        </h1>
                        <p className={`text-sm leading-relaxed max-w-md ${lt ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isArabic
                                ? 'ادخل إلى لوحة التحكم الذكية، وأدِر العمليات بسلاسة مع تحليلات فورية.'
                                : 'Coordinate live orders, kitchen flow, inventory, and branch operations from one calm operational surface.'}
                        </p>

                        {/* Stats row */}
                        <div className="flex gap-8 mt-10">
                            {[
                                { value: isArabic ? 'حي' : 'Live', label: isArabic ? 'وقت التشغيل' : 'Sync' },
                                { value: isArabic ? 'فروع' : 'Multi-Branch', label: isArabic ? 'متعدد الفروع' : 'Branch Aware' },
                                { value: isArabic ? 'تدقيق' : 'Audit', label: isArabic ? 'جاهز للمراجعة' : 'Ready' },
                            ].map((s, i) => (
                                <div key={i} className="flex flex-col">
                                    <span className={`text-xl font-black ${lt ? 'text-slate-800' : 'text-white'}`}>{s.value}</span>
                                    <span className={`text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${lt ? 'text-slate-400' : 'text-white/30'}`}>{s.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ?? Bottom: Footer ?? */}
                    <div className={`relative z-10 flex items-center justify-between text-[11px] font-medium border-t pt-5 ${lt ? 'text-slate-400 border-slate-200/50' : 'text-white/20 border-white/5'}`}>
                        <span className="tracking-wider">
                            {isArabic ? `© ${new Date().getFullYear()} Coduis Zen. جميع الحقوق محفوظة` : `© ${new Date().getFullYear()} Coduis Zen. All rights reserved.`}
                        </span>
                        <span className="font-mono tracking-wider">{timeStr}</span>
                    </div>
                </div>

                {/* ???????????????????? RIGHT PANEL — MAGIC GLASS ???????????????????? */}
                <div className="relative flex-1 lg:w-[50%] flex flex-col justify-center items-center px-5 sm:px-8 lg:px-14 overflow-hidden h-[100dvh] z-20 bg-black/50 -[40px] shadow-[0_0_80px_rgba(0,0,0,0.8)] border-l border-white/5">

                    {/* Deep inner glow/ambient blobs for Right Panel */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden mix-blend-color-dodge">
                        <div className="absolute -top-40 -right-40 w-[80vw] lg:w-[40vw] h-[80vw] lg:h-[40vw] rounded-full blur-[140px] bg-teal-500/15" style={{ animation: 'float 10s ease-in-out infinite' }} />
                        <div className="absolute -bottom-40 -left-40 w-[70vw] lg:w-[35vw] h-[70vw] lg:h-[35vw] rounded-full blur-[140px] bg-amber-500/15" style={{ animation: 'float 14s ease-in-out infinite 3s' }} />
                    </div>

                    {/* ??? Top bar: Logo + Controls ??? */}
                    <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 sm:px-8 lg:px-14 py-5 z-20">
                        {/* Mobile logo — natural wide shape */}
                        <div className="flex lg:hidden items-center gap-2.5">
                            <span className="flex h-11 items-center justify-center rounded-xl px-2.5 shadow-lg shadow-black/20 ring-1 ring-amber-300/50" style={{ background: 'linear-gradient(135deg,#0b1b30 0%,#020617 100%)' }}>
                                <img src="/logo.png?v=2" alt="Logo" className="h-8 w-auto max-w-[150px] object-contain" draggable={false} />
                            </span>
                            <span className={`text-sm font-extrabold tracking-widest uppercase ${lt ? 'text-slate-700' : 'text-white/80'}`}>Coduis Zen</span>
                        </div>
                        <div className="hidden lg:block" /> {/* spacer on desktop */}

                        {/* Controls */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => updateSettings({ isDarkMode: !settings.isDarkMode })}
                                className={`p-2 rounded-xl border transition-all duration-150  ${lt
                                    ? 'bg-white/80 border-slate-200 text-slate-500 hover:text-slate-800 hover:shadow-md shadow-sm'
                                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
                                    }`}
                                aria-label="Toggle Theme"
                            >
                                {lt ? <Moon size={15} /> : <Sun size={15} />}
                            </button>
                            <button
                                onClick={() => updateSettings({ language: settings.language === 'en' ? 'ar' : 'en' })}
                                className={`px-3 py-2 rounded-xl border transition-all duration-150  flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase ${lt
                                    ? 'bg-white/80 border-slate-200 text-slate-500 hover:text-slate-800 hover:shadow-md shadow-sm'
                                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                <Globe size={13} />
                                {t.switch}
                            </button>
                        </div>
                    </div>

                    {/* ??? FORM CONTAINER ??? */}
                    <div className="w-full max-w-[420px] relative z-10 flex flex-col justify-center p-6 sm:p-10 bg-black/60 backdrop-blur-lg rounded-2xl border border-white/20">

                        {/* Header */}
                        <div className="text-center sm:text-start mb-6 animate-stagger-1">
                            <div className={`inline-flex lg:hidden items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br border mb-3  ${lt ? 'from-teal-100/80 to-amber-50 border-stone-200/60' : 'from-teal-500/20 to-amber-500/10 border-white/10'}`}>
                                <Fingerprint size={22} className={lt ? 'text-teal-600' : 'text-amber-300'} />
                            </div>
                            <h1 className={`text-2xl sm:text-[1.75rem] font-black tracking-tight mb-1 ${lt ? 'text-slate-900' : 'text-white'}`}>
                                {mfaRequired ? t.verify : t.welcome}
                            </h1>
                            <p className={`text-xs sm:text-sm font-medium ${lt ? 'text-slate-500' : 'text-slate-400'}`}>
                                {mfaRequired ? t.mfaCode : t.subtitle}
                            </p>
                        </div>

                        {/* Mode Switcher */}
                        {!mfaRequired && (
                            <div className={`flex rounded-2xl p-1 mb-5 border shrink-0 transition-colors duration-150 animate-stagger-2 ${lt ? 'bg-slate-100/70 border-slate-200/60 ' : 'bg-white/[0.03] border-white/[0.06] '}`}>
                                {([
                                    { mode: 'pin' as const, icon: KeyRound, label: t.pinLogin },
                                    { mode: 'password' as const, icon: AtSign, label: t.emailLogin },
                                ]).map(item => (
                                    <button
                                        key={item.mode}
                                        type="button"
                                        onClick={() => { setLoginMode(item.mode); setError(undefined); }}
                                        className={`flex-1 py-2 sm:py-2.5 min-h-[40px] rounded-xl text-[10px] sm:text-[11px] font-bold uppercase tracking-widest transition-all duration-150 flex items-center justify-center gap-2
                                        ${loginMode === item.mode
                                                ? lt
                                                    ? 'bg-white text-teal-700 shadow-sm border border-stone-200/70 scale-100 ring-1 ring-teal-500/10'
                                                    : 'bg-white/10 text-white shadow-md border border-white/10 scale-100 hover:bg-white-[0.12]'
                                                : lt
                                                    ? 'text-slate-400 hover:text-slate-700 hover:bg-white/80 scale-[0.97] border border-transparent'
                                                    : 'text-slate-300 hover:text-white/80 hover:bg-white/5 scale-[0.97] border border-transparent'
                                            }`}
                                    >
                                        <item.icon size={14} className={loginMode === item.mode ? (lt ? 'text-teal-600' : 'text-amber-300') : 'opacity-60'} />
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        <form id="login-form" onSubmit={handleSubmit} className="w-full relative">
                            {/* ??? PIN Mode ??? */}
                            {loginMode === 'pin' && !mfaRequired && (
                                <div className="flex flex-col gap-3 sm:gap-4">
                                    {/* Hidden keyboard input for fallback/mobile */}
                                    <input
                                        ref={pinInputRef}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        value={pin}
                                        autoFocus
                                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="h-0 w-0 opacity-0 absolute pointer-events-none"
                                        aria-label="PIN input"
                                        autoComplete="off"
                                    />

                                    {/* PIN indicator */}
                                    <div
                                        className={`flex items-center justify-center gap-3.5 py-3 cursor-text rounded-2xl border transition-all duration-150 ${lt ? 'bg-white border-slate-200 shadow-sm' : 'bg-white/[0.03] border-white/[0.06]'}`}
                                        onClick={() => pinInputRef.current?.focus()}
                                    >
                                        {[0, 1, 2, 3, 4, 5].map((i) => (
                                            <div key={i} className="relative">
                                                <div className={`w-3 h-3 rounded-full transition-all duration-150 ${i < pin.length
                                                    ? lt
                                                        ? 'bg-teal-600 scale-[1.3] shadow-[0_0_10px_rgba(13,148,136,0.45)]'
                                                        : 'bg-amber-300 scale-[1.3] shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                                                    : i < 4
                                                        ? lt ? 'bg-slate-200 border border-slate-300' : 'bg-white/10 border border-white/10'
                                                        : lt ? 'bg-slate-100 border border-slate-200' : 'bg-white/5 border border-white/5'
                                                    }`} />
                                                {i === pin.length && (
                                                    <div className={`absolute -inset-2 rounded-full border animate-ping opacity-40 ${lt ? 'border-teal-400' : 'border-amber-300'}`} />
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Number Pad */}
                                    <div className="grid grid-cols-3 gap-2 sm:gap-2.5 max-w-[320px] w-full mx-auto">
                                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                                            <button
                                                key={digit}
                                                type="button"
                                                onClick={() => handlePinDigit(digit)}
                                                className={`h-14 sm:h-[3.75rem] rounded-2xl font-semibold text-xl transition-all duration-150
                                                ${pressedKey === digit
                                                        ? 'bg-amber-400/90 text-slate-950 scale-[0.90] shadow-[0_0_25px_rgba(251,191,36,0.5)] border border-amber-300'
                                                        : 'bg-white/[0.03]  border border-white/[0.06] text-slate-200 hover:bg-white/[0.08] hover:border-amber-400/30 hover:shadow-[0_4px_15px_rgba(251,191,36,0.15)] active:scale-[0.93]'
                                                    }`}
                                            >
                                                {digit}
                                            </button>
                                        ))}

                                        {/* Clear */}
                                        <button
                                            type="button"
                                            onClick={() => { setPin(''); pinInputRef.current?.focus(); }}
                                            className={`h-14 sm:h-[3.75rem] rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.93] flex items-center justify-center border border-transparent
                                            ${lt ? 'text-rose-500 hover:bg-rose-50 hover:border-rose-100' : 'text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/10'}`}
                                        >
                                            {isArabic ? 'مسح' : 'CLR'}
                                        </button>

                                        {/* Zero */}
                                        <button
                                            type="button"
                                            onClick={() => handlePinDigit('0')}
                                            className={`h-14 sm:h-[3.75rem] rounded-2xl font-semibold text-xl transition-all duration-150
                                            ${pressedKey === '0'
                                                    ? 'bg-amber-400/90 text-slate-950 scale-[0.90] shadow-[0_0_25px_rgba(251,191,36,0.5)] border border-amber-300'
                                                    : 'bg-white/[0.03]  border border-white/[0.06] text-slate-200 hover:bg-white/[0.08] hover:border-amber-400/30 hover:shadow-[0_4px_15px_rgba(251,191,36,0.15)] active:scale-[0.93]'
                                                }`}
                                        >
                                            0
                                        </button>

                                        {/* Backspace */}
                                        <button
                                            type="button"
                                            onClick={handlePinBackspace}
                                            className={`h-14 sm:h-[3.75rem] rounded-2xl flex items-center justify-center transition-all active:scale-[0.93] border border-transparent
                                            ${pressedKey === 'back'
                                                    ? lt ? 'bg-amber-100 text-amber-600 scale-[0.93]' : 'bg-amber-500/15 text-amber-400 scale-[0.93]'
                                                    : lt
                                                        ? 'text-amber-500 hover:bg-amber-50 hover:border-amber-100'
                                                        : 'text-amber-500 hover:bg-amber-500/10 hover:border-amber-500/10'
                                                }`}
                                            aria-label="Backspace"
                                        >
                                            <Delete size={22} className={isArabic ? 'scale-x-[-1]' : ''} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ??? Password Mode ??? */}
                            {loginMode === 'password' && !mfaRequired && (
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className={`text-[11px] font-bold uppercase tracking-wider pl-1 ${lt ? 'text-slate-500' : 'text-slate-400'}`}>{t.email}</label>
                                        <div className="relative group">
                                            <AtSign className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors z-10 ${lt ? 'text-slate-300 group-focus-within:text-teal-600' : 'text-slate-600 group-focus-within:text-amber-300'}`} size={17} />
                                            <input
                                                type="email"
                                                required
                                                dir="ltr"
                                                autoComplete="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="admin@zen.com"
                                                style={{ colorScheme: 'dark' }}
                                                className={`login-field relative w-full rounded-2xl py-3.5 pl-11 pr-5 outline-none transition-all text-sm font-medium text-left caret-amber-300 focus:ring-2 ${lt
                                                    ? `bg-white border border-stone-200 text-slate-900 placeholder:text-slate-300 focus:${accentRing} focus:border-teal-500/40 shadow-sm`
                                                    : `bg-white/[0.03] border border-white/[0.06] text-white placeholder:text-slate-600 focus:ring-amber-400/25 focus:border-amber-400/30`
                                                    }`}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className={`text-[11px] font-bold uppercase tracking-wider pl-1 ${lt ? 'text-slate-500' : 'text-slate-400'}`}>{t.password}</label>
                                        <div className="relative group">
                                            <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors z-10 ${lt ? 'text-slate-300 group-focus-within:text-teal-600' : 'text-slate-600 group-focus-within:text-amber-300'}`} size={17} />
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                required
                                                autoComplete="current-password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                style={{ colorScheme: 'dark' }}
                                                className={`login-field relative w-full rounded-2xl py-3.5 pl-11 pr-12 outline-none transition-all text-sm font-medium tracking-wider caret-amber-300 focus:ring-2 ${lt
                                                    ? `bg-white border border-stone-200 text-slate-900 placeholder:text-slate-300 focus:${accentRing} focus:border-teal-500/40 shadow-sm`
                                                    : `bg-white/[0.03] border border-white/[0.06] text-white placeholder:text-slate-600 focus:ring-amber-400/25 focus:border-amber-400/30`
                                                    }`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className={`absolute right-4 top-1/2 -translate-y-1/2 transition-colors z-10 ${lt ? 'text-slate-300 hover:text-slate-500' : 'text-slate-600 hover:text-slate-300'}`}
                                                aria-label="Toggle Password Visibility"
                                            >
                                                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between px-0.5 pt-1">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <div className="relative flex items-center">
                                                <input type="checkbox" className={`peer appearance-none w-4 h-4 rounded-md border transition-all cursor-pointer checked:border-transparent ${lt ? 'bg-white border-slate-300 checked:bg-teal-600' : 'bg-white/5 border-white/15 checked:bg-amber-400'}`} />
                                                <ShieldCheck className="absolute opacity-0 peer-checked:opacity-100 left-0 top-0 text-white transition-opacity pointer-events-none" size={16} />
                                            </div>
                                            <span className={`text-[11px] font-semibold ${lt ? 'text-slate-400 group-hover:text-slate-600' : 'text-slate-500 group-hover:text-slate-300'}`}>{t.remember}</span>
                                        </label>
                                        <button type="button" className={`text-[11px] font-semibold transition-colors ${lt ? 'text-slate-400 hover:text-teal-600' : 'text-slate-500 hover:text-amber-300'}`}>
                                            {t.forgot}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ??? MFA ??? */}
                            {mfaRequired && (
                                <div className="space-y-4">
                                    <label className={`text-[11px] font-bold uppercase tracking-wider pl-1 ${lt ? 'text-slate-500' : 'text-slate-400'}`}>Authentication Code</label>
                                    <div className="relative group">
                                        <ShieldCheck className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors z-10 ${lt ? 'text-slate-300 group-focus-within:text-teal-600' : 'text-slate-600 group-focus-within:text-amber-300'}`} size={17} />
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={6}
                                            value={mfaCode}
                                            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            placeholder="000000"
                                            autoFocus
                                                className={`login-field relative w-full rounded-2xl py-3.5 pl-11 pr-5 outline-none transition-all text-lg font-black tracking-[0.4em] text-center focus:ring-2 ${lt
                                                ? 'bg-white border border-stone-200 text-teal-700 placeholder:text-slate-300 focus:ring-teal-500/20 focus:border-teal-500/40 shadow-sm'
                                                : 'bg-white/[0.03] border border-white/[0.06] text-amber-300 placeholder:text-slate-600 focus:ring-amber-400/25 focus:border-amber-400/30'
                                                }`}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ??? Kick-out notice ??? */}
                            {kickNotice && !error && (
                                <div className={`mt-4 p-3 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2 ${lt ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'}`}>
                                    <Sparkles size={13} className="shrink-0 opacity-70" />
                                    {kickNotice}
                                </div>
                            )}

                            {/* ??? Error ??? */}
                            {error && (
                                <div className={`mt-4 p-3 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2 ${lt ? 'bg-rose-50 border border-rose-200 text-rose-600' : 'bg-rose-500/10 border border-rose-500/15 text-rose-400'}`}>
                                    <Sparkles size={13} className="shrink-0 opacity-70" />
                                    {error}
                                </div>
                            )}

                            {/* ??? Submit ??? */}
                            <button
                                type="submit"
                                disabled={
                                    isSubmitting ||
                                    (mfaRequired && mfaCode.length !== 6) ||
                                    (loginMode === 'pin' && !mfaRequired && pin.length !== 6)
                                }
                                className={`fluid-shine w-full mt-5 py-3.5 rounded-2xl font-bold text-sm tracking-wide flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:saturate-50 transition-all duration-150 group active:scale-[0.98] uppercase ${lt
                                    ? 'bg-gradient-to-r from-teal-700 to-emerald-600 text-white shadow-lg shadow-teal-700/20 hover:shadow-xl hover:shadow-teal-700/25 disabled:hover:shadow-lg'
                                    : 'bg-gradient-to-r from-teal-500 to-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/25 disabled:hover:shadow-lg'
                                    }`}
                            >
                                {isSubmitting ? (
                                    <div className="flex gap-1.5 items-center h-5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-white/80 animate-[bounce_1s_infinite_0ms]" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-white/80 animate-[bounce_1s_infinite_200ms]" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-white/80 animate-[bounce_1s_infinite_400ms]" />
                                    </div>
                                ) : (
                                    <>
                                        {mfaRequired ? t.verify : t.login}
                                        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform duration-150 opacity-80" />
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Footer on mobile */}
                        <p className={`lg:hidden text-center text-[10px] font-medium mt-6 animate-stagger-4 ${lt ? 'text-slate-400' : 'text-white/30'}`}>
                            {t.footer}
                        </p>
                    </div>
                </div>

            </div>
        </>
    );
};

export default Login;
