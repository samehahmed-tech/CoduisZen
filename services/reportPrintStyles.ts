export const getReportPrintCSS = (restaurantName: string, reportTitle: string, dateRange: string): string => {
  const isArabic = /[\u0600-\u06FF]/.test(`${restaurantName} ${reportTitle} ${dateRange}`);
  const printedAt = new Date().toLocaleString(isArabic ? 'ar-EG' : 'en-GB');
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo.png` : '/logo.png';
  const dir = isArabic ? 'rtl' : 'ltr';
  const align = isArabic ? 'right' : 'left';

  return `
<style>
  @page {
    margin: 12mm;
    size: A4 portrait;
  }

  html, body {
    background: #ffffff !important;
    color: #0f172a !important;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif !important;
    direction: ${dir};
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  body {
    margin: 0 !important;
    padding: 0 !important;
  }

  nav, button, .sidebar, [class*="sidebar"], .no-print, .recharts-tooltip-wrapper {
    display: none !important;
  }

  * {
    box-shadow: none !important;
    text-shadow: none !important;
    backdrop-filter: none !important;
  }

  table {
    width: 100% !important;
    border-collapse: collapse !important;
    margin-top: 10px !important;
    page-break-inside: auto !important;
    overflow: visible !important;
  }

  thead tr {
    background: #10243e !important;
    color: #ffffff !important;
  }

  th, td {
    border: 1px solid #dbe4ee !important;
    padding: 8px 10px !important;
    font-size: 9.5pt !important;
    vertical-align: middle !important;
  }

  th {
    font-weight: 900 !important;
    text-align: ${align} !important;
  }

  td {
    color: #162033 !important;
    text-align: ${align} !important;
  }

  tbody tr:nth-child(even) {
    background: #f8fbfc !important;
  }

  h1, h2, h3, h4, p {
    color: #0f172a !important;
  }

  svg,
  .recharts-responsive-container {
    max-width: 100% !important;
  }

  .print-shell {
    display: block !important;
  }

  .print-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 0 0 18px 0;
    margin-bottom: 18px;
    border-bottom: 2px solid #0f766e;
  }

  .print-header__brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .print-header__brand img {
    width: 56px;
    height: 56px;
    object-fit: contain;
  }

  .print-header__title {
    font-size: 22px;
    font-weight: 900;
    line-height: 1.2;
    margin: 0;
    color: #10243e;
  }

  .print-header__meta {
    margin-top: 6px;
    color: #5b6b7d;
    font-size: 11px;
    font-weight: 700;
  }

  .print-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    background: #ecfeff;
    border: 1px solid #b7ecea;
    color: #0f766e;
    font-size: 10px;
    font-weight: 800;
  }

  .print-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex !important;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0 0;
    border-top: 1px solid #dbe4ee;
    color: #64748b;
    font-size: 8.5pt;
    font-weight: 700;
  }

  .report-export-shell {
    direction: ${dir};
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    color: #0f172a;
    background: #ffffff;
  }

  .report-export-cover {
    border: 1px solid #dbe4ee;
    border-top: 6px solid #0f766e;
    border-radius: 14px;
    padding: 22px;
    margin-bottom: 18px;
    background: linear-gradient(135deg, #f8fbff 0%, #ffffff 56%, #ecfdf5 100%);
  }

  .report-export-title {
    margin: 0;
    font-size: 25px;
    line-height: 1.2;
    font-weight: 900;
    color: #10243e;
  }

  .report-export-meta {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    color: #475569;
    font-size: 11px;
    font-weight: 800;
  }

  .report-export-meta span {
    border: 1px solid #dbe4ee;
    border-radius: 999px;
    padding: 7px 10px;
    background: #ffffff;
  }

  .report-export-body {
    border: 1px solid #dbe4ee;
    border-radius: 14px;
    padding: 16px;
  }
</style>

<div class="print-shell" dir="${dir}">
  <div class="print-header">
    <div class="print-header__brand">
      <img src="${logoUrl}" alt="Coduis Zen" />
      <div>
        <h1 class="print-header__title">${restaurantName}</h1>
        <div class="print-header__meta">${reportTitle}</div>
        <div class="print-header__meta">${dateRange}</div>
      </div>
    </div>
    <div class="print-chip">${isArabic ? 'جاهز للطباعة' : 'Prepared for print'}</div>
  </div>
</div>

<div class="print-footer" dir="${dir}">
  <span>${restaurantName}</span>
  <span>${isArabic ? 'وقت الطباعة' : 'Printed at'}: ${printedAt}</span>
</div>
`;
};
