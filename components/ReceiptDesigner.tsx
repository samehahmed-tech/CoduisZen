import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    Receipt, GripVertical, Plus, Trash2, Eye, Save, Copy, Edit3,
    Printer as PrinterIcon, QrCode, Image, Type, AlignCenter,
    ChevronDown, ChevronUp, ToggleLeft, ToggleRight, X, Check,
    ArrowLeft, FileText, LayoutTemplate, Link2
} from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import { useToast } from './Toast';
import { useConfirm } from './common/ConfirmProvider';
import { AppSettings, OrderType } from '../types';

// ?? Receipt Block Types ??

type BlockType =
    | 'header'      // Restaurant name, branch, address, phone
    | 'title'       // Receipt title (e.g. "Sales Receipt" / "Kitchen Ticket")
    | 'orderInfo'   // Order #, type, date/time
    | 'customerInfo' // Customer name, phone, table, address
    | 'items'       // Items table
    | 'totals'      // Subtotal, discount, tax, total
    | 'payment'     // Payment method badge
    | 'qrCode'      // QR code
    | 'logo'        // Logo image
    | 'footer'      // Thank you message
    | 'separator'   // Dashed line separator
    | 'customText'; // Custom text block

interface ReceiptBlock {
    id: string;
    type: BlockType;
    enabled: boolean;
    label: string;
    labelAr: string;
    config: Record<string, any>;
}

interface ReceiptTemplate {
    id: string;
    name: string;
    nameAr: string;
    type: 'receipt' | 'kitchen';
    blocks: ReceiptBlock[];
    fontSize: 'small' | 'normal' | 'large';
    paperWidth: '58mm' | '80mm';
    showLogo: boolean;
    linkedPrinterIds: string[];
    linkedDepartments: string[];
    isDefault: boolean;
    createdAt: string;
    styleVariant?: 'classic' | 'compact' | 'bold';
}

// ?? Default block definitions ??

const BLOCK_CATALOG: Record<BlockType, { icon: any; label: string; labelAr: string; defaultConfig: Record<string, any> }> = {
    header: { icon: AlignCenter, label: 'Restaurant Header', labelAr: 'رأس المطعم', defaultConfig: { showBranch: true, showAddress: true, showPhone: true } },
    title: { icon: Type, label: 'Receipt Title', labelAr: 'عنوان الإيصال', defaultConfig: { text: 'Sales Receipt', textAr: 'إيصال بيع' } },
    orderInfo: { icon: FileText, label: 'Order Info', labelAr: 'بيانات الطلب', defaultConfig: { showOrderNum: true, showType: true, showDate: true, showTime: true } },
    customerInfo: { icon: FileText, label: 'Customer / Table', labelAr: 'العميل / الطاولة', defaultConfig: { showTable: true, showCustomer: true, showPhone: true, showAddress: true } },
    items: { icon: FileText, label: 'Items Table', labelAr: 'جدول الأصناف', defaultConfig: { showModifiers: true, showNotes: true, showPrice: true, showQty: true } },
    totals: { icon: FileText, label: 'Totals Section', labelAr: 'قسم الإجمالي', defaultConfig: { showSubtotal: true, showDiscount: true, showTax: true, showTotal: true, showTip: true } },
    payment: { icon: FileText, label: 'Payment Method', labelAr: 'طريقة الدفع', defaultConfig: { style: 'badge' } },
    qrCode: { icon: QrCode, label: 'QR Code', labelAr: 'كود QR', defaultConfig: { url: '', imageUrl: '', size: 80 } },
    logo: { icon: Image, label: 'Logo Image', labelAr: 'صورة اللوجو', defaultConfig: { url: '', maxHeight: 60 } },
    footer: { icon: Type, label: 'Footer Message', labelAr: 'رسالة الختام', defaultConfig: { text: 'Thank you for your visit!', textAr: 'شكراً لزيارتكم!', showTaxId: true, showPoweredBy: true } },
    separator: { icon: FileText, label: 'Separator Line', labelAr: 'خط فاصل', defaultConfig: { style: 'dashed' } },
    customText: { icon: Type, label: 'Custom Text', labelAr: 'نص مخصص', defaultConfig: { text: '', textAr: '', alignment: 'center', bold: false, fontSize: 12 } },
};

const createBlock = (type: BlockType, overrides?: Partial<ReceiptBlock>): ReceiptBlock => {
    const catalog = BLOCK_CATALOG[type];
    return {
        id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type,
        enabled: true,
        label: catalog.label,
        labelAr: catalog.labelAr,
        config: { ...catalog.defaultConfig },
        ...overrides,
    };
};

const DEFAULT_RECEIPT_BLOCKS: BlockType[] = [
    'logo', 'header', 'separator', 'title', 'orderInfo', 'customerInfo',
    'separator', 'items', 'separator', 'totals', 'payment', 'separator', 'footer', 'qrCode'
];

const DEFAULT_KITCHEN_BLOCKS: BlockType[] = [
    'title', 'orderInfo', 'customerInfo', 'separator', 'items', 'separator', 'footer'
];

const createDefaultTemplate = (type: 'receipt' | 'kitchen'): ReceiptTemplate => ({
    id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: type === 'receipt' ? 'Default Receipt' : 'Kitchen Ticket',
    nameAr: type === 'receipt' ? 'الإيصال الافتراضي' : 'تذكرة المطبخ',
    type,
    blocks: (type === 'receipt' ? DEFAULT_RECEIPT_BLOCKS : DEFAULT_KITCHEN_BLOCKS).map(bt =>
        createBlock(bt, bt === 'title' && type === 'kitchen'
            ? { config: { ...BLOCK_CATALOG.title.defaultConfig, text: 'KITCHEN TICKET', textAr: 'تذكرة المطبخ' } }
            : undefined)
    ),
    fontSize: type === 'kitchen' ? 'large' : 'normal',
    paperWidth: '80mm',
    showLogo: type === 'receipt',
    linkedPrinterIds: [],
    linkedDepartments: [],
    isDefault: true,
    createdAt: new Date().toISOString(),
    styleVariant: 'classic',
});

const createReceiptPresets = (): ReceiptTemplate[] => {
    const createPreset = (config: {
        id: string;
        name: string;
        nameAr: string;
        styleVariant: 'classic' | 'compact' | 'bold';
        fontSize: 'small' | 'normal' | 'large';
        blockTypes: BlockType[];
    }): ReceiptTemplate => ({
        ...createDefaultTemplate('receipt'),
        id: config.id,
        name: config.name,
        nameAr: config.nameAr,
        styleVariant: config.styleVariant,
        fontSize: config.fontSize,
        isDefault: config.styleVariant === 'classic',
        blocks: config.blockTypes.map(type => createBlock(type, type === 'separator'
            ? { config: { ...BLOCK_CATALOG.separator.defaultConfig, style: config.styleVariant === 'compact' ? 'dashed' : 'solid' } }
            : undefined)),
    });

    return [
        createPreset({ id: 'preset_receipt_classic_80', name: 'Classic Ledger 80mm', nameAr: 'دفتر كلاسيك 80mm', styleVariant: 'classic', fontSize: 'normal', blockTypes: DEFAULT_RECEIPT_BLOCKS }),
        createPreset({ id: 'preset_receipt_compact_80', name: 'Counter Compact 80mm', nameAr: 'كاونتر مختصر 80mm', styleVariant: 'compact', fontSize: 'small', blockTypes: [
            'logo', 'header', 'orderInfo', 'items', 'totals', 'qrCode', 'footer',
        ] }),
        createPreset({ id: 'preset_receipt_bold_80', name: 'Bold Order Ticket 80mm', nameAr: 'تذكرة طلب بارزة 80mm', styleVariant: 'bold', fontSize: 'large', blockTypes: [
            'logo', 'header', 'separator', 'title', 'orderInfo', 'customerInfo', 'separator',
            'items', 'separator', 'totals', 'payment', 'qrCode', 'footer',
        ] }),
    ];
};

