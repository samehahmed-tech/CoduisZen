import React, { useState, useMemo, useCallback } from 'react';
import { 
    Download, Upload, Plus, Trash2, Edit3, Save, Search, 
    ArrowRightLeft, FileText, Sparkles, Filter, ChevronDown, Check
} from 'lucide-react';
import { MenuItem, PriceBook, Branch, DeliveryPlatform } from '../../types';
import { useToast } from '../common/ToastProvider';

interface Props {
    allItems: (MenuItem & { _categoryId: string; _categoryName: string; _categoryNameAr?: string })[];
    branches: Branch[];
    platforms: DeliveryPlatform[];
    lang: string;
    currency: string;
}

const exportCSV = (headers: string[], rows: (string | number)[][], filename: string) => {
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

const PricingEngine: React.FC<Props> = ({ allItems, branches, platforms, lang, currency }) => {
    const { error } = useToast();
    const [priceBooks, setPriceBooks] = useState<PriceBook[]>([
        { id: 'pb-1', name: 'Alexandria Branches', nameAr: 'تسعير إسكندرية', type: 'BRANCH', isActive: true, itemPrices: {}, markupPercentage: 0, targetIds: [] },
        { id: 'pb-2', name: 'Talabat Integration', nameAr: 'تسعير منصة طلبات', type: 'PLATFORM', isActive: true, itemPrices: {}, markupPercentage: 15, targetIds: [] },
    ]);
    const [selectedBookId, setSelectedBookId] = useState<string>('pb-1');
    const [searchQuery, setSearchQuery] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [importData, setImportData] = useState('');
    const [showNewBookModal, setShowNewBookModal] = useState(false);
    const [showTargetsModal, setShowTargetsModal] = useState(false);
    const [newBookFormat, setNewBookFormat] = useState({ name: '', nameAr: '', markup: 0, type: 'BRANCH' });

    const activeBook = priceBooks.find(pb => pb.id === selectedBookId);

    const updateActiveBook = (changes: Partial<PriceBook>) => {
        setPriceBooks(prev => prev.map(pb => pb.id === selectedBookId ? { ...pb, ...changes } : pb));
    };

    const handlePriceChange = (itemId: string, val: string) => {
        if (!activeBook) return;
        const num = parseFloat(val);
        const newPrices = { ...activeBook.itemPrices };
        if (isNaN(num)) delete newPrices[itemId];
        else newPrices[itemId] = num;
        updateActiveBook({ itemPrices: newPrices });
    };

    const handleApplyGlobalMarkup = () => {
        if (!activeBook || !activeBook.markupPercentage) return;
        const newPrices = { ...activeBook.itemPrices };
        const multiplier = 1 + (activeBook.markupPercentage / 100);
        
        allItems.forEach(item => {
            if (item.price > 0 && !newPrices[item.id]) {
                newPrices[item.id] = parseFloat((item.price * multiplier).toFixed(2));
            }
        });
        updateActiveBook({ itemPrices: newPrices });
    };

    const handleExport = useCallback(() => {
        if (!activeBook) return;
        const headers = ['Item ID', 'Name', 'Name (AR)', 'Base Price', 'Cost', 'Custom Price', 'Margin %'];
        const rows = allItems.map(item => {
            const customPrice = activeBook.itemPrices[item.id] !== undefined ? activeBook.itemPrices[item.id] : item.price;
            const margin = item.cost && customPrice > 0 ? ((customPrice - item.cost) / customPrice * 100).toFixed(1) : '';
            return [
                item.id, item.name, item.nameAr || '', item.price, item.cost || '', customPrice, margin
            ];
        });
        exportCSV(headers, rows, `PriceBook_${activeBook.name.replace(/\s+/g, '_')}`);
    }, [activeBook, allItems]);

    const handleImport = useCallback(() => {
        if (!importData.trim() || !activeBook) return;
        try {
            const lines = importData.trim().split('\n');
            const newPrices = { ...activeBook.itemPrices };
            // Skip header
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
                const itemId = cols[0];
                const newPrice = parseFloat(cols[5]);
                if (itemId && !isNaN(newPrice)) {
                    newPrices[itemId] = newPrice;
                }
            }
            updateActiveBook({ itemPrices: newPrices });
            setShowImport(false);
            setImportData('');
        } catch {
            error(lang === 'ar' ? 'تعذر استيراد الأسعار' : 'Failed to import prices');
        }
    }, [importData, activeBook, error, lang]);

    const handleCreateNewBook = () => {
        if (!newBookFormat.name.trim()) return;
        const newId = `pb-${Date.now()}`;
        const newBook: PriceBook = {
            id: newId,
            name: newBookFormat.name,
            nameAr: newBookFormat.nameAr,
            type: newBookFormat.type as any,
            isActive: true,
            itemPrices: {},
            markupPercentage: newBookFormat.markup || 0,
            targetIds: []
        };
        setPriceBooks(prev => [...prev, newBook]);
        setSelectedBookId(newId);
        setShowNewBookModal(false);
        setNewBookFormat({ name: '', nameAr: '', markup: 0, type: 'BRANCH' });
    };

    const filteredItems = useMemo(() => {
        if (!searchQuery) return allItems;
        const q = searchQuery.toLowerCase();
        return allItems.filter(i => 
            i.name.toLowerCase().includes(q) || 
            (i.nameAr && i.nameAr.toLowerCase().includes(q)) ||
            (i._categoryName && i._categoryName.toLowerCase().includes(q))
        );
    }, [allItems, searchQuery]);

    const inputCls = "w-full bg-elevated/50 rounded-lg border border-border/30 h-10 px-3 text-[13px] text-main outline-none focus:border-indigo-500/50 transition-all font-medium font-mono";

    return (
        <div className="flex flex-col h-full bg-app overflow-hidden">
            <div className="bg-card border-b border-border/30 px-6 py-5 shrink-0">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-main tracking-tight flex items-center gap-3">
                            <Sparkles className="text-indigo-500" />
                            {lang === 'ar' ? 'هندسة التسعير المركزي (Price Books)' : 'Pricing Engine'}
                        </h1>
                        <p className="text-[13px] text-muted mt-1.5 font-medium max-w-xl">
                            {lang === 'ar' ? 'أنشئ قوائم أسعار مخصصة للفروع أو المنصات وعدلها بسرعة فائقة أو صدرها لملف إكسيل.' : 'Manage centralized price books for specific branches or platforms with bulk spreadsheet editing capabilities.'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 mt-6 overflow-x-auto no-scrollbar pb-1">
                    {priceBooks.map(pb => (
                        <button
                            key={pb.id}
                            onClick={() => setSelectedBookId(pb.id)}
                            className={`px-5 py-2.5 rounded-xl font-bold text-[13px] transition-all whitespace-nowrap border flex items-center gap-2
                                ${selectedBookId === pb.id 
                                    ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20 shadow-inner' 
                                    : 'bg-elevated/40 text-muted border-border/30 hover:bg-elevated hover:text-main'}`}
                        >
                            {selectedBookId === pb.id && <Check size={14}/>}
                            {lang === 'ar' ? 'قائمة: ' + (pb.nameAr || pb.name) : 'Book: ' + pb.name}
                        </button>
                    ))}
                    <button 
                        onClick={() => setShowNewBookModal(true)}
                        className="px-4 py-2.5 rounded-xl border-2 border-dashed border-border/50 text-muted hover:text-indigo-500 hover:border-indigo-500/30 transition-all ml-2 rtl:mr-2 flex items-center justify-center shrink-0"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            {activeBook && (
                <div className="flex-1 flex flex-col p-6 overflow-hidden">
                    <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mb-6 bg-elevated/30 p-4 rounded-2xl border border-border/30">
                        <div className="flex items-center gap-4 flex-1">
                            <div className="relative w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/50" />
                                <input 
                                    type="text" 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder={lang === 'ar' ? 'بحث في الأصناف...' : 'Search items...'}
                                    className="w-full bg-card h-11 pl-10 pr-4 rounded-xl border border-border/30 text-[13px] font-medium outline-none focus:border-indigo-500/50"
                                />
                            </div>
                            <div className="flex items-center gap-2 border-l rtl:border-r rtl:border-l-0 border-border/50 pl-4 rtl:pr-4 h-8">
                                <span className="text-[12px] font-black uppercase text-muted tracking-widest">{lang === 'ar' ? 'قاعدة الرفع' : 'Auto Markup'}</span>
                                <div className="relative flex items-center">
                                    <input 
                                        type="number"
                                        value={activeBook.markupPercentage || ""}
                                        onChange={e => updateActiveBook({ markupPercentage: parseFloat(e.target.value) || 0 })}
                                        className="w-16 h-8 bg-card border border-border/40 rounded-lg text-center text-[12px] font-black focus:border-indigo-500 outline-none"
                                    />
                                    <span className="absolute right-2 rtl:left-2 rtl:right-auto text-[10px] text-muted">%</span>
                                </div>
                                <button onClick={handleApplyGlobalMarkup} className="h-8 px-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-[11px] font-black transition-colors uppercase tracking-widest">
                                    {lang === 'ar' ? 'تطبيق للكل' : 'Apply All'}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button onClick={() => setShowTargetsModal(true)} className="h-11 px-4 rounded-xl font-bold text-xs uppercase tracking-widest bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-2">
                                <ArrowRightLeft size={16} /> {lang === 'ar' ? 'ربط القائمة' : 'Assign Targets'}
                                {activeBook.targetIds && activeBook.targetIds.length > 0 && (
                                    <span className="bg-indigo-500 text-white text-[10px] px-2 py-0.5 rounded-full ml-1">{activeBook.targetIds.length}</span>
                                )}
                            </button>
                            <div className="w-px h-6 bg-border/50 mx-1"></div>
                            <button onClick={() => setShowImport(true)} className="h-11 px-4 rounded-xl font-bold text-xs uppercase tracking-widest bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-2">
                                <Upload size={16} /> {lang === 'ar' ? 'استيراد' : 'Import'}
                            </button>
                            <button onClick={handleExport} className="h-11 px-4 rounded-xl font-black text-xs uppercase tracking-widest bg-elevated border border-border/50 text-main hover:bg-card hover:shadow-md transition-all flex items-center gap-2">
                                <FileText size={16} className="text-emerald-500" /> {lang === 'ar' ? 'تصدير إكسيل' : 'Export Excel'}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden flex flex-col">
                        <div className="grid grid-cols-[1fr_minmax(120px,1fr)_120px_120px_160px] gap-4 p-4 border-b border-border/30 bg-elevated/40 text-[11px] font-black uppercase tracking-widest text-muted">
                            <div>{lang === 'ar' ? 'الصنف' : 'Item Name'}</div>
                            <div>{lang === 'ar' ? 'القسم' : 'Category'}</div>
                            <div className="text-center">{lang === 'ar' ? 'السعر الأصلي' : 'Base Price'}</div>
                            <div className="text-center">{lang === 'ar' ? 'سعر القائمة' : 'Custom Price'}</div>
                            <div className="text-center">{lang === 'ar' ? 'الهامش المتوقع' : 'Projected Margin'}</div>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                            {filteredItems.map((item, idx) => {
                                const customPrice = activeBook.itemPrices[item.id];
                                const activePrice = customPrice !== undefined ? customPrice : item.price;
                                const hasCustom = customPrice !== undefined;
                                const margin = item.cost && activePrice > 0 ? ((activePrice - item.cost) / activePrice * 100).toFixed(0) : "—";
                                
                                return (
                                    <div key={item.id} className={`grid grid-cols-[1fr_minmax(120px,1fr)_120px_120px_160px] gap-4 p-4 border-b border-border/20 items-center transition-colors hover:bg-elevated/20 ${idx % 2 === 0 ? 'bg-transparent' : 'bg-elevated/5'}`}>
                                        <div className="flex flex-col justify-center min-w-0">
                                            <span className="text-[13px] font-bold text-main truncate">{lang === 'ar' ? (item.nameAr || item.name) : item.name}</span>
                                        </div>
                                        <div className="flex items-center">
                                            <span className="text-[11px] font-bold px-2 py-1 bg-elevated border border-border/30 rounded-md text-muted truncate">
                                                {lang === 'ar' ? (item._categoryNameAr || item._categoryName) : item._categoryName}
                                            </span>
                                        </div>
                                        <div className="text-center">
                                            <span className="text-[13px] font-bold text-muted line-through opacity-70">
                                                {currency} {item.price.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary font-bold text-xs">{currency}</span>
                                            <input 
                                                type="number"
                                                value={customPrice !== undefined ? customPrice : ''}
                                                placeholder={item.price.toString()}
                                                onChange={e => handlePriceChange(item.id, e.target.value)}
                                                className={`w-full h-10 pl-8 pr-2 rounded-xl text-center text-[13px] font-black focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all 
                                                    ${hasCustom ? 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/30 shadow-inner' : 'bg-elevated/50 text-main border border-transparent hover:border-border/50 placeholder:text-main'}`}
                                            />
                                        </div>
                                        <div className="text-center flex justify-center">
                                           <span className={`text-[12px] font-black px-3 py-1 rounded-lg border ${margin !== "—" && parseFloat(margin) > 40 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : margin !== "—" && parseFloat(margin) > 15 ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                                              {margin}%
                                           </span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {showImport && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowImport(false)} />
                    <div className="relative w-full max-w-2xl bg-card rounded-3xl shadow-2xl border border-border/40 p-8 flex flex-col gap-6 animate-slide-up">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-main flex items-center gap-2">
                                    <Upload className="text-emerald-500" /> {lang === 'ar' ? 'استيراد الأسعار لتحديث القائمة' : 'Import Price Overrides'}
                                </h3>
                                <p className="text-[12px] font-bold text-muted uppercase tracking-widest mt-2">{lang === 'ar' ? 'تأكد من مطابقة الـ Item ID' : 'Ensure Item IDs match exactly'}</p>
                            </div>
                        </div>
                        <div className="bg-elevated/40 p-4 border border-dashed border-border/50 rounded-2xl">
                            <p className="text-[12px] font-mono text-muted mb-3 break-all">CSV Format: Item ID, Name, Name (AR), Base Price, Cost, <span className="text-emerald-500 font-bold">Custom Price</span>, Margin %</p>
                            <textarea
                                value={importData}
                                onChange={e => setImportData(e.target.value)}
                                placeholder="Paste your Excel/CSV data here..."
                                className="w-full h-40 bg-card rounded-xl border border-border/30 p-4 text-[13px] text-main outline-none focus:border-indigo-500/50 resize-none font-mono"
                            />
                        </div>
                        <div className="flex justify-end gap-3 mt-2">
                            <button onClick={() => setShowImport(false)} className="h-12 px-6 rounded-xl font-black text-xs uppercase tracking-widest text-muted hover:text-main hover:bg-elevated transition-colors">
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button onClick={handleImport} disabled={!importData.trim()} className="h-12 px-8 rounded-xl font-black text-xs uppercase tracking-widest bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20">
                                {lang === 'ar' ? 'تطبيق وإغلاق' : 'Import & Apply'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showNewBookModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowNewBookModal(false)} />
                    <div className="relative w-full max-w-lg bg-card rounded-3xl shadow-2xl border border-border/40 p-8 flex flex-col gap-6 animate-slide-up">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-black text-main flex items-center gap-2">
                                <Plus className="text-indigo-500" /> {lang === 'ar' ? 'إنشاء قائمة تسعير جديدة' : 'Create Price Book'}
                            </h3>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1.5 block">{lang === 'ar' ? 'اسم القائمة (عربي)' : 'Book Name (AR)'}</label>
                                <input type="text" value={newBookFormat.nameAr} onChange={e => setNewBookFormat({...newBookFormat, nameAr: e.target.value, name: newBookFormat.name || e.target.value })} className={inputCls} placeholder="مثال: أسعار فرع الساحل.." />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1.5 block">{lang === 'ar' ? 'الاسم (إنجليزي)' : 'Book Name'}</label>
                                <input type="text" value={newBookFormat.name} onChange={e => setNewBookFormat({...newBookFormat, name: e.target.value})} className={inputCls} placeholder="e.g. Sahel Branch Pricing.." />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1.5 block">{lang === 'ar' ? 'النوع' : 'Type'}</label>
                                    <select value={newBookFormat.type} onChange={e => setNewBookFormat({...newBookFormat, type: e.target.value})} className={inputCls}>
                                        <option value="BRANCH">{lang === 'ar' ? 'فروع (Branches)' : 'Branch Pricing'}</option>
                                        <option value="PLATFORM">{lang === 'ar' ? 'منصات (Platforms)' : 'Platform Delivery'}</option>
                                        <option value="CUSTOM">{lang === 'ar' ? 'عروض / أخرى' : 'Custom / Promo'}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest mb-1.5 block">{lang === 'ar' ? 'قاعدة رفع مبدئية %' : 'Auto Markup %'}</label>
                                    <input type="number" value={newBookFormat.markup || ""} onChange={e => setNewBookFormat({...newBookFormat, markup: parseFloat(e.target.value) || 0})} className={inputCls} placeholder="0%" />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-2">
                            <button onClick={() => setShowNewBookModal(false)} className="h-12 px-6 rounded-xl font-black text-xs uppercase tracking-widest text-muted hover:text-main hover:bg-elevated transition-colors">
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button onClick={handleCreateNewBook} disabled={!newBookFormat.name.trim()} className="h-12 px-8 rounded-xl font-black text-xs uppercase tracking-widest bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20">
                                {lang === 'ar' ? 'تأكيد وإنشاء' : 'Create Book'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showTargetsModal && activeBook && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowTargetsModal(false)} />
                    <div className="relative w-full max-w-lg bg-card rounded-3xl shadow-2xl border border-border/40 p-8 flex flex-col gap-6 animate-slide-up">
                        <div className="flex items-center justify-between border-b border-border/30 pb-4">
                            <h3 className="text-xl font-black text-main flex items-center gap-2">
                                <ArrowRightLeft className="text-indigo-500" /> 
                                {lang === 'ar' ? 'ربط القائمة بالفروع أو المنصات' : 'Assign Price Book'}
                            </h3>
                        </div>

                        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto no-scrollbar pb-4">
                            <p className="text-[13px] font-bold text-muted -mb-2">
                                {lang === 'ar' 
                                    ? `اختر الأماكن التي سيتم تطبيق قائمة "${activeBook.nameAr || activeBook.name}" عليها:` 
                                    : `Select where "${activeBook.name}" should be applied:`}
                            </p>
                            
                            {(activeBook.type === 'BRANCH' || activeBook.type === 'CUSTOM') && branches.length > 0 && (
                                <div className="space-y-2 mt-4">
                                    <h4 className="text-[11px] font-black uppercase tracking-widest text-emerald-500">{lang === 'ar' ? 'الفروع المتاحة' : 'Branches'}</h4>
                                    {branches.map(branch => {
                                        const isLinked = (activeBook.targetIds || []).includes(branch.id);
                                        return (
                                            <div key={branch.id} onClick={() => {
                                                const newTargets = isLinked ? (activeBook.targetIds || []).filter(id => id !== branch.id) : [...(activeBook.targetIds || []), branch.id];
                                                updateActiveBook({ targetIds: newTargets });
                                            }} className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer ${isLinked ? 'border-indigo-500 bg-indigo-500/5' : 'border-border/30 hover:bg-elevated/50'}`}>
                                                <span className="text-[13px] font-bold text-main">
                                                    {lang === 'ar' ? (branch.nameAr || branch.name) : branch.name}
                                                </span>
                                                <div className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 ${isLinked ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-border'}`}>
                                                    {isLinked && <Check size={14} />}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {(activeBook.type === 'PLATFORM' || activeBook.type === 'CUSTOM') && platforms.length > 0 && (
                                <div className="space-y-2 mt-4">
                                    <h4 className="text-[11px] font-black uppercase tracking-widest text-emerald-500">{lang === 'ar' ? 'المنصات المتاحة' : 'Platforms'}</h4>
                                    {platforms.map(plat => {
                                        const isLinked = (activeBook.targetIds || []).includes(plat.id);
                                        return (
                                            <div key={plat.id} onClick={() => {
                                                const newTargets = isLinked ? (activeBook.targetIds || []).filter(id => id !== plat.id) : [...(activeBook.targetIds || []), plat.id];
                                                updateActiveBook({ targetIds: newTargets });
                                            }} className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer ${isLinked ? 'border-indigo-500 bg-indigo-500/5' : 'border-border/30 hover:bg-elevated/50'}`}>
                                                <span className="text-[13px] font-bold text-main">{plat.name}</span>
                                                <div className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 ${isLinked ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-border'}`}>
                                                    {isLinked && <Check size={14} />}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {activeBook.type === 'PLATFORM' && platforms.length === 0 && (
                                <div className="p-4 bg-amber-500/10 text-amber-600 rounded-xl text-[12px] font-bold">
                                    {lang === 'ar' ? 'لا يوجد منصات توصيل مضافة حاليا! قم بإضافة منصة أولاً.' : 'No delivery platforms found! Add a platform first.'}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end pt-2">
                            <button onClick={() => setShowTargetsModal(false)} className="h-12 px-8 rounded-xl font-black text-xs uppercase tracking-widest bg-indigo-500 text-white hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20">
                                {lang === 'ar' ? 'تم' : 'Done'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PricingEngine;
