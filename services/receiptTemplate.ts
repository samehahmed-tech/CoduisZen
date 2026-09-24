/**
 * receiptTemplate.ts - Generates styled HTML receipt for browser printing
 * Designed for 80mm thermal printer width with premium layout & full Arabic support
 */
import { Order, OrderType, Branch, AppSettings } from '../types';
import { calculateOrderTotalsFromOrder } from './orderTotals';
import { getTableDisplayName } from '../src/utils/tableDisplay';
import { createQrDataUrl } from './templateReceiptGenerator';

interface ReceiptTemplateParams {
   order: Order;
   settings: AppSettings;
   currencySymbol: string;
   lang: 'en' | 'ar';
   t: any;
   branch?: Branch;
   title?: string;
}

export const generateReceiptHTML = ({
   order,
   settings,
   currencySymbol,
   lang,
   t,
   branch,
   title,
}: ReceiptTemplateParams): string => {
   const isAr = lang === 'ar';
   const dir = isAr ? 'rtl' : 'ltr';
   const align = isAr ? 'right' : 'left';
   const alignEnd = isAr ? 'left' : 'right';
   const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
   const dateStr = createdAt.toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
   const timeStr = createdAt.toLocaleTimeString(isAr ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' });

   const orderTypeLabels: Record<string, { ar: string; en: string; icon: string }> = {
      [OrderType.DINE_IN]: { ar: 'صالة', en: 'Dine-In', icon: '' },
      [OrderType.DELIVERY]: { ar: 'دليفري', en: 'Delivery', icon: '' },
      [OrderType.PICKUP]: { ar: 'استلام عميل', en: 'Pickup', icon: '' },
      [OrderType.TAKEAWAY]: { ar: 'تيك اواي', en: 'Takeaway', icon: '' },
   };
   const typeInfo = orderTypeLabels[order.type] || orderTypeLabels[OrderType.TAKEAWAY];
   const orderTypeText = isAr ? typeInfo.ar : typeInfo.en;

   const restaurantName = settings.restaurantName || 'Restaurant';
   const branchName = (isAr ? branch?.nameAr || branch?.name : branch?.name || branch?.nameAr) || '';
   const branchAddr = settings.branchAddress || branch?.address || '';
   const phone = settings.phone || branch?.phone || '';
   const taxId = (settings as any).taxRegistrationNumber || '';
   const logoUrl = settings.receiptLogoUrl || '';
   const qrValue = settings.receiptQrUrl || '';
   const qrImageUrl = qrValue ? createQrDataUrl(qrValue, 260) : '';

   // Calculate totals
   const totals = calculateOrderTotalsFromOrder(order, settings);
   const subtotal = totals.subtotal;
   const totalItemDiscounts = totals.itemDiscountTotal;
   const itemRows = (order.items || []).map((item, idx) => {
      const modsPrice = (item.selectedModifiers || []).reduce((s, m) => s + (m.price || 0), 0);
      const unitPrice = (item.price || 0) + modsPrice;
      const lineGross = unitPrice * (item.quantity || 1);
      let itemDiscount = 0;
      if ((item as any).itemDiscount && (item as any).itemDiscount > 0) {
         itemDiscount = (item as any).itemDiscountType === 'percent'
            ? lineGross * ((item as any).itemDiscount / 100)
            : (item as any).itemDiscount;
      }
      const lineNet = lineGross - itemDiscount;

      const name = isAr ? ((item as any).nameAr || item.name) : item.name;

      const modLines = (item.selectedModifiers || []).map(m =>
         `<div class="item-mod">+ ${m.optionName || m.groupName}${m.price > 0 ? ` <span class="mod-price">(${m.price.toFixed(2)})</span>` : ''}</div>`
      ).join('');

      const noteLine = item.notes
         ? `<div class="item-note">${item.notes}</div>`
         : '';

      const discountLine = itemDiscount > 0
         ? `<div class="item-discount">${isAr ? '\u062e\u0635\u0645' : 'Disc'}: -${itemDiscount.toFixed(2)}</div>`
         : '';

      const rowBg = idx % 2 === 0 ? '' : ' class="alt-row"';

      return `
         <tr${rowBg}>
            <td class="col-item">
               <span class="item-name">${name}</span>
               ${modLines}${noteLine}${discountLine}
            </td>
            <td class="col-qty">${item.quantity || 1}</td>
            <td class="col-price">${unitPrice.toFixed(2)}</td>
            <td class="col-total">${lineNet.toFixed(2)}</td>
         </tr>
      `;
   }).join('');

   const orderDiscount = totals.orderDiscountAmount;
   const tax = totals.tax;
   const total = totals.total;

   // Summary rows
   const summaryLines: { label: string; value: string; cls: string }[] = [];
   summaryLines.push({ label: isAr ? 'المجموع الفرعي' : 'Subtotal', value: `${subtotal.toFixed(2)}`, cls: '' });
   if (totalItemDiscounts > 0) {
      summaryLines.push({ label: isAr ? 'خصومات الأصناف' : 'Item Discounts', value: `-${totalItemDiscounts.toFixed(2)}`, cls: 'discount-row' });
   }
   if (orderDiscount > 0) {
      summaryLines.push({
         label: isAr ? `خصم (${totals.orderDiscountPercent}%)` : `Discount (${totals.orderDiscountPercent}%)`,
         value: `-${orderDiscount.toFixed(2)}`,
         cls: 'discount-row',
      });
   }
   summaryLines.push({ label: isAr ? 'الضريبة' : 'Tax', value: tax.toFixed(2), cls: '' });
   if (order.tipAmount && order.tipAmount > 0) {
      summaryLines.push({ label: isAr ? 'البقشيش' : 'Tip', value: order.tipAmount.toFixed(2), cls: '' });
   }

   const summaryHTML = summaryLines.map(r => `
      <tr class="summary-line ${r.cls}">
         <td>${r.label}</td>
         <td>${r.value}</td>
      </tr>
   `).join('');

    // Payment
    const pmStr = String(order.paymentMethod || '').trim().toUpperCase();
   const paymentLabels: Record<string, { ar: string; en: string }> = {
      CASH: { ar: 'كاش', en: 'Cash' },
      CARD: { ar: 'بطاقة', en: 'Card' },
      VISA: { ar: 'فيزا', en: 'Visa' },
      VODAFONE_CASH: { ar: 'فودافون كاش', en: 'Vodafone Cash' },
      INSTAPAY: { ar: 'انستا باي', en: 'InstaPay' },
      SPLIT: { ar: 'مقسم', en: 'Split' },
   };
   const pmInfo = paymentLabels[pmStr];
   const paymentMethodText = pmInfo ? (isAr ? pmInfo.ar : pmInfo.en) : (order.paymentMethod ? String(order.paymentMethod) : '');

   const receiptTitle = title || t?.order_receipt || (isAr ? 'إيصال بيع' : 'Sales Receipt');

   // Customer / table info
   let customerBlock = '';
   const tableName = getTableDisplayName(order as any);
   if (tableName) {
      customerBlock += `<div class="info-chip">${isAr ? '\u0637\u0627\u0648\u0644\u0629' : 'Table'}: <strong>${tableName}</strong></div>`;
   }
   if (order.customerName) {
      customerBlock += `<div class="info-chip">${order.customerName}${order.customerPhone ? ` - ${order.customerPhone}` : ''}</div>`;
   }
   if (order.deliveryAddress) {
      customerBlock += `<div class="info-chip">${order.deliveryAddress}</div>`;
   }
   if (order.notes) {
      customerBlock += `<div class="info-chip order-note">${order.notes}</div>`;
   }

   return `<!DOCTYPE html>
<html dir="${dir}" lang="${lang}">
<head>
<meta charset="UTF-8">
<title>${restaurantName} - ${receiptTitle}</title>
<style>
   @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');

   @page { margin: 0; size: 80mm auto; }
   * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
       font-family: 'Cairo', Tahoma, Arial, sans-serif;
       font-size: 16px;
       color: #000;
       width: 76mm;
       max-width: 100%;
       margin: 0 auto;
       padding: 3mm 2mm 3mm;
       direction: ${dir};
       line-height: 1.6;
       overflow: visible;
       -webkit-print-color-adjust: exact;
       print-color-adjust: exact;
    }

   /* Header */
   .receipt-header {
      text-align: center;
      padding-bottom: 8px;
      border-bottom: 2px solid #111;
   }
   .restaurant-name {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: -0.5px;
      line-height: 1.2;
   }
   .branch-name { font-size: 14px; font-weight: 800; color: #000; margin-top: 1px; }
   .branch-info { font-size: 12px; color: #333; font-weight: 700; margin-top: 1px; }

    /* Title — Arabic glyphs (diacritics) are taller than Latin: keep a roomy
       line box and zero letter-spacing (spacing breaks Arabic shaping). */
    .receipt-title {
       text-align: center;
       font-size: 18px;
       font-weight: 900;
       line-height: 1.9;
       letter-spacing: 0;
       padding: 8px 6px;
       margin: 6px 0;
       border: 1px dashed #555;
       border-radius: 4px;
       background: #f5f5f5;
       overflow: visible;
       overflow-wrap: anywhere;
    }

   /* Order Meta */
    .order-meta {
       display: grid;
       grid-template-columns: minmax(0, 1fr) minmax(0, .9fr) minmax(0, 1.35fr);
      align-items: flex-start;
      gap: 4px;
      padding: 6px 0;
      border-bottom: 1px dashed #555;
   }
    .meta-block {
       display: flex;
       min-width: 0;
       flex-direction: column;
       gap: 1px;
       text-align: ${align};
   }
    .meta-label {
       font-size: 11px;
       font-weight: 900;
       letter-spacing: 0;
       line-height: 1.6;
       color: #333;
    }
     .meta-value {
        display: block;
        font-weight: 900;
        font-size: 16px;
        line-height: 1.6;
        padding-block: 2px;
        white-space: nowrap;
        unicode-bidi: isolate;
        overflow: visible;
    }
    /* Pill badges: Arabic needs a taller line box + vertical padding so the
       text never sits on (or under) the border when rasterized. */
    .type-badge {
       display: inline-flex;
       align-items: center;
       justify-content: center;
       padding: 4px 12px;
       background: #fff;
       color: #111;
       border: 1.5px solid #111;
       border-radius: 12px;
       font-size: 12px;
       font-weight: 900;
       line-height: 1.9;
       min-width: 56px;
       max-width: 100%;
       white-space: normal;
       overflow: visible;
       overflow-wrap: anywhere;
       text-align: center;
    }
    .receipt-logo {
       display: block;
       max-width: 54mm;
       max-height: 28mm;
       width: auto;
       height: auto;
       object-fit: contain;
       margin: 2mm auto 5px;
       padding-top: 1mm;
    }

   /* Customer Info */
   .customer-info {
      padding: 4px 0 6px;
   }
   .info-chip {
      font-size: 14px;
      font-weight: 800;
      padding: 2px 0;
      color: #000;
   }
   .order-note {
      font-style: italic;
      color: #333; font-weight: 700;
   }

   /* Items Table */
   .items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 6px 0;
   }
   .items-header td {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #333;
      padding: 4px 0;
      border-bottom: 2px solid #222;
   }
    .col-item { text-align: ${align}; width: 44%; }
    .col-qty  { text-align: center; width: 14%; }
    .col-price { text-align: center; width: 20%; }
    .col-total { text-align: ${alignEnd}; width: 22%; font-weight: 800; }
    .items-table .col-qty, .items-table .col-price, .items-table .col-total {
       direction: ltr;
       unicode-bidi: isolate;
       white-space: nowrap;
       font-variant-numeric: tabular-nums;
    }
   .items-table td {
      padding: 5px 2px;
      border-bottom: 1px dashed #999;
      vertical-align: top;
      font-size: 15px;
      overflow-wrap: anywhere;
      word-break: normal;
   }
   .alt-row td { background: #f0f0f0; }
   .item-name { font-weight: 900; font-size: 17px; display: block; line-height: 1.42; }
   .item-mod {
      font-size: 13px;
      color: #666;
      padding-${align}: 8px;
      line-height: 1.3;
   }
   .mod-price { color: #555; }
   .item-note {
      font-size: 13px;
      color: #888;
      font-style: italic;
      padding-${align}: 8px;
      margin-top: 1px;
   }
   .item-discount {
      font-size: 13px;
      color: #2e7d32;
      font-weight: 600;
      padding-${align}: 8px;
   }

   /* Separator */
   .dashed-sep {
      border: none;
      border-top: 1px dashed #666;
      margin: 6px 0;
   }
   .thick-sep {
      border: none;
      border-top: 2px solid #222;
      margin: 8px 0;
   }

   /* Summary */
   .summary-table {
      width: 100%;
      border-collapse: collapse;
   }
   .summary-line td {
      padding: 3px 0;
      font-size: 14px;
      font-weight: 600;
      color: #444;
   }
    .summary-line td:first-child { text-align: ${align}; }
    .summary-line td:last-child { text-align: ${alignEnd}; direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
   .discount-row td { color: #2e7d32; }

   /* Grand Total */
   .grand-total {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 10px;
      margin: 6px 2px 0;
      background: #fff;
      color: #000;
      border: 3px solid #111;
      border-radius: 4px;
      overflow: hidden;
   }
   .grand-total-label {
      font-size: 16px;
      font-weight: 800;
   }
     .grand-total-value {
        font-size: 22px;
        font-weight: 900;
        line-height: 1.6;
        letter-spacing: 0;
        direction: ltr;
        unicode-bidi: isolate;
        white-space: nowrap;
        overflow: visible;
        padding-block: 2px;
        text-align: ${alignEnd};
    }

   /* Payment */
   .payment-section {
      text-align: center;
      padding: 6px 0;
   }
     .payment-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 7px 18px;
        min-width: 96px;
        max-width: 100%;
        border: 1.5px solid #333;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 800;
        line-height: 1.8;
        /* Wrap instead of clipping: clipped half-glyphs rasterize as garbage. */
        white-space: normal;
        overflow: visible;
        overflow-wrap: anywhere;
        text-align: center;
        letter-spacing: 0;
     }

   /* Footer */
   .receipt-footer {
      text-align: center;
      padding-top: 8px;
      padding-bottom: 10px;
      border-top: 2px solid #111;
      margin-top: 8px;
   }
   .qr-block {
      text-align: center;
      padding: 7px 0 3px;
   }
   .qr-image {
      display: block;
      width: 30mm;
      height: 30mm;
      margin: 0 auto;
      image-rendering: pixelated;
   }
   .qr-caption {
      margin-top: 2px;
      font-size: 11px;
      font-weight: 800;
      color: #000;
   }
   .footer-thanks {
      font-size: 15px;
      font-weight: 800;
      margin-bottom: 2px;
   }
   .footer-sub {
      font-size: 12px;
      color: #333; font-weight: 700;
   }
   .tax-id-line {
      font-size: 11px;
      color: #555; font-weight: 700;
      margin-top: 4px;
   }
   .powered-by {
      font-size: 10px;
      color: #777; font-weight: 700;
      margin-top: 8px;
      letter-spacing: 0.5px;
   }

   @media print {
      body { width: 76mm; padding: 0; }
      .no-print { display: none !important; }
   }
</style>
</head>
<body>

   <!-- Header -->
   <div class="receipt-header">
      ${logoUrl ? `<img class="receipt-logo" src="${logoUrl}" alt="logo">` : ''}
      <div class="restaurant-name">${restaurantName}</div>
      ${branchName ? `<div class="branch-name">${branchName}</div>` : ''}
      ${branchAddr ? `<div class="branch-info">${branchAddr}</div>` : ''}
      ${phone ? `<div class="branch-info">${isAr ? 'هاتف' : 'Tel'}: ${phone}</div>` : ''}
   </div>

   <!-- Title -->
   <div class="receipt-title">${receiptTitle}</div>

   <!-- Order Meta -->
   <div class="order-meta">
      <div class="meta-block">
         <span class="meta-label">${isAr ? 'رقم الطلب' : 'ORDER #'}</span>
         <span class="meta-value">${order.orderNumber || order.id?.slice(0, 8) || '-'}</span>
      </div>
      <div class="meta-block" style="text-align:center;">
         <span class="meta-label">${isAr ? 'النوع' : 'TYPE'}</span>
         <span class="type-badge">${orderTypeText}</span>
      </div>
      <div class="meta-block" style="text-align:${alignEnd}">
         <span class="meta-label">${isAr ? 'التاريخ' : 'DATE'}</span>
         <span class="meta-value">${dateStr}</span>
         <span style="font-size:13px;font-weight:800;color:#000;">${timeStr}</span>
      </div>
   </div>

   <!-- Customer / Table -->
   ${customerBlock ? `<div class="customer-info">${customerBlock}</div>` : ''}

   <hr class="dashed-sep">

   <!-- Items -->
   <table class="items-table">
      <tr class="items-header">
        <td class="col-item">${isAr ? 'الصنف' : 'Item'}</td>
         <td class="col-qty">${isAr ? 'عدد' : 'Qty'}</td>
        <td class="col-price">${isAr ? 'السعر' : 'Price'}</td>
        <td class="col-total">${isAr ? 'المبلغ' : 'Total'}</td>
      </tr>
      ${itemRows}
   </table>

   <hr class="thick-sep">

   <!-- Summary -->
   <table class="summary-table">
      ${summaryHTML}
   </table>

   <!-- Grand Total -->
   <div class="grand-total">
      <span class="grand-total-label">${isAr ? 'الإجمالي' : 'TOTAL'}</span>
      <span class="grand-total-value">${currencySymbol} ${total.toFixed(2)}</span>
   </div>

   <!-- Payment -->
   ${paymentMethodText ? `
   <div class="payment-section">
      <span class="payment-pill">${isAr ? 'الدفع' : 'Paid'}: ${paymentMethodText}</span>
   </div>
   ` : ''}

   ${qrImageUrl ? `
      <div class="qr-block">
         <img class="qr-image" src="${qrImageUrl}" alt="QR">
         <div class="qr-caption">${isAr ? 'امسح الكود' : 'Scan QR'}</div>
      </div>
   ` : ''}

   <!-- Footer -->
   <div class="receipt-footer">
      <div class="footer-thanks">${(settings as any).receiptFooterMessage || (isAr ? 'شكراً لزيارتكم!' : 'Thank you for your visit!')}</div>
      <div class="footer-sub">${isAr ? 'نتمنى لكم تجربة سعيدة' : 'We hope you enjoyed your experience'}</div>
      ${taxId ? `<div class="tax-id-line">${isAr ? 'الرقم الضريبي' : 'Tax ID'}: ${taxId}</div>` : ''}
      <div class="powered-by">Powered by Coduis Zen</div>
   </div>

</body>
</html>`;
};

