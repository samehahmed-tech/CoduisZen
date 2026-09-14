import React, { useState, useMemo, useEffect } from 'react';
import {
    ChefHat, Plus, Trash2, Calculator, Scale, Save, Search, Package,
    ChevronRight, Printer, FileSpreadsheet, FileText, AlertTriangle,
    CheckCircle2, Copy, Filter, ArrowUpDown, UtensilsCrossed, Wallet, Target,
} from 'lucide-react';
import { InventoryItem, RecipeIngredient } from '../types';
import { useMenuStore } from '../stores/useMenuStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useToast } from './Toast';
import { downloadHtmlPdf } from '../services/reportPdf';

type BomRow = RecipeIngredient & { _key: string };
type SizeRecipe = { sizeId: string | null; yield: number; instructions?: string | null; ingredients: BomRow[] };

const UNITS = ['g', 'kg', 'ml', 'l', 'piece', 'unit', 'pack', 'tbsp', 'tsp', 'cup'];
const TARGET_FOOD_COST = 0.3;

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const getIngId = (ing: any) => String(ing?.itemId || ing?.inventoryItemId || '');
const num = (v: any, fb = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
const fmt = (n: number, d = 2) => num(n).toFixed(d);

const RECIPE_ERROR_AR: Record<string, string> = {
    RECIPE_YIELD_INVALID: 'كمية الإنتاج (Yield) يجب أن تكون أكبر من صفر',
    RECIPE_EMPTY_INGREDIENTS: 'الوصفة فارغة — أضف مكوناً واحداً على الأقل',
    RECIPE_INGREDIENT_ITEM_REQUIRED: 'يوجد مكون بدون صنف مخزني — احذفه أو اختر الصنف',
    RECIPE_INGREDIENT_QUANTITY_INVALID: 'يوجد مكون بكمية غير صحيحة — الكمية يجب أن تكون أكبر من صفر',
    RECIPE_INGREDIENT_ITEM_NOT_FOUND: 'يوجد مكون يشير لصنف مخزني محذوف — احذفه وأضفه من جديد',
    RECIPE_INGREDIENT_ITEM_INACTIVE: 'يوجد مكون غير نشط في المخزون — فعّله أو استبدله',
};

const RecipeManager: React.FC = () => {
    const { categories, updateMenuItem, fetchMenu } = useMenuStore();
    const { inventory, fetchInventory } = useInventoryStore();
    const { settings } = useAuthStore();
    const { showToast } = useToast();

    const lang = (settings.language || 'ar') as 'en' | 'ar';
    const tr = (ar: string, en: string) => (lang === 'ar' ? ar : en);
    const currency = settings.currencySymbol || (lang === 'ar' ? 'ج.م' : 'EGP');
    const restaurant = settings.restaurantName || 'RestoFlow';
    const isAr = lang === 'ar';

    const menuItems = useMemo(() => categories.flatMap((c) => c.items.map((i) => ({ ...i, _catId: c.id, _catName: c.name }))), [categories]);
    const costOf = useMemo(() => new Map(inventory.map((i) => [i.id, num(i.costPrice)])), [inventory]);
    const invById = useMemo(() => new Map(inventory.map((i) => [i.id, i])), [inventory]);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [sizeId, setSizeId] = useState<string | null>(null);
    const [bom, setBom] = useState<BomRow[]>([]);
    const [yieldQty, setYieldQty] = useState(1);
    const [instructions, setInstructions] = useState('');
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    // toolbar state
    const [q, setQ] = useState('');
    const [invQ, setInvQ] = useState('');
    const [catF, setCatF] = useState<string>('all');
    const [statusF, setStatusF] = useState<'all' | 'missing' | 'high' | 'ok'>('all');
    const [sortBy, setSortBy] = useState<'name' | 'foodCost' | 'margin'>('name');
    const [pdfBusy, setPdfBusy] = useState(false);

    useEffect(() => { fetchMenu(); fetchInventory(); }, [fetchMenu, fetchInventory]);

    const selected = useMemo(() => menuItems.find((i) => i.id === selectedId) || null, [menuItems, selectedId]);

    const sizeRecipes: SizeRecipe[] = useMemo(() => {
        const raw = Array.isArray((selected as any)?.recipe) ? (selected as any).recipe : [];
        if (raw.length > 0 && raw[0]?.ingredients) {
            return raw.map((r: any) => ({
                sizeId: r.sizeId ?? null,
                yield: num(r.yield, 1) || 1,
                instructions: r.instructions || '',
                ingredients: (r.ingredients || []).map((g: any) => ({ ...g, itemId: getIngId(g), _key: uid() })),
            }));
        }
        // legacy flat
        return raw.length > 0
            ? [{ sizeId: null, yield: 1, instructions: '', ingredients: raw.map((g: any) => ({ ...g, itemId: getIngId(g), _key: uid() })) }]
            : [];
    }, [selected]);

    // load BOM when selection/size changes
    useEffect(() => {
        if (!selected) { setBom([]); setYieldQty(1); setInstructions(''); setDirty(false); return; }
        const exact = sizeRecipes.find((r) => r.sizeId === sizeId);
        const base = sizeRecipes.find((r) => !r.sizeId);
        const src = exact || (sizeId && base ? { ...base, sizeId } : base);
        if (src) {
            setBom(src.ingredients.map((g) => ({ ...g, _key: uid() })));
            setYieldQty(num(src.yield, 1) || 1);
            setInstructions(src.instructions || '');
        } else {
            setBom([]); setYieldQty(1); setInstructions('');
        }
        setDirty(false);
    }, [selectedId, sizeId, selected?.id]);

    // ---- cost math ----
    const lines = useMemo(() => bom.map((r) => {
        const inv = invById.get(getIngId(r));
        const unitCost = inv ? num(inv.costPrice) : 0;
        const qty = num(r.quantity);
        return { row: r, inv, ext: unitCost * qty };
    }), [bom, invById]);
    const batchCost = lines.reduce((s, l) => s + l.ext, 0);
    const perPortion = yieldQty > 0 ? batchCost / yieldQty : 0;
    const sellPrice = useMemo(() => {
        const sz = (selected as any)?.sizes?.find((s: any) => s.id === sizeId);
        return num(sz?.price ?? (selected as any)?.price ?? 0);
    }, [selected, sizeId]);
    const margin = sellPrice - perPortion;
    const foodPct = sellPrice > 0 ? (perPortion / sellPrice) * 100 : 0;
    const suggested = perPortion / TARGET_FOOD_COST;

    const alerts = useMemo(() => {
        const a: string[] = [];
        if (!selected) return a;
        if (bom.length === 0) a.push(tr('لا توجد وصفة محفوظة لهذا الصنف', 'No saved recipe for this item'));
        lines.forEach((l) => {
            if (!l.inv) a.push(tr(`مكون محذوف من المخزون`, `Deleted inventory component`));
            else if (l.inv.isActive === false) a.push(tr(`${l.inv.name} غير نشط`, `${l.inv.name} inactive`));
            if (!(num(l.row.quantity) > 0)) a.push(tr('كمية غير صالحة', 'Invalid quantity'));
        });
        if (bom.length > 0 && sellPrice <= 0) a.push(tr('سعر البيع صفر — راجع سعر الصنف', 'Sell price is zero'));
        if (bom.length > 0 && foodPct > 35) a.push(tr(`تكلفة الطعام مرتفعة (${fmt(foodPct, 1)}%) — المستهدف ≤ 30%`, `High food cost (${fmt(foodPct, 1)}%) — target ≤ 30%`));
        return [...new Set(a)];
    }, [selected, bom, lines, sellPrice, foodPct, tr]);

    // ---- list: filter + sort + coverage ----
    const itemFoodPct = (item: any) => {
        const rec = Array.isArray(item.recipe) && item.recipe.length > 0
            ? (item.recipe[0]?.ingredients ? (item.recipe.find((r: any) => !r.sizeId) || item.recipe[0]) : { ingredients: item.recipe, yield: 1 })
            : null;
        if (!rec || !rec.ingredients?.length) return null;
        const y = num(rec.yield, 1) || 1;
        const c = rec.ingredients.reduce((s: number, g: any) => s + (costOf.get(getIngId(g)) || 0) * num(g.quantity), 0) / y;
        const p = num(item.price);
        return p > 0 ? (c / p) * 100 : null;
    };
    const filtered = useMemo(() => {
        let list = menuItems.filter((i) =>
            (catF === 'all' || (i as any)._catId === catF) &&
            (i.name?.toLowerCase().includes(q.toLowerCase()) || i.id?.toLowerCase().includes(q.toLowerCase())),
        );
        if (statusF === 'missing') list = list.filter((i) => !(Array.isArray((i as any).recipe) && (i as any).recipe.length > 0));
        if (statusF === 'high') list = list.filter((i) => { const p = itemFoodPct(i); return p !== null && p > 35; });
        if (statusF === 'ok') list = list.filter((i) => { const p = itemFoodPct(i); return p !== null && p <= 35; });
        const val = (i: any) => sortBy === 'name' ? i.name : sortBy === 'foodCost' ? (itemFoodPct(i) ?? -1) : (num(i.price) - (() => { const p = itemFoodPct(i); return p === null ? 0 : (p / 100) * num(i.price); })());
        return [...list].sort((a, b) => sortBy === 'name' ? String(val(a)).localeCompare(String(val(b)), isAr ? 'ar' : 'en') : (val(b) as number) - (val(a) as number));
    }, [menuItems, q, catF, statusF, sortBy, costOf]);

    const coverage = useMemo(() => {
        const withR = menuItems.filter((i) => Array.isArray((i as any).recipe) && (i as any).recipe.length > 0).length;
        const pcts = menuItems.map(itemFoodPct).filter((v): v is number => v !== null);
        return { total: menuItems.length, withR, without: menuItems.length - withR, avg: pcts.length ? pcts.reduce((s, v) => s + v, 0) / pcts.length : 0 };
    }, [menuItems, costOf]);

    // ---- editing ----
    const markDirty = (next: BomRow[]) => { setBom(next); setDirty(true); };
    const addIng = (inv: InventoryItem) => {
        if (bom.some((r) => getIngId(r) === inv.id)) return;
        markDirty([...bom, { itemId: inv.id, quantity: 1, unit: inv.unit || 'unit', _key: uid() } as BomRow]);
    };
    const rmIng = (k: string) => markDirty(bom.filter((r) => r._key !== k));
    const setQty = (k: string, v: number) => markDirty(bom.map((r) => (r._key === k ? { ...r, quantity: v } : r)));
    const setUnit = (k: string, u: string) => markDirty(bom.map((r) => (r._key === k ? { ...r, unit: u } : r)));
    const clearBom = () => markDirty([]);
    const copyBaseToSize = () => {
        const base = sizeRecipes.find((r) => !r.sizeId);
        if (base) { markDirty(base.ingredients.map((g) => ({ ...g, _key: uid() }))); setYieldQty(base.yield); }
    };

    const handleSave = async () => {
        if (!selected || !selectedId) return;
        if (bom.length === 0) { showToast(tr('أضف مكوناً واحداً على الأقل', 'Add at least one ingredient'), 'error'); return; }
        for (const r of bom) {
            const inv = invById.get(getIngId(r));
            if (!inv || inv.isActive === false || !(num(r.quantity) > 0)) {
                showToast(tr('يوجد مكون غير صالح أو كمية غير صحيحة', 'Invalid component or quantity'), 'error');
                return;
            }
        }
        if (!(yieldQty > 0)) { showToast(RECIPE_ERROR_AR.RECIPE_YIELD_INVALID, 'error'); return; }
        const cat = categories.find((c) => c.items.some((it) => it.id === selectedId));
        if (!cat) return;
        const activeMenu = (useMenuStore.getState().menus || []).find((m) => m.isDefault)?.id || 'menu-1';
        setSaving(true);
        try {
            const others = sizeRecipes.filter((r) => r.sizeId !== sizeId).map((r) => ({
                sizeId: r.sizeId, yield: r.yield, instructions: r.instructions || null,
                ingredients: r.ingredients.map(({ _key, ...g }) => ({ ...g, itemId: getIngId(g) })),
            }));
            const current = {
                sizeId: sizeId ?? null, yield: yieldQty, instructions: instructions || null,
                ingredients: bom.map(({ _key, ...g }) => ({ ...g, itemId: getIngId(g), quantity: num(g.quantity) })),
            };
            const payload = [...others, current];
            await updateMenuItem(activeMenu, cat.id, { ...(selected as any), price: num((selected as any).price), cost: perPortion, recipe: payload } as any);
            await fetchMenu();
            setDirty(false);
            showToast(tr('تم حفظ الوصفة بنجاح', 'Recipe saved'), 'success');
        } catch (e: any) {
            const code = String(e?.code || e?.message || '');
            const msg = RECIPE_ERROR_AR[code] || e?.messageAr || tr('تعذر حفظ الوصفة — حاول مجدداً', 'Could not save recipe');
            showToast(msg, 'error');
        } finally { setSaving(false); }
    };

    // ---- print / export helpers ----
    const invName = (id: string) => { const v = invById.get(id); return v ? (isAr ? v.nameAr || v.name : v.name) : tr('مكون محذوف', 'Deleted'); };
    const recipeRowsFor = (item: any, sId: string | null) => {
        const rec = Array.isArray(item.recipe) && item.recipe.length > 0
            ? item.recipe[0]?.ingredients
                ? item.recipe.find((r: any) => r.sizeId === sId) || item.recipe.find((r: any) => !r.sizeId) || item.recipe[0]
                : { ingredients: item.recipe, yield: 1, instructions: '' }
            : null;
        return rec;
    };
    const costFor = (item: any, sId: string | null) => {
        const rec = recipeRowsFor(item, sId);
        if (!rec) return { batch: 0, per: 0, y: 1, n: 0 };
        const y = num(rec.yield, 1) || 1;
        const batch = (rec.ingredients || []).reduce((s: number, g: any) => s + (costOf.get(getIngId(g)) || 0) * num(g.quantity), 0);
        return { batch, per: batch / y, y, n: rec.ingredients?.length || 0 };
    };

    const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const printHtmlDoc = (title: string, body: string) => {
        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) { showToast(tr('اسمح بالنوافذ المنبثقة للطباعة', 'Allow popups to print'), 'error'); return; }
        w.document.write(`<!DOCTYPE html><html dir="${isAr ? 'rtl' : 'ltr'}"><head><meta charset="UTF-8"><title>${esc(title)}</title>
        <style>@page{size:A4;margin:12mm}body{font-family:'Segoe UI',Tahoma,Arial;margin:0;color:#0f172a}.h{display:flex;align-items:center;gap:12px;border-bottom:3px solid #4f46e5;padding-bottom:12px;margin-bottom:12px}.h h1{font-size:20px;margin:0}.sub{font-size:11px;color:#64748b;font-weight:700}table{width:100%;border-collapse:collapse;font-size:10pt}th{background:#1e1b4b;color:#fff;padding:8px;text-align:${isAr ? 'right' : 'left'}}td{padding:7px 8px;border-bottom:1px solid #e2e8f0}.tot{background:#eef2ff;font-weight:900}.f{margin-top:14px;font-size:9pt;color:#64748b;display:flex;justify-content:space-between}@media print{.noprint{display:none}}</style>
        </head><body><div class="h"><div><h1>${esc(restaurant)}</h1><div class="sub">${esc(title)} · ${new Date().toLocaleString(isAr ? 'ar-EG' : 'en-GB')}</div></div></div>${body}
        <div class="f"><span>${esc(restaurant)}</span><span>${esc(tr('الوصفات وهندسة التكلفة', 'Recipes & Cost Engineering'))}</span></div>
        <div class="noprint" style="margin-top:16px"><button onclick="window.print()" style="padding:10px 22px;background:#4f46e5;color:#fff;border:0;border-radius:10px;font-weight:900;cursor:pointer">${esc(tr('طباعة', 'Print'))}</button></div>
        </body></html>`);
        w.document.close();
    };

    const singleBody = (item: any, sId: string | null) => {
        const rec = recipeRowsFor(item, sId);
        const { batch, per, y } = costFor(item, sId);
        const price = num((item.sizes?.find((s: any) => s.id === sId)?.price) ?? item.price);
        const rows = (rec?.ingredients || []).map((g: any, idx: number) => {
            const id = getIngId(g); const c = costOf.get(id) || 0; const ext = c * num(g.quantity);
            return `<tr><td>${idx + 1}</td><td>${esc(invName(id))}</td><td>${esc(g.quantity)} ${esc(g.unit || '')}</td><td>${fmt(c)} ${esc(currency)}</td><td>${fmt(ext)} ${esc(currency)}</td></tr>`;
        }).join('') || `<tr><td colspan="5">${esc(tr('لا توجد مكونات', 'No ingredients'))}</td></tr>`;
        return `<h2 style="margin:0 0 4px">${esc(isAr ? item.nameAr || item.name : item.name)} ${sId ? `— ${esc(item.sizes?.find((s: any) => s.id === sId)?.name || '')}` : ''}</h2>
        <div class="sub">${esc(tr('الناتج', 'Yield'))}: ${y} · ${esc(tr('سعر البيع', 'Price'))}: ${fmt(price)} ${esc(currency)} · ${esc(tr('تكلفة الحصة', 'Portion cost'))}: ${fmt(per)} ${esc(currency)} · ${esc(tr('هامش', 'Margin'))}: ${fmt(price - per)} (${price > 0 ? fmt(((price - per) / price) * 100, 1) : '0'}%)</div>
        <table style="margin-top:10px"><thead><tr><th>#</th><th>${esc(tr('المكون', 'Ingredient'))}</th><th>${esc(tr('الكمية', 'Qty'))}</th><th>${esc(tr('سعر الوحدة', 'Unit cost'))}</th><th>${esc(tr('الإجمالي', 'Total'))}</th></tr></thead>
        <tbody>${rows}</tbody><tfoot><tr class="tot"><td colspan="4">${esc(tr('إجمالي الدفعة', 'Batch total'))}</td><td>${fmt(batch)} ${esc(currency)}</td></tr></tfoot></table>
        ${rec?.instructions ? `<p><b>${esc(tr('التعليمات', 'Instructions'))}:</b> ${esc(rec.instructions)}</p>` : ''}`;
    };

    const printSingle = () => { if (selected) printHtmlDoc(`${tr('بطاقة وصفة', 'Recipe card')} — ${isAr ? (selected as any).nameAr || selected.name : selected.name}`, singleBody(selected, sizeId)); };
    const printGroup = () => {
        const body = filtered.map((i) => singleBody(i, null)).join('<hr style="margin:18px 0;border:0;border-top:2px dashed #cbd5e1">');
        printHtmlDoc(`${tr('دفتر وصفات', 'Recipe book')} (${filtered.length})`, body);
    };

    const csvCell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const download = (content: string, name: string, mime: string) => {
        const blob = new Blob(['\ufeff' + content], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    };
    const exportSingleCsv = () => {
        if (!selected) return;
        const rec = recipeRowsFor(selected, sizeId);
        const head = [tr('المكون', 'Ingredient'), tr('الكمية', 'Qty'), tr('الوحدة', 'Unit'), tr('سعر الوحدة', 'Unit cost'), tr('الإجمالي', 'Ext. cost')].map(csvCell).join(',');
        const rows = (rec?.ingredients || []).map((g: any) => {
            const id = getIngId(g); const c = costOf.get(id) || 0;
            return [invName(id), g.quantity, g.unit || '', fmt(c), fmt(c * num(g.quantity))].map(csvCell).join(',');
        });
        download([head, ...rows].join('\n'), `recipe-${selected.id}-${sizeId || 'base'}.csv`, 'text/csv');
    };
    const exportGroupCsv = () => {
        const head = [tr('الصنف', 'Item'), tr('القسم', 'Category'), tr('السعر', 'Price'), tr('المكونات', '#Ing'), tr('تكلفة الحصة', 'Portion'), tr('هامش %', 'Margin%')].map(csvCell).join(',');
        const rows = filtered.map((i: any) => {
            const { per, n } = costFor(i, null); const p = num(i.price);
            const m = p > 0 ? (((p - per) / p) * 100) : 0;
            return [isAr ? i.nameAr || i.name : i.name, i._catName || '', fmt(p), n, fmt(per), fmt(m, 1)].map(csvCell).join(',');
        });
        download([head, ...rows].join('\n'), `recipes-group-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
        showToast(tr('تم تصدير المجموعة CSV', 'Group exported CSV'), 'success');
    };
    const exportGroupPdf = async () => {
        setPdfBusy(true);
        try {
            const rows = filtered.map((i: any) => {
                const { per, n } = costFor(i, null); const p = num(i.price);
                const m = p > 0 ? (((p - per) / p) * 100) : 0;
                return { item: isAr ? i.nameAr || i.name : i.name, cat: i._catName || '', price: fmt(p), n, per: fmt(per), m: fmt(m, 1) + '%' };
            });
            const body = `<table><thead><tr><th>${tr('الصنف', 'Item')}</th><th>${tr('القسم', 'Cat')}</th><th>${tr('السعر', 'Price')}</th><th>#</th><th>${tr('تكلفة الحصة', 'Portion')}</th><th>%</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.item)}</td><td>${esc(r.cat)}</td><td>${esc(r.price)}</td><td>${r.n}</td><td>${esc(r.per)}</td><td>${esc(r.m)}</td></tr>`).join('')}</tbody></table>`;
            await downloadHtmlPdf(body, {
                filename: `recipes-group`, title: tr('تقرير الوصفات وهندسة التكلفة', 'Recipes & cost report'),
                restaurant, logoUrl: settings.receiptLogoUrl || '/logo.png',
                metaChips: [`${filtered.length} ${tr('صنف', 'items')}`, `${tr('متوسط تكلفة الطعام', 'Avg food cost')}: ${fmt(coverage.avg, 1)}%`],
                isArabic: isAr, orientation: 'landscape',
            });
        } finally { setPdfBusy(false); }
    };

    const availInv = inventory.filter((i) => i.isActive !== false && (i.name?.toLowerCase().includes(invQ.toLowerCase()) || (i.nameAr || '').includes(invQ)));

    return (
        <div className="p-6 md:p-8 bg-app min-h-screen pb-24" dir={isAr ? 'rtl' : 'ltr'}>
            {/* header */}
            <div className="flex flex-col xl:flex-row justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-2xl md:text-3xl font-black text-main uppercase flex items-center gap-3">
                        <ChefHat className="text-indigo-600" size={32} /> {tr('الوصفات وهندسة التكلفة', 'Recipes & Cost Engineering')}
                        {dirty && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded-lg">{tr('تغييرات غير محفوظة', 'Unsaved')}</span>}
                    </h2>
                    <p className="text-muted text-xs font-bold mt-1">{tr('احفظ الوصفة أولاً — ثم اطبع أو صدّر أي صنف أو المجموعة المفلترة.', 'Save first — then print/export any item or the filtered group.')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={exportGroupCsv} className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-xl text-[10px] font-black uppercase hover:border-emerald-500 transition-all"><FileSpreadsheet size={14} className="text-emerald-500" /> {tr('تصدير المجموعة CSV', 'Group CSV')}</button>
                    <button onClick={() => void exportGroupPdf()} disabled={pdfBusy || filtered.length === 0} className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-xl text-[10px] font-black uppercase hover:border-red-400 transition-all disabled:opacity-50"><FileText size={14} className="text-red-500" /> {pdfBusy ? '...' : tr('تقرير PDF', 'PDF report')}</button>
                    <button onClick={printGroup} disabled={filtered.length === 0} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-indigo-700 transition-all disabled:opacity-50"><Printer size={14} /> {tr('طباعة المجموعة', 'Print group')} ({filtered.length})</button>
                </div>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                {[
                    { icon: <UtensilsCrossed size={20} />, label: tr('إجمالي الأصناف', 'Items'), val: coverage.total, tint: 'border-indigo-500' },
                    { icon: <CheckCircle2 size={20} />, label: tr('لها وصفات', 'With recipes'), val: coverage.withR, tint: 'border-emerald-500' },
                    { icon: <AlertTriangle size={20} />, label: tr('بدون وصفة', 'Missing'), val: coverage.without, tint: 'border-rose-500' },
                    { icon: <Wallet size={20} />, label: tr('متوسط تكلفة الطعام', 'Avg food cost'), val: `${fmt(coverage.avg, 1)}%`, tint: 'border-amber-500' },
                ].map((k, i) => (
                    <div key={i} className={`card-primary p-5 rounded-3xl border-s-8 ${k.tint}`}>
                        <div className="flex items-center gap-2 text-muted">{k.icon}<p className="text-[10px] font-black uppercase">{k.label}</p></div>
                        <p className="text-2xl font-black text-main mt-1">{k.val}</p>
                    </div>
                ))}
            </div>

            {/* toolbar */}
            <div className="card-primary rounded-3xl p-4 mb-6 flex flex-col lg:flex-row gap-3 lg:items-center">
                <div className="relative flex-1">
                    <Search size={16} className="absolute start-4 top-1/2 -translate-y-1/2 text-muted" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('ابحث عن صنف...', 'Search items...')}
                        className="w-full bg-elevated/50 border border-border rounded-2xl py-3 ps-11 pe-4 text-xs font-bold outline-none focus:border-indigo-500" />
                </div>
                <select value={catF} onChange={(e) => setCatF(e.target.value)} className="bg-elevated/50 border border-border rounded-2xl py-3 px-4 text-xs font-bold">
                    <option value="all">{tr('كل الأقسام', 'All categories')}</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={statusF} onChange={(e) => setStatusF(e.target.value as any)} className="bg-elevated/50 border border-border rounded-2xl py-3 px-4 text-xs font-bold">
                    <option value="all">{tr('كل الحالات', 'All status')}</option>
                    <option value="missing">{tr('بدون وصفة', 'Missing')}</option>
                    <option value="high">{tr('تكلفة مرتفعة >35%', 'High cost')}</option>
                    <option value="ok">{tr('تكلفة سليمة', 'Healthy')}</option>
                </select>
                <button onClick={() => setSortBy(sortBy === 'name' ? 'foodCost' : sortBy === 'foodCost' ? 'margin' : 'name')}
                    className="flex items-center gap-2 px-4 py-3 bg-elevated/50 border border-border rounded-2xl text-[10px] font-black uppercase whitespace-nowrap">
                    <ArrowUpDown size={14} /> {sortBy === 'name' ? tr('الاسم', 'Name') : sortBy === 'foodCost' ? tr('تكلفة الطعام', 'Food cost') : tr('الهامش', 'Margin')} <Filter size={12} className="opacity-50" />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* list */}
                <div className="lg:col-span-4 xl:col-span-3">
                    <div className="card-primary rounded-3xl p-4 border border-border max-h-[70vh] overflow-y-auto space-y-2">
                        {filtered.map((item: any) => {
                            const has = Array.isArray(item.recipe) && item.recipe.length > 0;
                            const pct = itemFoodPct(item);
                            const active = selectedId === item.id;
                            return (
                                <button key={item.id} onClick={() => { setSelectedId(item.id); setSizeId(null); }}
                                    className={`w-full text-start p-3 rounded-2xl flex items-center gap-3 transition-all ${active ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-elevated/60 border border-transparent'}`}>
                                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${!has ? 'bg-rose-500' : pct !== null && pct > 35 ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-black truncate">{isAr ? item.nameAr || item.name : item.name}</p>
                                        <p className={`text-[10px] font-bold ${active ? 'text-indigo-200' : 'text-muted'}`}>
                                            {fmt(num(item.price))} {currency}{has && pct !== null ? ` · ${fmt(pct, 1)}%` : has ? '' : ` · ${tr('بدون وصفة', 'No recipe')}`}
                                        </p>
                                    </div>
                                    <ChevronRight size={14} className={active ? '' : 'opacity-30'} />
                                </button>
                            );
                        })}
                        {filtered.length === 0 && <p className="text-center text-xs text-muted py-10 font-bold">{tr('لا توجد أصناف مطابقة', 'No matching items')}</p>}
                    </div>
                </div>

                {/* editor */}
                <div className="lg:col-span-8 xl:col-span-9">
                    {selected ? (
                        <div className="space-y-6">
                            {/* cost cards */}
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                                <div className="card-primary p-5 rounded-3xl border-s-8 border-indigo-500"><p className="text-[10px] font-black text-muted uppercase">{tr('سعر البيع', 'Price')}</p><p className="text-xl font-black">{fmt(sellPrice)} {currency}</p></div>
                                <div className="card-primary p-5 rounded-3xl border-s-8 border-rose-500"><p className="text-[10px] font-black text-muted uppercase">{tr('تكلفة الحصة', 'Portion')}</p><p className="text-xl font-black text-rose-500">{fmt(perPortion)} {currency}</p><p className="text-[10px] text-muted font-bold">{tr('الدفعة', 'Batch')}: {fmt(batchCost)} · {tr('الناتج', 'Yield')}: {yieldQty}</p></div>
                                <div className="card-primary p-5 rounded-3xl border-s-8 border-emerald-500"><p className="text-[10px] font-black text-muted uppercase">{tr('الهامش', 'Margin')}</p><p className="text-xl font-black">{fmt(margin)} <span className={`text-[10px] px-2 py-0.5 rounded-lg ${foodPct <= 30 ? 'bg-emerald-100 text-emerald-700' : foodPct <= 35 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{fmt(foodPct, 1)}%</span></p></div>
                                <div className="card-primary p-5 rounded-3xl border-s-8 border-amber-500"><p className="text-[10px] font-black text-muted uppercase flex items-center gap-1"><Target size={12} /> {tr('سعر مقترح (30%)', 'Suggested (30%)')}</p><p className="text-xl font-black">{fmt(suggested)} {currency}</p></div>
                            </div>

                            {alerts.length > 0 && (
                                <div className="rounded-3xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-1">
                                    {alerts.map((a, i) => <p key={i} className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-2"><AlertTriangle size={13} /> {a}</p>)}
                                </div>
                            )}

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                {/* BOM */}
                                <div className="card-primary rounded-3xl p-6 border border-border">
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                                        <h3 className="font-black text-sm uppercase flex items-center gap-2"><Scale size={18} className="text-indigo-600" /> {tr('مكونات الوصفة', 'Bill of materials')}</h3>
                                        <div className="flex gap-2">
                                            <button onClick={printSingle} className="p-2.5 bg-elevated border border-border rounded-xl hover:border-indigo-500" title={tr('طباعة الصنف', 'Print item')}><Printer size={15} /></button>
                                            <button onClick={exportSingleCsv} className="p-2.5 bg-elevated border border-border rounded-xl hover:border-emerald-500" title="CSV"><FileSpreadsheet size={15} className="text-emerald-600" /></button>
                                            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase disabled:opacity-60"><Save size={14} /> {saving ? tr('جاري الحفظ...', 'Saving...') : tr('حفظ الوصفة', 'Save')}</button>
                                        </div>
                                    </div>

                                    {(selected as any).sizes?.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            <button onClick={() => setSizeId(null)} className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase ${!sizeId ? 'bg-indigo-600 text-white' : 'bg-elevated text-muted'}`}>{tr('الأساسية', 'Base')}</button>
                                            {(selected as any).sizes.map((s: any) => (
                                                <button key={s.id} onClick={() => setSizeId(s.id)} className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase ${sizeId === s.id ? 'bg-indigo-600 text-white' : 'bg-elevated text-muted'}`}>
                                                    {s.name}{sizeRecipes.some((r) => r.sizeId === s.id) ? ' •' : ''}
                                                </button>
                                            ))}
                                            {sizeId && !sizeRecipes.some((r) => r.sizeId === sizeId) && (
                                                <button onClick={copyBaseToSize} className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase bg-amber-100 text-amber-700 flex items-center gap-1"><Copy size={12} /> {tr('نسخ الأساسية', 'Copy base')}</button>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] font-black text-muted">
                                        <span>{tr('الناتج (حصة)', 'Yield (portions)')}</span>
                                        <input type="number" min={0.001} step={0.5} value={yieldQty} onChange={(e) => { setYieldQty(num(e.target.value, 0)); setDirty(true); }}
                                            className="w-24 px-3 py-2 rounded-xl bg-elevated border border-border font-black text-main" />
                                        <button onClick={clearBom} className="ms-auto text-rose-500 text-[10px] uppercase flex items-center gap-1"><Trash2 size={12} /> {tr('تفريغ', 'Clear')}</button>
                                    </div>
                                    <textarea value={instructions} onChange={(e) => { setInstructions(e.target.value); setDirty(true); }}
                                        rows={2} placeholder={tr('تعليمات التحضير (اختياري)...', 'Prep instructions (optional)...')}
                                        className="w-full mb-4 px-4 py-3 rounded-2xl bg-elevated/60 border border-border text-xs font-bold outline-none focus:border-indigo-500" />

                                    <div className="space-y-2 max-h-[46vh] overflow-y-auto pe-1">
                                        {lines.length === 0 && <div className="py-12 text-center text-muted"><ChefHat size={40} className="mx-auto mb-2 opacity-40" /><p className="text-[11px] font-black uppercase">{tr('أضف مكونات من السجل', 'Add ingredients from registry')}</p></div>}
                                        {lines.map(({ row, inv, ext }) => (
                                            <div key={row._key} className="flex items-center gap-2 p-3 bg-elevated/50 rounded-2xl border border-transparent hover:border-indigo-500/30">
                                                <div className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted shrink-0"><Package size={16} /></div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-black truncate">{inv ? (isAr ? inv.nameAr || inv.name : inv.name) : tr('محذوف', 'Deleted')}</p>
                                                    <p className="text-[9px] text-muted font-bold">{fmt(inv ? num(inv.costPrice) : 0)} / {inv?.unit || row.unit} → <b className="text-main">{fmt(ext)} {currency}</b>{batchCost > 0 ? ` (${fmt((ext / batchCost) * 100, 0)}%)` : ''}</p>
                                                </div>
                                                <input type="number" min={0.001} step={0.001} value={row.quantity}
                                                    onChange={(e) => setQty(row._key, e.target.value === '' ? 0 : e.target.valueAsNumber)}
                                                    className="w-[74px] px-2 py-2 rounded-xl bg-card border border-border text-xs font-black text-center outline-none focus:border-indigo-500" />
                                                <select value={row.unit} onChange={(e) => setUnit(row._key, e.target.value)} className="px-1 py-2 rounded-xl bg-card border border-border text-[10px] font-black">
                                                    {[row.unit, ...UNITS.filter((u) => u !== row.unit)].filter(Boolean).map((u) => <option key={u} value={u}>{u}</option>)}
                                                </select>
                                                <button onClick={() => rmIng(row._key)} className="p-2 text-muted hover:text-rose-500"><Trash2 size={15} /></button>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-4 p-4 rounded-2xl bg-indigo-600 text-white flex items-center gap-3">
                                        <Calculator size={22} className="shrink-0" />
                                        <p className="text-[11px] font-bold leading-relaxed">{tr(`الدفعة ${fmt(batchCost)} ${currency} ÷ الناتج ${yieldQty} = الحصة ${fmt(perPortion)} ${currency} — تُخصم تلقائياً عند البيع.`, `Batch ${fmt(batchCost)} ${currency} ÷ yield ${yieldQty} = portion ${fmt(perPortion)} ${currency} — auto-deducted on sale.`)}</p>
                                    </div>
                                </div>

                                {/* registry */}
                                <div className="card-primary rounded-3xl p-6 border border-border h-fit">
                                    <h3 className="font-black text-sm uppercase mb-4 flex items-center gap-2"><Search size={18} className="text-indigo-600" /> {tr('السجل المخزني', 'Supply registry')}</h3>
                                    <input value={invQ} onChange={(e) => setInvQ(e.target.value)} placeholder={tr('ابحث في الخامات...', 'Search materials...')}
                                        className="w-full mb-4 bg-elevated/50 border border-border rounded-2xl py-3 px-4 text-xs font-bold outline-none focus:border-indigo-500" />
                                    <div className="grid gap-2 max-h-[56vh] overflow-y-auto pe-1">
                                        {availInv.slice(0, 200).map((inv) => {
                                            const added = bom.some((r) => getIngId(r) === inv.id);
                                            return (
                                                <button key={inv.id} disabled={added} onClick={() => addIng(inv)}
                                                    className={`flex items-center gap-3 p-3 rounded-2xl border text-start transition-all ${added ? 'opacity-40 grayscale border-border' : 'bg-card border-border hover:border-indigo-500 shadow-sm'}`}>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-black truncate">{isAr ? inv.nameAr || inv.name : inv.name}</p>
                                                        <p className="text-[9px] text-muted font-bold">{fmt(num(inv.costPrice))} {currency} / {inv.unit} · {inv.category || ''}</p>
                                                    </div>
                                                    {!added && <Plus size={16} className="text-indigo-600 shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="card-primary rounded-3xl p-20 text-center border-2 border-dashed border-border text-muted">
                            <ChefHat size={52} className="mx-auto mb-4 opacity-40" />
                            <h3 className="font-black text-lg text-main uppercase">{tr('اختر صنفاً من القائمة', 'Select an item')}</h3>
                            <p className="text-[11px] font-bold mt-2">{tr('ابحث وصفِّ ثم اختر صنفاً لبناء وصفته وحساب التكلفة والهامش وطباعته.', 'Search, filter, pick an item to build, cost, and print its recipe.')}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RecipeManager;
