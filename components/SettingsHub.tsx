import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building2, DollarSign, Globe, ShieldCheck, Printer, BellRing, Smartphone,
    Save, Palette, Truck, Store, Plus, Package, ExternalLink, Cpu, Settings,
    ChevronRight, X, Loader2, Clock, MessageSquare, MessageCircle, Search,
    Sun, Moon, Monitor, Users, ChevronDown, LayoutGrid, Database, RefreshCw,
    Check, Upload, Download, AlertTriangle, Eye, EyeOff, Hash, CreditCard,
    MapPin, Server, Globe2, Palette as PaletteIcon, Layers, Wifi, Zap,
    Receipt, BarChart3, Network, BookOpen, FileText, Link2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppSettings, Printer as PrinterType } from '../types';
import { useToast } from './Toast';
import { aiApi } from '../services/api/ai';
import { branchesApi } from '../services/api/branches';
import { inventoryApi } from '../services/api/inventory';
import { printersApi } from '../services/api/printers';
import { settingsApi } from '../services/api/settings';
import { financeApi } from '../services/api/finance';
import { nanoid } from 'nanoid';
import { useAuthStore } from '../stores/useAuthStore';
import { useMenuStore } from '../stores/useMenuStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useWhatsAppStore, WhatsAppAutomationConfig } from '../stores/useWhatsAppStore';
import { useConfirm } from './common/ConfirmProvider';

interface MenuGroup {
    label: string;
    labelAr: string;
    items: { id: string; label: string; labelAr: string; icon: any }[];
}

interface BusinessHour {
    open: string;
    close: string;
    enabled: boolean;
}

