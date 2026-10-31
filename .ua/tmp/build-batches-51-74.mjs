import fs from 'node:fs';
import path from 'node:path';

const root = 'D:/Projects/restoflow-erp';
const ua = path.join(root, '.ua');
const intermediate = path.join(ua, 'intermediate');
const batchesDoc = JSON.parse(fs.readFileSync(path.join(intermediate, 'batches.json'), 'utf8'));

const arNames = {
  'day-close-fix': 'إصلاح إغلاق يوم العمل',
  'discount-fix': 'إصلاح الخصومات',
  hotfix: 'إصلاح النظام المثبّت',
  'kds-order-fix': 'إصلاح تدفق طلبات KDS',
  'latest-fixes': 'حزمة أحدث الإصلاحات',
  'local-image-fix': 'إصلاح الصور المحلية',
  'operational-reset': 'إعادة ضبط بيانات التشغيل التجريبية',
  'order-save-fix': 'إصلاح حفظ الطلبات',
  'price-size-hotfix': 'إصلاح أسعار الأحجام',
  'print-bridge-resilience-fix': 'تعزيز اعتمادية جسر الطباعة',
  'recipe-quantity-fix': 'إصلاح كميات الوصفات',
  'table-pos-fix': 'إصلاح ربط الطاولات بنقطة البيع',
  'print-bridge-hotfix': 'إصلاح جسر الطباعة',
  'print-routing-hotfix': 'إصلاح توجيه الطباعة',
  'perf-hotfix': 'إصلاح الأداء',
};

