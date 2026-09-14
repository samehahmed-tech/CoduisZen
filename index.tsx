import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ModalProvider } from './components/Modal';
import './src/i18n'; // Initialize i18n

// ── Strict Console Cleaner (Pristine Dev Experience) ──
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('of chart should be greater than 0')) return;
  originalWarn(...args);
};

const originalInfo = console.info;
console.info = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Download the React DevTools')) return;
  originalInfo(...args);
};

const originalLog = console.log;
console.log = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('SW registered')) return;
  originalLog(...args);
};

// ── PWA Service Worker Registration ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch(() => {});
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// ── Non-blocking Cairo font (CSP-safe: DOM-created, no inline handlers) ──
// index.html only preloads the CSS; injecting the stylesheet here keeps font
// fetch off the critical path. display=swap swaps it in without layout shift.
if (typeof document !== 'undefined' && !document.querySelector('link[data-font="cairo"]')) {
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap';
  fontLink.setAttribute('data-font', 'cairo');
  document.head.appendChild(fontLink);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: (failureCount, error: any) => {
        const status = Number(error?.status || 0);
        const endpoint = String(error?.endpoint || '');
        if (status >= 400 && status < 500) return false;
        if (endpoint.includes('/reports/') || endpoint.includes('/export')) return false;
        return failureCount < 1;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ModalProvider>
        <App />
      </ModalProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
