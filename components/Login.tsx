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
@keyframes capIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
/* Login glass fields: in dark mode shield them from the global
   light-theme input backgrounds (theme-overrides repaints ALL inputs with
   light vars in light mode). Scoped under .dark so light mode uses the
   component lt classes. */
.dark #login-form .login-field {
  background: rgba(255, 255, 255, 0.06) !important;
  color: #ffffff !important;
  border-color: rgba(255, 255, 255, 0.10) !important;
  caret-color: #fbbf24;
}
#login-form .login-field::placeholder {
  color: #64748b !important;
  opacity: 1;
}
.dark #login-form .login-field:focus {
  background: rgba(255, 255, 255, 0.08) !important;
  border-color: rgba(251, 191, 36, 0.35) !important;
}
/* Fix: browser autofill paints inputs white while text stays white -> unreadable (dark mode) */
.dark #login-form input:-webkit-autofill,
.dark #login-form input:-webkit-autofill:hover,
.dark #login-form input:-webkit-autofill:focus,
.dark #login-form input:-webkit-autofill:active {
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

/* Slideshow media pool — halal-safe only (no alcohol): restaurant/cafe
   interiors, coffee, bakery and desserts. Videos are short muted loops. */
const LOGIN_MEDIA: { type: 'image' | 'video'; src: string }[] = [
    // Bundled local media first — guaranteed to work offline / behind strict firewalls.
    { type: 'video', src: '/login-bg/bg-latte-1.mp4' }, // latte art pour
    { type: 'video', src: '/login-bg/bg-pour-1.mp4' }, // barista pour
    { type: 'image', src: '/login-bg/bg-cafe-1.jpg' }, // restaurant interior
    { type: 'image', src: '/login-bg/bg-coffee-1.jpg' }, // coffee art
    { type: 'image', src: '/login-bg/bg-baklava-1.jpg' }, // baklava
    // Remote pool for extra variety (same subjects, halal-safe).
    { type: 'video', src: 'https://videos.pexels.com/video-files/13736555/13736555-hd_720_1280_24fps.mp4' },
    { type: 'video', src: 'https://videos.pexels.com/video-files/34505177/14619761_720_1280_30fps.mp4' }, // barista pour
    { type: 'image', src: 'https://images.pexels.com/photos/776538/pexels-photo-776538.jpeg?auto=compress&cs=tinysrgb&w=1920' }, // restaurant interior
    { type: 'image', src: 'https://images.pexels.com/photos/34077030/pexels-photo-34077030.jpeg?auto=compress&cs=tinysrgb&w=1920' }, // cozy cafe
    { type: 'image', src: 'https://images.pexels.com/photos/35646560/pexels-photo-35646560.jpeg?auto=compress&cs=tinysrgb&w=1920' }, // cafe wooden tables
    { type: 'image', src: 'https://images.pexels.com/photos/29517889/pexels-photo-29517889.jpeg?auto=compress&cs=tinysrgb&w=1920' }, // modern cafe warm light
    { type: 'image', src: 'https://images.pexels.com/photos/29525876/pexels-photo-29525876.jpeg?auto=compress&cs=tinysrgb&w=1920' }, // cafe pendant lights
    { type: 'image', src: 'https://images.pexels.com/photos/312420/pexels-photo-312420.jpeg?auto=compress&cs=tinysrgb&w=1920' }, // coffee cup at cafe
    { type: 'image', src: 'https://images.pexels.com/photos/302899/pexels-photo-302899.jpeg?auto=compress&cs=tinysrgb&w=1920' }, // coffee art
    { type: 'image', src: 'https://images.pexels.com/photos/8696281/pexels-photo-8696281.jpeg?auto=compress&cs=tinysrgb&w=1920' }, // baklava
    { type: 'image', src: 'https://images.pexels.com/photos/18543486/pexels-photo-18543486.jpeg?auto=compress&cs=tinysrgb&w=1920' }, // turkish baklava
    ...LOGIN_BACKGROUNDS.map(src => ({ type: 'image' as const, src })),
];

