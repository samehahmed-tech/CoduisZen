/**
 * kitchenTicketTemplate.ts — Generates styled HTML kitchen/distribution ticket
 * Optimized for kitchen readability: large fonts, clear item list, minimal decoration
 */
import { Order, OrderType, OrderItem, Branch, AppSettings } from '../types';
import { getTableDisplayName } from '../src/utils/tableDisplay';

/* Thermal-safe escaping + symbols. Thermal raster (html2canvas → 384px +
   contrast crush) cannot render emoji/decorative glyphs reliably — they come
   out as tofu boxes (؟؟؟-like marks). Only basic Latin/Arabic/punctuation. */
const escapeHtml = (value: unknown): string =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

interface KitchenTicketParams {
    order: Order;
    items?: OrderItem[];
    settings: AppSettings;
    lang: 'en' | 'ar';
    t: any;
    branch?: Branch;
    title?: string;
    printerName?: string;
}

export const generateKitchenTicketHTML = ({
    order,
    items,
    settings,
    lang,
    t,
    branch,
    title,
    printerName,
}: KitchenTicketParams): string => {
    const isAr = lang === 'ar';
    const dir = isAr ? 'rtl' : 'ltr';
    const align = isAr ? 'right' : 'left';
    const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
    const timeStr = createdAt.toLocaleTimeString(isAr ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = createdAt.toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short' });

    const ticketTitle = title || t?.kitchen_ticket || (isAr ? 'تذكرة المطبخ' : 'KITCHEN TICKET');

    const typeLabels: Record<string, { ar: string; en: string }> = {
        [OrderType.DINE_IN]: { ar: 'صالة', en: 'DINE-IN' },
        [OrderType.DELIVERY]: { ar: 'ديلفري', en: 'DELIVERY' },
        [OrderType.PICKUP]: { ar: 'استلام عميل', en: 'PICKUP' },
        [OrderType.TAKEAWAY]: { ar: 'تيك اواي', en: 'TAKEAWAY' },
    };
    const typeInfo = typeLabels[order.type] || typeLabels[OrderType.TAKEAWAY];
    const orderTypeText = isAr ? typeInfo.ar : typeInfo.en;

    const displayItems = items || order.items || [];

    const itemRows = displayItems.map((item, idx) => {
        const name = isAr ? ((item as any).nameAr || item.name) : item.name;
        const qty = item.quantity || 1;

        const modLines = (item.selectedModifiers || []).map(m =>
            `<div class="k-mod">+ ${escapeHtml(m.optionName || m.groupName || '')}</div>`
        ).join('');

        const noteLine = item.notes
            ? `<div class="k-note">! ${escapeHtml(item.notes)}</div>`
            : '';

        return `
         <div class="k-item ${idx % 2 === 0 ? '' : 'k-item-alt'}">
            <div class="k-item-header">
               <span class="k-qty">${escapeHtml(qty)}x</span>
               <span class="k-name">${escapeHtml(name)}</span>
            </div>
            ${modLines}${noteLine}
         </div>
      `;
    }).join('');

    const kitchenNotes = order.kitchenNotes || order.notes;

    return `<!DOCTYPE html>
<html dir="${dir}" lang="${lang}">
<head>
<meta charset="UTF-8">
<title>${ticketTitle}</title>
<style>
   @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap');

   @page { margin: 2mm; size: 80mm auto; }
   * { margin: 0; padding: 0; box-sizing: border-box; }

   body {
      font-family: 'Cairo', 'Segoe UI', 'Arial', sans-serif;
      font-size: 14px;
      color: #000;
      width: 72mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 2mm;
      direction: ${dir};
      line-height: 1.3;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
   }

   /* ── Header ── */
   .k-header {
      text-align: center;
      padding: 4px 0 6px;
      border-bottom: 3px solid #000;
      margin-bottom: 4px;
   }
   .k-title {
      font-size: 20px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
   }
   .k-printer-name {
      font-size: 11px;
      font-weight: 700;
      color: #555;
   }

   /* ── Order Info Strip ── */
   .k-info-strip {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 4px;
      background: #000;
      color: #fff;
      border-radius: 4px;
      margin: 4px 0;
   }
   .k-order-num {
      font-size: 20px;
      font-weight: 900;
   }
    .k-type-badge {
       font-size: 13px;
       font-weight: 800;
       line-height: 1.8;
       padding: 4px 12px;
       border: 2px solid #fff;
       border-radius: 8px;
       overflow: visible;
       white-space: normal;
       text-align: center;
    }
   .k-time {
      font-size: 14px;
      font-weight: 700;
   }

   /* ── Table / Customer ── */
   .k-context {
      padding: 4px 0;
      font-size: 14px;
      font-weight: 700;
      border-bottom: 1px dashed #999;
   }
   .k-context-item {
      padding: 1px 0;
   }

   /* ── Items ── */
   .k-items {
      padding: 4px 0;
   }
   .k-item {
      padding: 6px 4px;
      border-bottom: 1px dashed #ccc;
   }
   .k-item-alt {
      background: #f5f5f5;
   }
   .k-item-header {
      display: flex;
      align-items: baseline;
      gap: 6px;
   }
   .k-qty {
      font-size: 22px;
      font-weight: 900;
      min-width: 34px;
      text-align: center;
      color: #000;
      background: #fff;
      border: 2px solid #000;
      border-radius: 2px;
      padding: 0 4px;
      line-height: 1.15;
      -webkit-print-color-adjust: economy;
      print-color-adjust: economy;
   }
   .k-name {
      font-size: 18px;
      font-weight: 800;
      line-height: 1.3;
   }
   .k-mod {
      font-size: 13px;
      font-weight: 600;
      color: #444;
      padding-${align}: 44px;
      line-height: 1.3;
   }
   .k-note {
      font-size: 13px;
      font-weight: 700;
      color: #c62828;
      padding-${align}: 44px;
      margin-top: 2px;
      line-height: 1.3;
   }

   /* ── Kitchen Notes ── */
   .k-notes-section {
      margin: 6px 0;
      padding: 6px;
      border: 2px solid #c62828;
      border-radius: 4px;
      background: #fff3f3;
   }
   .k-notes-title {
      font-size: 12px;
      font-weight: 800;
      color: #c62828;
      text-transform: uppercase;
      margin-bottom: 2px;
   }
   .k-notes-text {
      font-size: 14px;
      font-weight: 700;
      color: #333;
   }

   /* ── Footer ── */
   .k-footer {
      text-align: center;
      padding-top: 6px;
      border-top: 3px solid #000;
      margin-top: 6px;
   }
   .k-footer-time {
      font-size: 10px;
      color: #888;
   }

   @media print {
      body { width: 72mm; padding: 0; }
      .no-print { display: none !important; }
   }
</style>
</head>
<body>

   <!-- ═══ Header ═══ -->
   <div class="k-header">
      <div class="k-title">${escapeHtml(ticketTitle)}</div>
      ${printerName ? `<div class="k-printer-name">${escapeHtml(printerName)}</div>` : ''}
   </div>

   <!-- ═══ Order Info Strip ═══ -->
   <div class="k-info-strip">
      <span class="k-order-num">#${escapeHtml(order.orderNumber || order.id?.slice(0, 6) || '-')}</span>
      <span class="k-type-badge">${escapeHtml(orderTypeText)}</span>
      <span class="k-time">${escapeHtml(timeStr)}</span>
   </div>

   <!-- ═══ Context (Table / Customer) ═══ -->
   ${getTableDisplayName(order as any) || order.customerName ? `
   <div class="k-context">
      ${getTableDisplayName(order as any) ? `<div class="k-context-item">${isAr ? 'طاولة' : 'Table'}: ${escapeHtml(getTableDisplayName(order as any))}</div>` : ''}
      ${order.customerName ? `<div class="k-context-item">${isAr ? 'العميل' : 'Customer'}: ${escapeHtml(order.customerName)}</div>` : ''}
   </div>
   ` : ''}

   <!-- ═══ Items ═══ -->
   <div class="k-items">
      ${itemRows}
   </div>

   <!-- ═══ Kitchen Notes ═══ -->
   ${kitchenNotes ? `
   <div class="k-notes-section">
      <div class="k-notes-title">${isAr ? '! ملاحظات' : '! NOTES'}</div>
      <div class="k-notes-text">${escapeHtml(kitchenNotes)}</div>
   </div>
   ` : ''}

   <!-- ═══ Footer ═══ -->
   <div class="k-footer">
      <div class="k-footer-time">${escapeHtml(dateStr)} - ${escapeHtml(timeStr)} - ${escapeHtml(settings.restaurantName || '')}</div>
   </div>

</body>
</html>`;
};