function words(name) {
  return name.replace(/\.[^.]+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim();
}

function purposeFromPath(p) {
  const low = p.toLowerCase();
  for (const [key, value] of Object.entries(arNames)) if (low.includes(`/${key}/`)) return value;
  if (low.includes('advance-business-date')) return 'تقديم تاريخ يوم العمل التشغيلي';
  if (low.includes('business-day-reopen')) return 'إعادة فتح يوم العمل';
  if (low.includes('cleanup-future-days')) return 'تنظيف أيام العمل المستقبلية غير الصحيحة';
  if (low.includes('close-day-17-open-18')) return 'إغلاق يوم عمل وفتح اليوم التالي';
  if (low.includes('move-day16-to-day15')) return 'تصحيح إسناد الأرباح بين يومي عمل';
  if (low.includes('rosa-cafe')) return 'استيراد وتهيئة بيانات Rosa Cafe';
  if (low.includes('cafe-menu')) return 'استيراد كتالوج وقائمة المقهى';
  if (low.includes('sqlserver')) return 'فحص أو إصلاح مخطط SQL Server';
  if (low.includes('lighthouse')) return 'تشغيل قياسات Lighthouse وتجميع تقاريرها';
  return words(path.basename(p));
}

function fileSummary(file, content, result) {
  const p = file.path.replaceAll('\\', '/');
  const low = p.toLowerCase();
  const base = path.basename(p);
  const purpose = purposeFromPath(p);
  if (file.language === 'batch') return `مشغّل Windows مختصر يطلق ${purpose} من PowerShell مع تمرير الصلاحيات والحفاظ على تجربة تشغيل مباشرة للمستخدم.`;
  if (file.language === 'powershell') return `سكريبت صيانة لـ ${purpose}؛ يدير إيقاف الخدمات أو المهام، تطبيق الملفات المطلوبة، ثم إعادة التشغيل والتحقق من سلامة النظام المثبّت.`;
  if (file.fileCategory === 'docs') {
    if (low.includes('/tasks/')) return `خطة عمل توثّق نطاق وتنفيذ ${purpose}، بما يشمل الخطوات ومعايير التحقق والمتابعة.`;
    if (low.includes('/plans/')) return `خطة تنفيذ تفصيلية لـ ${purpose} تربط تغييرات الواجهة والخادم والبيانات بخطوات اختبار وتسليم واضحة.`;
    if (low.includes('/specs/')) return `مواصفة تصميمية تشرح قرارات ونطاق ${purpose} والعقود والسلوك المتوقع قبل التنفيذ.`;
    if (low.includes('hr_user_guide')) return 'دليل عربي لمستخدمي وحدة الموارد البشرية يشرح الوصول إلى الوظائف الأساسية وإتمام إجراءات الموظفين اليومية.';
    return `دليل تشغيل عربي يشرح هدف ${purpose} وطريقة تطبيقه والتحقق من نجاحه أو الرجوع الآمن عند الحاجة.`;
  }
  if (file.fileCategory === 'markup' && file.language === 'css') {
    if (low.includes('/themes/')) return `تعريف سمة مرئية باسم ${words(base)} يضبط متغيرات الألوان والأسطح والظلال والحالات التفاعلية ضمن محرك السمات.`;
    if (low.includes('responsive')) return 'قواعد responsive تضبط تخطيط نقطة البيع وكثافة العناصر وأحجام أهداف اللمس عبر الشاشات المختلفة.';
    if (low.includes('sidebar')) return 'أنماط تخطيط وتنويعات مرئية للشريط الجانبي، تشمل حالاته وأبعاده وتفاعلاته داخل مساحات العمل.';
    if (low.includes('kds')) return 'أنماط واجهة شاشة المطبخ KDS لتحسين وضوح التذاكر والحالات والألوان على شاشات التشغيل.';
    if (low.includes('kiosk')) return 'نظام تنسيق واجهة الكشك اللمسية، مع تخطيطات كبيرة وواضحة لتصفح القائمة وتنفيذ الطلب.';
    if (low.includes('pos-')) return `نظام تنسيق موسّع لواجهة POS يطبّق أسلوب ${words(base)} على البطاقات والقوائم والتفاعلات وحالات الاستجابة.`;
    if (low.includes('animation') || low.includes('motion') || low.includes('interaction')) return 'مكتبة CSS للحركة والتفاعلات الدقيقة، توحّد الانتقالات وحالات hover/focus مع مراعاة تقليل الحركة.';
    if (low.includes('theme')) return 'طبقة CSS لمحرك السمات توحّد المتغيرات والمكوّنات والتجاوزات المرئية عبر وحدات النظام.';
    return `طبقة CSS باسم ${words(base)} تضبط الأسطح والتخطيط والتفاصيل المرئية المشتركة في واجهات النظام.`;
  }
  if (file.fileCategory === 'config') {
    if (low.endsWith('translation.json')) return `قاموس ترجمة ${low.includes('/ar/') ? 'عربي' : 'إنجليزي'} لنصوص الواجهة، يضمن اتساق المصطلحات والرسائل في تجربة متعددة اللغات.`;
    if (low.includes('drizzle')) return 'إعداد Drizzle لتحديد مخطط قاعدة البيانات ومسار المخرجات وبيانات الاتصال المستخدمة في التوليد والترحيل.';
    if (low.includes('eslint')) return 'إعداد ESLint لقواعد جودة كود TypeScript وReact والاستثناءات المستخدمة في المشروع.';
    if (low.includes('lighthouse/routes')) return 'قائمة المسارات التي تغطيها جولات Lighthouse الآلية عند قياس الأداء وإتاحة الواجهة.';
    return `ملف إعداد يضبط ${purpose} والقيم اللازمة لتشغيله بصورة متكررة ومتسقة.`;
  }
  if (file.fileCategory === 'data' && file.language === 'sql') return 'ترحيل SQL Server يضيف daily_order_number عند غيابه ويعيد ترقيم الطلبات يوميًا لكل فرع داخل معاملة ذرّية.';
  if (['7z', 'webp', 'bmp', 'msi', 'exe'].includes(file.language)) {
    if (file.language === 'webp') return `صورة خلفية مضغوطة باسم ${words(base)} تُستخدم كخيار بصري داخل نظام تخصيص واجهة التطبيق.`;
    if (file.language === 'msi' || file.language === 'exe') return `حزمة prerequisite ثنائية يضمّنها المثبّت لتجهيز ${file.language === 'msi' ? 'برنامج تشغيل SQL Server' : 'مكتبات Visual C++ runtime'} دون تنزيل خارجي.`;
    if (file.language === 'bmp') return 'صورة bitmap لواجهة معالج التثبيت تُعرض في صفحات المثبّت وتدعم الهوية البصرية للحزمة.';
    return 'أرشيف إصدار ثنائي يجمع مخرجات التحديث الجاهزة للنقل أو التثبيت في بيئة العميل.';
  }
  if (low.includes('/tests/') || low.startsWith('tests/')) return `اختبار آلي يتحقق من ${purpose} ويحمي السلوك المتوقع من الانكسار عند تغييرات لاحقة.`;
  if (low.includes('/hooks/')) return `React hook باسم ${words(base)} يعزل منطق ${purpose} في واجهة قابلة لإعادة الاستخدام داخل المكوّنات.`;
  if (low.includes('components/common/')) return `مكوّن React مشترك باسم ${words(base)} يقدّم لبنة واجهة قابلة لإعادة الاستخدام مع حالات وعرض متّسقين.`;
  if (low.includes('components/dashboard/')) return `مكوّن لوحة معلومات باسم ${words(base)} يعرض المؤشرات أو الرسوم ضمن حاوية متناسقة وقابلة لإعادة الاستخدام.`;
  if (low.includes('components/tiles/')) return 'مكوّن بطاقة وحدة قابل للنقر يعرض هوية الوحدة وحالتها ويضيف تفاعل الميل البصري عند المؤشر.';
  if (low.includes('drizzle/relations')) return 'تعريف مركزي لعلاقات جداول Drizzle، يربط كيانات التشغيل والطلبات والمخزون والموارد البشرية لتكوين استعلامات مترابطة آمنة الأنواع.';
  if (low.includes('hardware-bridge/index')) return 'خدمة جسر الطباعة المحلي؛ تستقبل مهام الطباعة من الخادم وتحوّلها لصيغ الطابعات، تدير الإعادة والتقارير، وتدعم Windows وTCP.';
  if (low.includes('png-raster')) return 'أداة منخفضة المستوى لفك PNG وتحويل بيانات البكسل إلى raster صالح لأوامر ESC/POS المستخدمة في الطابعات الحرارية.';
  if (low.includes('service-worker') || low.endsWith('/sw.js')) return 'Service Worker يدير التخزين المؤقت وطلبات الشبكة لتوفير تحميل أسرع وسلوك أكثر مرونة عند ضعف الاتصال.';
  if (low.includes('vite.config')) return 'إعداد بناء وتشغيل Vite للتطبيق، بما يشمل plugins وaliases وبيئة التطوير وتقسيم حزم الإنتاج.';
  if (low.includes('vitest.config')) return 'إعداد Vitest لبيئة الاختبارات ومسارات الملفات وتجهيزات التشغيل المشتركة.';
  if (low.includes('.d.ts')) return `تعريفات TypeScript مساعدة لـ ${purpose} تكمل أنواع المكتبات والبيئة أثناء الفحص والبناء.`;
  if (low.includes('/scripts/') || low.startsWith('scripts/') || low.endsWith('.cjs') || low.endsWith('.mjs')) return `أداة تشغيلية لـ ${purpose} تنفّذ المهمة آليًا مع تسجيل النتيجة ومعالجة أخطاء التنفيذ.`;
  if (low.includes('services/') || low.includes('server/services/')) return `خدمة تطبيقية لـ ${purpose} تفصل منطق المجال عن الواجهة وتقدّم عقدًا صغيرًا يمكن اختباره وإعادة استخدامه.`;
  if (low.includes('utils/')) return `أداة مساعدة لـ ${purpose} توحّد السلوك المشترك وتقلل تكراره بين أجزاء النظام.`;
  return `وحدة ${file.language} مسؤولة عن ${purpose} ضمن بنية نظام RestoFlow.`;
}

function fileTags(file) {
  const p = file.path.toLowerCase();
  if (file.language === 'batch' || file.language === 'powershell') return ['maintenance', 'windows', 'deployment'];
  if (file.fileCategory === 'docs') return ['documentation', p.includes('plan') ? 'implementation-plan' : 'operations', 'reference'];
  if (file.fileCategory === 'markup') return ['ui-design', 'css', p.includes('theme') ? 'theming' : 'responsive-design'];
  if (file.fileCategory === 'config') return ['configuration', p.includes('translation') ? 'localization' : 'build-system', 'runtime'];
  if (file.fileCategory === 'data') return ['database', 'migration', 'sql-server'];
  if (p.includes('test')) return ['test', 'regression', 'validation'];
  if (p.includes('/hooks/')) return ['hook', 'react', 'utility'];
  if (p.includes('component')) return ['component', 'react', 'ui'];
  if (p.includes('hardware-bridge')) return ['service', 'printing', 'hardware-integration'];
  if (p.includes('script')) return ['script', 'operations', 'automation'];
  if (['7z', 'webp', 'bmp', 'msi', 'exe'].includes(file.language)) return ['asset', 'distribution', 'binary'];
  return ['application', 'typescript', 'utility'];
}

function nodeType(file, content) {
  if (file.fileCategory === 'config') return ['config', `config:${file.path}`];
  if (file.fileCategory === 'docs') return ['document', `document:${file.path}`];
  if (file.fileCategory === 'infra') return ['service', `service:${file.path}`];
  if (file.fileCategory === 'data' && file.language === 'sql') return ['table', `table:${file.path}:orders`];
  if (file.fileCategory === 'data') return ['schema', `schema:${file.path}`];
  return ['file', `file:${file.path}`];
}

function complexity(lines, structures = 0) {
  if (lines > 200 || structures > 20) return 'complex';
  if (lines >= 50 || structures > 5) return 'moderate';
  return 'simple';
}

function symbolSummary(kind, name, filePath) {
  const n = name.toLowerCase();
  if (n.startsWith('use')) return `React hook ينفّذ سلوك ${words(name)} ويحتفظ بدورة حياته وتنظيف موارده بصورة قابلة لإعادة الاستخدام.`;
  if (n.includes('wait')) return `ينتظر جاهزية ${words(name)} ضمن مهلة محددة، ويعيد نتيجة قابلة للاستخدام في التحقق أو الاسترداد.`;
  if (n.includes('repair') || n.includes('fix')) return `يفحص حالة ${words(name)} ويطبّق التصحيح المطلوب مع الحفاظ على قابلية تتبع النتيجة.`;
  if (n.includes('load') || n.includes('read')) return `يقرأ ${words(name)} من المصدر المحلي ويحوّله إلى بنية مناسبة لباقي مسار التنفيذ.`;
  if (n.includes('save') || n.includes('write')) return `يحفظ ${words(name)} بصورة منظمة لضمان استمرار الحالة وإمكان استعادتها.`;
  if (n.includes('print') || n.includes('raster')) return `ينفّذ مرحلة ${words(name)} ضمن مسار تجهيز وإرسال مهام الطباعة للأجهزة المستهدفة.`;
  if (n.includes('test') || n.includes('assert') || n.includes('verify')) return `يتحقق من ${words(name)} ويُظهر فشلًا واضحًا عندما لا تتحقق شروط السلامة المتوقعة.`;
  if (kind === 'class') return `فئة ${name} تجمع الحالة والعمليات المرتبطة بوظيفة ${purposeFromPath(filePath)} في واجهة واحدة.`;
  return `تنفّذ الدالة ${name} جزءًا محددًا من ${purposeFromPath(filePath)} وتفصل هذه المسؤولية عن مسار التنفيذ الرئيسي.`;
}

function parsePowerShellFunctions(content) {
  const lines = content.split(/\r?\n/);
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*function\s+([A-Za-z0-9_-]+)\s*(?:\(([^)]*)\))?/i);
    if (m) starts.push({ name: m[1], startLine: i + 1, params: m[2] ? m[2].split(',').map(x => x.trim()).filter(Boolean) : [] });
  }
  return starts.map((f, i) => ({ ...f, endLine: (starts[i + 1]?.startLine ?? (lines.length + 1)) - 1 }));
}

