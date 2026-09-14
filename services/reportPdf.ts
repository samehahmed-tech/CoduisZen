/**
 * Direct designer-PDF pipeline for reports (no print dialog).
 * Heavy libs (html2canvas + jspdf) load lazily on first export only.
 * Canvas-based so Arabic/RTL, colors and charts render pixel-perfect.
 */

export interface DirectPdfOptions {
    filename: string;
    title: string;
    restaurant: string;
    logoUrl?: string;
    metaChips?: string[];
    subtitle?: string;
    orientation?: 'landscape' | 'portrait';
    isArabic?: boolean;
}

const esc = (s: string) =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Branded A4 cover header rendered as the first page content. */
export function buildPdfCover(opts: Pick<DirectPdfOptions, 'title' | 'restaurant' | 'logoUrl' | 'metaChips' | 'subtitle' | 'isArabic'>): string {
    const dir = opts.isArabic ? 'rtl' : 'ltr';
    const chips = (opts.metaChips || []).filter(Boolean).map((m) => `<span class="pdf-chip">${esc(m)}</span>`).join('');
    return `
    <div class="pdf-cover" dir="${dir}">
      <div class="pdf-brand">
        ${opts.logoUrl ? `<img class="pdf-logo" src="${opts.logoUrl}" alt="" crossorigin="anonymous" onerror="this.style.display='none'" />` : ''}
        <div>
          <div class="pdf-restaurant">${esc(opts.restaurant)}</div>
          <div class="pdf-title">${esc(opts.title)}</div>
          ${opts.subtitle ? `<div class="pdf-sub">${esc(opts.subtitle)}</div>` : ''}
        </div>
      </div>
      <div class="pdf-chips">${chips}<span class="pdf-chip pdf-chip-date">${esc(new Date().toLocaleString(opts.isArabic ? 'ar-EG' : 'en-GB'))}</span></div>
    </div>`;
}

const PDF_DOC_CSS = `
  .pdf-doc { background: #ffffff; color: #0f172a; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 28px 30px; }
  .pdf-cover { border: 1px solid #dbe4ee; border-top: 6px solid #0f766e; border-radius: 14px; padding: 20px 22px; margin-bottom: 16px; background: linear-gradient(135deg, #f8fbff 0%, #ffffff 56%, #ecfdf5 100%); }
  .pdf-brand { display: flex; align-items: center; gap: 14px; }
  .pdf-logo { width: 54px; height: 54px; object-fit: contain; }
  .pdf-restaurant { font-size: 13px; font-weight: 800; color: #0f766e; text-transform: uppercase; letter-spacing: 0.08em; }
  .pdf-title { font-size: 24px; font-weight: 900; color: #10243e; margin-top: 2px; }
  .pdf-sub { font-size: 11px; font-weight: 700; color: #5b6b7d; margin-top: 4px; }
  .pdf-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .pdf-chip { border: 1px solid #dbe4ee; border-radius: 999px; padding: 6px 12px; background: #ffffff; font-size: 10px; font-weight: 800; color: #475569; }
  .pdf-chip-date { background: #ecfeff; border-color: #b7ecea; color: #0f766e; }
  .pdf-doc table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .pdf-doc thead th { background: #10243e; color: #ffffff; padding: 8px 10px; font-size: 10px; font-weight: 900; }
  .pdf-doc td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
  .pdf-doc tbody tr:nth-child(even) { background: #f8fafc; }
  .pdf-doc tfoot td { background: #0f766e; color: #ffffff; font-weight: 900; }
`;

/**
 * Render an HTML string to a multipage A4 PDF and download it.
 * Arabic/RTL renders pixel-perfect (canvas-based). Throws on failure
 * so callers can fall back to the print-window flow.
 */
