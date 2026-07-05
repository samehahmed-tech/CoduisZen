import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';

const TITLES: Record<string, { en: string; ar: string }> = {
    '/': { en: 'Dashboard', ar: 'لوحة القيادة' },
    '/pos': { en: 'Point of Sale', ar: 'نقطة البيع' },
    '/menu': { en: 'Menu Manager', ar: 'إدارة المنيو' },
    '/inventory': { en: 'Inventory', ar: 'المخزون' },
    '/reports': { en: 'Reports & Analytics', ar: 'التقارير والتحليلات' },
    '/crm': { en: 'CRM', ar: 'إدارة العملاء' },
    '/hr': { en: 'HR & People', ar: 'الموارد البشرية' },
    '/finance': { en: 'Finance', ar: 'المالية' },
    '/dispatch': { en: 'Logistics', ar: 'اللوجستيات' },
    '/marketing': { en: 'Campaign Hub', ar: 'حملات النمو' },
    '/whatsapp': { en: 'WhatsApp Hub', ar: 'واتساب' },
    '/settings': { en: 'Settings', ar: 'الإعدادات' },
    '/admin': { en: 'Admin Panel', ar: 'لوحة المسؤول' },
    '/admin-dashboard': { en: 'Admin Dashboard', ar: 'لوحة الإدارة' },
    '/refunds': { en: 'Refund Manager', ar: 'إدارة المرتجعات' },
    '/wastage': { en: 'Wastage Control', ar: 'إدارة الهدر' },
    '/inventory-intelligence': { en: 'Inventory Intelligence', ar: 'ذكاء المخزون' },
    '/approvals': { en: 'Approval Center', ar: 'مركز الموافقات' },
    '/platforms': { en: 'Platforms', ar: 'المنصات' },
    '/day-close': { en: 'Day Close', ar: 'إقفال اليوم' },
    '/kds': { en: 'Kitchen Display', ar: 'شاشة المطبخ' },
    '/recipes': { en: 'Recipe Manager', ar: 'إدارة الوصفات' },
    '/ai-insights': { en: 'AI Insights', ar: 'رؤى الذكاء الاصطناعي' },
    '/ai-assistant': { en: 'AI Assistant', ar: 'المساعد الذكي' },
    '/call-center': { en: 'Call Center', ar: 'مركز الاتصال' },
    '/franchise': { en: 'Multi-Branch', ar: 'إدارة الفروع' },
    '/forensics': { en: 'Forensics', ar: 'التحليل الجنائي' },
    '/fiscal': { en: 'Fiscal Compliance', ar: 'الامتثال الضريبي' },
    '/production': { en: 'Production', ar: 'الإنتاج' },
    '/login': { en: 'Login', ar: 'تسجيل الدخول' },
};

const APP_NAME = 'Coduis Zen';

export const usePageTitle = () => {
    const location = useLocation();
    const lang = useAuthStore(state => state.settings.language) || 'en';

    useEffect(() => {
        const path = '/' + (location.pathname.split('/')[1] || '');
        const title = TITLES[path];
        const pageTitle = title ? (lang === 'ar' ? title.ar : title.en) : '';
        document.title = pageTitle ? `${pageTitle} — ${APP_NAME}` : APP_NAME;
    }, [location.pathname, lang]);
};

export default usePageTitle;
