/**
 * driverTicketTemplate.ts — Generates the driver/dispatch ticket (شيك الطيار).
 * Printed when an order is assigned to a driver so the pilot moves with a
 * paper slip: driver name, customer phone/address, items, and cash to collect.
 *
 * Thermal-safe by design: Cairo + basic Latin/Arabic glyphs only — NO emoji
 * or decorative symbols (they rasterize as tofu boxes on thermal printers).
 */
import { Order, OrderType, OrderItem, Branch, AppSettings } from '../types';
import { getCashToCollect } from '../src/features/driver/cashCollection';

interface DriverTicketParams {
    order: Order;
    driverName: string;
    driverPhone?: string;
    settings: AppSettings;
    currencySymbol: string;
    lang: 'en' | 'ar';
    branch?: Branch;
    title?: string;
    printerName?: string;
}

const escapeHtml = (value: unknown): string =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

export const generateDriverTicketHTML = ({
    order,
    driverName,
    driverPhone,
    settings,
    currencySymbol,
    lang,
    branch,
    title,
    printerName,
}: DriverTicketParams): string => {
    const isAr = lang === 'ar';
    const dir = isAr ? 'rtl' : 'ltr';
    const align = isAr ? 'right' : 'left';
    const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
    const timeStr = createdAt.toLocaleTimeString(isAr ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    const dateStr = createdAt.toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short' });

    const ticketTitle = title || (isAr ? 'تذكرة طيار' : 'DRIVER TICKET');
    const typeText = order.type === OrderType.DELIVERY
        ? (isAr ? 'ديلفري' : 'DELIVERY')
        : (isAr ? 'استلام عميل' : 'PICKUP');

    const displayItems = order.items || [];
    const itemRows = displayItems.map((item: OrderItem, idx: number) => {
        const name = isAr ? ((item as any).nameAr || item.name) : item.name;
        const qty = item.quantity || 1;
        const modLines = (item.selectedModifiers || []).map((m) =>
            `<div class="d-mod">+ ${escapeHtml(m.optionName || m.groupName || '')}</div>`
        ).join('');
        const noteLine = item.notes ? `<div class="d-note">! ${escapeHtml(item.notes)}</div>` : '';
        return `
         <div class="d-item ${idx % 2 === 0 ? '' : 'd-item-alt'}">
            <div class="d-item-header">
               <span class="d-qty">${escapeHtml(qty)}x</span>
               <span class="d-name">${escapeHtml(name)}</span>
            </div>
            ${modLines}${noteLine}
         </div>
      `;
    }).join('');

    const cashToCollect = getCashToCollect(order as any);
    const otp = (order as any).delivery_otp ? String((order as any).delivery_otp) : '';
    const total = Number((order as any).total || 0);
    const paidText = cashToCollect > 0
        ? (isAr ? `المطلوب تحصيله: ${currencySymbol} ${cashToCollect.toFixed(2)}` : `Collect: ${currencySymbol} ${cashToCollect.toFixed(2)}`)
        : (isAr ? 'مدفوع - لا تحصل شيئا' : 'PAID - collect nothing');
    const paymentRaw = String((order as any).paymentMethod || (order as any).payment_method || '');
    const orderNotes = order.deliveryNotes || order.notes || '';

    return `<!DOCTYPE html>
<html dir="${dir}" lang="${lang}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(ticketTitle)}</title>
<style>
   @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap');

   @page { margin: 2mm; size: 80mm auto; }
   * { margin: 0; padding: 0; box-sizing: border-box; }

   body {
      font-family: 'Cairo', 'Segoe UI', 'Arial', sans-serif;
      font-size: 15px;
      color: #000;
      width: 72mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 2mm;
      direction: ${dir};
      line-height: 1.32;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
   }

   .d-header { text-align: center; padding: 4px 0 6px; border-bottom: 3px solid #000; margin-bottom: 4px; }
   .d-title { font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
   .d-printer-name { font-size: 11px; font-weight: 700; color: #555; }

   /* Driver band — the most important line on the slip */
   .d-driver {
      display: block;
      text-align: center;
      padding: 8px 4px;
      background: #000;
      color: #fff;
      border-radius: 4px;
      margin: 6px 0;
   }
   .d-driver-label { display: block; font-size: 12px; font-weight: 800; }
   .d-driver-name { display: block; font-size: 26px; font-weight: 900; line-height: 1.2; }
   .d-driver-phone { display: block; font-size: 15px; font-weight: 800; direction: ltr; unicode-bidi: isolate; }

   .d-info-strip {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 4px;
      border: 2px solid #000;
      border-radius: 4px;
      margin: 4px 0;
   }
   .d-order-num { font-size: 20px; font-weight: 900; }
   .d-type-badge { font-size: 13px; font-weight: 800; padding: 2px 10px; border: 2px solid #000; border-radius: 4px; }
   .d-time { font-size: 14px; font-weight: 700; }

   .d-otp {
      text-align: center;
      padding: 6px 4px;
      border: 2px dashed #000;
      border-radius: 4px;
      margin: 4px 0;
      font-size: 15px;
      font-weight: 800;
   }
   .d-otp-code { display: block; font-size: 30px; font-weight: 900; letter-spacing: 4px; direction: ltr; unicode-bidi: isolate; }

   .d-customer { padding: 6px 4px; border-bottom: 1px dashed #999; font-weight: 700; }
   .d-customer-name { font-size: 19px; font-weight: 900; }
   .d-customer-phone { font-size: 22px; font-weight: 900; direction: ltr; unicode-bidi: isolate; display: inline-block; }
   .d-customer-address { font-size: 17px; font-weight: 800; margin-top: 2px; }
   .d-customer-notes { font-size: 14px; font-weight: 700; color: #333; margin-top: 2px; }
   .d-row-label { font-size: 12px; font-weight: 800; color: #444; }

   .d-items { padding: 4px 0; }
   .d-item { padding: 6px 4px; border-bottom: 1px dashed #ccc; }
   .d-item-alt { background: #f5f5f5; }
   .d-item-header { display: flex; align-items: baseline; gap: 6px; }
   .d-qty {
      font-size: 22px; font-weight: 900; min-width: 34px; text-align: center;
      color: #000; background: #fff; border: 2px solid #000; border-radius: 2px;
      padding: 0 4px; line-height: 1.15;
   }
   .d-name { font-size: 18px; font-weight: 800; line-height: 1.3; }
   .d-mod { font-size: 13px; font-weight: 600; color: #444; padding-${align}: 44px; line-height: 1.3; }
   .d-note { font-size: 13px; font-weight: 700; color: #c62828; padding-${align}: 44px; margin-top: 2px; line-height: 1.3; }

   .d-collect {
      text-align: center;
      padding: 10px 6px;
      border: 4px solid #000;
      border-radius: 4px;
      margin: 6px 0;
      font-size: 19px;
      font-weight: 900;
   }
   .d-collect small { display: block; font-size: 12px; font-weight: 800; color: #444; }

   .d-footer { text-align: center; padding-top: 6px; border-top: 3px solid #000; margin-top: 6px; }
   .d-footer-time { font-size: 10px; color: #888; }

   @media print {
      body { width: 72mm; padding: 0; }
   }
</style>
</head>
<body>

   <div class="d-header">
      <div class="d-title">${escapeHtml(ticketTitle)}</div>
      ${printerName ? `<div class="d-printer-name">${escapeHtml(printerName)}</div>` : ''}
      ${branch?.name || branch?.nameAr ? `<div class="d-printer-name">${escapeHtml(isAr ? (branch?.nameAr || branch?.name || '') : (branch?.name || ''))}</div>` : ''}
   </div>

   <div class="d-driver">
      <span class="d-driver-label">${isAr ? 'الطيار' : 'DRIVER'}</span>
      <span class="d-driver-name">${escapeHtml(driverName)}</span>
      ${driverPhone ? `<span class="d-driver-phone">${escapeHtml(driverPhone)}</span>` : ''}
   </div>

   <div class="d-info-strip">
      <span class="d-order-num">#${escapeHtml((order as any).orderNumber || String(order.id || '').slice(0, 6) || '-')}</span>
      <span class="d-type-badge">${escapeHtml(typeText)}</span>
      <span class="d-time">${escapeHtml(timeStr)}</span>
   </div>

   ${otp ? `
   <div class="d-otp">
      ${isAr ? 'كود التسليم' : 'HANDOVER CODE'}
      <span class="d-otp-code">${escapeHtml(otp)}</span>
   </div>
   ` : ''}

   <div class="d-customer">
      ${order.customerName ? `<div><span class="d-row-label">${isAr ? 'العميل' : 'Customer'}: </span><span class="d-customer-name">${escapeHtml(order.customerName)}</span></div>` : ''}
      ${order.customerPhone ? `<div><span class="d-row-label">${isAr ? 'هاتف' : 'Phone'}: </span><span class="d-customer-phone">${escapeHtml(order.customerPhone)}</span></div>` : ''}
      ${order.deliveryAddress ? `<div class="d-customer-address">${escapeHtml(order.deliveryAddress)}</div>` : ''}
      ${orderNotes ? `<div class="d-customer-notes">${escapeHtml(orderNotes)}</div>` : ''}
   </div>

   <div class="d-items">
      ${itemRows}
   </div>

   <div class="d-collect">
      ${escapeHtml(paidText)}
      ${paymentRaw ? `<small>${escapeHtml(isAr ? 'طريقة الدفع' : 'Payment')}: ${escapeHtml(paymentRaw)} - ${escapeHtml(isAr ? 'الإجمالي' : 'Total')} ${escapeHtml(currencySymbol)} ${total.toFixed(2)}</small>` : ''}
   </div>

   <div class="d-footer">
      <div class="d-footer-time">${escapeHtml(dateStr)} - ${escapeHtml(timeStr)} - ${escapeHtml(settings.restaurantName || '')}</div>
   </div>

</body>
</html>`;
};