function parseBatchLabels(content) {
  const lines = content.split(/\r?\n/);
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*:([A-Za-z0-9_-]+)\s*$/);
    if (m && !m[1].startsWith(':')) starts.push({ name: m[1], startLine: i + 1 });
  }
  return starts.map((f, i) => ({ ...f, endLine: (starts[i + 1]?.startLine ?? (lines.length + 1)) - 1, params: [] }));
}

function analyzeBatch(batch) {
  const extraction = JSON.parse(fs.readFileSync(path.join(ua, 'tmp', `ua-file-extract-results-${batch.batchIndex}.json`), 'utf8'));
  if (extraction.filesUnreadable?.length) throw new Error(`Unreadable files in batch ${batch.batchIndex}: ${JSON.stringify(extraction.filesUnreadable)}`);
  const results = new Map((extraction.results ?? []).map(r => [r.path, r]));
  const nodes = [];
  const edges = [];
  const fileNodeIds = new Map();

  for (const file of batch.files) {
    const abs = path.join(root, file.path);
    const content = fs.readFileSync(abs, ['7z', 'webp', 'bmp', 'msi', 'exe'].includes(file.language) ? null : 'utf8');
    const result = results.get(file.path);
    const text = typeof content === 'string' ? content : '';
    const actualLines = result?.nonEmptyLines ?? (text ? text.split(/\r?\n/).filter(l => l.trim()).length : file.sizeLines);
    const [type, id] = nodeType(file, text);
    fileNodeIds.set(file.path, id);
    const structures = (result?.functions?.length ?? 0) + (result?.classes?.length ?? 0);
    const fileNode = {
      id, type, name: path.basename(file.path), filePath: file.path,
      summary: fileSummary(file, text, result), tags: fileTags(file), complexity: complexity(actualLines, structures),
    };
    if (file.language === 'powershell') fileNode.languageNotes = 'يعتمد على PowerShell لأتمتة صيانة تثبيت Windows وإدارة scheduled tasks والعمليات مع رسائل تشغيل واضحة.';
    if (file.language === 'css' && actualLines > 200) fileNode.languageNotes = 'يستخدم CSS variables وmedia queries وselectors مركبة لبناء نظام تصميم قابل للتخصيص والاستجابة.';
    nodes.push(fileNode);

    let funcs = result?.functions ?? [];
    if (!result && file.language === 'powershell') funcs = parsePowerShellFunctions(text);
    if (!result && file.language === 'batch') funcs = parseBatchLabels(text);
    const exportNames = new Set((result?.exports ?? []).map(e => e.name));
    for (const fn of funcs) {
      const len = (fn.endLine ?? fn.startLine) - fn.startLine + 1;
      if (len < 10 && !exportNames.has(fn.name)) continue;
      const fnId = `function:${file.path}:${fn.name}`;
      nodes.push({
        id: fnId, type: 'function', name: fn.name, filePath: file.path,
        lineRange: [fn.startLine, fn.endLine ?? fn.startLine], summary: symbolSummary('function', fn.name, file.path),
        tags: file.path.toLowerCase().includes('test') ? ['test', 'validation', 'regression'] : ['function', file.language === 'powershell' ? 'automation' : 'business-logic', 'utility'],
        complexity: complexity(len),
      });
      edges.push({ source: id, target: fnId, type: 'contains', direction: 'forward', weight: 1.0 });
      if (exportNames.has(fn.name)) edges.push({ source: id, target: fnId, type: 'exports', direction: 'forward', weight: 0.8 });
    }
    for (const cls of result?.classes ?? []) {
      const len = (cls.endLine ?? cls.startLine) - cls.startLine + 1;
      if (len < 20 && (cls.methods?.length ?? 0) < 2 && !exportNames.has(cls.name)) continue;
      const clsId = `class:${file.path}:${cls.name}`;
      nodes.push({ id: clsId, type: 'class', name: cls.name, filePath: file.path, lineRange: [cls.startLine, cls.endLine ?? cls.startLine], summary: symbolSummary('class', cls.name, file.path), tags: ['class', 'domain-logic', 'encapsulation'], complexity: complexity(len, cls.methods?.length ?? 0) });
      edges.push({ source: id, target: clsId, type: 'contains', direction: 'forward', weight: 1.0 });
      if (exportNames.has(cls.name)) edges.push({ source: id, target: clsId, type: 'exports', direction: 'forward', weight: 0.8 });
    }
  }

  let expectedImports = 0;
  for (const file of batch.files) {
    if (file.fileCategory !== 'code') continue;
    const imports = batch.batchImportData?.[file.path] ?? [];
    expectedImports += imports.length;
    for (const target of imports) edges.push({ source: fileNodeIds.get(file.path), target: `file:${target}`, type: 'imports', direction: 'forward', weight: 0.7 });
    if (file.path.toLowerCase().includes('test')) {
      for (const target of imports) edges.push({ source: `file:${target}`, target: fileNodeIds.get(file.path), type: 'tested_by', direction: 'forward', weight: 0.5 });
    }
  }
  const actualImports = edges.filter(e => e.type === 'imports').length;
  if (expectedImports !== actualImports) throw new Error(`Import mismatch batch ${batch.batchIndex}: ${actualImports}/${expectedImports}`);
  return { nodes, edges, skipped: extraction.filesSkipped ?? [] };
}

