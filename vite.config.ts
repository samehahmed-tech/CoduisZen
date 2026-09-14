import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Force dependency cache reload after installing bullmq
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      watch: {
        ignored: ['**/.wwebjs_auth/**', '**/.wwebjs_cache/**']
      },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          ws: true,
        },
      }
    },
    build: {
      // Modern baseline (React 19 requires it): evergreen browsers only.
      // This drops the ~49KB legacy polyfill chunk + duplicate legacy bundles.
      target: 'es2020',
      minify: 'esbuild',
      cssMinify: true,
      sourcemap: false,
      cssCodeSplit: true,
      reportCompressedSize: false,
      assetsInlineLimit: 4096,
      chunkSizeWarningLimit: 600,
      // Safety net: the shell's HTML must never preload route/heavy chunks.
      // Entry static deps are preloaded; route chunks (page-*, motion,
      // charts, …) load on navigation or via the shell's own idle prefetch.
      modulePreload: {
        polyfill: false,
        resolveDependencies: (filename, deps, context) => {
          if ((context as { hostType?: string })?.hostType === 'html') {
            return deps.filter(
              (dep) =>
                !/(page-|motion|charts|DashboardCharts|MetricSparkline|RevenueForecast|KitchenDispatch|excel-export|spreadsheet|drag-drop|jspdf|purify|pdf-export|maps-vendor|date-range)/.test(
                  dep
                )
            );
          }
          return deps;
        },
      },
      rollupOptions: {
        output: {
          // Do NOT hoist transitive deps into importers: default hoisting
          // drags route-chunk + motion references into the entry for
          // evaluation ordering, defeating code-splitting. Verified safe:
          // no circular-chunk warnings, build passes, runtime intact.
          hoistTransitiveImports: false,
      manualChunks(id) {
              // ── Vendor libs ──
              if (id.includes('node_modules/react-dom')) return 'vendor-react';
              if (id.includes('node_modules/react-router')) return 'vendor-react';
              if (id.includes('node_modules/react/')) return 'vendor-react';
              if (id.includes('node_modules/recharts')) return 'charts';
              if (id.includes('node_modules/exceljs')) return 'excel-export';
              if (id.includes('node_modules/xlsx')) return 'spreadsheet';
              if (id.includes('node_modules/@hello-pangea/dnd')) return 'drag-drop';
              if (id.includes('node_modules/framer-motion')) return 'motion';
              if (id.includes('node_modules/cmdk')) return 'command-palette';
              if (id.includes('node_modules/socket.io-client')) return 'socket';
              if (id.includes('node_modules/leaflet')) return 'maps-vendor';
              if (id.includes('node_modules/react-date-range')) return 'date-range';
              // PDF/print pipeline (jspdf + pdfkit + html2canvas): only used by
              // export/print flows. Kept out of the entry + shared chunks so
              // first paint never pays for it.
              if (
                id.includes('node_modules/jspdf') ||
                id.includes('node_modules/pdfkit') ||
                id.includes('node_modules/html2canvas')
              ) return 'pdf-export';
              if (id.includes('node_modules/react-hot-toast')) return 'toast';
              if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) return 'i18n-vendor';
              if (id.includes('node_modules/qrcode')) return 'qr';
              if (id.includes('node_modules/lucide-react')) return 'ui-icons';
              if (id.includes('node_modules/dexie')) return 'offline';
              if (id.includes('node_modules/zustand')) return 'state';
              if (id.includes('node_modules/date-fns')) return 'date-utils';
              // Used by the shell (QueryClientProvider) AND every data route —
              // without its own chunk it gets absorbed into a route chunk and
              // creates static entry→route edges (plus eager preloads).
              if (id.includes('node_modules/@tanstack')) return 'vendor-tanstack';

              // ── Shared app foundation (used by shell AND routes).
              // Without these, Rollup buckets shared modules (translations,
              // api clients, formatters) into whichever route chunk it sees
              // first — creating static entry→route edges that defeat
              // code-splitting and trigger eager preloads of route chunks.
              // NOTE: heavy print/pdf modules (posPrintOrchestrator,
              // receiptTemplate*, templateReceiptGenerator,
              // receiptImageRenderer, reportPdf) are deliberately EXCLUDED —
              // they stay in lazy route chunks (loaded on first print/export).
              if (id.includes('services/api/')) return 'shared-api';
              if (id.includes('services/translations') || id.includes('src/i18n')) return 'shared-i18n';
              if (
                id.includes('services/eventBus') ||
                id.includes('services/socketService') ||
                id.includes('services/syncService') ||
                id.includes('src/services/syncService') ||
                id.includes('src/services/syncQueueUtils') ||
                id.includes('db/localDb') ||
                id.includes('src/db/')
              ) return 'shared-core';
              // NOTE: auditService/aiIntelligenceService stay OUT of shared
              // chunks on purpose — auditService imports useAuthStore, which
              // would create a shared-core↔shared-stores cycle. Both are only
              // used by App's deferred init, so they inline into the entry.
              if (id.includes('/stores/') && !id.includes('node_modules')) return 'shared-stores';
              if (
                (id.includes('/utils/') || id.includes('/src/utils/') ||
                  id.includes('services/platformPricing') ||
                  id.includes('services/stockAdjustment') ||
                  id.includes('services/stockSocket')) &&
                !id.includes('node_modules')
              ) return 'shared-utils';
              if (/[/\\]types\.ts$/.test(id) && !id.includes('node_modules')) return 'shared-types';
              if (id.includes('/theme/') && !id.includes('node_modules')) return 'shared-theme';
              if (id.includes('/hooks/') && !id.includes('node_modules')) return 'shared-hooks';
              if (
                id.includes('components/common/PageSkeleton') ||
                id.includes('components/common/ToastProvider') ||
                id.includes('components/common/ConfirmProvider') ||
                id.includes('components/common/ErrorBoundary') ||
                id.includes('components/common/ScrollToTop') ||
                id.includes('components/common/navigation') ||
                id.includes('components/common/BranchContextSwitcher') ||
                id.includes('components/common/googleMaps') ||
                id.includes('components/Toast') ||
                id.includes('components/Modal') ||
                id.includes('components/SensitiveData')
              ) return 'shared-ui';

              // ── Heavy page chunks (split from main bundle) ──
              if (id.includes('components/CallCenter')) return 'page-callcenter';
              if (id.includes('components/KDS')) return 'page-kds';
              if (id.includes('components/Finance')) return 'page-finance';
              if (id.includes('features/pos/')) return 'page-pos';
              if (id.includes('components/PrinterManager') || id.includes('components/ReceiptDesigner')) return 'page-printing';
              if (id.includes('components/menu/MenuSetupWizard')) return 'page-menu-setup';
              if (id.includes('components/menu/ItemDrawer')) return 'page-menu-drawer';
              if (id.includes('components/MenuManager') || id.includes('components/menu/')) return 'page-menu';
              if (id.includes('features/inventory/')) return 'page-inventory';
              if (id.includes('features/hr/components/AttendanceManager')) return 'page-hr-attendance';
              if (id.includes('features/hr/components/PayrollManager')) return 'page-hr-payroll';
              if (id.includes('features/hr/components/BiometricDeviceManager')) return 'page-hr-biometric';
              if (id.includes('features/hr/components/SchedulingManager')) return 'page-hr-scheduling';
              if (id.includes('features/hr/components/HRSettingsManager')) return 'page-hr-settings';
              if (id.includes('features/hr/components/HRUserGuide')) return 'page-hr-guide';
              if (id.includes('features/hr/components/TaskChecklistManager')) return 'page-hr-tasks';
              if (id.includes('features/hr/components/DataMigrationWizard')) return 'page-hr-migration';
              if (id.includes('features/hr/components/HRHub')) return 'page-hr-hub';
              if (id.includes('features/hr/UserManagement')) return 'page-hr-users';
              if (id.includes('features/hr/')) return 'page-hr-shared';
              if (id.includes('components/Dashboard')) return 'page-dashboard';
              if (id.includes('components/Reports') || id.includes('components/reports/')) return 'page-reports';
              if (id.includes('components/SettingsHub')) return 'page-settings';
            }
        }
      }
    },
    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      'global': 'window',
      'process.env': '{}'
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