const DEFAULT_BUSINESS_HOURS: Record<string, BusinessHour> = {
    Saturday: { open: '09:00', close: '23:00', enabled: true },
    Sunday: { open: '09:00', close: '23:00', enabled: true },
    Monday: { open: '09:00', close: '23:00', enabled: true },
    Tuesday: { open: '09:00', close: '23:00', enabled: true },
    Wednesday: { open: '09:00', close: '23:00', enabled: true },
    Thursday: { open: '09:00', close: '23:00', enabled: true },
    Friday: { open: '09:00', close: '23:00', enabled: true },
};

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const SettingsHub: React.FC = () => {
    const navigate = useNavigate();
    const { settings, updateSettings, branches, fetchBranches, printers, fetchPrinters, createPrinterInDB, updatePrinterInDB, deletePrinterFromDB } = useAuthStore();
    const { platforms, fetchPlatforms, addPlatform } = useMenuStore();
    const { warehouses, fetchWarehouses } = useInventoryStore();
    const whatsAppStore = useWhatsAppStore();
    const { t } = useTranslation();
    const lang = settings.language;
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const tn = (en: string, ar: string) => lang === 'ar' ? ar : en;

    const [activeTab, setActiveTab] = useState('IDENTITY');
    const [searchQuery, setSearchQuery] = useState('');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // Modal states
    const [showBranchModal, setShowBranchModal] = useState(false);
    const [showPlatformModal, setShowPlatformModal] = useState(false);
    const [showWarehouseModal, setShowWarehouseModal] = useState(false);
    const [showPrinterModal, setShowPrinterModal] = useState(false);
    const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSettingsSaving, setIsSettingsSaving] = useState(false);

    // AI Config
    const [aiKeySource, setAiKeySource] = useState<'DEFAULT' | 'CUSTOM'>('DEFAULT');
    const [customAiKey, setCustomAiKey] = useState('');
    const [maskedCustomAiKey, setMaskedCustomAiKey] = useState<string | null>(null);
    const [hasCustomAiKey, setHasCustomAiKey] = useState(false);
    const [usingDefaultAvailable, setUsingDefaultAvailable] = useState(false);
    const [aiProvider, setAiProvider] = useState<'OLLAMA' | 'OPENROUTER'>('OPENROUTER');
    const [providerOptions, setProviderOptions] = useState<Array<{ id: 'OPENROUTER' | 'OLLAMA'; label: string }>>([]);
    const [ollamaEnabled, setOllamaEnabled] = useState(false);
    const [ollamaBaseUrl, setOllamaBaseUrl] = useState('');
    const [ollamaModel, setOllamaModel] = useState('');
    const [ollamaModelDefault, setOllamaModelDefault] = useState('');
    const [aiModel, setAiModel] = useState('');
    const [defaultAiModel, setDefaultAiModel] = useState('');
    const [availableAiModels, setAvailableAiModels] = useState<Array<{ id: string; label: string; provider: string }>>([]);
    const [aiConfigLoading, setAiConfigLoading] = useState(false);
    const [aiConfigSaving, setAiConfigSaving] = useState(false);

    // Branch form
    const [editingBranch, setEditingBranch] = useState<any>(null);
    const [branchForm, setBranchForm] = useState({ name: '', location: '', address: '', serverIp: '', dayCloseEmailsText: '', timezone: 'Africa/Cairo', currency: 'EGP' });
    const [platformForm, setPlatformForm] = useState({ name: '', apiKey: '', commissionPercent: 0 });
    const [warehouseForm, setWarehouseForm] = useState({ name: '', branchId: '', type: 'MAIN' });

    // Printer form
    const [editingPrinter, setEditingPrinter] = useState<any>(null);
    const [printerForm, setPrinterForm] = useState({ name: '', type: 'NETWORK' as 'NETWORK' | 'USB' | 'BLUETOOTH', address: '', branchId: '', role: '' });

    // Date/Time format
    const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
    const [timeFormat, setTimeFormat] = useState('12h');

    // Business hours
    const [businessHours, setBusinessHours] = useState<Record<string, BusinessHour>>(DEFAULT_BUSINESS_HOURS);
    const [businessHoursLoaded, setBusinessHoursLoaded] = useState(false);

    // Notification preferences
    const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
        order_alerts: true,
        low_stock: true,
        shift_reminders: false,
        daily_summary: true,
        whatsapp: false,
    });
    const [notifPrefsLoaded, setNotifPrefsLoaded] = useState(false);

    // WhatsApp config
    const [waConfig, setWaConfig] = useState<WhatsAppAutomationConfig | null>(null);
    const [waConfigLoaded, setWaConfigLoaded] = useState(false);

    // Payment methods
    const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
    const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);

    // Chart of Accounts
    const [accounts, setAccounts] = useState<any[]>([]);
    const [accountsLoading, setAccountsLoading] = useState(false);

    const normalizeNumber = (value: unknown) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };

    // ============ Effects ============

    useEffect(() => {
        let cancelled = false;
        const loadAiKeyConfig = async () => {
            setAiConfigLoading(true);
            try {
                const config = await aiApi.getKeyConfig();
                if (cancelled) return;
                setAiProvider(config.provider || 'OPENROUTER');
                setProviderOptions(config.providerOptions || []);
                setOllamaEnabled(Boolean(config.ollama?.enabled));
                setOllamaBaseUrl(String(config.ollama?.baseUrl || ''));
                setOllamaModel(String(config.ollama?.model || ''));
                setOllamaModelDefault(String(config.ollama?.modelDefault || ''));
                setAiKeySource(config.source);
                setHasCustomAiKey(config.hasCustomKey);
                setMaskedCustomAiKey(config.maskedCustomKey);
                setUsingDefaultAvailable(config.usingDefaultAvailable);
                setAiModel(config.model);
                setDefaultAiModel(config.defaultModel);
                setAvailableAiModels(config.availableModels || []);
            } catch (err: any) {
                showToast(err?.message || tn('Failed to load AI settings', 'تعذر تحميل إعدادات الذكاء الاصطناعي'), 'error');
            } finally {
                if (!cancelled) setAiConfigLoading(false);
            }
        };
        loadAiKeyConfig();
        fetchPlatforms();
        fetchPrinters();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        settingsApi.getAll().then(data => {
            if (data.dateFormat) setDateFormat(data.dateFormat);
            if (data.timeFormat) setTimeFormat(data.timeFormat);
            if (data.businessHours) { setBusinessHours(data.businessHours); setBusinessHoursLoaded(true); }
            if (data.notificationPreferences) { setNotifPrefs(data.notificationPreferences); setNotifPrefsLoaded(true); }
        }).catch((err: any) => {
            showToast(err?.message || tn('Failed to load custom settings', 'تعذر تحميل الإعدادات المخصصة'), 'error');
        });
    }, []);

    useEffect(() => {
        const loadWaConfig = async () => {
            await whatsAppStore.fetchAutomationConfig();
        };
        loadWaConfig();
    }, []);

    useEffect(() => {
        if (whatsAppStore.automationConfig && !waConfigLoaded) {
            setWaConfig(whatsAppStore.automationConfig);
            setWaConfigLoaded(true);
        }
    }, [whatsAppStore.automationConfig]);

    useEffect(() => {
        if (!businessHoursLoaded) {
            setBusinessHoursLoaded(true);
        }
    }, [businessHours]);

    useEffect(() => {
        if (!notifPrefsLoaded) {
            setNotifPrefsLoaded(true);
        }
    }, [notifPrefs]);

    // Load payment methods
    const loadPaymentMethods = useCallback(async () => {
        setPaymentMethodsLoading(true);
        try {
            const data = await financeApi.getAccounts();
            setPaymentMethods(data || []);
        } catch (err: any) {
            showToast(err?.message || tn('Failed to load payment accounts', 'تعذر تحميل حسابات الدفع'), 'error');
        } finally {
            setPaymentMethodsLoading(false);
        }
    }, []);

    // Load chart of accounts
    const loadAccounts = useCallback(async () => {
        setAccountsLoading(true);
        try {
            const data = await financeApi.getAccounts();
            setAccounts(data || []);
        } catch (err: any) {
            showToast(err?.message || tn('Failed to load chart of accounts', 'تعذر تحميل دليل الحسابات'), 'error');
        } finally {
            setAccountsLoading(false);
        }
    }, []);

    // ============ Handlers ============

    const handleChange = (key: keyof AppSettings, value: any) => {
        updateSettings({ [key]: value });
    };

    const handleSaveSettings = async () => {
        if (isSettingsSaving) return;
        setIsSettingsSaving(true);
        try {
            updateSettings(settings);
            await saveCustomSettings();
            showToast(t('settings_saved'), 'success');
        } catch (err: any) {
            showToast(err?.message || tn('Failed to save settings', 'تعذر حفظ الإعدادات'), 'error');
        } finally {
            setIsSettingsSaving(false);
        }
    };

    const saveCustomSettings = async () => {
        await settingsApi.updateBulk({
            dateFormat,
            timeFormat,
            businessHours,
            notificationPreferences: notifPrefs,
        });
    };

    // Branch handlers
    const handleSaveBranch = async () => {
        if (!branchForm.name.trim() || !branchForm.location.trim() || !branchForm.serverIp.trim()) {
            showToast(t('fill_all_fields'), 'error');
            return;
        }
        setIsSubmitting(true);
        try {
            const payload: any = {
                ...branchForm,
                name: branchForm.name.trim(),
                location: branchForm.location.trim(),
                address: branchForm.address.trim(),
                serverIp: branchForm.serverIp.trim(),
                dayCloseEmails: branchForm.dayCloseEmailsText ? branchForm.dayCloseEmailsText.split(',').map((e: string) => e.trim()).filter(Boolean) : [],
            };
            delete payload.dayCloseEmailsText;
            if (editingBranch) {
                await branchesApi.update(editingBranch.id, payload);
                showToast(t('branch_updated'), 'success');
            } else {
                await branchesApi.create({ id: nanoid(), ...payload, isActive: true });
                showToast(t('branch_added'), 'success');
            }
            await fetchBranches();
            setShowBranchModal(false);
            setEditingBranch(null);
            setBranchForm({ name: '', location: '', address: '', serverIp: '', dayCloseEmailsText: '', timezone: 'Africa/Cairo', currency: 'EGP' });
        } catch (err: any) {
            showToast(err.message || 'Error saving branch', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeactivateBranch = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const ok = await confirm({
            title: tn('Deactivate branch', 'تعطيل الفرع'),
            message: t('confirm_deactivate_branch'),
            confirmText: tn('Deactivate', 'تعطيل'),
            cancelText: tn('Cancel', 'إلغاء'),
            variant: 'warning',
        });
        if (!ok) return;
        setIsSubmitting(true);
        try {
            await branchesApi.delete(id);
            await fetchBranches();
            showToast(t('branch_deactivated'), 'success');
            setShowBranchModal(false);
            setEditingBranch(null);
        } catch (err: any) {
            showToast(err.message || 'Error deactivating branch', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleHardDeleteBranch = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const ok = await confirm({
            title: tn('Delete branch permanently', 'حذف الفرع نهائيا'),
            message: t('confirm_hard_delete_branch'),
            confirmText: tn('Delete', 'حذف'),
            cancelText: tn('Cancel', 'إلغاء'),
            variant: 'danger',
        });
        if (!ok) return;
        setIsSubmitting(true);
        try {
            await branchesApi.delete(id, true);
            await fetchBranches();
            showToast(t('branch_deleted'), 'success');
            setShowBranchModal(false);
            setEditingBranch(null);
        } catch (err: any) {
            showToast(err.message || 'Error deleting branch', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddPlatform = async () => {
        if (!platformForm.name.trim()) { showToast(t('enter_platform_name'), 'error'); return; }
        setIsSubmitting(true);
        try {
            await addPlatform({ name: platformForm.name.trim(), isActive: true, feePercentage: normalizeNumber(platformForm.commissionPercent), integrationType: 'MANUAL' });
            showToast(t('platform_added'), 'success');
            setShowPlatformModal(false);
            setPlatformForm({ name: '', apiKey: '', commissionPercent: 0 });
        } catch (err: any) {
            showToast(err.message || 'Error adding platform', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddWarehouse = async () => {
        if (!warehouseForm.name.trim() || !warehouseForm.branchId) { showToast(t('fill_all_fields'), 'error'); return; }
        setIsSubmitting(true);
        try {
            await inventoryApi.createWarehouse({ id: nanoid(), ...warehouseForm, name: warehouseForm.name.trim(), isActive: true });
            if (fetchWarehouses) await fetchWarehouses();
            showToast(t('warehouse_added'), 'success');
            setShowWarehouseModal(false);
            setWarehouseForm({ name: '', branchId: '', type: 'MAIN' });
        } catch (err: any) {
            showToast(err.message || 'Error adding warehouse', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Printer handlers
    const handleSavePrinter = async () => {
        if (!printerForm.name.trim() || !printerForm.address.trim()) {
            showToast(t('fill_all_fields'), 'error');
            return;
        }
        setIsSubmitting(true);
        try {
            const payload: any = {
                name: printerForm.name.trim(),
                type: printerForm.type,
                address: printerForm.address.trim(),
                branch_id: printerForm.branchId || undefined,
                role: printerForm.role || 'OTHER',
                is_active: true,
            };
            if (editingPrinter) {
                await updatePrinterInDB({ ...editingPrinter, ...printerForm, name: printerForm.name.trim(), address: printerForm.address.trim() } as any);
                showToast(t('printer_updated'), 'success');
            } else {
                await createPrinterInDB({ id: nanoid(), ...payload } as any);
                showToast(t('printer_added'), 'success');
            }
            setShowPrinterModal(false);
            setEditingPrinter(null);
            setPrinterForm({ name: '', type: 'NETWORK', address: '', branchId: '', role: '' });
        } catch (err: any) {
            showToast(err.message || 'Error saving printer', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeletePrinter = async (id: string) => {
        const ok = await confirm({
            title: tn('Delete printer', 'حذف الطابعة'),
            message: t('confirm_delete_printer'),
            confirmText: tn('Delete', 'حذف'),
            cancelText: tn('Cancel', 'إلغاء'),
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await deletePrinterFromDB(id);
            showToast(t('printer_deleted'), 'success');
        } catch (err: any) {
            showToast(err.message || 'Error deleting printer', 'error');
        }
    };

    // WhatsApp handlers
    const handleSaveWaConfig = async () => {
        if (!waConfig) return;
        const ok = await whatsAppStore.saveAutomationConfig(waConfig);
        if (ok) showToast(t('whatsapp_config_saved'), 'success');
        else showToast(t('whatsapp_config_failed'), 'error');
    };

    const handleWaConfigChange = (key: keyof WhatsAppAutomationConfig, value: any) => {
        if (!waConfig) return;
        setWaConfig({ ...waConfig, [key]: value });
    };

    // Notification handler
    const handleNotifToggle = (key: string, value: boolean) => {
        const updated = { ...notifPrefs, [key]: value };
        setNotifPrefs(updated);
        settingsApi.update('notificationPreferences', updated).catch((err: any) => {
            showToast(err?.message || tn('Failed to save notification preferences', 'تعذر حفظ تفضيلات الإشعارات'), 'error');
        });
    };

    // Business hours handler
    const handleBusinessHourChange = (day: string, field: keyof BusinessHour, value: any) => {
        const updated = { ...businessHours, [day]: { ...businessHours[day], [field]: value } };
        setBusinessHours(updated);
    };

    const handleSaveBusinessHours = () => {
        settingsApi.update('businessHours', businessHours).then(() => {
            showToast(t('business_hours_saved'), 'success');
        }).catch(() => {
            showToast(t('business_hours_failed'), 'error');
        });
    };

    // AI config
    const saveAiKeyConfig = async () => {
        setAiConfigSaving(true);
        try {
            const payload: any = {
                source: aiKeySource,
                model: aiModel || defaultAiModel || undefined,
                provider: aiProvider,
            };
            if (aiKeySource === 'CUSTOM' && customAiKey.trim()) payload.customKey = customAiKey.trim();
            if (aiProvider === 'OLLAMA') payload.ollamaModel = (ollamaModel || ollamaModelDefault || '').trim() || undefined;
            const config = await aiApi.updateKeyConfig(payload);
            setAiProvider(config.provider || 'OPENROUTER');
            setProviderOptions(config.providerOptions || []);
            setOllamaEnabled(Boolean(config.ollama?.enabled));
            setOllamaBaseUrl(String(config.ollama?.baseUrl || ''));
            setOllamaModel(String(config.ollama?.model || ''));
            setOllamaModelDefault(String(config.ollama?.modelDefault || ''));
            setAiKeySource(config.source);
            setHasCustomAiKey(config.hasCustomKey);
            setMaskedCustomAiKey(config.maskedCustomKey);
            setUsingDefaultAvailable(config.usingDefaultAvailable);
            setAiModel(config.model);
            setDefaultAiModel(config.defaultModel);
            setAvailableAiModels(config.availableModels || []);
            setCustomAiKey('');
            showToast(t('ai_config_saved'), 'success');
        } catch (err: any) {
            showToast(err?.message || t('ai_config_failed'), 'error');
        } finally {
            setAiConfigSaving(false);
        }
    };

    // ============ UI State ============

    const groups: MenuGroup[] = [
        { label: 'General', labelAr: 'عام', items: [
            { id: 'IDENTITY', label: 'Identity', labelAr: 'الهوية', icon: Building2 },
            { id: 'LOCALIZATION', label: 'Localization', labelAr: 'التوطين', icon: Globe },
            { id: 'APPEARANCE', label: 'Appearance', labelAr: 'المظهر', icon: Palette },
        ]},
        { label: 'Operations', labelAr: 'التشغيل', items: [
            { id: 'BRANCHES', label: 'Branches', labelAr: 'الفروع', icon: Store },
            { id: 'WAREHOUSES', label: 'Warehouses', labelAr: 'المخازن', icon: Package },
            { id: 'PRINTERS', label: 'Printers', labelAr: 'الطابعات', icon: Printer },
            { id: 'OPS', label: 'Business Hours', labelAr: 'ساعات العمل', icon: Clock },
        ]},
        { label: 'Financial', labelAr: 'المالية', items: [
            { id: 'FINANCE', label: 'Finance', labelAr: 'المالية', icon: DollarSign },
            { id: 'PAYMENTS', label: 'Payments', labelAr: 'طرق الدفع', icon: CreditCard },
            { id: 'ACCOUNTS', label: 'Chart of Accounts', labelAr: 'دليل الحسابات', icon: Layers },
        ]},
        { label: 'Communications', labelAr: 'التواصل', items: [
            { id: 'WHATSAPP', label: 'WhatsApp', labelAr: 'واتساب', icon: MessageCircle },
            { id: 'NOTIFICATIONS', label: 'Notifications', labelAr: 'الإشعارات', icon: BellRing },
        ]},
        { label: 'Integrations', labelAr: 'التكاملات', items: [
            { id: 'INTEGRATIONS', label: 'Platforms', labelAr: 'المنصات', icon: ExternalLink },
            { id: 'AI', label: 'AI', labelAr: 'الذكاء الاصطناعي', icon: Cpu },
        ]},
        { label: 'System', labelAr: 'النظام', items: [
            { id: 'SECURITY', label: 'Security', labelAr: 'الأمان', icon: ShieldCheck },
        ]},
    ];

    const flatMenu = useMemo(() => groups.flatMap(g => g.items), []);
    const activeGroup = useMemo(() => groups.find(g => g.items.some(i => i.id === activeTab)), [activeTab]);
    const filteredGroups = useMemo(() => {
        if (!searchQuery.trim()) return groups;
        const q = searchQuery.toLowerCase();
        return groups.map(g => ({
            ...g,
            items: g.items.filter(i => `${i.id} ${i.label} ${i.labelAr}`.toLowerCase().includes(q)),
        })).filter(g => g.items.length > 0);
    }, [searchQuery]);

    const inputClass = "w-full px-5 py-4 bg-elevated/40 border border-border/30 rounded-2xl outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all font-bold text-sm text-main placeholder:text-muted/40";
    const labelClass = "text-[10px] font-black text-muted uppercase tracking-widest mb-1.5 block";
    const cardClass = "bg-elevated/10 border border-border/20 rounded-3xl p-6 space-y-6";
    const sectionHeaderClass = "flex items-center gap-3 pb-4 border-b border-border/20 mb-6";
    const badgeClass = "px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest";

    const SectionHeader = ({ icon: Icon, title, sub }: { icon: any; title: string; sub?: string }) => (
        <div className={sectionHeaderClass}>
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon size={20} />
            </div>
            <div>
                <h3 className="text-sm font-black text-main uppercase tracking-tight">{title}</h3>
                {sub && <p className="text-[10px] text-muted font-bold mt-0.5">{sub}</p>}
            </div>
        </div>
    );

    const Toggle = ({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) => (
        <div onClick={() => onChange(!enabled)} className={`w-12 h-7 ${enabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'} rounded-full relative cursor-pointer transition-all shrink-0`}>
            <div className={`absolute top-0.5 ${enabled ? 'right-0.5' : 'left-0.5'} w-6 h-6 bg-white rounded-full shadow-md transition-all`} />
        </div>
    );

    const StatCard = ({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) => (
        <div className="bg-elevated/20 border border-border/20 rounded-2xl p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0`} style={{ backgroundColor: color + '20', color }}>
                <Icon size={22} />
            </div>
            <div>
                <p className="text-[9px] font-black text-muted uppercase tracking-widest">{label}</p>
                <p className="text-lg font-black text-main mt-0.5">{value}</p>
            </div>
        </div>
    );

    // ============ Tab Content Rendering ============

    const renderTabContent = () => {
        switch (activeTab) {
            case 'IDENTITY':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={Building2} title={tn('Restaurant Identity', 'هوية المطعم')} sub={tn('Brand & contact information', 'معلومات العلامة التجارية والتواصل')} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className={labelClass}>{tn('Restaurant Name (EN)', 'اسم المطعم (إنجليزي)')}</label>
                                <input type="text" value={settings.restaurantName || ''} onChange={e => handleChange('restaurantName', e.target.value)} className={inputClass} placeholder="e.g. Gourmet Palace" />
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Phone Number', 'رقم الهاتف')}</label>
                                <input type="text" value={settings.phone || ''} onChange={e => handleChange('phone', e.target.value)} className={inputClass} placeholder="+20 100 000 0000" />
                            </div>
                            <div className="md:col-span-2">
                                <label className={labelClass}>{tn('Branch Address', 'عنوان الفرع')}</label>
                                <input type="text" value={settings.branchAddress || ''} onChange={e => handleChange('branchAddress', e.target.value)} className={inputClass} placeholder="e.g. 15 Tahrir Street, Downtown" />
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Receipt Logo URL', 'رابط شعار الفاتورة')}</label>
                                <input type="text" value={settings.receiptLogoUrl || ''} onChange={e => handleChange('receiptLogoUrl', e.target.value)} className={inputClass} placeholder="https://..." />
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Receipt QR URL', 'رابط QR الفاتورة')}</label>
                                <input type="text" value={settings.receiptQrUrl || ''} onChange={e => handleChange('receiptQrUrl', e.target.value)} className={inputClass} placeholder="https://..." />
                            </div>
                        </div>
                    </div>
                );
            case 'LOCALIZATION':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={Globe} title={tn('Localization', 'اللغة والتوطين')} sub={tn('Language, timezone & formatting', 'اللغة والمنطقة الزمنية والتنسيق')} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className={labelClass}>{tn('Language', 'اللغة')}</label>
                                <select value={settings.language} onChange={e => handleChange('language', e.target.value)} className={inputClass}>
                                    <option value="en">English (US)</option>
                                    <option value="ar">العربية (Arabic)</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Timezone', 'المنطقة الزمنية')}</label>
                                <select value={settings.timezone || 'Africa/Cairo'} onChange={e => handleChange('timezone', e.target.value)} className={inputClass}>
                                    <option value="Africa/Cairo">Cairo (GMT+2)</option>
                                    <option value="Europe/London">London (GMT+0)</option>
                                    <option value="America/New_York">New York (GMT-5)</option>
                                    <option value="Asia/Dubai">Dubai (GMT+4)</option>
                                    <option value="Asia/Riyadh">Riyadh (GMT+3)</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Date Format', 'صيغة التاريخ')}</label>
                                <select value={dateFormat} onChange={e => { setDateFormat(e.target.value); settingsApi.update('dateFormat', e.target.value).catch(() => {}); }} className={inputClass}>
                                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Time Format', 'صيغة الوقت')}</label>
                                <select value={timeFormat} onChange={e => { setTimeFormat(e.target.value); settingsApi.update('timeFormat', e.target.value).catch(() => {}); }} className={inputClass}>
                                    <option value="12h">12-hour (AM/PM)</option>
                                    <option value="24h">24-hour</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Currency', 'العملة')}</label>
                                <select value={settings.currency} onChange={e => handleChange('currency', e.target.value)} className={inputClass}>
                                    <option value="EGP">EGP - Egyptian Pound</option>
                                    <option value="USD">USD - US Dollar</option>
                                    <option value="EUR">EUR - Euro</option>
                                    <option value="SAR">SAR - Saudi Riyal</option>
                                    <option value="AED">AED - UAE Dirham</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Currency Symbol', 'رمز العملة')}</label>
                                <input type="text" value={settings.currencySymbol} onChange={e => handleChange('currencySymbol', e.target.value)} className={inputClass} placeholder="ج.م" />
                            </div>
                        </div>
                    </div>
                );
            case 'APPEARANCE':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={Palette} title={tn('Appearance', 'المظهر')} sub={tn('Theme, dark mode & accent color', 'السمة والوضع الليلي ولون التطبيق')} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className={labelClass}>{tn('Theme', 'السمة')}</label>
                                <select value={settings.theme || 'dark-elegant'} onChange={e => handleChange('theme', e.target.value)} className={inputClass}>
                                    <option value="dark-elegant">Dark Elegant</option>
                                    <option value="cupertino-light">Cupertino Light</option>
                                    <option value="material-soft">Material Soft</option>
                                    <option value="fluent-clean">Fluent Clean</option>
                                    <option value="fintech-sharp">Fintech Sharp</option>
                                    <option value="flat-minimal">Flat Minimal</option>
                                    <option value="mica-glass">Mica Glass</option>
                                    <option value="monochrome-pro">Monochrome Pro</option>
                                    <option value="neumorphism-soft">Neumorphism Soft</option>
                                    <option value="warm-beige">Warm Beige</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Dark Mode', 'الوضع الليلي')}</label>
                                <div className="flex items-center gap-4 p-4 bg-elevated/40 border border-border/20 rounded-2xl">
                                    <div className="flex items-center gap-3 flex-1">
                                        {settings.isDarkMode ? <Moon size={18} className="text-indigo-500" /> : <Sun size={18} className="text-amber-500" />}
                                        <span className="text-sm font-bold text-main">{settings.isDarkMode ? tn('Dark', 'ليلي') : tn('Light', 'فاتح')}</span>
                                    </div>
                                    <Toggle enabled={settings.isDarkMode} onChange={v => handleChange('isDarkMode', v)} />
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className={labelClass}>{tn('Accent Color', 'لون التطبيق')}</label>
                                <div className="flex gap-3 flex-wrap">
                                    {['#6366f1', '#059669', '#dc2626', '#d97706', '#0891b2', '#7c3aed', '#ec4899', '#f97316', '#84cc16', '#14b8a6'].map(c => (
                                        <button key={c} onClick={() => handleChange('accentColor', c)}
                                            className="w-11 h-11 rounded-xl border-2 transition-all hover:scale-110"
                                            style={{ backgroundColor: c, borderColor: settings.accentColor === c ? '#fff' : 'transparent', boxShadow: settings.accentColor === c ? `0 0 0 2px ${c}` : 'none' }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Touch Mode', 'وضع اللمس')}</label>
                                <div className="flex items-center gap-4 p-4 bg-elevated/40 border border-border/20 rounded-2xl">
                                    <span className="text-sm font-bold text-main flex-1">{settings.isTouchMode ? tn('Enabled', 'مفعل') : tn('Disabled', 'معطل')}</span>
                                    <Toggle enabled={settings.isTouchMode} onChange={v => handleChange('isTouchMode', v)} />
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'BRANCHES':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={Store} title={tn('Branch Management', 'إدارة الفروع')} sub={tn('Manage branches & locations', 'إدارة الفروع والمواقع')} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {branches.map(b => (
                                <div key={b.id} onClick={() => { setEditingBranch(b); setBranchForm({ name: b.name || '', location: b.location || '', address: b.address || '', serverIp: b.serverIp || '', dayCloseEmailsText: Array.isArray(b.dayCloseEmails) ? b.dayCloseEmails.join(', ') : '', timezone: b.timezone || 'Africa/Cairo', currency: b.currency || 'EGP' }); setShowBranchModal(true); }}
                                    className="p-5 bg-elevated/20 border border-border/20 rounded-3xl flex items-center justify-between hover:shadow-xl hover:border-primary/40 transition-all group cursor-pointer relative overflow-hidden"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg transition-transform group-hover:scale-110 ${!b.isActive ? 'bg-slate-500/10 text-slate-400' : 'bg-primary/10 text-primary'}`}>{b.name.charAt(0)}</div>
                                        <div>
                                            <p className={`font-black uppercase text-sm tracking-tight ${!b.isActive ? 'text-slate-400' : 'text-main'}`}>{b.name}</p>
                                            <p className="text-[10px] text-muted font-bold mt-1">
                                                {b.location} {b.serverIp ? <span className="font-mono">• {b.serverIp}</span> : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${b.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
                                        {b.isActive ? tn('Active', 'نشط') : tn('Archived', 'مؤرشف')}
                                    </span>
                                </div>
                            ))}
                            <button onClick={() => { setEditingBranch(null); setBranchForm({ name: '', location: '', address: '', serverIp: '', dayCloseEmailsText: '', timezone: 'Africa/Cairo', currency: 'EGP' }); setShowBranchModal(true); }}
                                className="p-5 border-2 border-dashed border-border/30 rounded-3xl flex items-center justify-center gap-3 text-muted font-black text-[10px] uppercase tracking-widest hover:text-primary hover:border-primary/40 transition-all bg-app/20 group"
                            >
                                <div className="p-2 bg-elevated rounded-xl group-hover:bg-primary group-hover:text-white transition-colors"><Plus size={18} /></div>
                                {tn('Add Branch', 'إضافة فرع')}
                            </button>
                        </div>
                    </div>
                );
            case 'WAREHOUSES':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={Package} title={tn('Warehouses', 'المخازن')} sub={tn('Manage inventory warehouses', 'إدارة مخازن المخزون')} />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {warehouses.map(w => {
                                const branch = branches.find(b => b.id === w.branchId);
                                return (
                                    <div key={w.id} className="p-5 bg-elevated/20 border border-border/20 rounded-3xl flex flex-col gap-4 hover:shadow-xl hover:border-blue-500/40 transition-all group">
                                        <div className="flex items-center justify-between">
                                            <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center"><Package size={20} /></div>
                                            <span className="px-3 py-1 bg-blue-500/5 text-blue-500 text-[8px] font-black uppercase tracking-widest rounded-lg border border-blue-500/10">{w.type}</span>
                                        </div>
                                        <div>
                                            <p className="font-black text-main leading-tight uppercase tracking-tight">{w.name}</p>
                                            <p className="text-[10px] text-muted font-black mt-1">{branch?.name || 'Unknown'}</p>
                                        </div>
                                    </div>
                                );
                            })}
                            <button onClick={() => setShowWarehouseModal(true)} className="p-5 border-2 border-dashed border-border/30 rounded-3xl flex flex-col items-center justify-center gap-3 text-muted hover:text-blue-500 hover:border-blue-500/40 transition-all bg-app/20 group">
                                <div className="p-3 bg-elevated rounded-2xl group-hover:bg-blue-500 group-hover:text-white transition-colors"><Plus size={20} /></div>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{tn('Add Warehouse', 'إضافة مخزن')}</span>
                            </button>
                        </div>
                    </div>
                );
            case 'PRINTERS':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={Printer} title={tn('Printers', 'الطابعات')} sub={tn('Printer & device management', 'إدارة الطابعات والأجهزة')} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {printers.map(p => {
                                const branch = branches.find(b => b.id === p.branchId);
                                return (
                                    <div key={p.id} className="p-5 bg-elevated/20 border border-border/20 rounded-3xl flex items-center gap-4 hover:shadow-xl hover:border-teal-500/40 transition-all relative group">
                                        <div className="w-12 h-12 bg-teal-500/10 text-teal-500 rounded-2xl flex items-center justify-center"><Printer size={24} /></div>
                                        <div className="flex-1">
                                            <p className="font-black text-sm text-main uppercase">{p.name}</p>
                                            <p className="text-[9px] text-muted font-bold mt-0.5">
                                                {p.type || 'NETWORK'} {p.address ? `• ${p.address}` : ''} {branch ? `• ${branch.name}` : ''}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-3 py-1 text-[8px] font-black uppercase rounded-lg ${p.isOnline === false ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                                {p.isOnline === false ? tn('Offline', 'غير متصل') : tn('Online', 'متصل')}
                                            </span>
                                            <button onClick={() => handleDeletePrinter(p.id)} className="p-2 rounded-xl text-muted hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            <button onClick={() => { setEditingPrinter(null); setPrinterForm({ name: '', type: 'NETWORK', address: '', branchId: '', role: '' }); setShowPrinterModal(true); }}
                                className="p-5 border-2 border-dashed border-border/30 rounded-3xl flex items-center justify-center gap-3 text-muted font-black text-[10px] uppercase tracking-widest hover:text-teal-500 hover:border-teal-500/40 transition-all bg-app/20 group"
                            >
                                <div className="p-2 bg-elevated rounded-xl group-hover:bg-teal-500 group-hover:text-white transition-colors"><Plus size={18} /></div>
                                {tn('Add Printer', 'إضافة طابعة')}
                            </button>
                        </div>
                    </div>
                );
            case 'OPS':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={Clock} title={tn('Business Hours', 'ساعات العمل')} sub={tn('Configure operating hours per day', 'تحديد ساعات العمل لكل يوم')} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {DAYS.map(day => {
                                const h = businessHours[day] || { open: '09:00', close: '23:00', enabled: true };
                                return (
                                    <div key={day} className="p-4 bg-elevated/20 border border-border/20 rounded-2xl flex items-center justify-between gap-4">
                                        <span className="text-[10px] font-black uppercase text-main tracking-widest w-24 shrink-0">{day}</span>
                                        <div className="flex items-center gap-2 flex-1">
                                            <input type="time" value={h.open} disabled={!h.enabled}
                                                onChange={e => handleBusinessHourChange(day, 'open', e.target.value)}
                                                className="px-3 py-2 bg-elevated/40 border border-border/20 rounded-xl text-[10px] font-bold text-main outline-none w-24"
                                            />
                                            <span className="text-[9px] text-muted font-black">—</span>
                                            <input type="time" value={h.close} disabled={!h.enabled}
                                                onChange={e => handleBusinessHourChange(day, 'close', e.target.value)}
                                                className="px-3 py-2 bg-elevated/40 border border-border/20 rounded-xl text-[10px] font-bold text-main outline-none w-24"
                                            />
                                        </div>
                                        <Toggle enabled={h.enabled} onChange={v => handleBusinessHourChange(day, 'enabled', v)} />
                                    </div>
                                );
                            })}
                        </div>
                        <button onClick={handleSaveBusinessHours} className="px-8 py-4 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:shadow-xl hover:shadow-primary/30 transition-all">
                            {tn('Save Business Hours', 'حفظ ساعات العمل')}
                        </button>
                    </div>
                );
            case 'FINANCE':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={DollarSign} title={tn('Financial Settings', 'الإعدادات المالية')} sub={tn('Currency, tax & service charge', 'العملة والضريبة وخدمة التوصيل')} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className={labelClass}>{tn('Currency', 'العملة')}</label>
                                <select value={settings.currency} onChange={e => handleChange('currency', e.target.value)} className={inputClass}>
                                    <option value="EGP">EGP - Egyptian Pound</option>
                                    <option value="USD">USD - US Dollar</option>
                                    <option value="EUR">EUR - Euro</option>
                                    <option value="SAR">SAR - Saudi Riyal</option>
                                    <option value="AED">AED - UAE Dirham</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Currency Symbol', 'رمز العملة')}</label>
                                <input type="text" value={settings.currencySymbol} onChange={e => handleChange('currencySymbol', e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Tax Rate (%)', 'نسبة الضريبة (%)')}</label>
                                <div className="relative">
                                    <input type="number" value={settings.taxRate || 0} onChange={e => handleChange('taxRate', parseFloat(e.target.value))} className={`${inputClass} pr-12`} step="0.1" min="0" max="100" />
                                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-muted font-black text-[10px]">%</span>
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Service Charge (%)', 'خدمة التوصيل (%)')}</label>
                                <div className="relative">
                                    <input type="number" value={settings.serviceCharge || 0} onChange={e => handleChange('serviceCharge', parseFloat(e.target.value))} className={`${inputClass} pr-12`} step="0.1" min="0" max="100" />
                                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-muted font-black text-[10px]">%</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-3xl p-6">
                            <h4 className="font-black text-sm uppercase text-indigo-600 mb-2 flex items-center gap-2">
                                <Layers size={18} /> {tn('Fiscal Period', 'الفترة المالية')}
                            </h4>
                            <p className="text-[10px] text-muted font-bold mb-4">{tn('Manage fiscal periods & period closing', 'إدارة الفترات المالية وإغلاق الفترة')}</p>
                            <button onClick={() => navigate('/finance')} className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all">
                                {tn('Open Finance', 'فتح المالية')}
                            </button>
                        </div>
                    </div>
                );
            case 'PAYMENTS':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={CreditCard} title={tn('Payment Methods', 'طرق الدفع')} sub={tn('Configure payment methods & accounts', 'تكوين طرق الدفع والحسابات')} />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {['CASH', 'VISA', 'VODAFONE_CASH', 'INSTAPAY'].map(method => (
                                <div key={method} className="p-5 bg-elevated/20 border border-border/20 rounded-3xl flex flex-col gap-3 hover:border-emerald-500/30 transition-all">
                                    <div className="flex items-center justify-between">
                                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${method === 'CASH' ? 'bg-emerald-500/10 text-emerald-500' : method === 'VISA' ? 'bg-blue-500/10 text-blue-500' : method === 'VODAFONE_CASH' ? 'bg-red-500/10 text-red-500' : 'bg-purple-500/10 text-purple-500'}`}>
                                            <CreditCard size={18} />
                                        </div>
                                        <span className="w-3 h-3 rounded-full bg-emerald-500" />
                                    </div>
                                    <p className="font-black text-xs text-main uppercase tracking-tight">{method.replace(/_/g, ' ')}</p>
                                    <p className="text-[8px] text-muted font-bold">{tn('Active', 'نشط')}</p>
                                </div>
                            ))}
                        </div>
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-6">
                            <h4 className="font-black text-sm uppercase text-emerald-600 mb-2">{tn('Payment Account Mapping', 'ربط حسابات الدفع')}</h4>
                            <p className="text-[10px] text-muted font-bold mb-4">{tn('Map payment methods to chart of accounts', 'ربط طرق الدفع بحسابات مالية')}</p>
                            <button onClick={() => { loadPaymentMethods(); setShowPaymentMethodModal(true); }} className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all">
                                {tn('Configure Mapping', 'تكوين الربط')}
                            </button>
                        </div>
                    </div>
                );
            case 'ACCOUNTS':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={Layers} title={tn('Chart of Accounts', 'دليل الحسابات')} sub={tn('Browse financial accounts & structure', 'تصفح الحسابات المالية والهيكل')} />
                        {accounts.length === 0 ? (
                            <div className="text-center py-12">
                                <button onClick={() => { loadAccounts(); }} className="px-8 py-4 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:shadow-xl transition-all flex items-center gap-3 mx-auto">
                                    {accountsLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                    {accountsLoading ? tn('Loading...', 'جاري التحميل...') : tn('Load Accounts', 'تحميل الحسابات')}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {accounts.map((account: any) => (
                                    <div key={account.id} className="p-4 bg-elevated/20 border border-border/20 rounded-2xl hover:border-primary/30 transition-all">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-[9px] font-mono font-black text-muted">{account.code}</span>
                                                <span className="text-sm font-black text-main uppercase">{account.name}</span>
                                            </div>
                                            <span className={`px-2 py-1 text-[8px] font-black uppercase rounded-lg ${
                                                account.type === 'ASSET' ? 'bg-blue-500/10 text-blue-500' :
                                                account.type === 'LIABILITY' ? 'bg-orange-500/10 text-orange-500' :
                                                account.type === 'EQUITY' ? 'bg-purple-500/10 text-purple-500' :
                                                account.type === 'REVENUE' ? 'bg-emerald-500/10 text-emerald-500' :
                                                'bg-rose-500/10 text-rose-500'
                                            }`}>{account.type}</span>
                                        </div>
                                        {account.children && account.children.length > 0 && (
                                            <div className="mt-3 pl-6 space-y-1">
                                                {account.children.map((child: any) => (
                                                    <div key={child.id} className="flex items-center justify-between py-1.5 px-3 bg-elevated/30 rounded-xl">
                                                        <span className="text-[10px] font-bold text-main">{child.code} - {child.name}</span>
                                                        <span className="text-[8px] font-black text-muted uppercase">{child.type}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-6">
                            <h4 className="font-black text-sm uppercase text-amber-600 mb-2">{tn('Manage Accounts', 'إدارة الحسابات')}</h4>
                            <p className="text-[10px] text-muted font-bold mb-4">{tn('Full account management in Finance module', 'إدارة كاملة للحسابات في وحدة المالية')}</p>
                            <button onClick={() => navigate('/finance')} className="px-6 py-3 bg-amber-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-700 transition-all">
                                {tn('Open Finance', 'فتح المالية')}
                            </button>
                        </div>
                    </div>
                );
            case 'NOTIFICATIONS':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={BellRing} title={tn('Notifications', 'الإشعارات')} sub={tn('Manage notification preferences', 'إدارة تفضيلات الإشعارات')} />
                        <div className="space-y-3">
                            {[
                                { key: 'order_alerts', label: tn('New Order Alerts', 'إشعارات الطلبات الجديدة'), desc: tn('Alert when a new order arrives', 'تنبيه عند وصول طلب جديد') },
                                { key: 'low_stock', label: tn('Low Stock Warnings', 'تنبيهات المخزون المنخفض'), desc: tn('Alert when stock falls below minimum', 'إنذار عند انخفاض المخزون') },
                                { key: 'shift_reminders', label: tn('Shift Reminders', 'تذكيرات الورديات'), desc: tn('Reminder at shift start/end', 'تذكير ببداية ونهاية الوردية') },
                                { key: 'daily_summary', label: tn('Daily Summary', 'الملخص اليومي'), desc: tn('End-of-day performance summary', 'تقرير يومي بنهاية اليوم') },
                                { key: 'whatsapp', label: tn('WhatsApp Alerts', 'تنبيهات واتساب'), desc: tn('Send critical alerts via WhatsApp', 'إرسال التنبيهات عبر واتساب') },
                            ].map(n => (
                                <div key={n.key} className="flex items-center justify-between p-5 bg-elevated/20 border border-border/20 rounded-2xl hover:border-pink-500/30 transition-all">
                                    <div>
                                        <p className="text-xs font-black text-main uppercase">{n.label}</p>
                                        <p className="text-[9px] text-muted font-bold mt-0.5">{n.desc}</p>
                                    </div>
                                    <Toggle enabled={notifPrefs[n.key] || false} onChange={v => handleNotifToggle(n.key, v)} />
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'WHATSAPP': {
                const ws = whatsAppStore.statusData;
                const isConnected = ws?.status === 'READY';
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={MessageCircle} title="WhatsApp" sub={tn('WhatsApp & customer communication', 'واتساب والتواصل مع العملاء')} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="p-5 bg-elevated/20 border border-border/20 rounded-3xl flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isConnected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                        <Smartphone size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-main uppercase">{tn('Connection', 'الاتصال')}</p>
                                        <p className="text-[8px] text-muted font-bold mt-0.5">{ws?.status || tn('Unknown', 'غير معروف')}</p>
                                    </div>
                                </div>
                                <span className={`px-3 py-1.5 text-[8px] font-black uppercase rounded-xl ${isConnected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                    {isConnected ? tn('Connected', 'متصل') : tn('Disconnected', 'غير متصل')}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => whatsAppStore.restartEngine()} className="flex-1 py-4 bg-elevated/40 border border-border/20 rounded-2xl font-black text-[9px] uppercase tracking-widest text-main hover:bg-elevated transition-all">
                                    {tn('Restart', 'إعادة تشغيل')}
                                </button>
                                <button onClick={() => whatsAppStore.resetSession()} className="flex-1 py-4 bg-rose-600/10 border border-rose-600/30 text-rose-600 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-600/20 transition-all">
                                    {tn('Reset', 'إعادة تعيين')}
                                </button>
                            </div>
                            {waConfig && (
                                <div className="md:col-span-2 space-y-4">
                                    <h4 className="font-black text-[10px] uppercase text-main tracking-widest">{tn('Automation', 'الأتمتة')}</h4>
                                    {[
                                        { key: 'orderCreated' as const, label: tn('Order Created Msg', 'رسالة إنشاء الطلب') },
                                        { key: 'outForDelivery' as const, label: tn('Out for Delivery Msg', 'رسالة التوصيل') },
                                        { key: 'delivered' as const, label: tn('Delivered Msg', 'رسالة التسليم') },
                                        { key: 'feedback' as const, label: tn('Feedback Request', 'طلب تقييم') },
                                    ].map(item => (
                                        <div key={item.key} className="flex items-center justify-between p-4 bg-elevated/20 border border-border/20 rounded-2xl">
                                            <span className="text-[10px] font-bold text-main">{item.label}</span>
                                            <Toggle enabled={waConfig[item.key] || false} onChange={v => handleWaConfigChange(item.key, v)} />
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between p-4 bg-elevated/20 border border-border/20 rounded-2xl">
                                        <div>
                                            <span className="text-[10px] font-bold text-main">{tn('Chat Bot', 'بوت المحادثة')}</span>
                                            <p className="text-[8px] text-muted font-bold">{tn('Enable WhatsApp menu & ordering bot', 'تفعيل بوت المنيو والطلب')}</p>
                                        </div>
                                        <Toggle enabled={waConfig.botEnabled || false} onChange={v => handleWaConfigChange('botEnabled', v)} />
                                    </div>
                                    <div className="flex items-center justify-between p-4 bg-elevated/20 border border-border/20 rounded-2xl">
                                        <div>
                                            <span className="text-[10px] font-bold text-main">{tn('Quiet Hours', 'ساعات الهدوء')}</span>
                                            <p className="text-[8px] text-muted font-bold">{tn('Suppress auto-replies during quiet hours', 'كتم الردود التلقائية')}</p>
                                        </div>
                                        <Toggle enabled={waConfig.quietHoursEnabled || false} onChange={v => handleWaConfigChange('quietHoursEnabled', v)} />
                                    </div>
                                    <button onClick={handleSaveWaConfig} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20">
                                        {tn('Save WhatsApp Config', 'حفظ إعدادات واتساب')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            }
            case 'INTEGRATIONS':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={ExternalLink} title={tn('Integrations', 'التكاملات')} sub={tn('Delivery platforms & external services', 'منصات التوصيل والخدمات الخارجية')} />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {platforms.map(p => (
                                <div key={p.id} className="p-6 bg-elevated/20 border border-border/20 rounded-3xl flex flex-col items-center text-center gap-4 hover:shadow-xl hover:border-amber-500/40 transition-all group relative overflow-hidden">
                                    <div className="w-14 h-14 bg-elevated rounded-[1.2rem] flex items-center justify-center text-amber-600 shadow-sm group-hover:scale-110 transition-transform border border-border/30">
                                        <Globe size={28} />
                                    </div>
                                    <p className="font-black text-xs text-main uppercase tracking-tight">{p.name}</p>
                                </div>
                            ))}
                            <button onClick={() => setShowPlatformModal(true)} className="flex flex-col items-center justify-center gap-4 p-6 border-2 border-dashed border-border/30 rounded-3xl text-muted hover:text-amber-600 hover:border-amber-500/40 transition-all bg-app/20 group">
                                <div className="p-3 bg-elevated rounded-[1.2rem] group-hover:bg-amber-600 group-hover:text-white transition-all"><Plus size={24} /></div>
                                <span className="text-[10px] font-black uppercase tracking-widest">{tn('Add Platform', 'إضافة منصة')}</span>
                            </button>
                        </div>
                    </div>
                );
            case 'AI':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={Cpu} title={tn('AI Configuration', 'إعدادات الذكاء الاصطناعي')} sub={tn('LLM provider, model & API key', 'مزود النموذج والمفتاح')} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-6">
                                <div>
                                    <label className={labelClass}>{tn('AI Provider', 'مزود الذكاء الاصطناعي')}</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {(providerOptions.length ? providerOptions : [
                                            { id: 'OLLAMA', label: 'Local (Ollama)' },
                                            { id: 'OPENROUTER', label: 'Cloud (OpenRouter)' },
                                        ]).map(p => (
                                            <button key={p.id} onClick={() => setAiProvider(p.id as any)}
                                                className={`p-4 rounded-2xl border-2 transition-all text-center ${aiProvider === p.id ? 'border-cyan-500 bg-cyan-500/5 text-cyan-500' : 'border-border/30 text-muted hover:border-cyan-500/30'}`}
                                            >
                                                <span className="text-[10px] font-black uppercase tracking-widest">{p.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {aiProvider === 'OLLAMA' && (
                                    <div className="space-y-4">
                                        <div className="p-4 bg-elevated/40 border border-border/20 rounded-2xl flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase text-main">{tn('Server URL', 'رابط الخادم')}</span>
                                            <span className="text-[10px] font-mono font-bold text-cyan-500">{ollamaBaseUrl || 'http://localhost:11434'}</span>
                                        </div>
                                        <div>
                                            <label className={labelClass}>{tn('Local Model', 'النموذج المحلي')}</label>
                                            <input value={ollamaModel || ''} onChange={e => setOllamaModel(e.target.value)} placeholder={ollamaModelDefault || 'qwen2.5:7b-instruct'} className={inputClass} />
                                        </div>
                                    </div>
                                )}
                                {aiProvider === 'OPENROUTER' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={() => setAiKeySource('DEFAULT')} className={`p-4 rounded-2xl border-2 text-left transition-all ${aiKeySource === 'DEFAULT' ? 'border-cyan-500 bg-cyan-500/5' : 'border-border/30'}`}>
                                                <p className="text-[10px] font-black uppercase text-main">{tn('Server Key', 'مفتاح الخادم')}</p>
                                                <p className={`text-[8px] font-bold uppercase mt-1 ${usingDefaultAvailable ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {usingDefaultAvailable ? tn('Available', 'متاح') : tn('Exhausted', 'منتهي')}
                                                </p>
                                            </button>
                                            <button onClick={() => setAiKeySource('CUSTOM')} className={`p-4 rounded-2xl border-2 text-left transition-all ${aiKeySource === 'CUSTOM' ? 'border-cyan-500 bg-cyan-500/5' : 'border-border/30'}`}>
                                                <p className="text-[10px] font-black uppercase text-main">{tn('Custom Key', 'مفتاح مخصص')}</p>
                                                <p className="text-[8px] text-muted font-bold uppercase mt-1">
                                                    {hasCustomAiKey ? tn('Stored', 'مخزن') : tn('Not Set', 'غير مضبوط')}
                                                </p>
                                            </button>
                                        </div>
                                        {aiKeySource === 'CUSTOM' && (
                                            <input type="password" value={customAiKey} onChange={e => setCustomAiKey(e.target.value)} placeholder="sk-or-..." className={inputClass} />
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <label className={labelClass}>{tn('AI Model', 'نموذج الذكاء الاصطناعي')}</label>
                                    <select value={aiModel || defaultAiModel} onChange={e => setAiModel(e.target.value)} disabled={aiProvider === 'OLLAMA'} className={inputClass}>
                                        {(availableAiModels.length ? availableAiModels : [{ id: defaultAiModel || 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (Free)', provider: 'Google' }]).map(model => (
                                            <option key={model.id} value={model.id}>{model.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="p-6 bg-elevated/20 border border-border/20 rounded-3xl flex flex-col gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-emerald-500/10 text-emerald-500 rounded-lg flex items-center justify-center"><ShieldCheck size={18} /></div>
                                        <p className="text-[10px] font-black uppercase text-main">{tn('Model Status', 'حالة النموذج')}</p>
                                        <span className="ml-auto px-2 py-1 bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase rounded-lg">{tn('Operational', 'جاهز')}</span>
                                    </div>
                                    <button onClick={saveAiKeyConfig} disabled={aiConfigSaving} className="w-full py-4 bg-cyan-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-cyan-700 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50">
                                        {aiConfigSaving ? <Loader2 size={16} className="animate-spin mx-auto" /> : tn('Save AI Config', 'حفظ إعدادات AI')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'SECURITY':
                return (
                    <div className="space-y-6">
                        <SectionHeader icon={ShieldCheck} title={tn('Security', 'الأمان')} sub={tn('Permissions, roles & audit logs', 'الصلاحيات والأدوار وسجل العمليات')} />
                        <div className="space-y-4">
                            <div className="p-6 bg-elevated/20 border border-border/20 rounded-3xl flex items-center justify-between hover:border-slate-500/30 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-slate-500/10 text-slate-500 rounded-xl flex items-center justify-center"><Settings size={20} /></div>
                                    <div>
                                        <p className="text-sm font-black text-main uppercase">{tn('Audit Logs', 'سجل العمليات')}</p>
                                        <p className="text-[10px] text-muted font-bold mt-1">{tn('View detailed history of all system changes', 'عرض سجل التغييرات الكامل')}</p>
                                    </div>
                                </div>
                                <button onClick={() => navigate('/forensics')} className="px-6 py-3 bg-elevated/40 border border-border/20 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-elevated transition-all">
                                    {tn('View', 'عرض')}
                                </button>
                            </div>
                            <div className="p-6 bg-elevated/20 border border-border/20 rounded-3xl flex items-center justify-between hover:border-amber-500/30 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center"><Users size={20} /></div>
                                    <div>
                                        <p className="text-sm font-black text-main uppercase">{tn('Roles & Permissions', 'الصلاحيات والأدوار')}</p>
                                        <p className="text-[10px] text-muted font-bold mt-1">{tn('Manage users, roles & approval PINs', 'إدارة المستخدمين والأدوار وأرقام PIN')}</p>
                                    </div>
                                </div>
                                <button onClick={() => navigate('/roles')} className="px-6 py-3 bg-amber-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-600 transition-all">
                                    {tn('Open', 'فتح')}
                                </button>
                            </div>
                            <div className="p-6 bg-elevated/20 border border-border/20 rounded-3xl flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center"><Monitor size={20} /></div>
                                    <div>
                                        <p className="text-sm font-black text-main uppercase">{tn('Active Sessions', 'جلسات الدخول النشطة')}</p>
                                        <p className="text-[10px] text-muted font-bold mt-1">{tn('View and manage current login sessions', 'عرض وإدارة جلسات الدخول الحالية')}</p>
                                    </div>
                                </div>
                                <button onClick={() => navigate('/user-management')} className="px-6 py-3 bg-elevated/40 border border-border/20 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-elevated transition-all">
                                    {tn('View', 'عرض')}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    // ============ Main Render ============

    return (
        <div className="min-h-screen bg-app overflow-hidden selection:bg-primary/30">
            <div className="flex h-screen overflow-hidden">
                {/* Sidebar */}
                <aside className={`${sidebarCollapsed ? 'w-20' : 'w-72'} shrink-0 bg-card/80 backdrop-blur-xl border-r border-border/30 flex flex-col transition-all duration-300 z-20`}>
                    <div className="p-5 border-b border-border/20 flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                            <Settings size={22} />
                        </div>
                        {!sidebarCollapsed && (
                            <div>
                                <h2 className="text-sm font-black text-main uppercase tracking-tight leading-none">{tn('Settings', 'الإعدادات')}</h2>
                                <p className="text-[8px] font-black text-muted uppercase tracking-widest mt-1">{tn('Control Panel', 'لوحة التحكم')}</p>
                            </div>
                        )}
                        <button type="button" aria-label={sidebarCollapsed ? tn('Expand settings sidebar', 'توسيع قائمة الإعدادات') : tn('Collapse settings sidebar', 'طي قائمة الإعدادات')} onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="ml-auto p-1.5 rounded-lg text-muted hover:bg-elevated/60 transition-all">
                            <ChevronRight size={16} className={`transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
                        </button>
                    </div>

                    {!sidebarCollapsed && (
                        <div className="px-4 pt-4 pb-2">
                            <div className="relative">
                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    placeholder={tn('Search settings...', 'بحث في الإعدادات...')}
                                    className="w-full pl-10 pr-4 py-3 bg-elevated/40 border border-border/20 rounded-2xl outline-none focus:border-primary/30 transition-all text-xs font-bold text-main placeholder:text-muted/40"
                                />
                            </div>
                        </div>
                    )}

                    <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-5">
                        {filteredGroups.map(group => (
                            <div key={group.label}>
                                {!sidebarCollapsed && (
                                    <p className="px-3 pb-1 text-[8px] font-black text-muted uppercase tracking-[0.2em]">
                                        {tn(group.label, group.labelAr)}
                                    </p>
                                )}
                                <div className="space-y-0.5">
                                    {group.items.map(item => {
                                        const isActive = activeTab === item.id;
                                        const groupItem = groups.flatMap(g => g.items).find(i => i.id === item.id);
                                        return (
                                            <button key={item.id} onClick={() => setActiveTab(item.id)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all group relative ${isActive ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-muted hover:text-main hover:bg-elevated/40'}`}
                                                title={sidebarCollapsed ? tn(item.label, item.labelAr) : undefined}
                                            >
                                                {groupItem && <item.icon size={18} />}
                                                {!sidebarCollapsed && <span className="font-black text-[10px] uppercase tracking-widest">{tn(item.label, item.labelAr)}</span>}
                                                {isActive && !sidebarCollapsed && <ChevronRight size={12} className="ml-auto text-white/40" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>

                    {!sidebarCollapsed && (
                        <div className="p-4 border-t border-border/20 space-y-2">
                            <button onClick={() => navigate('/floor-designer')} className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-700 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-indigo-500/20">
                                {tn('Floor Designer', 'مصمم القاعة')}
                            </button>
                            <button onClick={() => navigate('/receipt-designer')} className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-amber-500/20">
                                {tn('Receipt Designer', 'مصمم الفاتورة')}
                            </button>
                        </div>
                    )}
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Top Bar */}
                    <div className="sticky top-0 z-10 bg-app/80 backdrop-blur-xl border-b border-border/20">
                        <div className="px-8 py-4 flex items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-2xl text-white shadow-lg ${activeGroup ? '' : 'bg-primary'}`} style={activeGroup ? { backgroundColor: 'var(--primary)', opacity: 0.9 } : {}}>
                                    {React.createElement(flatMenu.find(i => i.id === activeTab)?.icon || Settings, { size: 22 })}
                                </div>
                                <div>
                                    <h1 className="text-xl font-black text-main uppercase tracking-tight leading-none">
                                        {tn(flatMenu.find(i => i.id === activeTab)?.label || activeTab, flatMenu.find(i => i.id === activeTab)?.labelAr || activeTab)}
                                    </h1>
                                    <p className="text-[9px] font-black text-muted uppercase tracking-[0.2em] mt-1">
                                        {activeGroup && tn(activeGroup.label, activeGroup.labelAr)} • {tn('Settings', 'الإعدادات')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => navigate('/')} className="px-5 py-3 bg-elevated/40 border border-border/20 rounded-2xl font-black text-[10px] uppercase tracking-widest text-muted hover:text-main hover:bg-elevated/60 transition-all">
                                    {tn('Back', 'رجوع')}
                                </button>
                                <button onClick={handleSaveSettings} disabled={isSettingsSaving}
                                    className="px-7 py-3 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:shadow-2xl hover:shadow-primary/30 transition-all shadow-xl shadow-primary/20 flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait"
                                >
                                    {isSettingsSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    {isSettingsSaving ? tn('Saving...', 'جار الحفظ...') : tn('Save All', 'حفظ الكل')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* System Overview Cards */}
                    <div className="px-8 pt-6 pb-2">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard icon={Building2} color="#6366f1" label={tn('Restaurant', 'المطعم')} value={settings.restaurantName || '—'} />
                            <StatCard icon={Store} color="#7c3aed" label={tn('Branches', 'الفروع')} value={String(branches.length)} />
                            <StatCard icon={Package} color="#059669" label={tn('Warehouses', 'المخازن')} value={String(warehouses.length)} />
                            <StatCard icon={Printer} color="#0891b2" label={tn('Printers', 'الطابعات')} value={String(printers.length)} />
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-8 pb-24">
                        <div className="bg-elevated/5 border border-border/20 rounded-[2.5rem] p-8 shadow-xl mt-4 min-h-[500px]">
                            {renderTabContent()}
                        </div>
                    </div>
                </main>
            </div>

            {/* Branch Modal */}
            {showBranchModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md p-4 flex items-center justify-center z-50" onClick={() => setShowBranchModal(false)}>
                    <div className="bg-card border border-border/30 rounded-[2.5rem] p-10 w-full max-w-xl shadow-2xl animate-fade-up" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-purple-500 text-white rounded-2xl shadow-lg shadow-purple-500/20"><Store size={24} /></div>
                                <h3 className="text-xl font-black text-main tracking-tighter uppercase">{editingBranch ? tn('Edit Branch', 'تعديل الفرع') : tn('Add Branch', 'إضافة فرع')}</h3>
                            </div>
                            <button onClick={() => { setShowBranchModal(false); setEditingBranch(null); }} className="p-3 rounded-2xl hover:bg-elevated text-muted transition-colors"><X size={24} /></button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto px-2 custom-scrollbar">
                            <div className="sm:col-span-2">
                                <label className={labelClass}>{tn('Branch Name', 'اسم الفرع')}</label>
                                <input type="text" value={branchForm.name} onChange={e => setBranchForm(f => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="e.g. Downtown" />
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Location', 'الموقع')}</label>
                                <input type="text" value={branchForm.location} onChange={e => setBranchForm(f => ({ ...f, location: e.target.value }))} className={inputClass} placeholder="City, Area" />
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Full Address', 'العنوان الكامل')}</label>
                                <input type="text" value={branchForm.address} onChange={e => setBranchForm(f => ({ ...f, address: e.target.value }))} className={inputClass} placeholder="Full Address" />
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Timezone', 'المنطقة الزمنية')}</label>
                                <select value={branchForm.timezone} onChange={e => setBranchForm(f => ({ ...f, timezone: e.target.value }))} className={inputClass}>
                                    <option value="Africa/Cairo">Cairo (EGY)</option>
                                    <option value="GMT">GMT</option>
                                    <option value="Asia/Riyadh">Riyadh</option>
                                    <option value="Asia/Dubai">Dubai</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Currency', 'العملة')}</label>
                                <select value={branchForm.currency} onChange={e => setBranchForm(f => ({ ...f, currency: e.target.value }))} className={inputClass}>
                                    <option value="EGP">EGP</option>
                                    <option value="USD">USD</option>
                                    <option value="SAR">SAR</option>
                                    <option value="AED">AED</option>
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label className={labelClass}>{tn('Server IP', 'IP الخادم')}</label>
                                <input type="text" value={branchForm.serverIp} onChange={e => setBranchForm(f => ({ ...f, serverIp: e.target.value }))} className={`${inputClass} font-mono`} placeholder="192.168.1.100" />
                            </div>
                        </div>
                        <div className="flex gap-4 mt-8">
                            {editingBranch && (
                                <button onClick={(e) => handleHardDeleteBranch(editingBranch.id, e)} disabled={isSubmitting}
                                    className="px-8 py-4 bg-app text-red-600 border border-border/30 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:border-red-600 hover:bg-red-600/10 transition-all"
                                >{tn('Delete', 'حذف')}</button>
                            )}
                            <button onClick={handleSaveBranch} disabled={isSubmitting}
                                className="flex-1 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:shadow-2xl hover:shadow-primary/30 transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3"
                            >
                                {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                                {editingBranch ? tn('Save Changes', 'حفظ التغييرات') : tn('Add Branch', 'إضافة فرع')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Platform Modal */}
            {showPlatformModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md p-4 flex items-center justify-center z-50" onClick={() => setShowPlatformModal(false)}>
                    <div className="bg-card border border-border/30 rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl animate-fade-up" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black text-main uppercase tracking-tighter">{tn('Add Platform', 'إضافة منصة')}</h3>
                            <button onClick={() => setShowPlatformModal(false)} className="p-3 rounded-2xl hover:bg-elevated text-muted"><X size={24} /></button>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className={labelClass}>{tn('Platform Name', 'اسم المنصة')}</label>
                                <input type="text" value={platformForm.name} onChange={e => setPlatformForm(f => ({ ...f, name: e.target.value }))} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Commission (%)', 'نسبة العمولة')}</label>
                                <input type="number" value={platformForm.commissionPercent} onChange={e => setPlatformForm(f => ({ ...f, commissionPercent: parseFloat(e.target.value) }))} className={inputClass} />
                            </div>
                            <button onClick={handleAddPlatform} disabled={isSubmitting} className="w-full py-5 bg-orange-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-orange-500/20 hover:bg-orange-700 transition-all">
                                {isSubmitting ? <Loader2 size={18} className="animate-spin mx-auto" /> : tn('Add', 'إضافة')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Warehouse Modal */}
            {showWarehouseModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md p-4 flex items-center justify-center z-50" onClick={() => setShowWarehouseModal(false)}>
                    <div className="bg-card border border-border/30 rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl animate-fade-up" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black text-main uppercase tracking-tighter">{tn('Add Warehouse', 'إضافة مخزن')}</h3>
                            <button onClick={() => setShowWarehouseModal(false)} className="p-3 rounded-2xl hover:bg-elevated text-muted"><X size={24} /></button>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className={labelClass}>{tn('Warehouse Name', 'اسم المخزن')}</label>
                                <input type="text" value={warehouseForm.name} onChange={e => setWarehouseForm(f => ({ ...f, name: e.target.value }))} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Branch', 'الفرع')}</label>
                                <select value={warehouseForm.branchId} onChange={e => setWarehouseForm(f => ({ ...f, branchId: e.target.value }))} className={inputClass}>
                                    <option value="">{tn('Select branch', 'اختر فرع')}</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{tn('Type', 'النوع')}</label>
                                <select value={warehouseForm.type} onChange={e => setWarehouseForm(f => ({ ...f, type: e.target.value }))} className={inputClass}>
                                    <option value="MAIN">{tn('Warehouse', 'مخزن')}</option>
                                    <option value="KITCHEN">{tn('Kitchen', 'مطبخ')}</option>
                                    <option value="POS">{tn('POS', 'نقطة بيع')}</option>
                                    <option value="SUB">{tn('Sub', 'فرعي')}</option>
                                </select>
                            </div>
                            <button onClick={handleAddWarehouse} disabled={isSubmitting} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all">
                                {isSubmitting ? <Loader2 size={18} className="animate-spin mx-auto" /> : tn('Add', 'إضافة')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Printer Modal */}
            {showPrinterModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md p-4 flex items-center justify-center z-50" onClick={() => setShowPrinterModal(false)}>
                    <div className="bg-card border border-border/30 rounded-[2.5rem] p-10 w-full max-w-lg shadow-2xl animate-fade-up" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-teal-500 text-white rounded-2xl shadow-lg shadow-teal-500/20"><Printer size={24} /></div>
                                <h3 className="text-xl font-black text-main tracking-tighter uppercase">{editingPrinter ? tn('Edit Printer', 'تعديل الطابعة') : tn('Add Printer', 'إضافة طابعة')}</h3>
                            </div>
                            <button onClick={() => { setShowPrinterModal(false); setEditingPrinter(null); }} className="p-3 rounded-2xl hover:bg-elevated text-muted"><X size={24} /></button>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className={labelClass}>{tn('Printer Name', 'اسم الطابعة')}</label>
                                <input type="text" value={printerForm.name} onChange={e => setPrinterForm(f => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="Kitchen Printer" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>{tn('Type', 'النوع')}</label>
                                    <select value={printerForm.type} onChange={e => setPrinterForm(f => ({ ...f, type: e.target.value as any }))} className={inputClass}>
                                        <option value="NETWORK">Network</option>
                                        <option value="USB">USB</option>
                                        <option value="BLUETOOTH">Bluetooth</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>{tn('Branch', 'الفرع')}</label>
                                    <select value={printerForm.branchId} onChange={e => setPrinterForm(f => ({ ...f, branchId: e.target.value }))} className={inputClass}>
                                        <option value="">{tn('All Branches', 'كل الفروع')}</option>
                                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>{tn('IP Address', 'عنوان IP')}</label>
                                <input type="text" value={printerForm.address} onChange={e => setPrinterForm(f => ({ ...f, address: e.target.value }))} className={`${inputClass} font-mono`} placeholder="192.168.1.100" />
                            </div>
                            <button onClick={handleSavePrinter} disabled={isSubmitting}
                                className="w-full py-5 bg-teal-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-teal-500/20 hover:bg-teal-700 transition-all"
                            >
                                {isSubmitting ? <Loader2 size={18} className="animate-spin mx-auto" /> : tn('Save Printer', 'حفظ الطابعة')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Method Account Mapping Modal */}
            {showPaymentMethodModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md p-4 flex items-center justify-center z-50" onClick={() => setShowPaymentMethodModal(false)}>
                    <div className="bg-card border border-border/30 rounded-[2.5rem] p-10 w-full max-w-2xl shadow-2xl animate-fade-up" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-500/20"><CreditCard size={24} /></div>
                                <h3 className="text-xl font-black text-main tracking-tighter uppercase">{tn('Payment Account Mapping', 'ربط حسابات الدفع')}</h3>
                            </div>
                            <button onClick={() => setShowPaymentMethodModal(false)} className="p-3 rounded-2xl hover:bg-elevated text-muted"><X size={24} /></button>
                        </div>
                        <div className="space-y-4 max-h-[50vh] overflow-y-auto custom-scrollbar">
                            {paymentMethodsLoading ? (
                                <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-muted" /></div>
                            ) : paymentMethods.length === 0 ? (
                                <p className="text-center text-muted font-bold text-[10px] py-8">{tn('No accounts found. Configure in Finance module.', 'لا توجد حسابات. قم بالتكوين في وحدة المالية.')}</p>
                            ) : (
                                paymentMethods.filter((a: any) => a.type === 'ASSET').slice(0, 10).map((account: any) => (
                                    <div key={account.id} className="p-4 bg-elevated/20 border border-border/20 rounded-2xl flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[9px] font-mono font-black text-muted">{account.code}</span>
                                            <span className="text-xs font-black text-main">{account.name}</span>
                                        </div>
                                        <span className="text-[8px] font-black text-muted uppercase">{account.normalBalance || 'DEBIT'}</span>
                                    </div>
                                ))
                            )}
                        </div>
                        <p className="text-[9px] text-muted font-bold mt-6 text-center">{tn('Full account mapping available in Finance module', 'الربط الكامل متاح في وحدة المالية')}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsHub;
