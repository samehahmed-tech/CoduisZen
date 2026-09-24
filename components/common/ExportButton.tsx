import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2, Printer, X } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { downloadHtmlPdf } from '../../services/reportPdf';
import { escReportHtml, getReportBrand, isSameLogoUrl } from '../../services/reportBrand';

type Column = {
    key: string;
    label: string;
    format?: (val: any) => string;
};

interface ExportButtonProps {
    data: Record<string, any>[];
    columns: Column[];
    filename?: string;
    title?: string;
    className?: string;
    /** Subtitle line under the title (range / branch / filters). */
    subtitle?: string;
    /** Totals row aligned to columns (first cell usually TOTAL label). */
    totals?: (string | number)[];
}

const toCSV = (data: Record<string, any>[], columns: Column[]): string => {
    const header = columns.map(c => `"${String(c.label ?? '').replace(/"/g, '""')}"`).join(',');
    const rows = data.map(row =>
        columns.map(c => {
            const val = c.format ? c.format(row[c.key]) : (row[c.key] ?? '');
            return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
    );
    return [header, ...rows].join('\n');
};

const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob(['\ufeff' + content], { type: `${mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const ExportButton: React.FC<ExportButtonProps> = ({
    data,
    columns,
    filename = 'export',
    title = 'Export Data',
    className = '',
    subtitle,
    totals,
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [isPdfBusy, setIsPdfBusy] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const settings = useAuthStore((s) => s.settings);
    const branches = useAuthStore((s) => s.branches);
    const isArabic = (settings.language || 'en') !== 'en';
    // Single brand source: Arabic restaurant name, system mark, branch — same
    // identity as the main Reports center (no more English-only mini cover).
    const brand = getReportBrand({
        settings,
        branchName: settings.activeBranchId
            ? branches.find((b: any) => b.id === settings.activeBranchId)?.name || ''
            : '',
        reportTitle: title,
        rangeStart: '',
        rangeEnd: '',
        isArabic,
    });
    const restaurantName = brand.restaurant;
    const logoUrl = brand.logoUrl || '/logo.png';

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
        };
        if (showMenu) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showMenu]);

    const exportCSV = () => {
        const csv = toCSV(data, columns);
        const totalsLine = totals && totals.length
            ? '\n' + totals.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
            : '';
        downloadFile(csv + totalsLine, `${filename}_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
        setShowMenu(false);
    };

    /** Direct designer-PDF download (no print dialog). Falls back to print window. */
    const exportDirectPdf = async () => {
        setIsPdfBusy(true);
        try {
            const headerCells = columns.map((c) => `<th>${escReportHtml(c.label)}</th>`).join('');
            const bodyRows = data
                .map(
                    (row) =>
                        `<tr>${columns
                            .map((c) => {
                                const val = c.format ? c.format(row[c.key]) : row[c.key] ?? '';
                                return `<td>${escReportHtml(val)}</td>`;
                            })
                            .join('')}</tr>`
                )
                .join('');
            const totalsRow =
                totals && totals.length
                    ? `<tfoot><tr>${totals.map((v) => `<td>${escReportHtml(v ?? '')}</td>`).join('')}</tr></tfoot>`
                    : '';
            const metaLine = `${data.length} ${isArabic ? 'صف' : 'records'}`;
            await downloadHtmlPdf(
                `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody>${totalsRow}</table>`,
                {
                    filename,
                    title,
                    restaurant: restaurantName,
                    logoUrl,
                    systemLogoUrl: (brand as any).systemLogoUrl,
                    metaChips: [brand.branch, subtitle || '', metaLine].filter(Boolean),
                    isArabic,
                    orientation: columns.length > 5 ? 'landscape' : 'portrait',
                    systemName: brand.systemName,
                    systemTagline: brand.systemTagline,
                    branchName: brand.branch,
                }
            );
        } catch {
            exportHTML();
            return;
        } finally {
            setIsPdfBusy(false);
            setShowMenu(false);
        }
    };
    const exportHTML = () => {
        const dir = isArabic ? 'rtl' : 'ltr';
        const align = isArabic ? 'right' : 'left';
        const exportedAt = new Date().toLocaleString(isArabic ? 'ar-EG' : 'en-GB');
        const orientation = columns.length > 5 ? 'landscape' : 'portrait';
        const styles = `
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" />
            <style>
                @page { size: A4 ${orientation}; margin: 11mm 10mm 14mm 10mm; }
                body { font-family: 'Cairo','Segoe UI',Tahoma,Arial,sans-serif; margin: 0; color: #0f172a; direction: ${dir}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .hz { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #0f766e; padding-bottom: 14px; margin-bottom: 14px; }
                .hz img { height: 52px; width: auto; max-width: 230px; object-fit: contain; background: linear-gradient(135deg,#0b1b30,#020617); border: 1px solid #c9a227; border-radius: 10px; padding: 4px 10px; }
                .hz h1 { font-size: 20px; margin: 0; color: #10243e; }
                .hz .sub { font-size: 11px; color: #5b6b7d; font-weight: 700; margin-top: 4px; }
                .meta { font-size: 10px; color: #64748b; font-weight: 700; margin-bottom: 10px; }
                table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
                thead { display: table-header-group; }
                tr { page-break-inside: avoid; }
                th { background: #10243e; color: #fff; padding: 8px 10px; text-align: ${align}; font-size: 9pt; }
                td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: ${align}; }
                tbody tr:nth-child(even) { background: #f8fafc; }
                tfoot td { background: #0f766e; color: #fff; font-weight: 900; padding: 9px 10px; }
                .footer { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; border-top: 1px solid #dbe4ee; padding-top: 6px; font-size: 8.5pt; color: #64748b; font-weight: 700; }
            </style>
        `;
        const headerCells = columns.map(c => `<th>${escReportHtml(c.label)}</th>`).join('');
        const bodyRows = data.map(row =>
            `<tr>${columns.map(c => {
                const val = c.format ? c.format(row[c.key]) : (row[c.key] ?? '');
                return `<td>${escReportHtml(val)}</td>`;
            }).join('')}</tr>`
        ).join('');
        const totalsRow = totals && totals.length
            ? `<tfoot><tr>${totals.map(v => `<td>${escReportHtml(v ?? '')}</td>`).join('')}</tr></tfoot>`
            : '';

        const html = `<!DOCTYPE html><html dir="${dir}" lang="${isArabic ? 'ar' : 'en'}"><head><meta charset="UTF-8"><title>${escReportHtml(restaurantName)} - ${escReportHtml(title)}</title>${styles}</head><body>
            <div class="hz">
                <img src="${logoUrl}" alt="" onerror="this.style.display='none'" />
                ${(brand as any).systemLogoUrl && !isSameLogoUrl((brand as any).systemLogoUrl, logoUrl) ? `<img src="${(brand as any).systemLogoUrl}" alt="" style="height:40px;width:auto;max-width:180px;border:1px solid #c9a227;border-radius:10px;padding:3px 6px;background:linear-gradient(135deg,#0b1b30,#020617);object-fit:contain;" onerror="this.style.display='none'" />` : ''}
                <div><div style="font-size:9px;font-weight:800;color:#0f766e;">${escReportHtml(brand.systemName)} • ${escReportHtml(brand.systemTagline)}</div><h1>${escReportHtml(restaurantName)}</h1><div class="sub">${escReportHtml(title)}</div>${subtitle ? `<div class="sub">${escReportHtml(subtitle)}</div>` : ''}<div class="sub">${escReportHtml(brand.branch)}</div></div>
            </div>
            <div class="meta">${data.length} ${isArabic ? 'صف' : 'records'} · ${isArabic ? 'صُدّر' : 'exported'} ${exportedAt}</div>
            <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody>${totalsRow}</table>
            <div class="footer"><span>${escReportHtml(brand.systemName)} • ${escReportHtml(restaurantName)}</span><span>${exportedAt}</span></div>
        </body></html>`;

        const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (win) {
            win.onload = () => {
                win.print();
                URL.revokeObjectURL(url);
            };
        }
        setShowMenu(false);
    };

    if (data.length === 0) return null;

    return (
        <div ref={menuRef} className={`relative inline-block ${className}`}>
            <button onClick={() => setShowMenu(!showMenu)}
                className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-xl text-[10px] font-black text-muted uppercase tracking-widest hover:text-main hover:border-primary/40 transition-all shadow-sm">
                <Download size={14} /> Export
            </button>

            {showMenu && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-top-2 duration-200">
                    <div className="p-2 border-b border-border/50 flex items-center justify-between px-3">
                        <span className="text-[9px] font-black text-muted uppercase tracking-widest">Export As</span>
                        <button onClick={() => setShowMenu(false)} className="text-muted hover:text-main"><X size={12} /></button>
                    </div>
                    <div className="p-1">
                        <button onClick={exportCSV}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold text-main hover:bg-elevated/60 transition-colors text-left">
                            <FileSpreadsheet size={16} className="text-emerald-500" />
                            <div>
                                <p className="font-black text-[10px]">CSV / Excel</p>
                                <p className="text-[8px] text-muted">Spreadsheet compatible</p>
                            </div>
                        </button>
                        <button onClick={() => void exportDirectPdf()}
                            disabled={isPdfBusy}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold text-main hover:bg-elevated/60 transition-colors text-left disabled:opacity-50">
                            {isPdfBusy ? <Loader2 size={16} className="text-red-500 animate-spin" /> : <FileText size={16} className="text-red-500" />}
                            <div>
                                <p className="font-black text-[10px]">PDF</p>
                                <p className="text-[8px] text-muted">{isArabic ? 'تحميل مباشر بتصميم احترافي' : 'Direct designer download'}</p>
                            </div>
                        </button>
                        <button onClick={exportHTML}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold text-main hover:bg-elevated/60 transition-colors text-left">
                            <Printer size={16} className="text-blue-500" />
                            <div>
                                <p className="font-black text-[10px]">{isArabic ? 'طباعة' : 'Print'}</p>
                                <p className="text-[8px] text-muted">{isArabic ? 'نافذة الطباعة' : 'Print dialog'}</p>
                            </div>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExportButton;
