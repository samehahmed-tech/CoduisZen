import puppeteer from 'puppeteer';
import fs from 'node:fs';

const root = 'D:/Projects/restoflow-erp';
const out = `${root}/output/live-screenshots`;
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const cleanOverlays = async (page) => {
  await page.evaluate(() => {
    const marker = 'تنبيه: النظام';
    const leaves = Array.from(document.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && (el.textContent || '').includes(marker)
    );
    for (const leaf of leaves) {
      let current = leaf;
      for (let i = 0; i < 10 && current; i++, current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.position === 'fixed' || style.position === 'sticky') {
          current.style.display = 'none';
          break;
        }
      }
    }
  });
};

const browser = await puppeteer.launch({ headless: true });
const desktop = await browser.newPage();
await desktop.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
desktop.setDefaultNavigationTimeout(15000);
await desktop.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
const loginResult = await desktop.evaluate(async () => {
  const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@coduiszen.com', password: 'w3dC5jOJLveEG6sr' }) });
  const data = await response.json();
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  localStorage.setItem('auth_token', data.token || data.accessToken || '');
  if (data.refreshToken) localStorage.setItem('refresh_token', data.refreshToken);
  return Boolean(data.token || data.accessToken);
});
if (!loginResult) throw new Error('Login response did not include a token');
await desktop.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await wait(1800);
await wait(1600);

const desktopRoutes = [
  ['dashboard', '/'],
  ['pos', '/pos'],
  ['kds', '/kds'],
  ['inventory', '/inventory'],
  ['finance', '/finance'],
  ['dispatch', '/dispatch'],
  ['reports', '/reports'],
  ['ai-insights', '/ai-insights'],
  ['menu', '/menu'],
  ['franchise', '/franchise'],
  ['users-roles', '/user-management'],
];
for (const [name, route] of desktopRoutes) {
  await desktop.goto(`http://127.0.0.1:3000${route}`, { waitUntil: 'domcontentloaded' });
  await wait(1100);
  await cleanOverlays(desktop);
  await desktop.screenshot({ path: `${out}/live-${name}-desktop.png`, fullPage: false });
}

const mobile = await browser.newPage();
await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
mobile.setDefaultNavigationTimeout(15000);
await mobile.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await wait(1000);
const mobileRoutes = [
  ['dashboard', '/'],
  ['pos', '/pos'],
  ['inventory', '/inventory'],
  ['dispatch', '/dispatch'],
  ['reports', '/reports'],
  ['hr', '/hr'],
];
for (const [name, route] of mobileRoutes) {
  await mobile.goto(`http://127.0.0.1:3000${route}`, { waitUntil: 'domcontentloaded' });
  await wait(1100);
  await cleanOverlays(mobile);
  await mobile.screenshot({ path: `${out}/live-${name}-mobile.png`, fullPage: false });
}

await browser.close();
console.log(`captured ${desktopRoutes.length + mobileRoutes.length} live screenshots in ${out}`);
