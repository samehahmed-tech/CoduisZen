import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';

const ROUTE_LABELS: Record<string, { en: string; ar: string }> = {
    '/': { en: 'Dashboard', ar: 'لوحة القيادة' },
    '/pos': { en: 'Point of Sale', ar: 'نقطة البيع' },
    '/menu': { en: 'Menu Manager', ar: 'إدارة المنيو' },
    '/inventory': { en: 'Inventory', ar: 'المخزون' },
    '/stock-requests': { en: 'Stock Requests', ar: 'الطلبيات المخزنية' },
    '/reports': { en: 'Reports', ar: 'التقارير' },
    '/crm': { en: 'CRM', ar: 'العملاء' },
    '/hr': { en: 'HR & People', ar: 'الموارد البشرية' },
    '/finance': { en: 'Finance', ar: 'المالية' },
    '/dispatch': { en: 'Logistics', ar: 'اللوجستيات' },
    '/marketing': { en: 'Marketing', ar: 'حملات النمو' },
    '/whatsapp': { en: 'WhatsApp Hub', ar: 'واتساب' },
    '/mail': { en: 'Staff Mail', ar: 'البريد الداخلي' },
    '/settings': { en: 'Settings', ar: 'الإعدادات' },
    '/admin': { en: 'Admin', ar: 'المسؤول' },
    '/refunds': { en: 'Refund Manager', ar: 'إدارة المرتجعات' },
    '/wastage': { en: 'Wastage Control', ar: 'إدارة الهدر' },
    '/inventory-intelligence': { en: 'Inventory Intelligence', ar: 'ذكاء المخزون' },
    '/approvals': { en: 'Approval Center', ar: 'مركز الموافقات' },
    '/platforms': { en: 'Platforms', ar: 'المنصات' },
    '/day-close': { en: 'Day Close', ar: 'إقفال اليوم' },
    '/setup': { en: 'Setup Wizard', ar: 'معالج الإعداد' },
};

const Breadcrumb: React.FC = () => {
    const location = useLocation();
    const { settings } = useAuthStore();
    const lang = settings.language || 'en';

    if (location.pathname === '/' || location.pathname === '/pos') return null;

    const segments = location.pathname.split('/').filter(Boolean);
    const crumbs = segments.map((_, i) => {
        const path = '/' + segments.slice(0, i + 1).join('/');
        const label = ROUTE_LABELS[path]?.[lang] || segments[i].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return { path, label };
    });

    return (
        <nav className="flex items-center gap-1.5 px-4 md:px-8 lg:px-10 pt-4 pb-0 text-[10px] font-bold uppercase tracking-widest">
            <Link to="/" className="text-muted hover:text-primary transition-colors flex items-center gap-1">
                <Home size={12} />
                <span className="hidden md:inline">{lang === 'ar' ? 'الرئيسية' : 'Home'}</span>
            </Link>
            {crumbs.map((crumb, i) => (
                <React.Fragment key={crumb.path}>
                    <ChevronRight size={10} className="text-muted/40" />
                    {i === crumbs.length - 1 ? (
                        <span className="text-main">{crumb.label}</span>
                    ) : (
                        <Link to={crumb.path} className="text-muted hover:text-primary transition-colors">{crumb.label}</Link>
                    )}
                </React.Fragment>
            ))}
        </nav>
    );
};

export default Breadcrumb;
