type StockCountLine = {
    itemId?: string;
    itemName?: string;
    itemNameAr?: string | null;
    unit?: string;
    expectedQty?: number;
    systemQty?: number;
    countedQty?: number | null;
    varianceQty?: number | null;
    cost?: number;
    notes?: string;
};

type StockCountSession = {
    id: string;
    countDate?: string | Date | null;
    type?: string;
    status?: string;
    warehouseId?: string | null;
    warehouseName?: string | null;
    remarks?: string | null;
    items?: StockCountLine[];
};

type StockCountPrintOptions = {
    lang?: 'ar' | 'en' | string;
    restaurantName?: string;
    currencySymbol?: string;
};

const escapeHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatNumber = (value: unknown) => Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 3,
});

const dateOnly = (value?: string | Date | null) => {
    if (!value) return '-';
    if (value instanceof Date) return value.toISOString().split('T')[0];
    return String(value).split('T')[0];
};

export const buildStockCountPrintHtml = (
    count: StockCountSession,
    options: StockCountPrintOptions = {},
) => {
    const isAr = options.lang !== 'en';
    const items = count.items || [];
    const currency = options.currencySymbol || (isAr ? 'ج.م' : 'EGP');
    const countedLines = items.filter((item) => item.countedQty !== null && item.countedQty !== undefined).length;
    const varianceLines = items.filter((item) => {
        const variance = item.varianceQty ?? (
            item.countedQty === null || item.countedQty === undefined
                ? 0
                : Number(item.countedQty) - Number(item.systemQty ?? item.expectedQty ?? 0)
        );
        return Number(variance) !== 0;
    }).length;
    const varianceValue = items.reduce((sum, item) => {
        const variance = item.varianceQty ?? (
            item.countedQty === null || item.countedQty === undefined
                ? 0
                : Number(item.countedQty) - Number(item.systemQty ?? item.expectedQty ?? 0)
        );
        return sum + Number(variance || 0) * Number(item.cost || 0);
    }, 0);

    const rows = items.map((item, index) => {
        const expected = Number(item.systemQty ?? item.expectedQty ?? 0);
        const counted = item.countedQty;
        const variance = item.varianceQty ?? (
            counted === null || counted === undefined ? null : Number(counted) - expected
        );
        const itemName = isAr ? item.itemNameAr || item.itemName : item.itemName;
        return `<tr>
            <td>${index + 1}</td>
            <td class="name">${escapeHtml(itemName || item.itemId || '-')}</td>
            <td>${escapeHtml(item.unit || '-')}</td>
            <td>${formatNumber(expected)}</td>
            <td>${counted === null || counted === undefined ? '-' : formatNumber(counted)}</td>
            <td class="${Number(variance || 0) < 0 ? 'negative' : Number(variance || 0) > 0 ? 'positive' : ''}">${variance === null ? '-' : formatNumber(variance)}</td>
            <td>${formatNumber(item.cost)} ${escapeHtml(currency)}</td>
            <td>${variance === null ? '-' : `${formatNumber(Number(variance) * Number(item.cost || 0))} ${escapeHtml(currency)}`}</td>
            <td class="name">${escapeHtml(item.notes || '-')}</td>
        </tr>`;
    }).join('');

    return `<!doctype html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
    <meta charset="utf-8" />
    <title>${escapeHtml(isAr ? `تقرير جرد ${count.id}` : `Stock Count ${count.id}`)}</title>
    <style>
        *{box-sizing:border-box} body{font-family:Arial,Tahoma,sans-serif;color:#111827;margin:24px}
        h1{font-size:22px;margin:0 0 4px} .muted{color:#64748b;font-size:12px}
        .header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid #0f766e;padding-bottom:14px}
        .meta,.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:16px 0}
        .box{border:1px solid #dbe3ea;border-radius:8px;padding:9px}.box b{display:block;font-size:11px;color:#64748b;margin-bottom:4px}
        table{width:100%;border-collapse:collapse;font-size:10px} th,td{border:1px solid #dbe3ea;padding:7px;text-align:center}
        th{background:#eef6f5;font-weight:700}.name{text-align:${isAr ? 'right' : 'left'}}.negative{color:#be123c}.positive{color:#047857}
        .remarks{margin-top:12px;border:1px solid #dbe3ea;border-radius:8px;padding:10px;font-size:11px}
        @page{size:A4 landscape;margin:10mm}@media print{body{margin:0}.no-print{display:none}}
    </style>
</head>
<body>
    <div class="header">
        <div><h1>${escapeHtml(isAr ? 'تقرير جلسة الجرد' : 'Stock Count Session Report')}</h1><div class="muted">${escapeHtml(options.restaurantName || '')}</div></div>
        <div class="muted">${escapeHtml(count.id)}</div>
    </div>
    <div class="meta">
        <div class="box"><b>${isAr ? 'التاريخ' : 'Date'}</b>${escapeHtml(dateOnly(count.countDate))}</div>
        <div class="box"><b>${isAr ? 'المخزن' : 'Warehouse'}</b>${escapeHtml(count.warehouseName || count.warehouseId || '-')}</div>
        <div class="box"><b>${isAr ? 'نوع الجرد' : 'Count Type'}</b>${escapeHtml(count.type || '-')}</div>
        <div class="box"><b>${isAr ? 'الحالة' : 'Status'}</b>${escapeHtml(count.status || '-')}</div>
    </div>
    <div class="summary">
        <div class="box"><b>${isAr ? 'إجمالي البنود' : 'Total Lines'}</b>${items.length}</div>
        <div class="box"><b>${isAr ? 'بنود تم جردها' : 'Counted Lines'}</b>${countedLines}</div>
        <div class="box"><b>${isAr ? 'بنود بها فرق' : 'Variance Lines'}</b>${varianceLines}</div>
        <div class="box"><b>${isAr ? 'قيمة الفرق' : 'Variance Value'}</b>${formatNumber(varianceValue)} ${escapeHtml(currency)}</div>
    </div>
    <table>
        <thead><tr>
            <th>#</th><th>${isAr ? 'الصنف' : 'Item'}</th><th>${isAr ? 'الوحدة' : 'Unit'}</th>
            <th>${isAr ? 'النظري' : 'Expected'}</th><th>${isAr ? 'الفعلي' : 'Counted'}</th>
            <th>${isAr ? 'الفرق' : 'Variance'}</th><th>${isAr ? 'التكلفة' : 'Cost'}</th>
            <th>${isAr ? 'قيمة الفرق' : 'Variance Value'}</th><th>${isAr ? 'ملاحظات' : 'Notes'}</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="9">${isAr ? 'لا توجد بنود' : 'No lines'}</td></tr>`}</tbody>
    </table>
    ${count.remarks ? `<div class="remarks"><b>${isAr ? 'ملاحظات الجلسة:' : 'Session notes:'}</b> ${escapeHtml(count.remarks)}</div>` : ''}
</body>
</html>`;
};

export const printStockCountSession = (
    count: StockCountSession,
    options: StockCountPrintOptions = {},
) => {
    const printWindow = window.open('', '_blank', 'width=1200,height=850');
    if (!printWindow) throw new Error('PRINT_WINDOW_BLOCKED');
    printWindow.document.open();
    printWindow.document.write(buildStockCountPrintHtml(count, options));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
};