// ?? Storage helpers ??

const STORAGE_KEY = 'coduiszen_receipt_templates';
const PRESET_VERSION_KEY = 'coduiszen_receipt_presets_version';
const PRESET_VERSION = '3';

const loadTemplates = (remoteTemplates?: ReceiptTemplate[]): ReceiptTemplate[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const savedTemplates: ReceiptTemplate[] = remoteTemplates?.length ? remoteTemplates : (raw ? JSON.parse(raw) : []);
        if (localStorage.getItem(PRESET_VERSION_KEY) === PRESET_VERSION) return savedTemplates;

        const presetTemplates = createReceiptPresets();
        const existingIds = new Set(savedTemplates.map(template => template.id));
        const templates = savedTemplates.length
            ? [...savedTemplates, ...presetTemplates.filter(template => !existingIds.has(template.id)).map(template => ({ ...template, isDefault: false }))]
            : [...presetTemplates, createDefaultTemplate('kitchen')];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
        localStorage.setItem(PRESET_VERSION_KEY, PRESET_VERSION);
        return templates;
    } catch { /* ignore */ }
    return [...createReceiptPresets(), createDefaultTemplate('kitchen')];
};

const saveTemplates = (templates: ReceiptTemplate[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
};

// ?? Main Component ??

const ReceiptDesigner: React.FC = () => {
    const { settings, printers, updateSettings } = useAuthStore();
    const lang = settings.language;
    const isAr = lang === 'ar';
    const { showToast } = useToast();
    const { confirm } = useConfirm();

    const [templates, setTemplates] = useState<ReceiptTemplate[]>(() => loadTemplates(settings.receiptTemplates as ReceiptTemplate[] | undefined));
    const [activeTemplateId, setActiveTemplateId] = useState<string>(templates[0]?.id || '');
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    const [showAddBlock, setShowAddBlock] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [previewMode, setPreviewMode] = useState<'rich' | 'raw'>('rich');

    // Drag state
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const [dragActive, setDragActive] = useState(false);

    const activeTemplate = templates.find(t => t.id === activeTemplateId) || templates[0];
    const receiptTemplates = templates.filter(template => template.type === 'receipt');
    const orderTypeOptions = [
        { value: OrderType.DINE_IN, en: 'Dine-in', ar: 'الصالة' },
        { value: OrderType.TAKEAWAY, en: 'Takeaway', ar: 'تيك أواي' },
        { value: OrderType.DELIVERY, en: 'Delivery', ar: 'دليفري' },
        { value: OrderType.PICKUP, en: 'Pickup', ar: 'استلام عميل' },
        { value: OrderType.KIOSK, en: 'Kiosk', ar: 'كشك الطلب الذاتي' },
    ];

    const setDefaultReceiptTemplate = (templateId: string) => {
        const next = templates.map(template => ({
            ...template,
            isDefault: template.type === 'receipt' ? template.id === templateId : template.isDefault,
        }));
        setTemplates(next);
        saveTemplates(next);
        updateSettings({ receiptTemplates: next, defaultReceiptTemplateId: templateId });
        showToast(isAr ? 'تم تعيين شيك المبيعات الافتراضي' : 'Default sales receipt updated', 'success');
    };

    const setOrderTypeTemplate = (orderType: OrderType, templateId: string) => {
        updateSettings({
            receiptTemplateByOrderType: {
                ...(settings.receiptTemplateByOrderType || {}),
                [orderType]: templateId || undefined,
            },
        });
    };

    const persistTemplates = useCallback((next: ReceiptTemplate[]) => {
        saveTemplates(next);
        updateSettings({ receiptTemplates: next });
    }, [updateSettings]);

    useEffect(() => {
        const remote = settings.receiptTemplates as ReceiptTemplate[] | undefined;
        if (!Array.isArray(remote) || remote.length === 0 || JSON.stringify(remote) === JSON.stringify(templates)) return;
        saveTemplates(remote);
        setTemplates(remote);
        if (!remote.some(template => template.id === activeTemplateId)) setActiveTemplateId(remote[0].id);
    }, [settings.receiptTemplates]);

    const updateTemplate = useCallback((updater: (t: ReceiptTemplate) => ReceiptTemplate) => {
        setTemplates(prev => {
            const next = prev.map(t => t.id === activeTemplateId ? updater(t) : t);
            persistTemplates(next);
            return next;
        });
    }, [activeTemplateId, persistTemplates]);

    // ?? Drag & Drop ??

    const handleDragStart = (idx: number) => {
        dragItem.current = idx;
        setDragActive(true);
    };

    const handleDragEnter = (idx: number) => {
        dragOverItem.current = idx;
    };

    const handleDragEnd = () => {
        if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
            updateTemplate(t => {
                const blocks = [...t.blocks];
                const [removed] = blocks.splice(dragItem.current!, 1);
                blocks.splice(dragOverItem.current!, 0, removed);
                return { ...t, blocks };
            });
        }
        dragItem.current = null;
        dragOverItem.current = null;
        setDragActive(false);
    };

    const toggleBlock = (blockId: string) => {
        updateTemplate(t => ({
            ...t,
            blocks: t.blocks.map(b => b.id === blockId ? { ...b, enabled: !b.enabled } : b)
        }));
    };

    const removeBlock = async (blockId: string) => {
        const block = activeTemplate?.blocks.find(b => b.id === blockId);
        const ok = await confirm({
            title: isAr ? 'حذف البلوك؟' : 'Remove block?',
            message: isAr
                ? `سيتم حذف ${block?.labelAr || block?.label || 'هذا البلوك'} من القالب.`
                : `${block?.label || 'This block'} will be removed from the template.`,
            confirmText: isAr ? 'حذف' : 'Remove',
            cancelText: isAr ? 'إلغاء' : 'Cancel',
            variant: 'danger',
        });
        if (!ok) return;
        updateTemplate(t => ({ ...t, blocks: t.blocks.filter(b => b.id !== blockId) }));
    };

    const addBlock = (type: BlockType) => {
        updateTemplate(t => ({ ...t, blocks: [...t.blocks, createBlock(type)] }));
        setShowAddBlock(false);
    };

    const updateBlockConfig = (blockId: string, key: string, value: any) => {
        updateTemplate(t => ({
            ...t,
            blocks: t.blocks.map(b => b.id === blockId ? { ...b, config: { ...b.config, [key]: value } } : b)
        }));
    };

    const moveBlock = (idx: number, direction: 'up' | 'down') => {
        updateTemplate(t => {
            const blocks = [...t.blocks];
            const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
            if (targetIdx < 0 || targetIdx >= blocks.length) return t;
            [blocks[idx], blocks[targetIdx]] = [blocks[targetIdx], blocks[idx]];
            return { ...t, blocks };
        });
    };

    // ?? Template management ??

    const addNewTemplate = (type: 'receipt' | 'kitchen') => {
        const newTpl = createDefaultTemplate(type);
        newTpl.isDefault = false;
        newTpl.name = type === 'receipt' ? `Receipt ${templates.filter(t => t.type === 'receipt').length + 1}` : `Kitchen ${templates.filter(t => t.type === 'kitchen').length + 1}`;
        newTpl.nameAr = type === 'receipt' ? `إيصال ${templates.filter(t => t.type === 'receipt').length + 1}` : `مطبخ ${templates.filter(t => t.type === 'kitchen').length + 1}`;
        setTemplates(prev => {
            const next = [...prev, newTpl];
            persistTemplates(next);
            return next;
        });
        setActiveTemplateId(newTpl.id);
    };

    const duplicateTemplate = () => {
        if (!activeTemplate) return;
        const dup: ReceiptTemplate = {
            ...JSON.parse(JSON.stringify(activeTemplate)),
            id: `tpl_${Date.now()}`,
            name: `${activeTemplate.name} (Copy)`,
            nameAr: `${activeTemplate.nameAr} (نسخة)`,
            isDefault: false,
            createdAt: new Date().toISOString(),
        };
        setTemplates(prev => {
            const next = [...prev, dup];
            persistTemplates(next);
            return next;
        });
        setActiveTemplateId(dup.id);
        showToast(isAr ? 'تم نسخ القالب' : 'Template duplicated', 'success');
    };

    const deleteTemplate = async (id: string) => {
        const template = templates.find(t => t.id === id);
        const ok = await confirm({
            title: isAr ? 'حذف القالب؟' : 'Delete template?',
            message: isAr
                ? `سيتم حذف ${template?.nameAr || template?.name || 'هذا القالب'} نهائياً.`
                : `${template?.name || 'This template'} will be deleted permanently.`,
            confirmText: isAr ? 'حذف' : 'Delete',
            cancelText: isAr ? 'إلغاء' : 'Cancel',
            variant: 'danger',
        });
        if (!ok) return;
        const remainingTemplates = templates.filter(templateEntry => templateEntry.id !== id);
        if (remainingTemplates.length === 0) remainingTemplates.push(createDefaultTemplate('receipt'));
        const fallbackReceiptId = remainingTemplates.find(templateEntry => templateEntry.type === 'receipt')?.id;
        const remainingMappings = Object.fromEntries(
            Object.entries(settings.receiptTemplateByOrderType || {}).filter(([, templateId]) => templateId !== id),
        ) as AppSettings['receiptTemplateByOrderType'];
        setTemplates(remainingTemplates);
        persistTemplates(remainingTemplates);
        updateSettings({
            defaultReceiptTemplateId: settings.defaultReceiptTemplateId === id ? fallbackReceiptId : settings.defaultReceiptTemplateId,
            receiptTemplateByOrderType: remainingMappings,
        });
        if (activeTemplateId === id) setActiveTemplateId(remainingTemplates[0].id);
        showToast(isAr ? 'تم حذف القالب' : 'Template deleted', 'success');
    };

    const startRename = (t: ReceiptTemplate) => {
        setRenamingId(t.id);
        setRenameValue(isAr ? t.nameAr : t.name);
    };

    const finishRename = () => {
        if (renamingId && renameValue.trim()) {
            setTemplates(prev => {
                const next = prev.map(t => t.id === renamingId
                    ? { ...t, [isAr ? 'nameAr' : 'name']: renameValue.trim() }
                    : t);
                persistTemplates(next);
                return next;
            });
        }
        setRenamingId(null);
    };

    const togglePrinterLink = (printerId: string) => {
        updateTemplate(t => ({
            ...t,
            linkedPrinterIds: t.linkedPrinterIds.includes(printerId)
                ? t.linkedPrinterIds.filter(id => id !== printerId)
                : [...t.linkedPrinterIds, printerId]
        }));
    };

    const DEPARTMENTS = ['CASHIER', 'KITCHEN', 'BAR', 'GRILL', 'SHAWARMA', 'DESSERT', 'OTHER'];

    const departmentLabel = (dept: string) => {
        const labels: Record<string, string> = {
            CASHIER: isAr ? 'الكاشير' : 'Cashier',
            KITCHEN: isAr ? 'المطبخ' : 'Kitchen',
            BAR: isAr ? 'المشروبات' : 'Bar',
            GRILL: isAr ? 'الشواية' : 'Grill',
            SHAWARMA: isAr ? 'الشاورما' : 'Shawarma',
            DESSERT: isAr ? 'الحلويات' : 'Dessert',
            OTHER: isAr ? 'أخرى' : 'Other'
        };
        return labels[dept] || dept;
    };

    const configLabel = (key: string) => {
        const labels: Record<string, string> = {
            showBranch: isAr ? 'إظهار الفرع' : 'Show branch',
            showAddress: isAr ? 'إظهار العنوان' : 'Show address',
            showPhone: isAr ? 'إظهار الهاتف' : 'Show phone',
            text: isAr ? 'النص الإنجليزي' : 'English text',
            textAr: isAr ? 'النص العربي' : 'Arabic text',
            showOrderNum: isAr ? 'إظهار رقم الطلب' : 'Show order number',
            showType: isAr ? 'إظهار نوع الطلب' : 'Show order type',
            showDate: isAr ? 'إظهار التاريخ' : 'Show date',
            showTime: isAr ? 'إظهار الوقت' : 'Show time',
            showTable: isAr ? 'إظهار الطاولة' : 'Show table',
            showCustomer: isAr ? 'إظهار العميل' : 'Show customer',
            showModifiers: isAr ? 'إظهار الإضافات' : 'Show modifiers',
            showNotes: isAr ? 'إظهار الملاحظات' : 'Show notes',
            showPrice: isAr ? 'إظهار السعر' : 'Show price',
            showQty: isAr ? 'إظهار الكمية' : 'Show quantity',
            showSubtotal: isAr ? 'إظهار المجموع الفرعي' : 'Show subtotal',
            showDiscount: isAr ? 'إظهار الخصم' : 'Show discount',
            showTax: isAr ? 'إظهار الضريبة' : 'Show tax',
            showTotal: isAr ? 'إظهار الإجمالي' : 'Show total',
            showTip: isAr ? 'إظهار الخدمة' : 'Show tip',
            showTaxId: isAr ? 'إظهار الرقم الضريبي' : 'Show tax ID',
            showPoweredBy: isAr ? 'إظهار اسم النظام' : 'Show system credit',
            style: isAr ? 'النمط' : 'Style',
            url: isAr ? 'الرابط' : 'URL',
            imageUrl: isAr ? 'رابط الصورة' : 'Image URL',
            size: isAr ? 'الحجم' : 'Size',
            maxHeight: isAr ? 'أقصى ارتفاع' : 'Max height',
            alignment: isAr ? 'المحاذاة' : 'Alignment',
            bold: isAr ? 'خط عريض' : 'Bold',
            fontSize: isAr ? 'حجم الخط' : 'Font size'
        };
        return labels[key] || key.replace(/([A-Z])/g, ' $1');
    };

    const toggleDepartment = (dept: string) => {
        updateTemplate(t => ({
            ...t,
            linkedDepartments: t.linkedDepartments.includes(dept)
                ? t.linkedDepartments.filter(d => d !== dept)
                : [...t.linkedDepartments, dept]
        }));
    };

    // ?? Render Block Preview ??

    const renderBlockPreview = (block: ReceiptBlock) => {
        if (!block.enabled) return null;
        const sampleName = settings.restaurantName || 'Coduis Zen';
        switch (block.type) {
            case 'logo':
                return (
                    <div style={{ textAlign: 'center', padding: '6px 0' }}>
                        {block.config.url
                            ? <img src={block.config.url} alt="logo" style={{ maxHeight: block.config.maxHeight || 60, margin: '0 auto' }} />
                            : <div style={{ width: 60, height: 40, background: '#eee', borderRadius: 8, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#999' }}>LOGO</div>
                        }
                    </div>
                );
            case 'header':
                return (
                    <div style={{ textAlign: 'center', paddingBottom: 6, borderBottom: '2px solid #111' }}>
                        <div style={{ fontSize: 18, fontWeight: 900 }}>{sampleName}</div>
                        {block.config.showBranch && <div style={{ fontSize: 10, fontWeight: 700, color: '#555' }}>{isAr ? 'الفرع الرئيسي' : 'Main Branch'}</div>}
                        {block.config.showAddress && settings.branchAddress && <div style={{ fontSize: 9, color: '#888' }}>{settings.branchAddress}</div>}
                        {block.config.showPhone && settings.phone && <div style={{ fontSize: 9, color: '#888' }}>{isAr ? 'هاتف' : 'Tel'}: {settings.phone}</div>}
                    </div>
                );
            case 'title':
                return (
                    <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5, padding: '5px 0', border: '1px dashed #999', borderRadius: 3, background: '#f5f5f5', margin: '4px 0' }}>
                        {isAr ? (block.config.textAr || block.config.text) : block.config.text}
                    </div>
                );
            case 'orderInfo':
                return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 10, borderBottom: '1px dashed #ccc' }}>
                        {block.config.showOrderNum && <span><strong>{isAr ? 'طلب' : 'Order'} #1042</strong></span>}
                        {block.config.showType && <span style={{ background: '#111', color: '#fff', padding: '1px 6px', borderRadius: 8, fontSize: 8, fontWeight: 700 }}>{isAr ? 'صالة' : 'Dine-In'}</span>}
                        {block.config.showDate && <span style={{ fontSize: 9, color: '#666' }}>18 Mar · 21:00</span>}
                    </div>
                );
            case 'customerInfo':
                return (
                    <div style={{ padding: '3px 0', fontSize: 10, fontWeight: 600 }}>
                        {block.config.showTable && <div>{isAr ? 'طاولة' : 'Table'}: <strong>5</strong></div>}
                        {block.config.showCustomer && <div>{isAr ? 'العميل: أحمد محمد' : 'Customer: Ahmed M.'}</div>}
                    </div>
                );
            case 'items':
                return (
                    <div style={{ fontSize: 10, padding: '4px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px solid #222', paddingBottom: 2, fontSize: 8, fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>
                            <span>{isAr ? 'الصنف' : 'Item'}</span>
                            <span>{isAr ? 'الكمية' : 'Qty'}</span>
                            {block.config.showPrice && <span>{isAr ? 'المبلغ' : 'Total'}</span>}
                        </div>
                        {[
                            { name: isAr ? 'شاورما لحمة' : 'Beef Shawarma', qty: 2, total: '120.00' },
                            { name: isAr ? 'فتوش' : 'Fattoush', qty: 1, total: '45.00' },
                        ].map((item, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dashed #eee', fontWeight: 600 }}>
                                <span style={{ fontWeight: 700 }}>{item.name}</span>
                                <span>{item.qty}</span>
                                {block.config.showPrice && <span style={{ fontWeight: 700 }}>{item.total}</span>}
                            </div>
                        ))}
                        {block.config.showModifiers && <div style={{ fontSize: 8, color: '#666', paddingRight: 8 }}>+ {isAr ? 'صلصة حارة' : 'Hot sauce'}</div>}
                        {block.config.showNotes && <div style={{ fontSize: 8, color: '#999', fontStyle: 'italic' }}>{isAr ? 'ملاحظة: بدون بصل' : 'Note: No onions'}</div>}
                    </div>
                );
            case 'totals':
                return (
                    <div style={{ fontSize: 10, padding: '4px 0' }}>
                        {block.config.showSubtotal && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 600, color: '#444' }}><span>{isAr ? 'المجموع الفرعي' : 'Subtotal'}</span><span>165.00</span></div>}
                        {block.config.showTax && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 600, color: '#444' }}><span>{isAr ? 'الضريبة' : 'Tax'}</span><span>23.10</span></div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', background: '#111', color: '#fff', borderRadius: 4, fontWeight: 900, fontSize: 14, marginTop: 4 }}>
                            <span>{isAr ? 'الإجمالي' : 'TOTAL'}</span>
                            <span>EGP 188.10</span>
                        </div>
                    </div>
                );
            case 'payment':
                return (
                    <div style={{ textAlign: 'center', padding: '4px 0' }}>
                        <span style={{ display: 'inline-block', padding: '2px 12px', border: '1.5px solid #333', borderRadius: 14, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>
                            {isAr ? 'الدفع: كاش' : 'Paid: Cash'}
                        </span>
                    </div>
                );
            case 'qrCode':
                const qrPreviewSize = block.config.size || 80;
                const qrImageUrl = block.config.imageUrl || (block.config.url ? `https://api.qrserver.com/v1/create-qr-code/?size=${qrPreviewSize}x${qrPreviewSize}&data=${encodeURIComponent(block.config.url)}` : '');
                return (
                    <div style={{ textAlign: 'center', padding: '6px 0' }}>
                        {qrImageUrl ? (
                            <img src={qrImageUrl} alt="QR" style={{ width: qrPreviewSize, height: qrPreviewSize, objectFit: 'contain', margin: '0 auto', border: '1px solid #ddd', borderRadius: 8, padding: 4, background: '#fff' }} />
                        ) : (
                            <div style={{ width: qrPreviewSize, height: qrPreviewSize, background: '#f0f0f0', border: '2px solid #ddd', borderRadius: 8, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                                QR
                            </div>
                        )}
                        <div style={{ fontSize: 7, color: '#aaa', marginTop: 2 }}>{isAr ? 'امسح للتقييم' : 'Scan to rate'}</div>
                    </div>
                );
            case 'footer':
                return (
                    <div style={{ textAlign: 'center', paddingTop: 6, borderTop: '2px solid #111' }}>
                        <div style={{ fontSize: 11, fontWeight: 800 }}>{isAr ? (block.config.textAr || 'شكراً لزيارتكم!') : (block.config.text || 'Thank you!')}</div>
                        {block.config.showPoweredBy && <div style={{ fontSize: 7, color: '#ccc', marginTop: 4 }}>Powered by Coduis Zen</div>}
                    </div>
                );
            case 'separator':
                return (
                    <hr style={{ border: 'none', borderTop: block.config.style === 'solid' ? '2px solid #222' : '1px dashed #bbb', margin: '4px 0' }} />
                );
            case 'customText':
                return (
                    <div style={{ textAlign: block.config.alignment || 'center', fontSize: block.config.fontSize || 12, fontWeight: block.config.bold ? 800 : 400, padding: '3px 0' }}>
                        {isAr ? (block.config.textAr || block.config.text || '—') : (block.config.text || '—')}
                    </div>
                );
            default:
                return <div style={{ padding: 4, fontSize: 10, color: '#999' }}>{block.type}</div>;
        }
    };

    // ?? Render Raw (ESC/POS) Preview ??
    const renderRawBlockPreview = (block: ReceiptBlock) => {
        if (!block.enabled) return null;
        const cfg = block.config || {};
        
        switch (block.type) {
            case 'logo':
                return null; // Thermal printers usually don't print rich logos easily without special configs
            case 'header':
                return (
                    <div style={{ textAlign: 'center', marginBottom: 6 }}>
                        <div style={{ fontSize: 14, fontWeight: 900 }}>{settings.restaurantName || (isAr ? 'المطعم' : 'Restaurant')}</div>
                        {cfg.showBranch && <div style={{ fontWeight: 700 }}>{isAr ? 'الفرع الرئيسي' : 'Main Branch'}</div>}
                        {cfg.showAddress && settings.branchAddress && <div style={{ fontSize: 10 }}>{settings.branchAddress}</div>}
                        {cfg.showPhone && settings.phone && <div style={{ fontSize: 10 }}>{isAr ? 'هاتف' : 'Tel'}: {settings.phone}</div>}
                    </div>
                );
            case 'title':
                return (
                    <div style={{ textAlign: 'center', margin: '4px 0' }}>
                        <div>================================</div>
                        <div style={{ fontSize: 14, fontWeight: 'bold' }}>{isAr ? (cfg.textAr || cfg.text || 'إيصال بيع') : (cfg.text || 'Sales Receipt')}</div>
                        <div>================================</div>
                    </div>
                );
            case 'orderInfo':
                return (
                    <div style={{ margin: '4px 0' }}>
                        {cfg.showOrderNum && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{isAr ? 'طلب' : 'Order'} #1042</span><span>{cfg.showDate ? '18 Mar 2026' : ''}</span></div>}
                        {cfg.showType && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{isAr ? 'صالة' : 'Dine-In'}</span><span>{cfg.showTime ? '21:00' : ''}</span></div>}
                    </div>
                );
            case 'customerInfo':
                return (
                    <div style={{ margin: '4px 0' }}>
                        {cfg.showTable && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{isAr ? 'طاولة' : 'Table'}</span><span>5</span></div>}
                        {cfg.showCustomer && <div>{isAr ? 'العميل: أحمد محمد' : 'Customer: Ahmed M.'}</div>}
                        {cfg.showPhone && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{isAr ? 'هاتف' : 'Phone'}</span><span>01000000000</span></div>}
                    </div>
                );
            case 'items':
                return (
                    <div style={{ margin: '4px 0' }}>
                        <div>--------------------------------</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}><span>{isAr ? 'الصنف' : 'Item'}</span><span>{isAr ? 'المبلغ' : 'Amount'}</span></div>
                        <div>--------------------------------</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', overflow: 'hidden', whiteSpace: 'nowrap' }}><span>{isAr ? '2x شاورما لحمة' : '2x Beef Shawarma'}</span><span>240.00</span></div>
                        {cfg.showModifiers && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>  + {isAr ? 'صلصة حارة' : 'Hot sauce'}</span><span></span></div>}
                        {cfg.showNotes && <div>  * {isAr ? 'بدون بصل' : 'No onions'}</div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', overflow: 'hidden', whiteSpace: 'nowrap' }}><span>{isAr ? '1x فتوش' : '1x Fattoush'}</span><span>45.00</span></div>
                    </div>
                );
            case 'totals':
                return (
                    <div style={{ margin: '4px 0' }}>
                        <div>================================</div>
                        {cfg.showSubtotal && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{isAr ? 'المجموع الفرعي' : 'Subtotal'}</span><span>285.00</span></div>}
                        {cfg.showTax && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{isAr ? 'الضريبة' : 'Tax'}</span><span>39.90</span></div>}
                        <div>--------------------------------</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}><span>{isAr ? 'الإجمالي' : 'TOTAL'}</span><span>EGP 324.90</span></div>
                        <div>================================</div>
                    </div>
                );
            case 'payment':
                return <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}><span>{isAr ? 'الدفع' : 'Payment'}</span><span>{isAr ? 'كاش' : 'Cash'}</span></div>;
            case 'qrCode':
                const url = cfg.url || (settings as any).receiptQrUrl || '';
                if (!url) return null;
                return <div style={{ textAlign: 'center', margin: '4px 0' }}><div>--- {isAr ? 'رابط QR' : 'Web QR Link'} ---</div><div>{url}</div></div>;
            case 'footer':
                return (
                    <div style={{ textAlign: 'center', margin: '4px 0' }}>
                        <div>================================</div>
                        <div style={{ fontWeight: 'bold', fontSize: 13 }}>{isAr ? (cfg.textAr || cfg.text || 'شكرا لزيارتكم!') : (cfg.text || 'Thank you!')}</div>
                        {cfg.showTaxId && <div>{isAr ? 'رقم ضريبي' : 'TIN'}: 123-456-789</div>}
                        {cfg.showPoweredBy && <div style={{ marginTop: 4 }}>Powered by Coduis Zen</div>}
                    </div>
                );
            case 'separator':
                return <div style={{ overflow: 'hidden' }}>{cfg.style === 'solid' ? '====================================' : '------------------------------------'}</div>;
            case 'customText':
                return <div style={{ textAlign: cfg.alignment === 'right' ? 'right' : cfg.alignment === 'left' ? 'left' : 'center', fontWeight: cfg.bold ? 'bold' : 'normal' }}>{cfg.text}</div>;
            default:
                return null;
        }
    };

    // ?? Block Settings Panel ??

    const renderBlockSettings = (block: ReceiptBlock) => {
        const configs = Object.entries(block.config);
        return (
            <div className="space-y-3 p-4 bg-elevated/50 rounded-2xl border border-border/50 mt-2 animate-fade-up">
                {configs.map(([key, value]) => {
                    if (typeof value === 'boolean') {
                        return (
                            <label key={key} className="flex items-center justify-between cursor-pointer group">
                                <span className="text-[10px] font-bold text-muted uppercase tracking-widest">{configLabel(key)}</span>
                                <button
                                    type="button"
                                    onClick={() => updateBlockConfig(block.id, key, !value)}
                                    aria-label={`${value ? (isAr ? 'إيقاف' : 'Disable') : (isAr ? 'تشغيل' : 'Enable')} ${configLabel(key)}`}
                                    title={`${value ? (isAr ? 'إيقاف' : 'Disable') : (isAr ? 'تشغيل' : 'Enable')} ${configLabel(key)}`}
                                    className={`w-10 h-5 rounded-full transition-all flex items-center ${value ? 'bg-primary justify-end' : 'bg-slate-300 dark:bg-slate-600 justify-start'}`}
                                >
                                    <div className="w-4 h-4 bg-white rounded-full shadow mx-0.5" />
                                </button>
                            </label>
                        );
                    }
                    if (key === 'style' && block.type === 'separator') {
                        return (
                            <div key={key} className="flex gap-2">
                                {['dashed', 'solid'].map(s => (
                                    <button key={s} onClick={() => updateBlockConfig(block.id, key, s)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${value === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted'}`}>
                                        {s === 'dashed' ? (isAr ? 'متقطع' : 'Dashed') : (isAr ? 'متصل' : 'Solid')}
                                    </button>
                                ))}
                            </div>
                        );
                    }
                    if (key === 'alignment') {
                        return (
                            <div key={key} className="flex gap-2">
                                {['left', 'center', 'right'].map(a => (
                                    <button key={a} onClick={() => updateBlockConfig(block.id, key, a)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${value === a ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted'}`}>
                                        {a === 'left' ? (isAr ? 'يسار' : 'Left') : a === 'center' ? (isAr ? 'وسط' : 'Center') : (isAr ? 'يمين' : 'Right')}
                                    </button>
                                ))}
                            </div>
                        );
                    }
                    if (typeof value === 'number') {
                        return (
                            <div key={key} className="space-y-1">
                                <label className="text-[10px] font-bold text-muted uppercase tracking-widest">{configLabel(key)}</label>
                                <input type="number" value={value} onChange={e => updateBlockConfig(block.id, key, Number(e.target.value))}
                                    className="w-full p-3 bg-app border border-border rounded-xl text-main font-bold text-xs focus:border-primary outline-none" />
                            </div>
                        );
                    }
                    if (typeof value === 'string') {
                        return (
                            <div key={key} className="space-y-1">
                                <label className="text-[10px] font-bold text-muted uppercase tracking-widest">{configLabel(key)}</label>
                                <input type="text" value={value} onChange={e => updateBlockConfig(block.id, key, e.target.value)}
                                    className="w-full p-3 bg-app border border-border rounded-xl text-main font-bold text-xs focus:border-primary outline-none"
                                    placeholder={key.includes('Ar') ? 'النص بالعربي...' : (isAr ? 'ادخل النص...' : 'Enter text...')}
                                    dir={key.includes('Ar') ? 'rtl' : 'ltr'} />
                            </div>
                        );
                    }
                    return null;
                })}
            </div>
        );
    };

    if (!activeTemplate) return null;

    return (
        <div className="page-shell pb-32 animate-fade-up">
            {/* ?? Page Header ?? */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-border pb-8 mb-8">
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-amber-500/10 text-amber-500 rounded-[2rem] shadow-inner">
                        <LayoutTemplate size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-main uppercase tracking-tight">
                            {isAr ? 'مصمم الشيكات' : 'Receipt Designer'}
                        </h1>
                        <p className="text-[10px] font-bold text-muted uppercase tracking-[0.2em] mt-1">
                            {isAr ? 'صمم وخصص شكل الإيصالات وتذاكر المطبخ' : 'Design and customize receipt and kitchen ticket layouts'}
                        </p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={duplicateTemplate} className="px-5 py-3 bg-card border border-border rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted hover:text-primary hover:border-primary/50 transition-all flex items-center gap-2">
                        <Copy size={14} /> {isAr ? 'نسخ القالب' : 'Duplicate'}
                    </button>
                    <button onClick={() => showToast(isAr ? 'تم حفظ التصميم' : 'Design saved', 'success')} className="px-6 py-3 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 shadow-xl shadow-primary/30 hover:bg-primary/90 transition-all">
                        <Save size={14} /> {isAr ? 'حفظ' : 'Save'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* ??? LEFT: Template List ??? */}
                <div className="lg:col-span-3 space-y-3">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">{isAr ? 'القوالب' : 'Templates'}</h3>
                    </div>

                    {templates.map(tpl => (
                        <div key={tpl.id}
                            className={`p-4 rounded-2xl border cursor-pointer transition-all group ${tpl.id === activeTemplateId
                                ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                                : 'border-border bg-card hover:border-primary/30 hover:shadow-md'
                                }`}
                            onClick={() => setActiveTemplateId(tpl.id)}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black ${tpl.type === 'receipt' ? 'bg-amber-500' : 'bg-blue-500'}`}>
                                        {tpl.type === 'receipt' ? <Receipt size={14} /> : <FileText size={14} />}
                                    </div>
                                    {renamingId === tpl.id ? (
                                        <input
                                            value={renameValue}
                                            onChange={e => setRenameValue(e.target.value)}
                                            onBlur={finishRename}
                                            onKeyDown={e => e.key === 'Enter' && finishRename()}
                                            autoFocus
                                            className="text-xs font-bold bg-transparent border-b border-primary outline-none text-main w-24"
                                            onClick={e => e.stopPropagation()}
                                        />
                                    ) : (
                                        <div>
                                            <p className="text-xs font-black text-main leading-tight">{isAr ? tpl.nameAr : tpl.name}</p>
                                            <p className="text-[8px] font-bold text-muted uppercase tracking-widest mt-0.5">
                                                {tpl.type === 'receipt' ? (isAr ? 'إيصال' : 'Receipt') : (isAr ? 'مطبخ' : 'Kitchen')}
                                                {tpl.linkedPrinterIds.length > 0 && ` · ${tpl.linkedPrinterIds.length} ${isAr ? 'طابعة' : 'printers'}`}
                                            </p>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); startRename(tpl); }}
                                        className="p-1.5 rounded-lg hover:bg-elevated text-muted hover:text-primary"
                                        aria-label={isAr ? `إعادة تسمية ${tpl.nameAr || tpl.name}` : `Rename ${tpl.name}`}
                                        title={isAr ? 'إعادة تسمية' : 'Rename'}
                                    >
                                        <Edit3 size={12} />
                                    </button>
                                    {!tpl.isDefault && (
                                        <button
                                            type="button"
                                            onClick={e => { e.stopPropagation(); deleteTemplate(tpl.id); }}
                                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-500"
                                            aria-label={isAr ? `حذف ${tpl.nameAr || tpl.name}` : `Delete ${tpl.name}`}
                                            title={isAr ? 'حذف' : 'Delete'}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Add Template Buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                        <button onClick={() => addNewTemplate('receipt')} className="p-3 border-2 border-dashed border-border rounded-2xl text-[9px] font-black uppercase tracking-widest text-muted hover:text-amber-500 hover:border-amber-500/50 transition-all flex flex-col items-center gap-1">
                            <Plus size={14} />
                            {isAr ? 'إيصال' : 'Receipt'}
                        </button>
                        <button onClick={() => addNewTemplate('kitchen')} className="p-3 border-2 border-dashed border-border rounded-2xl text-[9px] font-black uppercase tracking-widest text-muted hover:text-blue-500 hover:border-blue-500/50 transition-all flex flex-col items-center gap-1">
                            <Plus size={14} />
                            {isAr ? 'مطبخ' : 'Kitchen'}
                        </button>
                    </div>

                    {/* Link Printers */}
                    <div className="mt-4 p-4 bg-card border border-border rounded-2xl">
                        <button onClick={() => setShowLinkModal(true)} className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted hover:text-primary transition-all">
                            <Link2 size={14} />
                            {isAr ? 'ربط بطابعة / قسم' : 'Link Printer / Dept'}
                        </button>
                    </div>

                    {/* Template Settings */}
                    <div className="p-4 bg-card border border-border rounded-2xl space-y-4">
                        <h4 className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">{isAr ? 'إعدادات القالب' : 'Template Settings'}</h4>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[9px] font-bold text-muted uppercase tracking-widest">{isAr ? 'حجم الخط' : 'Font Size'}</label>
                                <div className="flex gap-2 mt-1">
                                    {(['small', 'normal', 'large'] as const).map(s => (
                                        <button key={s} onClick={() => updateTemplate(t => ({ ...t, fontSize: s }))}
                                            className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${activeTemplate.fontSize === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted'}`}>
                                            {s === 'small' ? (isAr ? 'صغير' : 'S') : s === 'normal' ? (isAr ? 'عادي' : 'M') : (isAr ? 'كبير' : 'L')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-muted uppercase tracking-widest">{isAr ? 'عرض الورق' : 'Paper Width'}</label>
                                <div className="flex gap-2 mt-1">
                                    {(['58mm', '80mm'] as const).map(w => (
                                        <button key={w} onClick={() => updateTemplate(t => ({ ...t, paperWidth: w }))}
                                            className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${activeTemplate.paperWidth === w ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted'}`}>
                                            {w}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {activeTemplate.type === 'receipt' && (
                        <div className="p-4 bg-card border border-border rounded-2xl space-y-4">
                            <div>
                                <h4 className="text-[10px] font-black text-main uppercase tracking-[0.16em]">
                                    {isAr ? 'قوالب البيع الافتراضية' : 'Sales receipt defaults'}
                                </h4>
                                <p className="mt-1 text-[9px] font-bold text-muted">
                                    {isAr ? 'النوع الخاص يتغلب على الافتراضي العام.' : 'An order-type template overrides the general default.'}
                                </p>
                            </div>
                            <label className="block space-y-1">
                                <span className="text-[9px] font-black text-muted">{isAr ? 'الافتراضي العام' : 'General default'}</span>
                                <select
                                    value={settings.defaultReceiptTemplateId || receiptTemplates.find(template => template.isDefault)?.id || ''}
                                    onChange={(event) => setDefaultReceiptTemplate(event.target.value)}
                                    className="w-full rounded-xl border border-border bg-app p-2.5 text-[10px] font-black text-main outline-none focus:border-primary"
                                >
                                    {receiptTemplates.map(template => <option key={template.id} value={template.id}>{isAr ? template.nameAr : template.name}</option>)}
                                </select>
                            </label>
                            {orderTypeOptions.map(option => (
                                <label key={option.value} className="block space-y-1">
                                    <span className="text-[9px] font-black text-muted">{isAr ? option.ar : option.en}</span>
                                    <select
                                        value={settings.receiptTemplateByOrderType?.[option.value] || ''}
                                        onChange={(event) => setOrderTypeTemplate(option.value, event.target.value)}
                                        className="w-full rounded-xl border border-border bg-app p-2.5 text-[10px] font-black text-main outline-none focus:border-primary"
                                    >
                                        <option value="">{isAr ? 'استخدام الافتراضي العام' : 'Use general default'}</option>
                                        {receiptTemplates.map(template => <option key={template.id} value={template.id}>{isAr ? template.nameAr : template.name}</option>)}
                                    </select>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* ??? CENTER: Block Builder ??? */}
                <div className="lg:col-span-5 space-y-2">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">{isAr ? 'مكونات الإيصال' : 'Receipt Blocks'}</h3>
                        <button onClick={() => setShowAddBlock(true)}
                            className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all flex items-center gap-1.5">
                            <Plus size={12} /> {isAr ? 'إضافة' : 'Add Block'}
                        </button>
                    </div>

                    {activeTemplate.blocks.map((block, idx) => {
                        const catalogItem = BLOCK_CATALOG[block.type];
                        const IconComp = catalogItem?.icon || FileText;
                        return (
                            <div
                                key={block.id}
                                draggable
                                onDragStart={() => handleDragStart(idx)}
                                onDragEnter={() => handleDragEnter(idx)}
                                onDragEnd={handleDragEnd}
                                onDragOver={e => e.preventDefault()}
                                className={`p-4 rounded-2xl border transition-all ${dragActive && dragItem.current === idx ? 'opacity-50 border-primary scale-[0.97]' : ''
                                    } ${block.enabled
                                        ? 'bg-card border-border hover:border-primary/30 hover:shadow-md'
                                        : 'bg-slate-100 dark:bg-slate-800/30 border-border/30 opacity-60'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    {/* Drag Handle */}
                                    <div className="cursor-grab active:cursor-grabbing text-muted hover:text-primary transition-colors">
                                        <GripVertical size={16} />
                                    </div>

                                    {/* Icon */}
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs ${block.enabled ? 'bg-primary/10 text-primary' : 'bg-slate-200 dark:bg-slate-700 text-muted'}`}>
                                        <IconComp size={13} />
                                    </div>

                                    {/* Label */}
                                    <span className="text-xs font-bold text-main flex-1">
                                        {isAr ? block.labelAr : block.label}
                                    </span>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1">
                                        <button type="button" onClick={() => moveBlock(idx, 'up')} disabled={idx === 0} aria-label={isAr ? `تحريك ${block.labelAr} لأعلى` : `Move ${block.label} up`} title={isAr ? 'تحريك لأعلى' : 'Move up'} className="p-1 rounded-lg hover:bg-elevated text-muted hover:text-primary disabled:opacity-30"><ChevronUp size={13} /></button>
                                        <button type="button" onClick={() => moveBlock(idx, 'down')} disabled={idx === activeTemplate.blocks.length - 1} aria-label={isAr ? `تحريك ${block.labelAr} لأسفل` : `Move ${block.label} down`} title={isAr ? 'تحريك لأسفل' : 'Move down'} className="p-1 rounded-lg hover:bg-elevated text-muted hover:text-primary disabled:opacity-30"><ChevronDown size={13} /></button>
                                        <button type="button" onClick={() => toggleBlock(block.id)} aria-label={block.enabled ? (isAr ? `إخفاء ${block.labelAr}` : `Disable ${block.label}`) : (isAr ? `إظهار ${block.labelAr}` : `Enable ${block.label}`)} title={block.enabled ? (isAr ? 'إخفاء' : 'Disable') : (isAr ? 'إظهار' : 'Enable')} className={`p-1 rounded-lg transition-colors ${block.enabled ? 'text-primary hover:bg-primary/10' : 'text-muted hover:bg-elevated'}`}>
                                            {block.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                        </button>
                                        <button type="button" onClick={() => setEditingBlockId(editingBlockId === block.id ? null : block.id)} aria-label={isAr ? `تعديل ${block.labelAr}` : `Edit ${block.label}`} title={isAr ? 'تعديل' : 'Edit'} className="p-1 rounded-lg hover:bg-elevated text-muted hover:text-primary">
                                            <Edit3 size={13} />
                                        </button>
                                        <button type="button" onClick={() => removeBlock(block.id)} aria-label={isAr ? `حذف ${block.labelAr}` : `Remove ${block.label}`} title={isAr ? 'حذف' : 'Remove'} className="p-1 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-500">
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>

                                {/* Block Settings */}
                                {editingBlockId === block.id && renderBlockSettings(block)}
                            </div>
                        );
                    })}
                </div>

                {/* ??? RIGHT: Live Preview ??? */}
                <div className="lg:col-span-4">
                    <div className="sticky top-6">
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                                <Eye size={14} className="text-muted" />
                                <h3 className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">{isAr ? 'معاينة مباشرة' : 'Live Preview'}</h3>
                            </div>
                            <div className="flex items-center bg-elevated rounded-xl p-0.5 border border-border">
                                <button 
                                    onClick={() => setPreviewMode('rich')}
                                    className={`px-2 py-1 text-[9px] font-black tracking-widest uppercase rounded-lg transition-all ${previewMode === 'rich' ? 'bg-primary text-white shadow-md' : 'text-muted hover:text-main'}`}
                                >
                                    {isAr ? 'بصري' : 'Graphical'}
                                </button>
                                <button 
                                    onClick={() => setPreviewMode('raw')}
                                    className={`px-2 py-1 text-[9px] font-black tracking-widest uppercase rounded-lg transition-all ${previewMode === 'raw' ? 'bg-[#111] dark:bg-white dark:text-black text-white shadow-md' : 'text-muted hover:text-main'}`}
                                >
                                    {isAr ? 'نصي' : 'Raw Text'}
                                </button>
                            </div>
                        </div>
                        <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-2xl p-0 overflow-hidden"
                            style={{ maxWidth: activeTemplate.paperWidth === '58mm' ? 220 : 300, margin: '0 auto' }}>
                            {/* Paper Header Effect */}
                            <div className="h-3 bg-gradient-to-b from-slate-100 to-white" />
                            <div
                                dir={previewMode === 'rich' && isAr ? 'rtl' : 'ltr'}
                                style={{
                                    fontFamily: previewMode === 'raw' ? "'Courier New', Courier, monospace" : "'Cairo', system-ui, sans-serif",
                                    padding: '8px 12px',
                                    fontSize: previewMode === 'raw' ? (activeTemplate.paperWidth === '58mm' ? 9.5 : 10.5) : (activeTemplate.fontSize === 'small' ? 10 : activeTemplate.fontSize === 'large' ? 14 : 12),
                                    color: '#1a1a1a',
                                    lineHeight: previewMode === 'raw' ? 1.2 : 1.4,
                                }}
                            >
                                {activeTemplate.blocks.filter(b => b.enabled).map(block => (
                                    <div key={block.id}>{previewMode === 'raw' ? renderRawBlockPreview(block) : renderBlockPreview(block)}</div>
                                ))}
                            </div>
                            {/* Paper Tear Effect */}
                            <div className="h-6" style={{
                                background: 'repeating-linear-gradient(90deg, transparent, transparent 4px, #e5e7eb 4px, #e5e7eb 8px)',
                                maskImage: 'linear-gradient(to bottom, white 0%, transparent 100%)',
                                WebkitMaskImage: 'linear-gradient(to bottom, white 0%, transparent 100%)',
                            }} />
                        </div>

                        {/* Linked Info */}
                        {(activeTemplate.linkedPrinterIds.length > 0 || activeTemplate.linkedDepartments.length > 0) && (
                            <div className="mt-4 p-3 bg-card border border-border rounded-xl">
                                <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-2">{isAr ? 'مرتبط بـ' : 'Linked to'}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {activeTemplate.linkedPrinterIds.map(pid => {
                                        const printer = printers.find(p => p.id === pid);
                                        return printer ? (
                                            <span key={pid} className="px-2 py-1 bg-amber-500/10 text-amber-600 rounded-lg text-[9px] font-bold">{isAr ? 'طابعة' : 'Printer'}: {printer.name}</span>
                                        ) : null;
                                    })}
                                    {activeTemplate.linkedDepartments.map(dept => (
                                        <span key={dept} className="px-2 py-1 bg-blue-500/10 text-blue-600 rounded-lg text-[9px] font-bold">{departmentLabel(dept)}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ??? Add Block Modal ??? */}
            {showAddBlock && (
                <div className="fixed inset-0 bg-black/50  flex items-center justify-center z-50" onClick={() => setShowAddBlock(false)}>
                    <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black text-main">{isAr ? 'إضافة مكون' : 'Add Block'}</h3>
                            <button type="button" onClick={() => setShowAddBlock(false)} className="p-2 rounded-xl hover:bg-elevated text-muted" aria-label={isAr ? 'إغلاق إضافة المكونات' : 'Close add block'} title={isAr ? 'إغلاق' : 'Close'}><X size={18} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {(Object.entries(BLOCK_CATALOG) as [BlockType, typeof BLOCK_CATALOG[BlockType]][]).map(([type, info]) => (
                                <button key={type} onClick={() => addBlock(type)}
                                    className="p-4 bg-elevated rounded-2xl flex flex-col items-center gap-2 border border-transparent hover:border-primary hover:bg-primary/5 transition-all group">
                                    <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <info.icon size={18} />
                                    </div>
                                    <span className="text-[10px] font-black text-main uppercase tracking-tight">{isAr ? info.labelAr : info.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ??? Link Printer/Dept Modal ??? */}
            {showLinkModal && (
                <div className="fixed inset-0 bg-black/50  flex items-center justify-center z-50" onClick={() => setShowLinkModal(false)}>
                    <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-black text-main">{isAr ? 'ربط القالب' : 'Link Template'}</h3>
                            <button type="button" onClick={() => setShowLinkModal(false)} className="p-2 rounded-xl hover:bg-elevated text-muted" aria-label={isAr ? 'إغلاق الربط' : 'Close linking'} title={isAr ? 'إغلاق' : 'Close'}><X size={18} /></button>
                        </div>

                        {/* Printers */}
                        <div className="mb-6">
                            <h4 className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-3">{isAr ? 'الطابعات' : 'Printers'}</h4>
                            <div className="space-y-2">
                                {printers.length === 0 && (
                                    <p className="text-xs text-muted italic">{isAr ? 'لا توجد طابعات مضافة' : 'No printers configured'}</p>
                                )}
                                {printers.map(p => (
                                    <button key={p.id} onClick={() => togglePrinterLink(p.id)}
                                        className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all ${activeTemplate.linkedPrinterIds.includes(p.id) ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                                            }`}>
                                        <div className="flex items-center gap-3">
                                            <PrinterIcon size={16} className={activeTemplate.linkedPrinterIds.includes(p.id) ? 'text-primary' : 'text-muted'} />
                                            <div className="text-left">
                                                <p className="text-xs font-black text-main">{p.name}</p>
                                                <p className="text-[9px] text-muted font-bold uppercase">{p.role || '—'} · {p.address}</p>
                                            </div>
                                        </div>
                                        {activeTemplate.linkedPrinterIds.includes(p.id) && <Check size={16} className="text-primary" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Departments */}
                        <div>
                            <h4 className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-3">{isAr ? 'الأقسام' : 'Departments'}</h4>
                            <div className="flex flex-wrap gap-2">
                                {DEPARTMENTS.map(dept => (
                                    <button key={dept} onClick={() => toggleDepartment(dept)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${activeTemplate.linkedDepartments.includes(dept) ? 'border-blue-500 bg-blue-500/10 text-blue-600' : 'border-border text-muted hover:border-blue-300'
                                            }`}>
                                        {departmentLabel(dept)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button onClick={() => { setShowLinkModal(false); showToast(isAr ? 'تم تحديث الربط' : 'Links updated', 'success'); }}
                            className="w-full mt-6 py-3 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-primary/90 transition-all">
                            {isAr ? 'تم' : 'Done'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReceiptDesigner;