export async function downloadHtmlPdf(bodyHtml: string, opts: DirectPdfOptions): Promise<void> {
    const orientation = opts.orientation || 'landscape';
    const widthPx = orientation === 'landscape' ? 1047 : 719; // A4 printable width @96dpi minus margins
    const wrapper = document.createElement('div');
    wrapper.setAttribute(
        'style',
        `position:fixed;left:-12000px;top:0;width:${widthPx}px;background:#ffffff;color-scheme:light;` +
            `--bg-card:255 255 255;--bg-app:255 255 255;--bg-elevated:248 250 252;--bg-sidebar:248 250 252;` +
            `--text-main:15 23 42;--text-muted:100 116 139;--border-color:219 228 238;`
    );
    wrapper.setAttribute('dir', opts.isArabic ? 'rtl' : 'ltr');
    const doc = document.createElement('div');
    doc.className = 'pdf-doc';
    const style = document.createElement('style');
    style.textContent = PDF_DOC_CSS;
    doc.appendChild(style);
    const cover = document.createElement('div');
    cover.innerHTML = buildPdfCover(opts);
    doc.appendChild(cover);
    const body = document.createElement('div');
    body.innerHTML = bodyHtml;
    // Neutralize dark-mode-only surfaces inside the capture
    body.querySelectorAll('*').forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.boxShadow = 'none';
        htmlEl.style.textShadow = 'none';
    });
    doc.appendChild(body);
    wrapper.appendChild(doc);
    document.body.appendChild(wrapper);

    // Force light theme during capture so accounting PDFs are always
    // clean and printable. A progress veil hides the momentary switch.
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    const veil = document.createElement('div');
    veil.setAttribute(
        'style',
        'position:fixed;inset:0;z-index:99999;background:#ffffff;display:flex;align-items:center;justify-content:center;' +
            'font-family:Tahoma,Arial,sans-serif;font-weight:900;font-size:15px;color:#0f766e;'
    );
    veil.textContent = opts.isArabic ? 'جاري تجهيز ملف PDF...' : 'Generating PDF...';
    document.body.appendChild(veil);
    if (hadDark) root.classList.remove('dark');

    try {
    // Let images/fonts settle before capture
        await new Promise((r) => setTimeout(r, 350));
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
            import('html2canvas'),
            import('jspdf'),
        ]);
        const fullHeight = doc.scrollHeight;
        const scale = fullHeight > 14000 ? 1.2 : fullHeight > 7000 ? 1.5 : 2;
        const canvas = await html2canvas(doc, {
            backgroundColor: '#ffffff',
            scale,
            useCORS: true,
            logging: false,
        });
        const imgData = canvas.toDataURL('image/png');

        const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
        const pageW = orientation === 'landscape' ? 297 : 210;
        const pageH = orientation === 'landscape' ? 210 : 297;
        const marginX = 10;
        const marginTop = 10;
        const footerH = 14;
        const contentW = pageW - marginX * 2;
        const contentH = pageH - marginTop - footerH;
        const imgH = (canvas.height * contentW) / canvas.width;
        const totalPages = Math.max(1, Math.ceil(imgH / contentH));

        for (let page = 0; page < totalPages; page += 1) {
            if (page > 0) pdf.addPage();
            const yOffset = -(page * contentH);
            pdf.addImage(imgData, 'PNG', marginX, marginTop + yOffset, contentW, imgH);
            // Footer (drawn over the bottom margin, outside content flow)
            pdf.setFontSize(8);
            pdf.setTextColor(100, 116, 139);
            const footerY = pageH - 7;
            const leftText = opts.restaurant;
            const rightText = `${opts.isArabic ? 'صفحة' : 'Page'} ${page + 1} / ${totalPages}`;
            if (opts.isArabic) {
                pdf.text(rightText, pageW - marginX, footerY, { align: 'right' });
                pdf.text(leftText, marginX, footerY);
            } else {
                pdf.text(leftText, marginX, footerY);
                pdf.text(rightText, pageW - marginX, footerY, { align: 'right' });
            }
        }
        pdf.save(opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`);
    } finally {
        if (hadDark) root.classList.add('dark');
        veil.remove();
        wrapper.remove();
    }
}

/**
 * Capture a live report element (tables + charts) into a branded multipage A4 PDF.
 */
export async function downloadElementPdf(el: HTMLElement, opts: DirectPdfOptions): Promise<void> {
    await downloadHtmlPdf(el.innerHTML, opts);
}