function validate(fragment, batch) {
  const ids = new Set(fragment.nodes.map(n => n.id));
  if (ids.size !== fragment.nodes.length) throw new Error(`Duplicate node ids in batch ${batch.batchIndex}`);
  for (const n of fragment.nodes) {
    if (!n.summary || !n.tags?.length || !['simple', 'moderate', 'complex'].includes(n.complexity)) throw new Error(`Invalid node ${n.id}`);
  }
  const externalFiles = new Set();
  for (const arr of Object.values(batch.batchImportData ?? {})) for (const p of arr) externalFiles.add(`file:${p}`);
  for (const [p, list] of Object.entries(batch.neighborMap ?? {})) {
    externalFiles.add(`file:${p}`);
    for (const n of list ?? []) {
      externalFiles.add(`file:${n.path}`);
      for (const s of n.symbols ?? []) { externalFiles.add(`function:${n.path}:${s}`); externalFiles.add(`class:${n.path}:${s}`); }
    }
  }
  for (const e of fragment.edges) {
    if (e.source === e.target) throw new Error(`Self edge ${e.source}`);
    if (!ids.has(e.source) && !externalFiles.has(e.source)) throw new Error(`Unknown edge source ${e.source}`);
    if (!ids.has(e.target) && !externalFiles.has(e.target)) throw new Error(`Unknown edge target ${e.target}`);
  }
}