/* Rotating capability lines shown above the card — short system pitch. */
const CAPABILITIES = {
    ar: [
        'نقطة بيع سريعة للكاشير',
        'شاشات مطبخ KDS مباشرة',
        'مخزون وموردون بلا عجز',
        'فروع متعددة بصلاحيات دقيقة',
        'مالية وتقارير لحظية',
        'ولاء عملاء يعيدهم إليك',
    ],
    en: [
        'Lightning-fast cashier POS',
        'Live kitchen KDS screens',
        'Zero-shortage inventory',
        'Multi-branch fine-grained roles',
        'Instant finance reports',
        'Loyalty that brings them back',
    ],
};

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
    const pinInputRef = useRef<HTMLInputElement>(null);
    const isArabic = settings.language === 'ar';
    const capList = isArabic ? CAPABILITIES.ar : CAPABILITIES.en;
    // Shuffled slideshow order over the full media pool, random start, no immediate repeats.
    const [slideOrder] = useState<number[]>(() => {
        const arr = LOGIN_MEDIA.map((_, i) => i);
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    });
    const [slidePos, setSlidePos] = useState(0);
    const activeSlide = slideOrder[slidePos] ?? 0;
    // Gentle mouse parallax over the backdrop (throttled).
    const parRef = useRef({ x: 0, y: 0, t: 0 });
    const [par, setPar] = useState({ x: 0, y: 0 });
    const handlePar = (e: React.MouseEvent<HTMLDivElement>) => {
        const now = Date.now();
        if (now - parRef.current.t < 90) return;
        parRef.current.t = now;
        const r = e.currentTarget.getBoundingClientRect();
        setPar({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 });
    };
    const [capIndex, setCapIndex] = useState(0);
    const [capChar, setCapChar] = useState(0);
    useEffect(() => {
        const full = capList[capIndex % capList.length];
        if (capChar < full.length) {
            const id = setTimeout(() => setCapChar(c => c + 1), 45);
            return () => clearTimeout(id);
        }
        const id = setTimeout(() => { setCapIndex(i => i + 1); setCapChar(0); }, 2300);
        return () => clearTimeout(id);
    }, [capChar, capIndex, capList]);

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

    // Rotating background (slideshow) — random non-repeating jump every 9s.
    useEffect(() => {
        const id = setInterval(() => setSlidePos(p => (p + 1 + Math.floor(Math.random() * (LOGIN_MEDIA.length - 1))) % LOGIN_MEDIA.length), 9000);
        return () => clearInterval(id);
    }, []);

    // While the user types the PIN, warm the post-login chunks (dashboard +
    // POS cover every role's landing) so the first navigation feels instant.
    // Idle-only, staggered, saveData-aware; failures are silent.
    useEffect(() => {
        let cancelled = false;
        const warm = () => {
            if (cancelled) return;
            try {
                const conn = (navigator as unknown as { connection?: { saveData?: boolean } })?.connection;
                if (conn?.saveData) return;
            } catch {
                // unknown — prefetch anyway on LAN ERP
            }
            window.setTimeout(() => { if (!cancelled) void import('./Dashboard').catch(() => undefined); }, 3000);
            window.setTimeout(() => { if (!cancelled) void import('../src/features/pos/POS').catch(() => undefined); }, 7000);
        };
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            const idleId = (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(warm, { timeout: 5000 });
            return () => {
                cancelled = true;
                (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
            };
        }
        const timer = window.setTimeout(warm, 2500);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, []);


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
  const lt = !(settings.isDarkMode ?? true); // theme-aware: dark by default

    // Accent color pair
    const accentRing = 'ring-amber-400/25';

    // ???????????????????????????????????????????????????????????
    // RENDER
    // ???????????????????????????????????????????????????????????
    return (
        <>
            <style>{gradientKeyframes}</style>
            <div onMouseMove={handlePar} className={`flex min-h-[100dvh] w-full flex-col overflow-hidden ${isArabic ? 'rtl' : 'ltr'} relative ${lt ? 'bg-[#e9e5db]' : 'bg-black'}`}>

                {/* ??? MEDIA SLIDESHOW — halal-safe photos + muted video loops ??? */}
                <div className="absolute inset-0 z-0" style={{ transform: `scale(1.12) translate(${par.x * -18}px, ${par.y * -14}px)`, transition: 'transform .6s ease-out' }}>
                    {LOGIN_MEDIA.map((m, i) => {
                        const active = i === activeSlide;
                        const anim: React.CSSProperties = {
                            opacity: active ? 1 : 0,
                            transform: active ? 'scale(1.1) translate(-1%, 1%)' : 'scale(1)',
                            transition: 'opacity 1.6s ease, transform 9s ease',
                        };
                        return m.type === 'video' ? (
                            <video
                                key={i}
                                className="absolute inset-0 h-full w-full object-cover"
                                style={anim}
                                autoPlay muted loop playsInline preload="auto"
                                src={m.src}
                            />
                        ) : (
                            <div
                                key={i}
                                className="absolute inset-0 bg-cover bg-center"
                                style={{ ...anim, backgroundImage: `url('${m.src}')` }}
                            />
                        );
                    })}
                </div>
                {/* Readability shade — theme aware */}
                <div className={`absolute inset-0 z-[1] ${lt
                    ? 'bg-gradient-to-b from-white/75 via-white/60 to-white/85'
                    : 'bg-gradient-to-b from-black/60 via-black/55 to-black/80'}`} />

                {/* Centered layout — brand showcase panel removed per approved concept (v2) */}

                {/* ??? Top bar: Logo + Controls ??? */}
                <div className="relative z-20 flex items-center justify-between px-5 sm:px-8 py-4">
                    {/* Logo — transparent asset floating with light halo, responsive */}
                    <div className="relative flex items-center">
                        <div aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ width: '130%', height: '160%', background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.30), rgba(251,191,36,0.14) 55%, transparent 72%)' }} />
                        <img src="/logo.png?v=6" alt="Coduis Xen ERP Systems" className="relative w-auto object-contain" style={{ height: 'clamp(72px, 10vw, 120px)', filter: 'drop-shadow(0 0 14px rgba(255,255,255,0.55)) drop-shadow(0 8px 24px rgba(0,0,0,0.5))' }} draggable={false} />
                    </div>

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

                    {/* ??? CENTERED LOGIN CARD ??? */}
                    <div className="relative z-20 flex flex-1 flex-col items-center justify-center px-4 sm:px-6 pb-6">
                    {/* Ambient orbs behind the card */}
                    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/15 blur-[110px]" />
                    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-teal-500/15 blur-[100px]" />
                    {/* Animated capability pitch */}
                    <p key={settings.language} className={`mb-4 flex min-h-[22px] items-center gap-2 text-[12px] sm:text-sm font-bold tracking-wide ${lt ? 'text-slate-600' : 'text-white/80'}`} style={{ textShadow: lt ? 'none' : '0 2px 12px rgba(0,0,0,.6)' }}>
                        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" style={{ boxShadow: '0 0 10px rgba(251,191,36,.9)' }} />
                        <span>{capList[capIndex % capList.length].slice(0, capChar)}<span className="animate-pulse text-amber-400">▍</span></span>
                    </p>
                    <div className={`w-full max-w-[400px] flex flex-col justify-center p-6 sm:p-8 rounded-[1.75rem] border backdrop-blur-xl shadow-2xl ${lt ? 'bg-white/85 border-white/60 shadow-black/10' : 'bg-black/60 border-white/15 shadow-black/60'}`}>

                        {/* Header */}
                        <div className="text-center mb-6 animate-stagger-1">
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
                                                        : lt
                                                            ? 'bg-white border border-stone-200 text-slate-800 shadow-sm hover:border-amber-500/50 hover:shadow-md active:scale-[0.93]'
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
                                                     : lt
                                                         ? 'bg-white border border-stone-200 text-slate-800 shadow-sm hover:border-amber-500/50 hover:shadow-md active:scale-[0.93]'
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
                                                style={{ colorScheme: lt ? 'light' : 'dark' }}
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
                                                style={{ colorScheme: lt ? 'light' : 'dark' }}
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

                    </div>
                    </div>
                    <p className={`relative z-20 text-center text-[11px] font-medium pb-5 ${lt ? 'text-slate-500' : 'text-white/35'}`}>
                        {t.footer} · <span className="font-mono">{timeStr}</span>
                    </p>

            </div>
        </>
    );
};

export default Login;
