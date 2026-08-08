import React, { useEffect, useMemo, useRef, useState } from 'react';
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
   Printer,
   Search,
   Settings2,
   ShieldCheck,
   Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { reportsApi } from '../services/api/reports';
import { getReportPrintCSS } from '../services/reportPrintStyles';
import { useReportsState } from './reports/useReportsState';
import { SalesReports } from './reports/views/SalesReports';
import { FinanceReports } from './reports/views/FinanceReports';
import { InventoryReports } from './reports/views/InventoryReports';
import { HrReports } from './reports/views/HrReports';
import { CrmReports } from './reports/views/CrmReports';
import { OpsReports } from './reports/views/OpsReports';
import { AiReports } from './reports/views/AiReports';
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

const coerceExcelValue = (value: string) => {
   const normalized = value.trim();
   const numericCandidate = normalized.replace(/,/g, '');
   if (!normalized) return '';
   if (/^-?\d+(\.\d+)?$/.test(numericCandidate)) return Number(numericCandidate);
   return normalized;
};

export const extractRenderedReportRows = (node: HTMLElement | null, emptyLabel: string) => {
   if (!node) return { metadataRows: [] as string[][], tableRows: [[emptyLabel]] };

   const tables = Array.from(node.querySelectorAll('table'));
   const table = tables.sort((a, b) => b.rows.length - a.rows.length)[0];
   if (table) {
      const tableRows = Array.from(table.rows)
         .map((row) => Array.from(row.cells).map((cell) => (cell.textContent || '').trim()))
         .filter((row) => row.some(Boolean));
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
   const [isExporting, setIsExporting] = useState(false);
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
      if (settings.autoPrintReports === false) return;
      const node = printableRootRef.current;
      if (!node) return;

      const printWindow = window.open('', '_blank', 'width=1280,height=900');
      if (!printWindow) return;

      const styleNodes = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
         .map((el) => el.outerHTML)
         .join('\n');
      const restaurantName = settings.restaurantName || 'Coduis Zen';
      const dateRangeText = isArabic ? `${appliedRange.start} إلى ${appliedRange.end}` : `${appliedRange.start} to ${appliedRange.end}`;
      const printCSS = getReportPrintCSS(restaurantName, displaySubReportLabel, dateRangeText);

      printWindow.document.write(`
        <html dir="${direction}" lang="${isArabic ? 'ar' : 'en'}">
          <head>
            <title>${restaurantName} - ${displaySubReportLabel}${mode === 'pdf' ? ' PDF' : ''}</title>
            ${styleNodes}
            ${printCSS}
          </head>
          <body>
            <main class="report-export-shell" style="padding:16px">
              <section class="report-export-cover">
                <h1 class="report-export-title">${displaySubReportLabel}</h1>
                <div class="report-export-meta">
                  <span>${displayCategoryLabel}</span>
                  <span>${dateRangeText}</span>
                  <span>${activeBranchName || (isArabic ? 'كل الفروع' : 'All branches')}</span>
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
      setTimeout(() => printWindow.print(), 400);
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
         if (pendingOutput.mode === 'print' || pendingOutput.mode === 'pdf') {
            openPrintableReport(pendingOutput.mode);
         } else if (pendingOutput.mode === 'xlsx') {
            void exportXlsx(pendingOutput.reportName);
         }
         setPendingOutput(null);
      }, 250);
      return () => window.clearTimeout(timer);
   }, [activeCategory, activeSubReport, isLoadingReport, pendingOutput]);

   const selectReport = (categoryId: string, reportName: string, mode: 'view' | 'print' | 'pdf' | 'xlsx' = 'view') => {
      setReportError(null);
      setActiveCategory(categoryId);
      setActiveSubReport(reportName);
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
      setDateRange(nextRange);
      setAppliedRange(nextRange);
   };

   const exportCsv = async (reportName = activeSubReport) => {
      if (!isTabularExportSupported(reportName)) {
         setReportError(isArabic ? 'تصدير CSV/Excel غير متاح لهذا التقرير. استخدم PDF أو الطباعة.' : 'CSV/Excel export is not available for this report. Use PDF or print.');
         return;
      }
      setIsExporting(true);
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
         setIsExporting(false);
      }
   };

   const exportPdf = (reportName = activeSubReport) => {
      setReportError(null);
      if (reportName !== activeSubReport) {
         const category = visibleReportCategories.find((item) => item.subReports.includes(reportName));
         if (category) selectReport(category.id, reportName, 'pdf');
         return;
      }
      openPrintableReport('pdf');
   };

   const exportXlsx = async (reportName = activeSubReport) => {
      if (reportName !== activeSubReport) {
         const category = visibleReportCategories.find((item) => item.subReports.includes(reportName));
         if (category) selectReport(category.id, reportName, 'xlsx');
         return;
      }
      setIsExporting(true);
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
         workbook.creator = 'Coduis Zen';
         workbook.created = new Date();
         workbook.views = [{ rightToLeft: isArabic } as any];

         const sheet = workbook.addWorksheet(isArabic ? 'التقرير' : 'Report', {
            views: [{ rightToLeft: isArabic, state: 'frozen', ySplit: 8 }],
            properties: { defaultRowHeight: 24 },
         });
         const reportLabel = isArabic ? getReportDisplayLabel(reportName) : reportName;
         const columnCount = Math.max(headers.length, 6);
         sheet.mergeCells(1, 1, 3, columnCount);
         sheet.getCell(1, 1).value = reportLabel;
         sheet.getCell(1, 1).font = { bold: true, size: 24, color: { argb: 'FFFFFFFF' } };
         sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10243E' } };
         sheet.getCell(1, 1).alignment = { vertical: 'middle', horizontal: isArabic ? 'right' : 'left' };

         sheet.mergeCells(4, 1, 4, columnCount);
         sheet.getCell(4, 1).value = isArabic
            ? `الفترة: ${appliedRange.start} إلى ${appliedRange.end} | الفرع: ${activeBranchName || 'كل الفروع'}`
            : `Range: ${appliedRange.start} to ${appliedRange.end} | Branch: ${activeBranchName || 'All branches'}`;
         sheet.getCell(4, 1).font = { bold: true, size: 11, color: { argb: 'FF64748B' } };
         sheet.getCell(4, 1).alignment = { horizontal: isArabic ? 'right' : 'left' };

         const metaEntries = [
            [isArabic ? 'نوع التقرير' : 'Report type', getExportReportType(reportName)],
            [isArabic ? 'تاريخ التصدير' : 'Exported at', new Date().toLocaleString(isArabic ? 'ar-EG' : 'en-GB')],
            ...metadataRows.slice(0, 4),
         ].slice(0, columnCount);
         metaEntries.forEach(([label, value], index) => {
            const col = index + 1;
            sheet.getCell(6, col).value = label;
            sheet.getCell(6, col).font = { bold: true, size: 10, color: { argb: 'FF64748B' } };
            sheet.getCell(6, col).alignment = { horizontal: 'center' };
            sheet.getCell(7, col).value = value;
            sheet.getCell(7, col).font = { bold: true, size: 12, color: { argb: 'FF10243E' } };
            sheet.getCell(7, col).alignment = { horizontal: 'center', wrapText: true };
            sheet.getCell(7, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };
            sheet.getCell(7, col).border = {
               top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
               bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            };
         });

         const headerRow = sheet.getRow(9);
         headerRow.values = headers.length ? headers : [isArabic ? 'البيان' : 'Item'];
         headerRow.height = 30;
         headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
               top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
               bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            };
         });

         bodyRows.forEach((row, rowIndex) => {
            const sheetRow = sheet.addRow(row.map(coerceExcelValue));
            sheetRow.height = 24;
            sheetRow.eachCell((cell, colNumber) => {
               const value = cell.value;
               const isNumber = typeof value === 'number';
               const isNegative = isNumber && value < 0;
               cell.font = {
                  size: 10,
                  bold: colNumber === 1,
                  color: { argb: isNegative ? 'FFBE123C' : 'FF142033' },
               };
               cell.alignment = {
                  horizontal: isNumber ? 'center' : isArabic ? 'right' : 'left',
                  vertical: 'middle',
                  wrapText: true,
               };
               if (rowIndex % 2 === 1) {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };
               }
               cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
            });
         });

         const widthSource = [headers, ...bodyRows.slice(0, 200)];
         for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
            const maxLength = Math.max(12, ...widthSource.map((row) => String(row[colIndex] ?? '').length));
            sheet.getColumn(colIndex + 1).width = Math.min(Math.max(maxLength + 4, 14), 38);
         }
         if (headers.length) {
            sheet.autoFilter = { from: { row: 9, column: 1 }, to: { row: 9, column: headers.length } };
         }
         sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

         const buffer = await workbook.xlsx.writeBuffer();
         downloadBlob(
            new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            getSafeFileName(reportName, appliedRange.start, appliedRange.end, 'xlsx')
         );
      } catch (error: any) {
         setReportError(error?.message || (isArabic ? 'تعذر تصدير ملف Excel لهذا التقرير.' : 'Failed to export Excel.'));
      } finally {
         setIsExporting(false);
      }
   };

   const renderActiveReport = () => (
      <>
         {activeCategory === 'SALES' && <SalesReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
         {activeCategory === 'FINANCE' && <FinanceReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
         {activeCategory === 'INVENTORY' && <InventoryReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
         {activeCategory === 'HR' && <HrReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
         {activeCategory === 'CRM' && <CrmReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
         {activeCategory === 'OPS' && <OpsReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
         {activeCategory === 'AI' && <AiReports state={{ ...state, activeSubReport, activeCategory, navigate }} />}
      </>
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
                           <FileSpreadsheet size={16} />
                           Excel
                        </button>
                        <button onClick={() => exportPdf(activeSubReport)} disabled={isExporting} className="inline-flex items-center justify-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2.5 text-xs font-black text-danger transition hover:bg-danger/15 disabled:opacity-60">
                           <FileText size={16} />
                           PDF
                        </button>
                        <button onClick={() => exportCsv(activeSubReport)} disabled={isExporting || !canExportActiveCsv} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-app px-3 py-2.5 text-xs font-black text-main transition hover:bg-elevated disabled:opacity-60" title={canExportActiveCsv ? 'CSV' : (isArabic ? 'CSV غير متاح لهذا التقرير' : 'CSV unavailable for this report')}>
                           <Download size={16} />
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
                              onChange={(event) => setSearchQuery(event.target.value)}
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
                           <button onClick={() => setAppliedRange(dateRange)} className="rounded-md bg-primary px-4 py-2 text-xs font-black text-white transition hover:bg-primary-hover">
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
                                             <FileSpreadsheet size={15} />
                                          </button>
                                          <button onClick={() => exportPdf(report)} disabled={isExporting} className="rounded-md p-2 text-danger transition hover:bg-danger/10 disabled:opacity-50" title="PDF">
                                             <FileText size={15} />
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

            {isExporting && (
               <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm font-black text-success">
                  {isArabic ? 'جاري تجهيز ملف التصدير...' : 'Preparing export file...'}
               </div>
            )}

            {reportError && (
               <div className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">
                  {reportError}
               </div>
            )}

            <section ref={reportViewportRef} className="scroll-mt-4 rounded-lg border border-border bg-card p-4 lg:p-5">
               <div ref={printableRootRef}>
                  <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
                     <div>
                        <h2 className="text-lg font-black text-main">{displaySubReportLabel}</h2>
                        <p className="text-xs font-semibold text-muted">
                           {displayCategoryLabel} · {appliedRange.start} - {appliedRange.end} · {activeBranchName || (isArabic ? 'كل الفروع' : 'All branches')}
                        </p>
                     </div>
                     <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => exportXlsx(activeSubReport)} disabled={isExporting} className="rounded-md border border-border px-3 py-2 text-xs font-black text-main transition hover:bg-elevated disabled:opacity-60" title="Excel">Excel</button>
                        <button onClick={() => exportPdf(activeSubReport)} disabled={isExporting} className="rounded-md border border-border px-3 py-2 text-xs font-black text-main transition hover:bg-elevated disabled:opacity-60">PDF</button>
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
