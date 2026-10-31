import puppeteer from 'puppeteer';
import fs from 'node:fs';

const root = 'D:/Projects/restoflow-erp';
const out = `${root}/output/live-screenshots`;
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function cleanOverlays(page) {
  await page.evaluate(() => {
    const markers = ['تنبيه: النظام', 'Warning: the system'];
    for (const leaf of Array.from(document.querySelectorAll('*')).filter(el => el.children.length === 0 && markers.some(marker => (el.textContent || '').includes(marker)))) {
      let current = leaf;
      for (let i = 0; i < 12 && current; i++, current = current.parentElement) {
        const position = getComputedStyle(current).position;
        if (position === 'fixed' || position === 'sticky') { current.style.display = 'none'; break; }
      }
    }
  });
}

async function authenticate(page) {
  const ok = await page.evaluate(async () => {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@coduiszen.com', password: 'w3dC5jOJLveEG6sr' }) });
    const data = await response.json();
    if (!response.ok) throw new Error(`Login failed: ${response.status}`);
    localStorage.setItem('auth_token', data.token || data.accessToken || '');
    if (data.refreshToken) localStorage.setItem('refresh_token', data.refreshToken);
    return Boolean(data.token || data.accessToken);
  });
  if (!ok) throw new Error('Login response did not include a token');
}

async function setLanguage(page, value) {
  await page.goto('http://127.0.0.1:3000/settings', { waitUntil: 'domcontentloaded' });
  await wait(1800);
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find(el => (el.textContent || '').includes('التوطين') || (el.textContent || '').includes('Localization'));
    button?.click();
  });
  await wait(600);
  await page.evaluate((next) => {
    const select = Array.from(document.querySelectorAll('select')).find(el => { const values = Array.from(el.options).map(o => o.value); return values.includes('ar') && values.includes('en'); });
    if (!select) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, next);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, value);
  await wait(1200);
}

const browser = await puppeteer.launch({ headless: true });
const desktop = await browser.newPage();
await desktop.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
desktop.setDefaultNavigationTimeout(15000);

// Fresh login screens, before authentication.
await desktop.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
await wait(2400);
await desktop.screenshot({ path: `${out}/live-login-desktop.png`, fullPage: false });
await desktop.evaluate(() => Array.from(document.querySelectorAll('button')).find(el => (el.textContent || '').trim().toUpperCase().includes('ENGLISH'))?.click());
await wait(800);
await desktop.screenshot({ path: `${out}/live-login-english-desktop.png`, fullPage: false });

const mobileLogin = await browser.newPage();
await mobileLogin.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await mobileLogin.goto('http://127.0.0.1:3000/login', { waitUntil: 'domcontentloaded' });
await wait(1800);
await mobileLogin.screenshot({ path: `${out}/live-login-mobile.png`, fullPage: false });
await mobileLogin.close();

await authenticate(desktop);
await desktop.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await wait(2600);

// Arabic cashier screen.
await desktop.goto('http://127.0.0.1:3000/pos', { waitUntil: 'domcontentloaded' });
await wait(2000);
await cleanOverlays(desktop);
await desktop.screenshot({ path: `${out}/live-pos-arabic-desktop.png`, fullPage: false });

// Theme gallery: capture the real 10-theme grid from the Appearance Center.
await desktop.goto('http://127.0.0.1:3000/theme-lab', { waitUntil: 'domcontentloaded' });
await wait(2500);
await cleanOverlays(desktop);
const gallery = await desktop.$('.theme-lab-theme-grid');
if (gallery) await gallery.screenshot({ path: `${out}/live-theme-gallery-10-themes.png` });
await desktop.screenshot({ path: `${out}/live-theme-lab-desktop.png`, fullPage: false });

// A few real theme variations of the cashier screen.
for (const [id, label] of [['neon', 'neon'], ['cinema', 'cinema'], ['aero', 'aero']]) {
  await desktop.goto('http://127.0.0.1:3000/theme-lab', { waitUntil: 'domcontentloaded' });
  await wait(1800);
  await desktop.evaluate((name) => {
    const button = Array.from(document.querySelectorAll('.theme-lab-theme-card')).find(el => (el.textContent || '').toLowerCase().includes(name));
    button?.click();
  }, id);
  await wait(1500);
  await desktop.goto('http://127.0.0.1:3000/pos', { waitUntil: 'domcontentloaded' });
  await wait(1800);
  await cleanOverlays(desktop);
  await desktop.screenshot({ path: `${out}/live-pos-theme-${label}.png`, fullPage: false });
}

// English cashier screen to demonstrate LTR switching.
await setLanguage(desktop, 'en');
await desktop.goto('http://127.0.0.1:3000/pos', { waitUntil: 'domcontentloaded' });
await wait(2000);
await cleanOverlays(desktop);
await desktop.screenshot({ path: `${out}/live-pos-english-desktop.png`, fullPage: false });

await browser.close();
console.log('captured live login, language, theme gallery, and cashier theme screens');
