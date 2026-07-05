import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setupApi } from '../services/api/setup';
import { useAuthStore } from '../stores/useAuthStore';
import { CheckCircle2, ArrowRight, ArrowLeft, Globe, Loader2, Printer, Users, Layout, SkipForward } from 'lucide-react';
import { nanoid } from 'nanoid';

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const SetupWizard: React.FC = () => {
    const navigate = useNavigate();
    const { settings, updateSettings } = useAuthStore();

    const [step, setStep] = useState<WizardStep>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [restaurantName, setRestaurantName] = useState('');
    const [currency, setCurrency] = useState('EGP');
    const [currencySymbol, setCurrencySymbol] = useState('\u062c.\u0645');
    const [taxRate, setTaxRate] = useState(14);
    const [serviceCharge, setServiceCharge] = useState(0);
    const [language, setLanguage] = useState<'ar' | 'en'>(settings.language === 'en' ? 'en' : 'ar');

    const [branchName, setBranchName] = useState('');
    const [branchAddress, setBranchAddress] = useState('');
    const [branchPhone, setBranchPhone] = useState('');

    const [adminName, setAdminName] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');

    // Optional steps configuration
    const [printers, setPrinters] = useState<Array<{ name: string; type: string }>>([]);
    const [printerName, setPrinterName] = useState('');
    const [printerType, setPrinterType] = useState('RECEIPT');

    const [roles, setRoles] = useState<Array<{ name: string; permissions: string[] }>>([]);
    const [roleName, setRoleName] = useState('');

    const [tables, setTables] = useState<Array<{ name: string; capacity: number }>>([]);
    const [tableName, setTableName] = useState('');
    const [tableCapacity, setTableCapacity] = useState(4);

    const t = useMemo(() => ({
        title: language === 'ar' ? 'إعداد النظام لأول مرة' : 'First-Time Setup',
        subtitle: language === 'ar' ? 'خلّينا نجهّز الأساسيات بسرعة' : 'Let’s configure the essentials quickly',
        steps: [
            language === 'ar' ? 'المنشأة' : 'Business',
            language === 'ar' ? 'الفرع' : 'Branch',
            language === 'ar' ? 'الأدمن' : 'Admin',
            language === 'ar' ? 'الطابعات' : 'Printers',
            language === 'ar' ? 'الأدوار' : 'Roles',
            language === 'ar' ? 'الطاولات' : 'Tables',
            language === 'ar' ? 'إنهاء' : 'Finish',
        ],
        next: language === 'ar' ? 'التالي' : 'Next',
        back: language === 'ar' ? 'رجوع' : 'Back',
        skip: language === 'ar' ? 'تخطي' : 'Skip',
        finish: language === 'ar' ? 'إنهاء الإعداد' : 'Finish Setup',
        doneTitle: language === 'ar' ? 'تم الإعداد بنجاح' : 'Setup Complete',
        doneBody: language === 'ar' ? 'تقدر تدخل بالأدمن وتبدأ الشغل.' : 'You can now sign in with the admin account.',
        goLogin: language === 'ar' ? 'اذهب لتسجيل الدخول' : 'Go to Login',
        addPrinter: language === 'ar' ? 'إضافة طابعة' : 'Add Printer',
        addRole: language === 'ar' ? 'إضافة دور' : 'Add Role',
        addTable: language === 'ar' ? 'إضافة طاولة' : 'Add Table',
    }), [language]);

    const validateStep = () => {
        if (step === 0) {
            if (!restaurantName.trim()) return language === 'ar' ? 'اسم المنشأة مطلوب' : 'Restaurant name is required';
        }
        if (step === 1) {
            if (!branchName.trim()) return language === 'ar' ? 'اسم الفرع مطلوب' : 'Branch name is required';
        }
        if (step === 2) {
            if (!adminName.trim() || !adminEmail.trim() || !adminPassword) {
                return language === 'ar' ? 'بيانات الأدمن مطلوبة' : 'Admin details are required';
            }
            if (adminPassword.length < 6) {
                return language === 'ar' ? 'كلمة المرور لازم تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters';
            }
            if (adminPassword !== adminPasswordConfirm) {
                return language === 'ar' ? 'كلمة المرور غير متطابقة' : 'Passwords do not match';
            }
        }
        return null;
    };

    const handleNext = () => {
        const err = validateStep();
        if (err) {
            setError(err);
            return;
        }
        setError(null);
        setStep((s) => (Math.min(6, s + 1) as WizardStep));
    };

    const handleSkip = () => {
        setError(null);
        setStep((s) => (Math.min(6, s + 1) as WizardStep));
    };

    const handleBack = () => {
        setError(null);
        setStep((s) => (Math.max(0, s - 1) as WizardStep));
    };

    const handleFinish = async () => {
        const err = validateStep();
        if (err) {
            setError(err);
            return;
        }
        setError(null);
        setIsSubmitting(true);
        try {
            await setupApi.bootstrap({
                admin: {
                    name: adminName.trim(),
                    email: adminEmail.trim(),
                    password: adminPassword,
                },
                branch: {
                    name: branchName.trim(),
                    address: branchAddress.trim(),
                    phone: branchPhone.trim(),
                },
                settings: {
                    restaurantName: restaurantName.trim(),
                    currency,
                    currencySymbol,
                    taxRate,
                    serviceCharge,
                    language,
                    theme: settings.theme,
                    isDarkMode: settings.isDarkMode,
                    isTouchMode: settings.isTouchMode,
                    phone: branchPhone.trim(),
                    branchAddress: branchAddress.trim(),
                },
                printers: printers.map(p => ({ id: nanoid(), name: p.name, type: p.type })),
                roles: roles.map(r => ({ id: nanoid(), name: r.name, permissions: r.permissions })),
                tables: tables.map(t => ({ id: nanoid(), name: t.name, capacity: t.capacity })),
            });

            updateSettings({ language });
            setStep(6);
        } catch (e: any) {
            setError(e.message || 'Setup failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    const addPrinter = () => {
        if (printerName.trim()) {
            setPrinters(p => [...p, { name: printerName.trim(), type: printerType }]);
            setPrinterName('');
        }
    };

    const addRole = () => {
        if (roleName.trim()) {
            setRoles(r => [...r, { name: roleName.trim(), permissions: [] }]);
            setRoleName('');
        }
    };

    const addTable = () => {
        if (tableName.trim()) {
            setTables(t => [...t, { name: tableName.trim(), capacity: tableCapacity }]);
            setTableName('');
            setTableCapacity(4);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 font-neo">
            <div className={`w-full max-w-3xl bg-slate-900/60 border border-border/30 rounded-[2rem] shadow-2xl p-10 ${language === 'ar' ? 'rtl' : 'ltr'}`}>
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-black">{t.title}</h1>
                        <p className="text-slate-400 mt-2 text-sm">{t.subtitle}</p>
                    </div>
                    <button
                        onClick={() => setLanguage((l) => l === 'ar' ? 'en' : 'ar')}
                        className="px-4 py-2 rounded-xl border border-border/30 text-slate-300 hover:text-white hover:border-border/40 flex items-center gap-2"
                    >
                        <Globe size={16} />
                        {language === 'ar' ? 'English' : 'العربية'}
                    </button>
                </div>

                <div className="flex items-center gap-3 mb-10">
                    {t.steps.map((label, index) => {
                        const isActive = index === step;
                        const isDone = index < step;
                        return (
                            <div key={label} className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border ${isActive ? 'border-indigo-400 text-white' : isDone ? 'border-emerald-400 text-emerald-300' : 'border-border/30 text-slate-400'}`}>
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${isDone ? 'bg-emerald-500/20 text-emerald-300' : isActive ? 'bg-indigo-500/20 text-indigo-200' : 'bg-elevated/40 text-slate-400'}`}>
                                    {isDone ? <CheckCircle2 size={16} /> : index + 1}
                                </div>
                                <span className="text-xs font-bold">{label}</span>
                            </div>
                        );
                    })}
                </div>

                {error && (
                    <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 px-4 py-3 text-sm font-semibold">
                        {error}
                    </div>
                )}

                {step === 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="text-sm font-bold text-slate-300">{language === 'ar' ? 'اسم المنشأة' : 'Restaurant Name'}</label>
                            <input
                                value={restaurantName}
                                onChange={(e) => setRestaurantName(e.target.value)}
                                className="mt-2 w-full rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                                placeholder={language === 'ar' ? 'مثال: مطعم الراوي' : 'e.g. Coduis Zen'}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-bold text-slate-300">{language === 'ar' ? 'العملة' : 'Currency'}</label>
                            <input
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                className="mt-2 w-full rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-bold text-slate-300">{language === 'ar' ? 'رمز العملة' : 'Currency Symbol'}</label>
                            <input
                                value={currencySymbol}
                                onChange={(e) => setCurrencySymbol(e.target.value)}
                                className="mt-2 w-full rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-bold text-slate-300">{language === 'ar' ? 'ضريبة القيمة المضافة' : 'Tax Rate'}</label>
                            <input
                                type="number"
                                value={taxRate}
                                onChange={(e) => setTaxRate(Number(e.target.value))}
                                className="mt-2 w-full rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-bold text-slate-300">{language === 'ar' ? 'خدمة' : 'Service Charge'}</label>
                            <input
                                type="number"
                                value={serviceCharge}
                                onChange={(e) => setServiceCharge(Number(e.target.value))}
                                className="mt-2 w-full rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                            />
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="text-sm font-bold text-slate-300">{language === 'ar' ? 'اسم الفرع' : 'Branch Name'}</label>
                            <input
                                value={branchName}
                                onChange={(e) => setBranchName(e.target.value)}
                                className="mt-2 w-full rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-sm font-bold text-slate-300">{language === 'ar' ? 'العنوان' : 'Address'}</label>
                            <input
                                value={branchAddress}
                                onChange={(e) => setBranchAddress(e.target.value)}
                                className="mt-2 w-full rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-bold text-slate-300">{language === 'ar' ? 'الهاتف' : 'Phone'}</label>
                            <input
                                value={branchPhone}
                                onChange={(e) => setBranchPhone(e.target.value)}
                                className="mt-2 w-full rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                            />
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="text-sm font-bold text-slate-300">{language === 'ar' ? 'اسم الأدمن' : 'Admin Name'}</label>
                            <input
                                value={adminName}
                                onChange={(e) => setAdminName(e.target.value)}
                                className="mt-2 w-full rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-sm font-bold text-slate-300">{language === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
                            <input
                                type="email"
                                value={adminEmail}
                                onChange={(e) => setAdminEmail(e.target.value)}
                                className="mt-2 w-full rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-bold text-slate-300">{language === 'ar' ? 'كلمة المرور' : 'Password'}</label>
                            <input
                                type="password"
                                value={adminPassword}
                                onChange={(e) => setAdminPassword(e.target.value)}
                                className="mt-2 w-full rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-bold text-slate-300">{language === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm Password'}</label>
                            <input
                                type="password"
                                value={adminPasswordConfirm}
                                onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                                className="mt-2 w-full rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                            />
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 text-slate-400 mb-4">
                            <Printer size={20} />
                            <span className="text-sm">{language === 'ar' ? 'اختياري - يمكنك إضافة الطابعات لاحقاً' : 'Optional - You can add printers later'}</span>
                        </div>
                        <div className="flex gap-3">
                            <input
                                value={printerName}
                                onChange={(e) => setPrinterName(e.target.value)}
                                className="flex-1 rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                                placeholder={language === 'ar' ? 'اسم الطابعة' : 'Printer name'}
                            />
                            <select
                                value={printerType}
                                onChange={(e) => setPrinterType(e.target.value)}
                                className="rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                            >
                                <option value="RECEIPT">{language === 'ar' ? 'فواتير' : 'Receipt'}</option>
                                <option value="KDS">{language === 'ar' ? 'مطبخ' : 'Kitchen'}</option>
                                <option value="LABEL">{language === 'ar' ? 'ملصقات' : 'Label'}</option>
                            </select>
                            <button onClick={addPrinter} className="px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold">
                                {t.addPrinter}
                            </button>
                        </div>
                        {printers.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {printers.map((p, i) => (
                                    <div key={i} className="px-3 py-2 rounded-lg bg-indigo-500/20 text-indigo-200 text-sm flex items-center gap-2">
                                        <Printer size={14} /> {p.name} ({p.type})
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {step === 4 && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 text-slate-400 mb-4">
                            <Users size={20} />
                            <span className="text-sm">{language === 'ar' ? 'اختياري - يمكنك إضافة الأدوار لاحقاً' : 'Optional - You can add roles later'}</span>
                        </div>
                        <div className="flex gap-3">
                            <input
                                value={roleName}
                                onChange={(e) => setRoleName(e.target.value)}
                                className="flex-1 rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                                placeholder={language === 'ar' ? 'اسم الدور' : 'Role name (e.g. Cashier)'}
                            />
                            <button onClick={addRole} className="px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold">
                                {t.addRole}
                            </button>
                        </div>
                        {roles.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {roles.map((r, i) => (
                                    <div key={i} className="px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-200 text-sm flex items-center gap-2">
                                        <Users size={14} /> {r.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {step === 5 && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 text-slate-400 mb-4">
                            <Layout size={20} />
                            <span className="text-sm">{language === 'ar' ? 'اختياري - يمكنك إضافة الطاولات لاحقاً' : 'Optional - You can add tables later'}</span>
                        </div>
                        <div className="flex gap-3">
                            <input
                                value={tableName}
                                onChange={(e) => setTableName(e.target.value)}
                                className="flex-1 rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                                placeholder={language === 'ar' ? 'رقم/اسم الطاولة' : 'Table name (e.g. T1)'}
                            />
                            <input
                                type="number"
                                value={tableCapacity}
                                onChange={(e) => setTableCapacity(Number(e.target.value))}
                                className="w-24 rounded-xl bg-slate-800/60 border border-border/30 px-4 py-3 text-white"
                                placeholder={language === 'ar' ? 'السعة' : 'Capacity'}
                                min={1}
                            />
                            <button onClick={addTable} className="px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold">
                                {t.addTable}
                            </button>
                        </div>
                        {tables.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {tables.map((t, i) => (
                                    <div key={i} className="px-3 py-2 rounded-lg bg-purple-500/20 text-purple-200 text-sm flex items-center gap-2">
                                        <Layout size={14} /> {t.name} ({t.capacity})
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {step === 6 && (
                    <div className="text-center py-10">
                        <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-200 mb-6">
                            <CheckCircle2 size={28} />
                        </div>
                        <h2 className="text-2xl font-black mb-2">{t.doneTitle}</h2>
                        <p className="text-slate-400 mb-8">{t.doneBody}</p>
                        <button
                            onClick={() => navigate('/login')}
                            className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-black text-white"
                        >
                            {t.goLogin}
                        </button>
                    </div>
                )}

                {step < 6 && (
                    <div className="mt-10 flex items-center justify-between">
                        <button
                            onClick={handleBack}
                            disabled={step === 0}
                            className="px-5 py-3 rounded-2xl border border-border/30 text-slate-300 hover:text-white disabled:opacity-40 flex items-center gap-2"
                        >
                            <ArrowLeft size={16} />
                            {t.back}
                        </button>
                        <div className="flex items-center gap-3">
                            {step >= 3 && step <= 5 && (
                                <button
                                    onClick={handleSkip}
                                    className="px-5 py-3 rounded-2xl border border-border/30 text-slate-400 hover:text-white flex items-center gap-2"
                                >
                                    <SkipForward size={16} />
                                    {t.skip}
                                </button>
                            )}
                            <button
                                onClick={step === 5 ? handleFinish : handleNext}
                                disabled={isSubmitting}
                                className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black flex items-center gap-2 disabled:opacity-60"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
                                {step === 5 ? t.finish : t.next}
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SetupWizard;