const report = [];
for (const batch of batchesDoc.batches.filter(b => b.batchIndex >= 51 && b.batchIndex <= 74)) {
  const graph = analyzeBatch(batch);
  const old = fs.readdirSync(intermediate).filter(n => new RegExp(`^batch-${batch.batchIndex}(?:-part-\\d+)?\\.json$`).test(n));
  for (const n of old) fs.unlinkSync(path.join(intermediate, n));
  const parts = Math.ceil(Math.max(graph.nodes.length / 60, graph.edges.length / 120, 1));
  if (parts === 1) {
    validate(graph, batch);
    fs.writeFileSync(path.join(intermediate, `batch-${batch.batchIndex}.json`), JSON.stringify({ nodes: graph.nodes, edges: graph.edges }, null, 2) + '\n');
  } else {
    const sortedFiles = [...batch.files].sort((a, b) => a.path.localeCompare(b.path));
    const chunkSize = Math.ceil(sortedFiles.length / parts);
    for (let k = 0; k < parts; k++) {
      const filePaths = new Set(sortedFiles.slice(k * chunkSize, (k + 1) * chunkSize).map(f => f.path));
      const partNodes = graph.nodes.filter(n => filePaths.has(n.filePath));
      const sourceIds = new Set(partNodes.map(n => n.id));
      const partEdges = graph.edges.filter(e => sourceIds.has(e.source));
      const fragment = { nodes: partNodes, edges: partEdges };
      validate(fragment, batch);
      fs.writeFileSync(path.join(intermediate, `batch-${batch.batchIndex}-part-${k + 1}.json`), JSON.stringify(fragment, null, 2) + '\n');
    }
  }
  report.push({ batch: batch.batchIndex, parts, nodes: graph.nodes.length, edges: graph.edges.length, skipped: graph.skipped.length });
}
console.log(JSON.stringify(report));
