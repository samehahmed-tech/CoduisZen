import puppeteer from 'puppeteer';
import fs from 'node:fs';

const htmlPath = 'D:/Projects/restoflow-erp/tmp/pdfs/coduis_zen_brochure.html';
const outputPath = 'D:/Projects/restoflow-erp/output/pdf/CODUIS-ZEN-Company-Profile-AR-EG.pdf';
fs.mkdirSync('D:/Projects/restoflow-erp/output/pdf', { recursive: true });

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto(`file:///${htmlPath}`, { waitUntil: 'networkidle0' });
await page.evaluate(async () => {
  await document.fonts.ready;
  const images = [...document.images];
  await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; })));
});
await page.pdf({ path: outputPath, format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await browser.close();
console.log(outputPath);
