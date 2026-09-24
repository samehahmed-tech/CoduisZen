import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
   BarChart3,
   Calendar,
   CheckCircle2,
   ChevronLeft,
   Clock,
   Download,
   Eye,
   FileSpreadsheet,
   FileText,
   Filter,
   Layers3,
   Loader2,
   Printer,
   Search,
   Settings2,
   ShieldCheck,
   Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { reportsApi } from '../services/api/reports';
import { getReportPrintCSS } from '../services/reportPrintStyles';
import { downloadElementPdf } from '../services/reportPdf';
import { getReportBrand, isSameLogoUrl, REPORT_PALETTE, REPORT_SYSTEM_NAME } from '../services/reportBrand';
import { useReportsState } from './reports/useReportsState';
const SalesReports = React.lazy(() => import('./reports/views/SalesReports').then((module) => ({ default: module.SalesReports })));
const FinanceReports = React.lazy(() => import('./reports/views/FinanceReports').then((module) => ({ default: module.FinanceReports })));
const InventoryReports = React.lazy(() => import('./reports/views/InventoryReports').then((module) => ({ default: module.InventoryReports })));
const HrReports = React.lazy(() => import('./reports/views/HrReports').then((module) => ({ default: module.HrReports })));
const CrmReports = React.lazy(() => import('./reports/views/CrmReports').then((module) => ({ default: module.CrmReports })));
const OpsReports = React.lazy(() => import('./reports/views/OpsReports').then((module) => ({ default: module.OpsReports })));
const AiReports = React.lazy(() => import('./reports/views/AiReports').then((module) => ({ default: module.AiReports })));
import { REPORT_CATEGORIES, downloadBlob, getExportReportType, getReportDisplayLabel, isTabularExportSupported } from './reports/reportConstants';

type QuickRange = {
   labelAr: string;
   labelEn: string;
   days: number;
};

type PendingOutput = {
   categoryId: string;
   reportName: string;
   mode: 'view' | 'print' | 'pdf' | 'xlsx';
} | null;

const QUICK_RANGES: QuickRange[] = [
   { labelAr: 'اليوم', labelEn: 'Today', days: 0 },
   { labelAr: 'آخر 7 أيام', labelEn: 'Last 7 days', days: 6 },
   { labelAr: 'آخر 30 يوم', labelEn: 'Last 30 days', days: 29 },
   { labelAr: 'آخر سنة', labelEn: 'Last year', days: 365 },
];

const REPORT_DESCRIPTIONS_AR: Record<string, string> = {
   SALES: 'مبيعات، مصادر الطلب، المنيو، الخصومات، المرتجعات، وسلوك الشراء.',
   FINANCE: 'ضرائب، أرباح وخسائر، ورديات، تسويات، تدقيق، وتدفق نقدي.',
   INVENTORY: 'حركة المخزون، الهدر، النواقص، الجرد النظري، التقييم، وتكلفة الوصفات.',
   HR: 'رواتب، حضور، تأخير، إنتاجية، وتكلفة العمالة.',
   CRM: 'عملاء، ولاء، احتفاظ، حملات، وقيمة عمرية.',
   OPS: 'تشغيل الفروع، المطبخ، الدليفري، الترابيزات، وأوقات الخدمة.',
   AI: 'توقع الطلب، تقرير الفحص، التسعير، ومؤشرات القرار السريع.',
};

const REPORT_DESCRIPTIONS_EN: Record<string, string> = {
   SALES: 'Sales, order sources, menu performance, discounts, refunds and buying behavior.',
   FINANCE: 'VAT, P&L, shifts, reconciliations, audit trail and cash flow.',
   INVENTORY: 'Stock movement, waste, shortages, theoretical stock, valuation and recipe costs.',
   HR: 'Payroll, attendance, delays, productivity and labor cost.',
   CRM: 'Customers, loyalty, retention, campaigns and lifetime value.',
   OPS: 'Branches, kitchen, delivery, tables and service timings.',
   AI: 'Demand forecasting, anomaly detection, pricing and decision signals.',
};

const getSafeFileName = (reportName: string, start: string, end: string, extension: string) =>
   `report_${getExportReportType(reportName).toLowerCase()}_${start}_${end}.${extension}`;

const parseCsvRows = (csv: string): string[][] => {
   const rows: string[][] = [];
   let current = '';
   let row: string[] = [];
   let inQuotes = false;

   for (let index = 0; index < csv.length; index += 1) {
      const char = csv[index];
      const next = csv[index + 1];
      if (char === '"' && inQuotes && next === '"') {
         current += '"';
         index += 1;
      } else if (char === '"') {
         inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
         row.push(current);
         current = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
         if (char === '\r' && next === '\n') index += 1;
         row.push(current);
         if (row.some((cell) => cell.trim() !== '')) rows.push(row);
         row = [];
         current = '';
      } else {
         current += char;
      }
   }

   if (current || row.length) {
      row.push(current);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
   }

   return rows;
};

const splitCsvMetadata = (rows: string[][]) => {
   const firstHeaderIndex = rows.findIndex((row) => row.length > 1 && row.every((cell) => cell.trim() !== ''));
   return {
      metadataRows: firstHeaderIndex > 0 ? rows.slice(0, firstHeaderIndex).filter((row) => row.length >= 2) : [],
      tableRows: firstHeaderIndex >= 0 ? rows.slice(firstHeaderIndex) : rows,
   };
};

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const normalizeExcelText = (value: string) => {
   let out = String(value ?? '').trim();
   // Arabic-Indic digits → Latin so Excel keeps them numeric.
   out = out.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
   // Strip currency symbols / % / letters around the number (kept for display only).
   const cleaned = out
      .replace(/,/g, '')
      .replace(/[^\d.\-+eE]/g, (ch, off, str) => {
         // Keep a single leading minus and decimal point / exponent markers.
         if (ch === '-' && off === 0) return ch;
         return '';
      });
   return { display: out, cleaned };
};

const coerceExcelValue = (value: string) => {
   const normalized = String(value ?? '').trim();
   if (!normalized) return '';
   const { cleaned } = normalizeExcelText(normalized);
   if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(cleaned) && cleaned !== '-' && cleaned !== '.' && cleaned !== '') {
      const n = Number(cleaned);
      if (Number.isFinite(n)) return n;
   }
   return normalized;
};

