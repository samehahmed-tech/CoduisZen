import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const outputDir = path.resolve('public/wallpapers/webp');
fs.mkdirSync(outputDir, { recursive: true });

// Login-style scenes: soft cinematic light, generous negative space and no
// hard grids/technical geometry competing with the application UI.
const scenes = [
  ['aurora', ['#071226', '#4338ca', '#22d3ee'], 'Aurora'],
  ['midnight', ['#030712', '#1d4ed8', '#7c3aed'], 'Midnight'],
  ['copper', ['#1a0c08', '#9a3412', '#f59e0b'], 'Copper'],
  ['emerald', ['#021b19', '#047857', '#34d399'], 'Emerald'],
  ['violet', ['#12071f', '#7e22ce', '#ec4899'], 'Violet'],
  ['ocean', ['#031525', '#0369a1', '#38bdf8'], 'Ocean'],
  ['sand', ['#21140b', '#b45309', '#fde68a'], 'Sand'],
  ['rose', ['#210711', '#be123c', '#fb7185'], 'Rose'],
  ['graphite', ['#050609', '#334155', '#94a3b8'], 'Graphite'],
  ['teal', ['#022126', '#0f766e', '#5eead4'], 'Teal'],
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1200, deviceScaleFactor: 1 });

for (const [name, colors, label] of scenes) {
  const [base, primary, accent] = colors;
  await page.setContent(`<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${base}}
    body{position:relative;background:
      radial-gradient(ellipse 58% 72% at 6% 12%,${primary}cc 0%,transparent 72%),
      radial-gradient(ellipse 52% 66% at 94% 88%,${accent}aa 0%,transparent 72%),
      linear-gradient(135deg,${base} 0%,#05070e 100%)}
    body:before{content:'';position:absolute;inset:-12%;background:
      radial-gradient(ellipse 45% 20% at 31% 34%,${accent}66 0%,transparent 68%),
      radial-gradient(ellipse 40% 18% at 76% 26%,${primary}55 0%,transparent 70%);filter:blur(42px);opacity:.9}
    body:after{content:'';position:absolute;inset:0;background:
      radial-gradient(ellipse at 50% 50%,transparent 28%,rgba(0,0,0,.12) 76%,rgba(0,0,0,.42) 100%),
      linear-gradient(120deg,rgba(255,255,255,.045),transparent 34%,transparent 70%,rgba(255,255,255,.025));pointer-events:none}
    .orb{position:absolute;border-radius:50%;filter:blur(22px);mix-blend-mode:screen;opacity:.72}
    .o1{width:520px;height:520px;left:-150px;top:210px;background:${primary}88;box-shadow:0 0 180px ${primary}88}
    .o2{width:420px;height:420px;right:-80px;bottom:-150px;background:${accent}77;box-shadow:0 0 180px ${accent}88}
    .ribbon{position:absolute;filter:blur(26px);opacity:.6;border-radius:999px;transform:rotate(-18deg);mix-blend-mode:screen}
    .r1{width:1100px;height:150px;left:-170px;top:230px;background:linear-gradient(90deg,transparent,${accent}aa 35%,${primary}55 68%,transparent);box-shadow:0 0 90px ${accent}66}
    .r2{width:900px;height:120px;right:-190px;top:650px;background:linear-gradient(90deg,transparent,${primary}77 45%,${accent}66 70%,transparent);transform:rotate(24deg)}
    .spark{position:absolute;width:7px;height:7px;border-radius:50%;background:#fff;filter:blur(2px);opacity:.42;box-shadow:0 0 18px #fff}
    .s1{left:18%;top:24%}.s2{left:72%;top:20%;width:4px;height:4px}.s3{left:62%;top:74%;width:5px;height:5px}.s4{left:32%;top:79%;width:4px;height:4px}
  </style><div class="orb o1"></div><div class="orb o2"></div><div class="ribbon r1"></div><div class="ribbon r2"></div><i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i><i class="spark s4"></i>`);
  await page.screenshot({ path: path.join(outputDir, `${name}.webp`), type: 'webp', quality: 90 });
  console.log(`Generated ${label}`);
}

await browser.close();
console.log(`Generated ${scenes.length} WebP backgrounds in ${outputDir}`);
