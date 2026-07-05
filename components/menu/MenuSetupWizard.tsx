import React, { useState, useCallback } from 'react';
import { 
    Plus, Upload, Download, ArrowRight, FileSpreadsheet, 
    Sparkles, UtensilsCrossed, CheckCircle2, ChevronRight,
    Loader2, X, AlertCircle, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { MenuItem, MenuCategory } from '../../types';

interface MenuSetupWizardProps {
    onComplete: (categories: MenuCategory[]) => void;
    onManualStart: () => void;
    selectedMenuId: string;
    lang: 'ar' | 'en';
}

const MenuSetupWizard: React.FC<MenuSetupWizardProps> = ({ onComplete, onManualStart, selectedMenuId, lang }) => {
    const [step, setStep] = useState<'WELCOME' | 'CHOOSE_METHOD' | 'EXCEL_IMPORT' | 'REVIEW'>('WELCOME');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewData, setPreviewData] = useState<MenuCategory[]>([]);

    const t = {
        welcomeTitle: lang === 'ar' ? 'أهلاً بك في ريستوفلو' : 'Welcome to Coduis Zen',
        welcomeSub: lang === 'ar' ? 'لنقم بإعداد المنيو الخاص بك في دقائق.' : 'Let’s set up your menu in minutes.',
        getStarted: lang === 'ar' ? 'ابدأ الإعداد' : 'Get Started',
        chooseTitle: lang === 'ar' ? 'كيف تود البدء؟' : 'How would you like to start?',
        chooseSub: lang === 'ar' ? 'اختر الطريقة التي تناسبك لتكويد المنيو.' : 'Choose the method that works best for you.',
        methodManual: lang === 'ar' ? 'إضافة يدوية' : 'Manual Entry',
        methodManualSub: lang === 'ar' ? 'أضف الأصناف واحداً تلو الآخر.' : 'Add items one by one manually.',
        methodExcel: lang === 'ar' ? 'استيراد من Excel' : 'Excel Import',
        methodExcelSub: lang === 'ar' ? 'ارفع ملف إكسل لسرعة الإنجاز.' : 'Upload an Excel file for speed.',
        methodAI: lang === 'ar' ? 'بناء ذكي (AI)' : 'Smart Build (AI)',
        methodAISub: lang === 'ar' ? 'سوف نقترح عليك قائمة بناءً على نشاطك.' : 'We’ll suggest a menu based on your business.',
        downloadTemplate: lang === 'ar' ? 'تحميل القالب' : 'Download Template',
        uploadFile: lang === 'ar' ? 'ارفع الملف' : 'Upload File',
        back: lang === 'ar' ? 'رجوع' : 'Back',
        confirm: lang === 'ar' ? 'تأكيد الاستيراد' : 'Confirm Import',
        itemsFound: lang === 'ar' ? 'صنفاً تم العثور عليها' : 'items found',
        categoriesFound: lang === 'ar' ? 'أقسام تم العثور عليها' : 'categories found',
    };

    // --- Template Generation ---
    const handleDownloadTemplate = () => {
        const headers = [
            ['Category Name', 'Category Name (Arabic)', 'Item Name', 'Item Name (Arabic)', 'Price', 'Cost', 'SKU', 'Barcode', 'Description'],
            ['Main Dish', 'أطباق رئيسية', 'Classic Burger', 'برجر كلاسيك', 120, 45, 'SKU-001', '123456789', 'Our signature beef burger'],
            ['Main Dish', 'أطباق رئيسية', 'Cheese Burger', 'تشيز برجر', 135, 50, 'SKU-002', '123456790', 'Classic with double cheese'],
            ['Drinks', 'مشروبات', 'Fresh Orange Juice', 'عصير برتقال فريش', 45, 10, 'DR-001', '', '100% natural']
        ];

        const ws = XLSX.utils.aoa_to_sheet(headers);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Menu Template");
        
        // Auto-size columns
        const colWidths = [20, 25, 25, 25, 10, 10, 15, 15, 30];
        ws['!cols'] = colWidths.map(w => ({ wch: w }));

        XLSX.writeFile(wb, `Coduis Zen_Menu_Template_${lang}.xlsx`);
    };

    // --- Excel Parsing ---
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        setError(null);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length === 0) {
                    throw new Error(lang === 'ar' ? 'الملف فارغ' : 'The file is empty');
                }

                // Process into MenuCategory[]
                const categoryMap: Record<string, MenuCategory> = {};

                data.forEach((row: any, index: number) => {
                    const catName = row['Category Name'] || row['اسم القسم'] || 'General';
                    const catNameAr = row['Category Name (Arabic)'] || row['اسم القسم (بالعربي)'];
                    const itemName = row['Item Name'] || row['اسم الصنف'];
                    
                    if (!itemName) return; // Skip rows without item name

                    if (!categoryMap[catName]) {
                        categoryMap[catName] = {
                            id: `cat-${Date.now()}-${Object.keys(categoryMap).length}`,
                            name: catName,
                            nameAr: catNameAr,
                            isActive: true,
                            menuIds: [selectedMenuId],
                            items: [],
                            sortOrder: Object.keys(categoryMap).length
                        };
                    }

                    const item: MenuItem = {
                        id: `item-${Date.now()}-${index}`,
                        name: itemName,
                        nameAr: row['Item Name (Arabic)'] || row['اسم الصنف (بالعربي)'],
                        description: row['Description'] || row['الوصف'],
                        price: parseFloat(row['Price'] || row['السعر']) || 0,
                        cost: parseFloat(row['Cost'] || row['التكلفة']) || 0,
                        sku: row['SKU'],
                        barcode: row['Barcode'] || row['الباركود'],
                        categoryId: categoryMap[catName].id,
                        isAvailable: true,
                        modifierGroups: [],
                        priceLists: [],
                        printerIds: [],
                        tags: []
                    };

                    categoryMap[catName].items.push(item);
                });

                setPreviewData(Object.values(categoryMap));
                setStep('REVIEW');
            } catch (err: any) {
                setError(err.message || 'Failed to parse file');
            } finally {
                setIsProcessing(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full bg-app/50 px-4 relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] -z-10" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] -z-10" />

            <AnimatePresence mode="wait">
                {step === 'WELCOME' && (
                    <motion.div 
                        key="welcome"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="text-center max-w-xl w-full"
                    >
                        <div className="w-20 h-20 mx-auto mb-8 rounded-[2rem] bg-indigo-500/10 flex items-center justify-center text-indigo-500 shadow-xl shadow-indigo-500/10">
                            <Sparkles size={40} className="animate-pulse" />
                        </div>
                        <h1 className="text-4xl font-black text-main mb-4 tracking-tight">
                            {t.welcomeTitle}
                        </h1>
                        <p className="text-lg text-muted/80 mb-10 leading-relaxed font-medium">
                            {t.welcomeSub}
                        </p>
                        <button
                            onClick={() => setStep('CHOOSE_METHOD')}
                            className="group bg-indigo-500 hover:bg-indigo-600 text-white px-10 py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3 mx-auto shadow-lg shadow-indigo-500/20"
                        >
                            {t.getStarted}
                            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </motion.div>
                )}

                {step === 'CHOOSE_METHOD' && (
                    <motion.div 
                        key="choose"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="w-full max-w-4xl"
                    >
                        <div className="text-center mb-12">
                            <h2 className="text-2xl font-bold text-main mb-2">{t.chooseTitle}</h2>
                            <p className="text-muted/60">{t.chooseSub}</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Manual Option */}
                            <button 
                                onClick={onManualStart}
                                className="group relative bg-card/40 hover:bg-card/60 border border-border/20 p-8 rounded-[2.5rem] text-center transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/5 hover:-translate-y-1"
                            >
                                <div className="w-14 h-14 mx-auto mb-6 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
                                    <UtensilsCrossed size={28} />
                                </div>
                                <h3 className="text-lg font-bold text-main mb-2">{t.methodManual}</h3>
                                <p className="text-sm text-muted/60 leading-relaxed">{t.methodManualSub}</p>
                            </button>

                            {/* Excel Option */}
                            <button 
                                onClick={() => setStep('EXCEL_IMPORT')}
                                className="group relative bg-card/60 hover:bg-indigo-500 border border-border/20 p-8 rounded-[2.5rem] text-center transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/20 hover:-translate-y-1"
                            >
                                <div className="w-14 h-14 mx-auto mb-6 rounded-2xl bg-indigo-500/10 group-hover:bg-white/20 flex items-center justify-center text-indigo-500 group-hover:text-white transition-all">
                                    <FileSpreadsheet size={28} />
                                </div>
                                <h3 className="text-lg font-bold text-main group-hover:text-white mb-2">{t.methodExcel}</h3>
                                <p className="text-sm text-muted/60 group-hover:text-white/80 leading-relaxed">{t.methodExcelSub}</p>
                                
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ChevronRight size={20} className="text-white" />
                                </div>
                            </button>

                            {/* AI Option */}
                            <button 
                                className="group relative bg-card/40 border border-border/10 p-8 rounded-[2.5rem] text-center opacity-60 cursor-not-allowed overflow-hidden"
                            >
                                <div className="w-14 h-14 mx-auto mb-6 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                    <Sparkles size={28} />
                                </div>
                                <h3 className="text-lg font-bold text-main mb-2">{t.methodAI}</h3>
                                <p className="text-sm text-muted/60 leading-relaxed">{t.methodAISub}</p>
                                <div className="absolute inset-0 bg-app/40 flex items-center justify-center">
                                    <span className="bg-emerald-500/20 text-emerald-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Soon</span>
                                </div>
                            </button>
                        </div>
                    </motion.div>
                )}

                {step === 'EXCEL_IMPORT' && (
                    <motion.div 
                        key="excel"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="w-full max-w-2xl bg-card border border-border/20 rounded-[2.5rem] p-10 shadow-2xl relative"
                    >
                        <button 
                            onClick={() => setStep('CHOOSE_METHOD')}
                            className="absolute top-6 left-6 p-2 rounded-full hover:bg-app text-muted transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <div className="text-center mb-10">
                            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                <Upload size={32} />
                            </div>
                            <h2 className="text-2xl font-bold text-main mb-2">{t.methodExcel}</h2>
                            <p className="text-muted/60">{lang === 'ar' ? 'اتبع الخطوات التالية لتحميل المنيو' : 'Follow these steps to upload your menu'}</p>
                        </div>

                        <div className="space-y-6">
                            {/* Step 1: Download */}
                            <div className="flex items-center gap-4 p-4 rounded-2xl bg-app/50 border border-border/10">
                                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">1</div>
                                <div className="flex-1">
                                    <h4 className="text-sm font-bold text-main">{lang === 'ar' ? 'حمل القالب' : 'Download the Template'}</h4>
                                    <p className="text-xs text-muted/60">{lang === 'ar' ? 'ملف جاهز بالأعمدة المطلوبة' : 'A ready file with all required columns'}</p>
                                </div>
                                <button 
                                    onClick={handleDownloadTemplate}
                                    className="h-10 px-4 rounded-xl bg-white/[0.05] border border-border/20 text-main text-xs font-bold hover:bg-white/[0.1] transition-all flex items-center gap-2"
                                >
                                    <Download size={14} />
                                    {t.downloadTemplate}
                                </button>
                            </div>

                            {/* Step 2: Upload */}
                            <div className="flex items-center gap-4 p-4 rounded-2xl bg-app/50 border border-border/10">
                                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">2</div>
                                <div className="flex-1">
                                    <h4 className="text-sm font-bold text-main">{lang === 'ar' ? 'ارفع الملف المعبأ' : 'Upload Filled File'}</h4>
                                    <p className="text-xs text-muted/60">{lang === 'ar' ? 'اختر الملف بعد إدخال بياناتك' : 'Select the file after entering your data'}</p>
                                </div>
                                <label className="h-10 px-6 rounded-xl bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/20">
                                    <Upload size={14} />
                                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : t.uploadFile}
                                    <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={isProcessing} />
                                </label>
                            </div>
                        </div>

                        {error && (
                            <div className="mt-8 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3 text-rose-500 text-xs font-medium">
                                <AlertCircle size={16} />
                                {error}
                            </div>
                        )}
                    </motion.div>
                )}

                {step === 'REVIEW' && (
                    <motion.div 
                        key="review"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="w-full max-w-5xl bg-card border border-border/20 rounded-[2.5rem] flex flex-col max-h-[85vh] shadow-2xl overflow-hidden"
                    >
                        <div className="p-8 border-b border-border/10 flex items-center justify-between bg-white/[0.02]">
                            <div>
                                <h2 className="text-xl font-bold text-main">{lang === 'ar' ? 'مراجعة المنيو' : 'Review Your Menu'}</h2>
                                <p className="text-sm text-muted/60 mt-1">
                                    {previewData.reduce((acc, c) => acc + c.items.length, 0)} {t.itemsFound} 
                                    {' • '} 
                                    {previewData.length} {t.categoriesFound}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => setStep('EXCEL_IMPORT')}
                                    className="h-11 px-6 rounded-xl border border-border/20 text-main text-sm font-bold hover:bg-white/[0.05] transition-all"
                                >
                                    {t.back}
                                </button>
                                <button 
                                    onClick={() => onComplete(previewData)}
                                    className="h-11 px-8 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
                                >
                                    <CheckCircle2 size={18} />
                                    {t.confirm}
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 bg-app/30 space-y-8 no-scrollbar">
                            {previewData.map((cat, idx) => (
                                <div key={cat.id} className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-px flex-1 bg-border/10" />
                                        <h3 className="text-sm font-black text-indigo-400 uppercase tracking-widest px-4 py-1 rounded-full bg-indigo-500/5 border border-indigo-500/10">
                                            {lang === 'ar' ? (cat.nameAr || cat.name) : cat.name}
                                        </h3>
                                        <div className="h-px flex-1 bg-border/10" />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {cat.items.map(item => (
                                            <div key={item.id} className="bg-card border border-border/10 p-4 rounded-2xl flex flex-col gap-2 hover:border-indigo-500/30 transition-colors group">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <h4 className="text-sm font-bold text-main">{lang === 'ar' ? (item.nameAr || item.name) : item.name}</h4>
                                                        <p className="text-[11px] text-muted/60 line-clamp-1 mt-0.5">{item.description || (lang === 'ar' ? 'لا يوجد وصف' : 'No description')}</p>
                                                    </div>
                                                    <span className="text-sm font-black text-emerald-500">{item.price}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border/5">
                                                    <span className="text-[10px] px-2 py-0.5 rounded bg-app/50 text-muted font-mono">{item.sku || 'No SKU'}</span>
                                                    <span className="text-[10px] px-2 py-0.5 rounded bg-app/50 text-muted font-mono">{item.cost || 0} Cost</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default MenuSetupWizard;
