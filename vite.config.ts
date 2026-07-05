import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
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
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
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
              if (id.includes('node_modules/lucide-react')) return 'ui-icons';
              if (id.includes('node_modules/dexie')) return 'offline';
              if (id.includes('node_modules/zustand')) return 'state';
              if (id.includes('node_modules/date-fns')) return 'date-utils';

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
      legacy({
        targets: ['Android >= 4.4', 'Chrome >= 30'],
        renderLegacyChunks: true,
        modernPolyfills: true,
      }),
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