/** Resolve a logo URL (data: or absolute http) to base64 for ExcelJS. Null = skip silently. */
const loadLogoBase64 = async (url?: string): Promise<{ base64: string; extension: 'png' | 'jpeg' } | null> => {
   if (!url) return null;
   try {
      if (url.startsWith('data:image/')) {
         const m = url.match(/^data:image\/(png|jpe?g);base64,([\s\S]+)$/);
         if (!m) return null;
         return { base64: m[2], extension: m[1] === 'png' ? 'png' : 'jpeg' };
      }
      const absolute = url.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${url}` : url;
      if (!/^https?:\/\//i.test(absolute)) return null;
      const res = await fetch(absolute);
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!/^image\/(png|jpe?g)/.test(blob.type)) return null;
      const dataUrl: string = await new Promise((resolve, reject) => {
         const reader = new FileReader();
         reader.onload = () => resolve(String(reader.result));
         reader.onerror = () => reject(new Error('logo-read-failed'));
         reader.readAsDataURL(blob);
      });
      return loadLogoBase64(dataUrl);
   } catch {
      return null;
   }
};

export const extractRenderedReportRows = (node: HTMLElement | null, emptyLabel: string) => {
   if (!node) return { metadataRows: [] as string[][], tableRows: [[emptyLabel]] };

   const tables = Array.from(node.querySelectorAll('table'));
   // Prefer the full-data print table (all rows) over the paginated screen table.
   const fullTables = tables.filter((t) => t.closest('.report-full-print'));
   const pool = fullTables.length ? fullTables : tables;
   // Skip totals footers doubling: read thead/tbody only, footer handled separately.
   const table = pool.sort((a, b) => b.rows.length - a.rows.length)[0];
   if (table) {
      const headRows = Array.from(table.querySelectorAll('thead tr')).map((row) =>
         Array.from((row as HTMLTableRowElement).cells).map((cell) => (cell.textContent || '').trim())
      );
      const bodyRows = Array.from(table.querySelectorAll('tbody tr')).map((row) =>
         Array.from((row as HTMLTableRowElement).cells).map((cell) => (cell.textContent || '').trim())
      );
      const tableRows = [...headRows, ...bodyRows].filter((row) => row.some(Boolean));
      if (tableRows.length) return { metadataRows: [] as string[][], tableRows };
   }

   const lines = (node.innerText || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
   return {
      metadataRows: [] as string[][],
      tableRows: [[emptyLabel], ...lines.map((line) => [line])],
   };
};

const Reports: React.FC = () => {
   const navigate = useNavigate();
   const state = useReportsState();
   const {
      activeCategory,
      setActiveCategory,
      activeSubReport,
      setActiveSubReport,
      dateRange,
      setDateRange,
      appliedRange,
      setAppliedRange,
      isLoadingReport,
      reportError,
      setReportError,
      printableRootRef,
      settings,
      activeBranchId,
      activeBranchName,
      integrity,
      isHrReportsOnly,
   } = state;

   const isArabic = settings.language !== 'en';
   const direction = isArabic ? 'rtl' : 'ltr';
   const reportViewportRef = useRef<HTMLDivElement | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    // Heavy report re-renders (fetch + big tables/charts) run as a transition
    // so typing, clicking Apply, or switching reports never drops keystrokes.
    const [, startFilterTransition] = useTransition();
    // Which export is running — the clicked button itself spins until the
    // file downloads. No overlay pages, no blocking banners.
    const [exportingKind, setExportingKind] = useState<'csv' | 'pdf' | 'xlsx' | null>(null);
    const isExporting = exportingKind !== null;
   const [pendingOutput, setPendingOutput] = useState<PendingOutput>(null);

   const visibleReportCategories = useMemo(
      () => isHrReportsOnly ? REPORT_CATEGORIES.filter((category) => category.id === 'HR') : REPORT_CATEGORIES,
      [isHrReportsOnly]
   );

   const activeCategoryData = useMemo(
      () => visibleReportCategories.find((category) => category.id === activeCategory) || visibleReportCategories[0],
      [activeCategory, visibleReportCategories]
   );

   const filteredCategories = useMemo(() => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return visibleReportCategories;

      return visibleReportCategories
         .map((category) => {
            const categoryLabel = isArabic ? getReportDisplayLabel(category.label) : category.label;
            const matchingSubReports = category.subReports.filter((report) => {
               const reportLabel = isArabic ? getReportDisplayLabel(report) : report;
               return report.toLowerCase().includes(query) || reportLabel.toLowerCase().includes(query);
            });
            const categoryMatched = category.id.toLowerCase().includes(query)
               || category.label.toLowerCase().includes(query)
               || categoryLabel.toLowerCase().includes(query);
            if (categoryMatched || matchingSubReports.length > 0) {
               return { ...category, subReports: matchingSubReports.length > 0 ? matchingSubReports : category.subReports };
            }
            return null;
         })
         .filter(Boolean) as typeof REPORT_CATEGORIES;
   }, [isArabic, searchQuery, visibleReportCategories]);

   const totalReports = useMemo(
      () => visibleReportCategories.reduce((sum, category) => sum + category.subReports.length, 0),
      [visibleReportCategories]
   );
   const canExportActiveCsv = isTabularExportSupported(activeSubReport);
   const catalogCategories = searchQuery ? filteredCategories : visibleReportCategories;
   const displayCategoryLabel = isArabic ? getReportDisplayLabel(activeCategoryData?.label || '') : (activeCategoryData?.label || '');
   const displaySubReportLabel = isArabic ? getReportDisplayLabel(activeSubReport) : activeSubReport;

   const openPrintableReport = (mode: 'print' | 'pdf' = 'print') => {
      if (settings.autoPrintReports === false) {
         setReportError(isArabic ? 'الطباعة من التقارير معطلة في الإعدادات — فعّلها من Settings Hub.' : 'Report printing is disabled in settings — enable it in Settings Hub.');
         return;
      }
      const node = printableRootRef.current;
      if (!node) return;

      const printWindow = window.open('', '_blank', 'width=1280,height=900');
      if (!printWindow) return;

      const brand = getReportBrand({
         settings,
         branchName: activeBranchName,
         reportTitle: displaySubReportLabel,
         categoryLabel: displayCategoryLabel,
         rangeStart: appliedRange.start,
         rangeEnd: appliedRange.end,
         isArabic,
      });
      const restaurantName = brand.restaurant;
      const dateRangeText = brand.rangeText;
      // Wide tables stay landscape; narrow summaries print portrait to save paper.
      const tableCount = printableRootRef.current?.querySelector('.report-full-print table')?.rows?.[0]?.cells?.length
         || printableRootRef.current?.querySelectorAll('table')[0]?.rows?.[0]?.cells?.length || 6;
      const printOrientation = tableCount > 5 ? 'landscape' : 'portrait';
      // Print shell carries only the branded cover CSS (no app styles leak,
      // so dark mode can never bleed into the printout).
      const printCSS = getReportPrintCSS(restaurantName, displaySubReportLabel, dateRangeText, {
         logoUrl: settings.receiptLogoUrl || undefined,
         systemLogoUrl: (brand as any).systemLogoUrl,
         orientation: printOrientation,
         isArabic,
         systemName: brand.systemName,
         systemTagline: brand.systemTagline,
         branchName: brand.branch,
      });

      const escTitle = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      printWindow.document.write(`
        <html dir="${direction}" lang="${isArabic ? 'ar' : 'en'}">
          <head>
            <meta charset="utf-8" />
            <title>${escTitle(restaurantName)} - ${escTitle(displaySubReportLabel)}${mode === 'pdf' ? ' PDF' : ''}</title>
            ${printCSS}
          </head>
          <body>
            <main class="report-export-shell" style="padding:16px">
              <section class="report-export-cover">
                <div class="report-export-eyebrow">${escTitle(brand.systemName)} • ${escTitle(brand.systemTagline)}</div>
                <h1 class="report-export-title">${escTitle(displaySubReportLabel)}</h1>
                <div class="report-export-meta">
                  <span>${escTitle(displayCategoryLabel)}</span>
                  <span>${escTitle(dateRangeText)}</span>
                  <span class="report-export-branch">${escTitle(brand.branch)}</span>
                  <span>${mode === 'pdf' ? (isArabic ? 'احفظ من نافذة الطباعة كملف PDF' : 'Save as PDF from print dialog') : (isArabic ? 'نسخة طباعة' : 'Print copy')}</span>
                </div>
              </section>
              <section class="report-export-body">${node.innerHTML}</section>
            </main>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      // Wait for webfonts + logos before printing so Arabic never prints as tofu.
      try {
         const doPrint = () => { try { printWindow.print(); } catch { /* noop */ } };
         const imgs = Array.from(printWindow.document.images || []);
         const imgReady = Promise.all(imgs.map((img: HTMLImageElement) => img.complete ? Promise.resolve() : new Promise((r) => { img.onload = () => r(null); img.onerror = () => r(null); setTimeout(() => r(null), 1500); })));
         const fontsReady: any = (printWindow.document as any).fonts?.ready?.then(() => null).catch(() => null) ?? Promise.resolve();
         void Promise.race([
            Promise.all([imgReady, fontsReady]),
            new Promise((r) => setTimeout(r, 1800)),
         ]).then(() => setTimeout(doPrint, 120));
      } catch {
         setTimeout(() => { try { printWindow.print(); } catch { /* noop */ } }, 400);
      }
   };

   useEffect(() => {
      if (!activeCategoryData) return;
      if (!activeCategoryData.subReports.includes(activeSubReport)) {
         setActiveSubReport(activeCategoryData.subReports[0]);
      }
   }, [activeCategoryData, activeSubReport, setActiveSubReport]);

   useEffect(() => {
      if (!pendingOutput) return;
      if (pendingOutput.categoryId !== activeCategory || pendingOutput.reportName !== activeSubReport || isLoadingReport) return;
      const timer = window.setTimeout(() => {
         reportViewportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
         if (pendingOutput.mode === 'print') {
            openPrintableReport('print');
         } else if (pendingOutput.mode === 'pdf') {
            // Direct designer-PDF download (same as the header PDF button) —
            // no print dialog. Falls back to the print window on failure.
            void downloadActivePdf();
         } else if (pendingOutput.mode === 'xlsx') {
            void exportXlsx(pendingOutput.reportName);
         }
         setPendingOutput(null);
      }, 250);
      return () => window.clearTimeout(timer);
   }, [activeCategory, activeSubReport, isLoadingReport, pendingOutput]);

   const selectReport = (categoryId: string, reportName: string, mode: 'view' | 'print' | 'pdf' | 'xlsx' = 'view') => {
      setReportError(null);
      startFilterTransition(() => {
         setActiveCategory(categoryId);
         setActiveSubReport(reportName);
      });
      setPendingOutput({ categoryId, reportName, mode });
   };

   const applyQuickDate = (daysAgo: number) => {
      const today = new Date();
      const start = new Date();
      start.setDate(today.getDate() - daysAgo);
      const nextRange = {
         start: start.toISOString().split('T')[0],
         end: today.toISOString().split('T')[0],
      };
      startFilterTransition(() => {
         setDateRange(nextRange);
         setAppliedRange(nextRange);
      });
   };

   const exportCsv = async (reportName = activeSubReport) => {
      if (!isTabularExportSupported(reportName)) {
         setReportError(isArabic ? 'تصدير CSV/Excel غير متاح لهذا التقرير. استخدم PDF أو الطباعة.' : 'CSV/Excel export is not available for this report. Use PDF or print.');
         return;
      }
      setExportingKind('csv');
      setReportError(null);
      try {
         const blob = await reportsApi.exportCsv({
            branchId: activeBranchId,
            startDate: appliedRange.start,
            endDate: appliedRange.end,
            reportType: getExportReportType(reportName),
         });
         downloadBlob(blob, getSafeFileName(reportName, appliedRange.start, appliedRange.end, 'csv'));
      } catch (error: any) {
         setReportError(error?.message || (isArabic ? 'تعذر تصدير ملف CSV لهذا التقرير.' : 'Failed to export CSV.'));
      } finally {
         setExportingKind(null);
      }
   };

   const exportPdf = (reportName = activeSubReport) => {
      setReportError(null);
      if (reportName !== activeSubReport) {
         const category = visibleReportCategories.find((item) => item.subReports.includes(reportName));
         if (category) selectReport(category.id, reportName, 'pdf');
         return;
      }
      void downloadActivePdf();
   };

   /** Direct designer-PDF download (no print dialog). Falls back to print window on failure. */
   const downloadActivePdf = async () => {
      const node = printableRootRef.current;
      if (!node) {
         openPrintableReport('pdf');
         return;
      }
      setExportingKind('pdf');
      try {
         const pdfBrand = getReportBrand({
            settings,
            branchName: activeBranchName,
            reportTitle: displaySubReportLabel,
            categoryLabel: displayCategoryLabel,
            rangeStart: appliedRange.start,
            rangeEnd: appliedRange.end,
            isArabic,
         });
         const pdfTableCols = node.querySelector('.report-full-print table')?.rows?.[0]?.cells?.length
            || node.querySelectorAll('table')[0]?.rows?.[0]?.cells?.length || 6;
         await downloadElementPdf(node, {
            filename: getSafeFileName(activeSubReport, appliedRange.start, appliedRange.end, 'pdf'),
            title: displaySubReportLabel,
            restaurant: pdfBrand.restaurant,
            logoUrl: settings.receiptLogoUrl || '/logo.png?v=2',
            systemLogoUrl: (pdfBrand as any).systemLogoUrl,
            metaChips: [
               displayCategoryLabel,
               pdfBrand.rangeText,
            ],
            subtitle: isArabic ? REPORT_DESCRIPTIONS_AR[activeCategory] : REPORT_DESCRIPTIONS_EN[activeCategory],
            orientation: pdfTableCols > 5 ? 'landscape' : 'portrait',
            isArabic,
            systemName: pdfBrand.systemName,
            systemTagline: pdfBrand.systemTagline,
            branchName: pdfBrand.branch,
         });
      } catch (error: any) {
         // Pixel pipeline failed (huge report, blocked canvas, etc.) — log
         // for diagnosis, then fall back to the classic print flow.
         try {
            console.warn('[Reports] direct PDF failed, falling back to print:', error);
         } catch {
            // logging must never break the fallback
         }
         try {
            openPrintableReport('pdf');
         } catch {
            setReportError(error?.message || (isArabic ? 'تعذر إنشاء ملف PDF.' : 'Failed to build PDF.'));
         }
      } finally {
         setExportingKind(null);
      }
   };

   const exportXlsx = async (reportName = activeSubReport) => {
      if (reportName !== activeSubReport) {
         const category = visibleReportCategories.find((item) => item.subReports.includes(reportName));
         if (category) selectReport(category.id, reportName, 'xlsx');
         return;
      }
      setExportingKind('xlsx');
      setReportError(null);
      try {
         let metadataRows: string[][] = [];
         let tableRows: string[][] = [];
         if (isTabularExportSupported(reportName)) {
            const csvBlob = await reportsApi.exportCsv({
               branchId: activeBranchId,
               startDate: appliedRange.start,
               endDate: appliedRange.end,
               reportType: getExportReportType(reportName),
            });
            const csvText = await csvBlob.text();
            ({ metadataRows, tableRows } = splitCsvMetadata(parseCsvRows(csvText)));
         } else {
            ({ metadataRows, tableRows } = extractRenderedReportRows(
               printableRootRef.current,
               isArabic ? 'بيانات التقرير' : 'Report data'
            ));
         }
         const headers = tableRows[0] || [];
         const bodyRows = tableRows.slice(1);
         const ExcelJS = await import('exceljs');
         const workbook = new ExcelJS.Workbook();
         const brand = getReportBrand({
            settings,
            branchName: activeBranchName,
            reportTitle: isArabic ? getReportDisplayLabel(reportName) : reportName,
            categoryLabel: displayCategoryLabel,
            rangeStart: appliedRange.start,
            rangeEnd: appliedRange.end,
            isArabic,
         });
         const P = REPORT_PALETTE;
         const cairo = (font: any = {}) => ({ name: 'Cairo', ...font });
         const thinLine = { style: 'thin', color: { argb: `FF${P.line}` } } as const;
         const fullBorder = {
            top: thinLine, left: thinLine, bottom: thinLine, right: thinLine,
         };

         workbook.creator = REPORT_SYSTEM_NAME;
         workbook.lastModifiedBy = REPORT_SYSTEM_NAME;
         workbook.created = new Date();
         workbook.modified = new Date();
         (workbook as any).company = brand.restaurant;
         workbook.views = [{ rightToLeft: isArabic } as any];

         const sheet = workbook.addWorksheet(isArabic ? 'التقرير' : 'Report', {
            views: [{ rightToLeft: isArabic, state: 'frozen', ySplit: 5 }],
            properties: { defaultRowHeight: 24 },
         });
         const reportLabel = brand.reportTitle;
         const restaurantName = brand.restaurant;
         const columnCount = Math.max(headers.length, 6);
         const alignEdge = isArabic ? 'right' : 'left';

         // Row 1 — system eyebrow + logo
         sheet.mergeCells(1, 1, 1, columnCount);
         sheet.getCell(1, 1).value = `${brand.systemName}  •  ${brand.systemTagline}`.toUpperCase();
         sheet.getCell(1, 1).font = cairo({ bold: true, size: 9, color: { argb: `FF${P.teal}` } });
         sheet.getCell(1, 1).alignment = { vertical: 'middle', horizontal: alignEdge };
         sheet.getRow(1).height = 18;
         // Dual logos: restaurant (edge) + system mark beside it. Cell-anchored
         // (no fractional cols) so RTL/LTR both stay stable.
         const placeLogo = async (url: string | undefined, colStart: number) => {
            const logo = await loadLogoBase64(url || '/logo.png?v=2');
            if (!logo) return;
            try {
               const imageId = workbook.addImage({ base64: logo.base64, extension: logo.extension });
               sheet.addImage(imageId, {
                  tl: { col: colStart, row: 0 },
                  br: { col: colStart + 1, row: 2 },
                  editAs: 'oneCell',
               } as any);
            } catch {
               // logo placement is decorative — never fail the export
            }
         };
         const restaurantLogoUrl = settings.receiptLogoUrl || '/logo.png?v=2';
         const systemLogoUrl = (brand as any).systemLogoUrl;
         // Second mark only when it is a genuinely different image.
         const dualLogos = !!systemLogoUrl && !isSameLogoUrl(systemLogoUrl, restaurantLogoUrl);
         if (isArabic) {
            await placeLogo(restaurantLogoUrl, dualLogos ? Math.max(0, columnCount - 2) : Math.max(0, columnCount - 1));
            if (dualLogos) await placeLogo(systemLogoUrl, Math.max(0, columnCount - 1));
         } else {
            await placeLogo(restaurantLogoUrl, 0);
            if (dualLogos) await placeLogo(systemLogoUrl, 1);
         }

         // Row 2 — restaurant / company name
         sheet.mergeCells(2, 1, 2, columnCount);
         sheet.getCell(2, 1).value = restaurantName;
         sheet.getCell(2, 1).font = cairo({ bold: true, size: 20, color: { argb: `FF${P.navy}` } });
         sheet.getCell(2, 1).alignment = { vertical: 'middle', horizontal: alignEdge };
         sheet.getRow(2).height = 32;

         // Row 3 — report title band (navy + gold rule)
         sheet.mergeCells(3, 1, 3, columnCount);
         sheet.getCell(3, 1).value = reportLabel;
         sheet.getCell(3, 1).font = cairo({ bold: true, size: 15, color: { argb: `FF${P.white}` } });
         sheet.getCell(3, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${P.navy}` } };
         sheet.getCell(3, 1).alignment = { vertical: 'middle', horizontal: alignEdge };
         sheet.getCell(3, 1).border = { bottom: { style: 'medium', color: { argb: `FF${P.gold}` } } };
         sheet.getRow(3).height = 32;

         // Row 4 — range / branch / category / generated band
         sheet.mergeCells(4, 1, 4, columnCount);
         const metaBand = [brand.rangeText, `${isArabic ? 'الفرع' : 'Branch'}: ${brand.branch}`, brand.categoryLabel, `${brand.generatedLabel}: ${brand.generatedAt}`]
            .filter(Boolean)
            .join('   |   ');
         sheet.getCell(4, 1).value = metaBand;
         sheet.getCell(4, 1).font = cairo({ bold: true, size: 10, color: { argb: `FF${P.muted}` } });
         sheet.getCell(4, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${P.bandAlt}` } };
         sheet.getCell(4, 1).alignment = { horizontal: alignEdge, vertical: 'middle', wrapText: true };
         sheet.getCell(4, 1).border = {
            top: thinLine,
            bottom: { style: 'thin', color: { argb: `FF${P.gold}` } },
         };
         sheet.getRow(4).height = 24;

         // KPI meta cards — wrapped across as many label/value row-pairs as
         // needed so no KPI is ever dropped on narrow tables (old code sliced
         // to columnCount and silently lost the rest).
         const allMetaEntries = [
            [isArabic ? 'نوع التقرير' : 'Report type', getExportReportType(reportName)],
            [isArabic ? 'تاريخ التصدير' : 'Exported at', brand.generatedAt],
            ...metadataRows,
         ].slice(0, columnCount * 3);
         const metaChunks: string[][][] = [];
         for (let i = 0; i < allMetaEntries.length; i += columnCount) {
            metaChunks.push(allMetaEntries.slice(i, i + columnCount));
         }
         let metaRow = 5;
         metaChunks.forEach((chunk) => {
            chunk.forEach(([label, value], index) => {
               const col = index + 1;
               const labelCell = sheet.getCell(metaRow, col);
               labelCell.value = label;
               labelCell.font = cairo({ bold: true, size: 9, color: { argb: `FF${P.gold}` } });
               labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
               const valueCell = sheet.getCell(metaRow + 1, col);
               valueCell.value = value;
               valueCell.font = cairo({ bold: true, size: 12, color: { argb: `FF${P.navy}` } });
               valueCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
               valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${P.white}` } };
               valueCell.border = fullBorder;
            });
            sheet.getRow(metaRow).height = 18;
            sheet.getRow(metaRow + 1).height = 26;
            metaRow += 2;
         });
         const headerRowNumber = metaRow;

         // Table header (navy + gold rule)
         const headerRow = sheet.getRow(headerRowNumber);
         headerRow.values = headers.length ? headers : [isArabic ? 'البيان' : 'Item'];
         headerRow.height = 32;
         headerRow.eachCell((cell) => {
            cell.font = cairo({ bold: true, color: { argb: `FF${P.white}` }, size: 11 });
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${P.navy}` } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
               ...fullBorder,
               bottom: { style: 'medium', color: { argb: `FF${P.gold}` } },
            };
         });

         const columnSums: number[] = new Array(Math.max(headers.length, 1)).fill(0);
         const columnIsNumeric: boolean[] = new Array(Math.max(headers.length, 1)).fill(true);
         bodyRows.forEach((row, rowIndex) => {
            const sheetRow = sheet.addRow(row.map(coerceExcelValue));
            sheetRow.height = 24;
            sheetRow.eachCell((cell, colNumber) => {
               const value = cell.value;
               const isNumber = typeof value === 'number';
               if (!isNumber) columnIsNumeric[colNumber - 1] = false;
               else columnSums[colNumber - 1] += value;
                const isNegative = isNumber && value < 0;
                if (isNumber) cell.numFmt = '#,##0.00';
                cell.font = cairo({
                  size: 10,
                  bold: colNumber === 1,
                  color: { argb: isNegative ? `FF${P.danger}` : `FF${P.ink}` },
               });
               cell.alignment = {
                  horizontal: isNumber ? 'center' : alignEdge,
                  vertical: 'middle',
                  wrapText: true,
               };
               if (rowIndex % 2 === 1) {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${P.band}` } };
               }
               cell.border = fullBorder;
            });
         });

         if (bodyRows.length > 0 && columnIsNumeric.some(Boolean)) {
            const totalsRow = sheet.addRow(
               headers.map((_, colIndex) => {
                  if (colIndex === 0) return brand.totalLabel;
                  return columnIsNumeric[colIndex] ? Math.round(columnSums[colIndex] * 100) / 100 : '';
               })
            );
             totalsRow.height = 28;
             totalsRow.eachCell((cell) => {
                if (typeof cell.value === 'number') cell.numFmt = '#,##0.00';
                cell.font = cairo({ bold: true, size: 11, color: { argb: `FF${P.white}` } });
               cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${P.teal}` } };
               cell.alignment = { horizontal: 'center', vertical: 'middle' };
               cell.border = {
                  ...fullBorder,
                  top: { style: 'medium', color: { argb: `FF${P.gold}` } },
               };
            });
         }

         // Footer — system • restaurant • branch • generated
         const footerRow = sheet.addRow([]);
         sheet.mergeCells(footerRow.number, 1, footerRow.number, columnCount);
         sheet.getCell(footerRow.number, 1).value =
            `${brand.systemName}  •  ${restaurantName}  •  ${brand.branch}  •  ${brand.generatedLabel}: ${brand.generatedAt}`;
         sheet.getCell(footerRow.number, 1).font = cairo({ italic: true, size: 9, color: { argb: `FF${P.muted}` } });
         sheet.getCell(footerRow.number, 1).alignment = { horizontal: 'center', vertical: 'middle' };
         sheet.getRow(footerRow.number).height = 20;

         // Arabic glyphs run wider than Latin at the same char count — weight
         // CJK/Arabic chars ×1.8 so columns don't clip in Excel.
         const textWidth = (s: unknown) => {
            const str = String(s ?? '');
            let w = 0;
            for (const ch of str) w += /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u4E00-\u9FFF]/.test(ch) ? 1.8 : 1;
            return w;
         };
         const widthSource = [headers, ...bodyRows.slice(0, 200)];
         for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
            const maxLength = Math.max(12, ...widthSource.map((row) => textWidth(row[colIndex])));
            sheet.getColumn(colIndex + 1).width = Math.min(Math.max(maxLength + 5, 15), 48);
         }
         if (headers.length) {
            sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: headers.length } };
         }
         // Freeze everything above the table header (cover + KPI cards).
         (sheet.views as any) = [{ rightToLeft: isArabic, state: 'frozen', ySplit: headerRowNumber }];
          sheet.pageSetup = {
             orientation: headers.length > 5 ? 'landscape' : 'portrait',
             fitToPage: true,
             fitToWidth: 1,
             fitToHeight: 0,
             paperSize: 9,
             horizontalCentered: true,
             printTitlesRow: `${headerRowNumber}:${headerRowNumber}`,
          } as any;
         sheet.headerFooter = {
            oddHeader: `&L&\"Cairo,Bold\"&10 ${restaurantName} — ${reportLabel}&R&\"Cairo\"&9 ${appliedRange.start} : ${appliedRange.end}`,
            oddFooter: `&L&\"Cairo\"&8 &D &T&C&\"Cairo\"&8 ${brand.pageLabel} &P / &N&R&\"Cairo\"&8 ${REPORT_SYSTEM_NAME} • ${restaurantName}`,
         };

         const buffer = await workbook.xlsx.writeBuffer();
         downloadBlob(
            new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            getSafeFileName(reportName, appliedRange.start, appliedRange.end, 'xlsx')
         );
      } catch (error: any) {
         setReportError(error?.message || (isArabic ? 'تعذر تصدير ملف Excel لهذا التقرير.' : 'Failed to export Excel.'));
      } finally {
         setExportingKind(null);
      }
   };

   const renderActiveReport = () => (
      <React.Suspense fallback={null}>
         {activeCategory === 'SALES' && <SalesReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
         {activeCategory === 'FINANCE' && <FinanceReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
         {activeCategory === 'INVENTORY' && <InventoryReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
         {activeCategory === 'HR' && <HrReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
         {activeCategory === 'CRM' && <CrmReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
         {activeCategory === 'OPS' && <OpsReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
         {activeCategory === 'AI' && <AiReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
      </React.Suspense>
   );

   return (
      <main dir={direction} className="h-screen overflow-y-auto bg-app text-main font-neo pos-scroll selection:bg-primary/20">
         <div className="mx-auto flex w-full max-w-[1780px] flex-col gap-4 px-4 py-4 lg:px-7 lg:py-5">
            <section className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
               <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
               <div className="grid gap-5 p-4 lg:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.9fr)]">
                  <div className="min-w-0 space-y-4">
                     <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-black text-primary">
                           <Sparkles size={14} />
                           {isArabic ? 'مركز التقارير الذكي' : 'Smart Reports Center'}
                        </span>
                        <span className="rounded-md border border-border bg-app px-3 py-1.5 text-xs font-bold text-muted">
                           {activeBranchName || (isArabic ? 'كل الفروع' : 'All branches')}
                        </span>
                        <span className="rounded-md border border-border bg-app px-3 py-1.5 text-xs font-bold text-muted">
                           {totalReports} {isArabic ? 'تقرير' : 'reports'}
                        </span>
                     </div>

                     <div>
                        <p className="mb-2 text-xs font-black uppercase text-primary">{displayCategoryLabel}</p>
                        <h1 className="text-3xl font-black leading-tight text-main lg:text-4xl">{displaySubReportLabel}</h1>
                        <p className="mt-3 max-w-5xl text-sm font-semibold leading-7 text-muted">
                           {isArabic ? REPORT_DESCRIPTIONS_AR[activeCategory] : REPORT_DESCRIPTIONS_EN[activeCategory]}
                        </p>
                     </div>

                     <div className="flex flex-wrap gap-2">
                        <button onClick={() => exportXlsx(activeSubReport)} disabled={isExporting} className="inline-flex items-center justify-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2.5 text-xs font-black text-success transition hover:bg-success/15 disabled:opacity-60" title="Excel">
                           {exportingKind === 'xlsx' ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                           Excel
                        </button>
                        <button onClick={() => exportPdf(activeSubReport)} disabled={isExporting} className="inline-flex items-center justify-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2.5 text-xs font-black text-danger transition hover:bg-danger/15 disabled:opacity-60">
                           {exportingKind === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                           PDF
                        </button>
                        <button onClick={() => exportCsv(activeSubReport)} disabled={isExporting || !canExportActiveCsv} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-app px-3 py-2.5 text-xs font-black text-main transition hover:bg-elevated disabled:opacity-60" title={canExportActiveCsv ? 'CSV' : (isArabic ? 'CSV غير متاح لهذا التقرير' : 'CSV unavailable for this report')}>
                           {exportingKind === 'csv' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                           CSV
                        </button>
                        <button onClick={() => openPrintableReport('print')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-xs font-black text-white shadow-md shadow-primary/20 transition hover:bg-primary-hover">
                           <Printer size={16} />
                           {isArabic ? 'طباعة' : 'Print'}
                        </button>
                     </div>
                  </div>

                  <div className="rounded-xl border border-border bg-app/70 p-3">
                     <div className="mb-3 flex items-center gap-2 px-1 text-xs font-black text-muted">
                        <Filter size={14} />
                        {isArabic ? 'الفلاتر والبحث' : 'Filters and search'}
                     </div>
                     <div className="grid gap-2">
                        <div className="relative">
                           <Search size={16} className={`absolute top-1/2 -translate-y-1/2 text-muted ${isArabic ? 'right-3' : 'left-3'}`} />
                            <input
                               value={searchQuery}
                               onChange={(event) => {
                                  const value = event.target.value;
                                  startFilterTransition(() => setSearchQuery(value));
                               }}
                              placeholder={isArabic ? 'ابحث باسم التقرير أو القسم' : 'Search report or group'}
                              className={`w-full rounded-lg border border-border bg-card px-4 py-3 text-sm font-bold text-main outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15 ${isArabic ? 'pr-10' : 'pl-10'}`}
                           />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-center rounded-lg border border-border bg-card p-2">
                           <div className="flex items-center gap-2">
                              <Calendar size={14} className="text-primary" />
                              <input type="date" value={dateRange.start} onChange={(event) => setDateRange((prev) => ({ ...prev, start: event.target.value }))} className="w-full bg-transparent text-xs font-bold text-main outline-none" />
                           </div>
                           <ChevronLeft size={14} className="hidden text-muted sm:block rtl:rotate-180" />
                           <input type="date" value={dateRange.end} onChange={(event) => setDateRange((prev) => ({ ...prev, end: event.target.value }))} className="w-full bg-transparent text-xs font-bold text-main outline-none" />
                            <button onClick={() => startFilterTransition(() => setAppliedRange(dateRange))} className="rounded-md bg-primary px-4 py-2 text-xs font-black text-white transition hover:bg-primary-hover">
                              {isArabic ? 'تطبيق' : 'Apply'}
                           </button>
                        </div>
                        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                           {QUICK_RANGES.map((range) => (
                              <button key={range.days} onClick={() => applyQuickDate(range.days)} className="rounded-md border border-border bg-card px-3 py-2 text-[11px] font-black text-muted transition hover:bg-elevated hover:text-main">
                                 {isArabic ? range.labelAr : range.labelEn}
                              </button>
                           ))}
                        </div>
                     </div>
                  </div>
               </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
               <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div className="flex items-center gap-2 text-xs font-black text-muted">
                     <Layers3 size={14} />
                     {isArabic ? 'أقسام التقارير' : 'Report groups'}
                  </div>
                  <span className="text-[11px] font-bold text-muted">{isArabic ? 'اختار القسم ثم التقرير المطلوب' : 'Pick a group, then a report'}</span>
               </div>
               <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7">
                  {visibleReportCategories.map((category) => {
                     const Icon = category.icon;
                     const isActive = category.id === activeCategory;
                     return (
                        <button
                           key={category.id}
                           onClick={() => selectReport(category.id, category.subReports[0])}
                           className={`min-h-[118px] rounded-xl border p-3 text-start transition duration-200 ${
                              isActive ? 'border-primary/40 bg-primary/10 shadow-sm ring-2 ring-primary/10' : 'border-border bg-app hover:bg-elevated'
                           }`}
                        >
                           <div className="flex items-center justify-between gap-2">
                              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card" style={{ color: category.color }}>
                                 <Icon size={19} />
                              </span>
                              <span className={`rounded-md px-2 py-1 text-[10px] font-black ${isActive ? 'bg-primary text-white' : 'bg-card text-muted'}`}>
                                 {category.subReports.length}
                              </span>
                           </div>
                           <div className="mt-3 text-sm font-black leading-5 text-main">{isArabic ? getReportDisplayLabel(category.label) : category.label}</div>
                           <div className="mt-1 text-[11px] font-semibold leading-5 text-muted">{isArabic ? REPORT_DESCRIPTIONS_AR[category.id] : REPORT_DESCRIPTIONS_EN[category.id]}</div>
                        </button>
                     );
                  })}
               </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
               <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-black text-muted"><BarChart3 size={15} />{isArabic ? 'تغطية التقارير' : 'Coverage'}</div>
                  <div className="mt-2 text-2xl font-black text-main">{totalReports}</div>
                  <p className="text-xs font-semibold text-muted">{isArabic ? 'تقرير عبر أقسام النظام' : 'reports across ERP modules'}</p>
               </div>
               <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-black text-muted"><Clock size={15} />{isArabic ? 'الفترة المعروضة' : 'Active range'}</div>
                  <div className="mt-2 text-lg font-black text-main">{appliedRange.start}</div>
                  <p className="text-xs font-semibold text-muted">{isArabic ? `إلى ${appliedRange.end}` : `to ${appliedRange.end}`}</p>
               </div>
               <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-black text-muted"><ShieldCheck size={15} />{isArabic ? 'سلامة البيانات' : 'Integrity'}</div>
                  <div className={`mt-2 text-2xl font-black ${integrity?.ok === false ? 'text-danger' : 'text-success'}`}>
                     {integrity?.summary ? `${integrity.summary.passed || 0}/${integrity.summary.total || 0}` : isArabic ? 'جاهز' : 'Ready'}
                  </div>
                  <p className="text-xs font-semibold text-muted">{isArabic ? 'فحوصات التقارير' : 'report checks'}</p>
               </div>
               <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-black text-muted"><CheckCircle2 size={15} />{isArabic ? 'الإخراج' : 'Output'}</div>
                  <div className="mt-2 text-lg font-black text-main">View / Print / PDF / Excel</div>
                     <p className="text-xs font-semibold text-muted">{isArabic ? 'عرض وطباعة وPDF وExcel لكل التقارير' : 'view, print, PDF and Excel for every report'}</p>
               </div>
            </section>

            <section className="rounded-xl border border-border bg-card shadow-sm">
               <div className="flex flex-col gap-3 border-b border-border px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5">
                  <div>
                     <h2 className="text-xl font-black text-main">{isArabic ? 'كتالوج التقارير المنظم' : 'Organized Report Catalog'}</h2>
                     <p className="mt-1 text-sm font-semibold leading-6 text-muted">
                        {isArabic ? 'كل تقرير يمكن عرضه وطباعته وتصديره PDF أو Excel بنفس الفترة والفرع.' : 'Every report can be viewed, printed, and exported to PDF or Excel using the selected range and branch.'}
                     </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-app px-3 py-2 text-xs font-bold text-muted">
                     <Settings2 size={14} />
                     <span>{isArabic ? `${catalogCategories.length} مجموعة ظاهرة` : `${catalogCategories.length} visible groups`}</span>
                  </div>
               </div>

               <div className="grid gap-4 p-4 xl:grid-cols-2 2xl:grid-cols-3">
                  {catalogCategories.map((category) => {
                     const Icon = category.icon;
                     return (
                        <div key={category.id} className={`rounded-xl border p-4 transition ${category.id === activeCategory ? 'border-primary/35 bg-primary/5' : 'border-border bg-app'}`}>
                           <div className="mb-3 flex items-start gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card" style={{ color: category.color }}>
                                 <Icon size={21} />
                              </div>
                              <div className="min-w-0">
                                 <h3 className="text-sm font-black text-main">{isArabic ? getReportDisplayLabel(category.label) : category.label}</h3>
                                 <p className="mt-1 text-xs font-semibold leading-5 text-muted">{isArabic ? REPORT_DESCRIPTIONS_AR[category.id] : REPORT_DESCRIPTIONS_EN[category.id]}</p>
                              </div>
                           </div>
                           <div className="grid gap-2">
                              {category.subReports.map((report) => {
                                  const isCurrent = category.id === activeCategory && report === activeSubReport;
                                  return (
                                    <div key={report} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-3 py-2.5 transition ${isCurrent ? 'border-primary/35 bg-primary/10' : 'border-border bg-card hover:bg-elevated/60'}`}>
                                       <button onClick={() => selectReport(category.id, report)} className="min-w-0 text-start">
                                          <span className={`block text-xs font-black leading-5 ${isCurrent ? 'text-primary' : 'text-main'}`}>{isArabic ? getReportDisplayLabel(report) : report}</span>
                                          <span className="block text-[10px] font-bold text-muted">{getExportReportType(report)} · Excel · PDF</span>
                                       </button>
                                       <div className="flex items-center gap-1">
                                          <button onClick={() => selectReport(category.id, report)} className="rounded-md p-2 text-muted transition hover:bg-elevated hover:text-main" title={isArabic ? 'عرض' : 'View'}>
                                             <Eye size={15} />
                                          </button>
                                          <button onClick={() => selectReport(category.id, report, 'print')} className="rounded-md p-2 text-primary transition hover:bg-primary/10" title={isArabic ? 'طباعة' : 'Print'}>
                                             <Printer size={15} />
                                          </button>
                                          <button onClick={() => exportXlsx(report)} disabled={isExporting} className="rounded-md p-2 text-success transition hover:bg-success/10 disabled:opacity-50" title="Excel">
                                             {exportingKind === 'xlsx' ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
                                          </button>
                                          <button onClick={() => exportPdf(report)} disabled={isExporting} className="rounded-md p-2 text-danger transition hover:bg-danger/10 disabled:opacity-50" title="PDF">
                                             {exportingKind === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                                          </button>
                                       </div>
                                    </div>
                                 );
                              })}
                           </div>
                        </div>
                     );
                  })}
               </div>
            </section>

            {isLoadingReport && (
               <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-4 text-center text-sm font-black text-primary">
                  {isArabic ? 'جاري تجهيز التقرير...' : 'Preparing report...'}
               </div>
            )}

            {reportError && (
               <div className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">
                  {reportError}
               </div>
            )}

            <section ref={reportViewportRef} className="scroll-mt-4 rounded-lg border border-border bg-card p-4 lg:p-5">
               <div ref={printableRootRef}>
                  {/* Screen-only report header: the branded cover already carries
                     title/meta in print & PDF (both hide [data-pdf-hide]). */}
                  <div data-pdf-hide className="mb-5 flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
                     <div>
                        <h2 className="text-lg font-black text-main">{displaySubReportLabel}</h2>
                        <p className="text-xs font-semibold text-muted">
                           {displayCategoryLabel} · {appliedRange.start} - {appliedRange.end} · {activeBranchName || (isArabic ? 'كل الفروع' : 'All branches')}
                        </p>
                     </div>
                      <div className="flex flex-wrap items-center gap-2" data-pdf-hide>
                         <button onClick={() => exportXlsx(activeSubReport)} disabled={isExporting} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-black text-main transition hover:bg-elevated disabled:opacity-60" title="Excel">{exportingKind === 'xlsx' ? <Loader2 size={13} className="animate-spin" /> : null}Excel</button>
                        <button onClick={() => exportPdf(activeSubReport)} disabled={isExporting} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-black text-main transition hover:bg-elevated disabled:opacity-60">{exportingKind === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : null}PDF</button>
                        <button onClick={() => openPrintableReport('print')} className="rounded-md border border-border px-3 py-2 text-xs font-black text-main transition hover:bg-elevated">{isArabic ? 'طباعة' : 'Print'}</button>
                     </div>
                  </div>
                  {renderActiveReport()}
               </div>
            </section>
         </div>
      </main>
   );
};

export default Reports;
