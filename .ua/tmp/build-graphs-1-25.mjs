import fs from 'node:fs';
import path from 'node:path';

const root = 'D:/Projects/restoflow-erp';
const ua = path.join(root, '.ua');
const batchesDoc = JSON.parse(fs.readFileSync(path.join(ua, 'intermediate', 'batches.json'), 'utf8'));

const domains = [
  ['dayclose', 'إغلاق اليوم'], ['day-close', 'إغلاق اليوم'], ['shift', 'الورديات'], ['attendance', 'الحضور والانصراف'],
  ['payroll', 'الرواتب'], ['hr', 'الموارد البشرية'], ['inventory', 'المخزون'], ['stock', 'المخزون'],
  ['supplier', 'الموردين'], ['purchase', 'المشتريات'], ['finance', 'المالية'], ['fiscal', 'الفترات المالية'],
  ['ledger', 'دفتر الأستاذ'], ['account', 'الحسابات'], ['payment', 'المدفوعات'], ['refund', 'المرتجعات'],
  ['delivery', 'التوصيل'], ['driver', 'السائقين'], ['order', 'الطلبات'], ['pos', 'نقطة البيع'],
  ['table', 'الطاولات'], ['reservation', 'الحجوزات'], ['menu', 'قائمة الطعام'], ['recipe', 'الوصفات'],
  ['kds', 'شاشة المطبخ'], ['kitchen', 'المطبخ'], ['customer', 'العملاء'], ['crm', 'إدارة العملاء'],
  ['campaign', 'الحملات'], ['report', 'التقارير'], ['analytics', 'التحليلات'], ['ai', 'الذكاء الاصطناعي'],
  ['auth', 'المصادقة والصلاحيات'], ['permission', 'الصلاحيات'], ['role', 'الأدوار والصلاحيات'],
  ['subscription', 'الاشتراكات'], ['setting', 'الإعدادات'], ['setup', 'التهيئة الأولية'], ['print', 'الطباعة'],
  ['theme', 'نظام السمات'], ['map', 'الخرائط والمواقع'], ['talabat', 'تكامل طلبات'], ['socket', 'التحديثات اللحظية'],
  ['audit', 'التدقيق'], ['security', 'الأمان'], ['backup', 'النسخ الاحتياطي'], ['deploy', 'النشر'],
  ['sync', 'المزامنة'], ['notification', 'الإشعارات'], ['translation', 'الترجمة'], ['branch', 'الفروع'],
  ['employee', 'الموظفين'], ['expense', 'المصروفات'], ['budget', 'الميزانيات'], ['production', 'الإنتاج']
];

function domainOf(filePath, symbol = '') {
  const hay = `${filePath} ${symbol}`.toLowerCase().replaceAll('_', '-');
  return domains.find(([key]) => hay.includes(key))?.[1] ?? 'وظائف النظام';
}
function complexity(lines, extra = 0) {
  if (lines > 200 || extra > 20) return 'complex';
  if (lines >= 50 || extra > 6) return 'moderate';
  return 'simple';
}
function basename(p) { return p.replaceAll('\\', '/').split('/').at(-1); }
function uniq(a) { return [...new Set(a)]; }
function tagsForFile(p, result) {
  const x = p.toLowerCase();
  const tags = [];
  if (/\.test\.|\.spec\.|(^|\/)tests?\//.test(x)) tags.push('test', 'quality-assurance');
  else if (x.includes('/controllers/')) tags.push('api-handler', 'controller');
  else if (x.includes('/routes/')) tags.push('api-routing', 'express');
  else if (x.includes('/services/') || x.includes('service.')) tags.push('service', 'business-logic');
  else if (x.includes('/components/') || x.endsWith('.tsx')) tags.push('component', 'react');
  else if (x.includes('/stores/') || x.includes('store.')) tags.push('state-management', 'zustand');
  else if (x.includes('/hooks/') || basename(x).startsWith('use')) tags.push('hook', 'react');
  else if (x.includes('/scripts/') || x.startsWith('scripts/')) tags.push('maintenance-script', 'database');
  else if (x.includes('/middleware/')) tags.push('middleware', 'api');
  else if (x.includes('/schema') || x.includes('/db/')) tags.push('database', 'schema-definition');
  else tags.push('utility', 'typescript');
  if (x.includes('index.') || x.endsWith('/app.ts') || x === 'app.tsx') tags.push('entry-point');
  if ((result.exports?.length ?? 0) > 5 && (result.functions?.length ?? 0) < 3) tags.push('barrel');
  if (x.includes('validation') || x.includes('validator')) tags.push('validation');
  if (x.includes('socket') || x.includes('realtime')) tags.push('real-time');
  if (x.includes('security') || x.includes('auth') || x.includes('permission')) tags.push('security');
  if (x.includes('report') || x.includes('analytics')) tags.push('reporting');
  return uniq([...tags, 'typescript']).slice(0, 5);
}
function fileSummary(p, r) {
  const d = domainOf(p);
  const n = r.functions?.length ?? 0;
  const c = r.classes?.length ?? 0;
  const x = p.toLowerCase();
  if (/\.test\.|\.spec\.|(^|\/)tests?\//.test(x)) return `يتحقق من سلوك ${d} عبر سيناريوهات اختبار آلية تغطي الحالات الأساسية وحدود الأمان والتكامل ذات الصلة.`;
  if (x.includes('/controllers/')) return `يوفر معالجات HTTP الخاصة بـ${d}، وينسق التحقق من الطلبات والوصول إلى البيانات وصياغة استجابات API عبر ${n} دالة مستخرجة.`;
  if (x.includes('/routes/')) return `يعرّف مسارات Express الخاصة بـ${d} ويربطها بمعالجاتها وسياسات المصادقة والصلاحيات المناسبة.`;
  if (x.includes('/services/') || x.includes('service.')) return `ينفّذ منطق الخدمة الخاص بـ${d} ويفصل قواعد العمل والتكاملات عن طبقة العرض؛ يحتوي على ${n} دالة و${c} فئة مستخرجة.`;
  if (x.includes('/components/') || x.endsWith('.tsx')) return `يقدّم واجهة React لإدارة ${d}، بما يشمل عرض الحالة والتفاعلات واستدعاء خدمات التطبيق المرتبطة.`;
  if (x.includes('/stores/') || x.includes('store.')) return `يدير حالة ${d} على مستوى الواجهة، ويجمع عمليات الجلب والتحديث وحالات التحميل والأخطاء في مخزن مركزي.`;
  if (x.includes('/hooks/') || basename(x).startsWith('use')) return `يوفر React hook قابلاً لإعادة الاستخدام لتنسيق حالة وسلوك ${d} داخل مكونات الواجهة.`;
  if (x.includes('/scripts/') || x.startsWith('scripts/')) return `سكريبت صيانة وتشغيل لمهام ${d}، يطبّق إجراءات تهيئة أو إصلاح قابلة للتنفيذ خارج مسار الطلبات المعتاد.`;
  if (x.includes('/middleware/')) return `يوفر middleware لخدمة ${d} قبل وصول الطلب إلى المعالج، مع تطبيق التحقق أو العزل أو سياسات الاستجابة اللازمة.`;
  if (x.includes('/schema') || x.includes('/db/')) return `يعرّف بنية البيانات والعمليات المساندة المرتبطة بـ${d} ويشكّل عقدًا مشتركًا بين التخزين وخدمات التطبيق.`;
  if (x.includes('util') || x.includes('helper')) return `يجمع أدوات TypeScript مساندة لـ${d} لتوحيد التحويل والتحقق والحسابات المستخدمة عبر النظام.`;
  return `ينفّذ جزءًا من ${d} داخل المشروع، مع ${n} دالة و${c} فئة مستخرجة تربط هذا الملف ببقية طبقات التطبيق.`;
}
function symbolTags(name, p, kind) {
  const x = name.toLowerCase();
  const tags = [kind === 'class' ? 'class' : 'function'];
  if (/^(get|list|load|fetch|find|resolve)/.test(x)) tags.push('query');
  else if (/^(create|add|insert|register)/.test(x)) tags.push('creation');
  else if (/^(update|set|save|edit|patch)/.test(x)) tags.push('update');
  else if (/^(delete|remove|clear)/.test(x)) tags.push('deletion');
  else if (/^(validate|check|ensure|assert)/.test(x)) tags.push('validation');
  else if (/^(build|calculate|compute|derive|map|normalize|format)/.test(x)) tags.push('transformation');
  else if (/^(handle|on)/.test(x)) tags.push('event-handler');
  else tags.push('business-logic');
  if (p.toLowerCase().includes('controller')) tags.push('api-handler');
  else if (p.toLowerCase().includes('component') || p.endsWith('.tsx')) tags.push('component');
  else if (p.toLowerCase().includes('test')) tags.push('test');
  else tags.push('typescript');
  return uniq(tags).slice(0, 5);
}
function functionSummary(name, p, params) {
  const d = domainOf(p, name);
  const x = name.toLowerCase();
  let action = 'تنفّذ منطق';
  if (/^(get|list|load|fetch|find|resolve)/.test(x)) action = 'تسترجع أو تحل بيانات';
  else if (/^(create|add|insert|register)/.test(x)) action = 'تنشئ سجلًا أو كيانًا ضمن';
  else if (/^(update|set|save|edit|patch)/.test(x)) action = 'تحدّث حالة أو بيانات';
  else if (/^(delete|remove|clear)/.test(x)) action = 'تحذف أو تنظف بيانات';
  else if (/^(validate|check|ensure|assert)/.test(x)) action = 'تتحقق من متطلبات وسلامة';
  else if (/^(build|calculate|compute|derive|map|normalize|format)/.test(x)) action = 'تحسب أو تحوّل بيانات';
  else if (/^(handle|on)/.test(x)) action = 'تعالج حدثًا متعلقًا بـ';
  const suffix = (params?.length ?? 0) ? ` اعتمادًا على ${params.length} مُدخلات معلنة.` : '.';
  return `${action} ${d} داخل الدالة \`${name}\`${suffix}`;
}
function classSummary(name, p, methods) {
  return `تجمع الفئة \`${name}\` مسؤوليات ${domainOf(p, name)} خلف واجهة واحدة تضم ${methods?.length ?? 0} عمليات رئيسية.`;
}
function exportedNames(r) { return new Set((r.exports ?? []).map((e) => e.name)); }
function fileNodeType(file) {
  if (file.fileCategory === 'config') return ['config', `config:${file.path}`];
  if (file.fileCategory === 'docs') return ['document', `document:${file.path}`];
  if (file.fileCategory === 'infra') {
    if (/\.github\/workflows|\.gitlab-ci|Jenkinsfile|\.circleci/i.test(file.path)) return ['pipeline', `pipeline:${file.path}`];
    if (/\.tf(vars)?$|cloudformation|Vagrantfile/i.test(file.path)) return ['resource', `resource:${file.path}`];
    return ['service', `service:${file.path}`];
  }
  if (file.fileCategory === 'data') {
    if (/\.(graphql|proto|prisma)$/i.test(file.path)) return ['schema', `schema:${file.path}`];
    if (/openapi|swagger/i.test(file.path)) return ['endpoint', `endpoint:${file.path}`];
  }
  return ['file', `file:${file.path}`];
}
function dedupeById(items) { const m = new Map(); for (const x of items) if (!m.has(x.id)) m.set(x.id, x); return [...m.values()]; }
function dedupeEdges(items) { const m = new Map(); for (const x of items) { const k = `${x.source}|${x.target}|${x.type}`; if (!m.has(k) && x.source !== x.target) m.set(k, x); } return [...m.values()]; }

for (const batch of batchesDoc.batches.filter((b) => b.batchIndex >= 1 && b.batchIndex <= 25)) {
  const idx = batch.batchIndex;
  const extract = JSON.parse(fs.readFileSync(path.join(ua, 'tmp', `ua-file-extract-results-${idx}.json`), 'utf8'));
  if (!extract.scriptCompleted || extract.filesUnreadable?.length) throw new Error(`فشل الاستخراج للدفعة ${idx}`);
  const resultByPath = new Map(extract.results.map((r) => [r.path, r]));
  let nodes = [], edges = [];
  for (const file of batch.files) {
    const r = resultByPath.get(file.path);
    if (!r) throw new Error(`لا توجد نتيجة للملف ${file.path} في الدفعة ${idx}`);
    const [type, id] = fileNodeType(file);
    nodes.push({id, type, name: basename(file.path), filePath: file.path, summary: fileSummary(file.path, r), tags: tagsForFile(file.path, r), complexity: complexity(r.nonEmptyLines ?? file.sizeLines, (r.functions?.length ?? 0) + (r.classes?.length ?? 0)), ...(r.language === 'typescript' && r.metrics?.exportCount > 10 ? {languageNotes: 'يستخدم TypeScript بسطح تصدير واسع، ما يجعل الملف عقدة تكامل مهمة بين وحدات النظام.'} : {})});
    if (file.fileCategory !== 'code' && file.fileCategory !== 'script' && file.fileCategory !== 'markup') continue;
    const exports = exportedNames(r);
    const fileFunctions = new Map();
    for (const fn of r.functions ?? []) {
      const exported = exports.has(fn.name);
      const length = (fn.endLine ?? fn.startLine) - fn.startLine + 1;
      if (!exported && length < 10) continue;
      const existing = fileFunctions.get(fn.name);
      if (!existing || length > existing.length) fileFunctions.set(fn.name, {fn, exported, length});
    }
    for (const {fn, exported, length} of fileFunctions.values()) {
      const fnId = `function:${file.path}:${fn.name}`;
      nodes.push({id: fnId, type: 'function', name: fn.name, filePath: file.path, lineRange: [fn.startLine, fn.endLine], summary: functionSummary(fn.name, file.path, fn.params), tags: symbolTags(fn.name, file.path, 'function'), complexity: complexity(length, (fn.params?.length ?? 0))});
      edges.push({source: id, target: fnId, type: 'contains', direction: 'forward', weight: 1.0});
      if (exported) edges.push({source: id, target: fnId, type: 'exports', direction: 'forward', weight: 0.8});
    }
    for (const cls of r.classes ?? []) {
      const exported = exports.has(cls.name);
      const length = (cls.endLine ?? cls.startLine) - cls.startLine + 1;
      if (!exported && length < 20 && (cls.methods?.length ?? 0) < 2) continue;
      const clsId = `class:${file.path}:${cls.name}`;
      nodes.push({id: clsId, type: 'class', name: cls.name, filePath: file.path, lineRange: [cls.startLine, cls.endLine], summary: classSummary(cls.name, file.path, cls.methods), tags: symbolTags(cls.name, file.path, 'class'), complexity: complexity(length, cls.methods?.length ?? 0)});
      edges.push({source: id, target: clsId, type: 'contains', direction: 'forward', weight: 1.0});
      if (exported) edges.push({source: id, target: clsId, type: 'exports', direction: 'forward', weight: 0.8});
    }
    for (const target of batch.batchImportData?.[file.path] ?? []) edges.push({source: id, target: `file:${target}`, type: 'imports', direction: 'forward', weight: 0.7});
    const emitted = new Set([...fileFunctions.keys()]);
    for (const call of r.callGraph ?? []) {
      if (!emitted.has(call.caller) || !emitted.has(call.callee) || call.caller === call.callee) continue;
      edges.push({source: `function:${file.path}:${call.caller}`, target: `function:${file.path}:${call.callee}`, type: 'calls', direction: 'forward', weight: 0.8});
    }
  }
  nodes = dedupeById(nodes);
  edges = dedupeEdges(edges);
  const expectedImports = batch.files.filter((f) => f.fileCategory === 'code').reduce((s, f) => s + (batch.batchImportData?.[f.path]?.length ?? 0), 0);
  const actualImports = edges.filter((e) => e.type === 'imports').length;
  if (expectedImports !== actualImports) throw new Error(`عدم تطابق imports في الدفعة ${idx}: ${actualImports}/${expectedImports}`);
  const parts = Math.ceil(Math.max(nodes.length / 60, edges.length / 120, 1));
  const sortedPaths = [...batch.files.map((f) => f.path)].sort((a,b) => a.localeCompare(b));
  const chunkSize = Math.ceil(sortedPaths.length / parts);
  for (let k = 0; k < parts; k++) {
    const paths = new Set(sortedPaths.slice(k * chunkSize, (k + 1) * chunkSize));
    const partNodes = nodes.filter((n) => paths.has(n.filePath));
    const ids = new Set(partNodes.map((n) => n.id));
    const partEdges = edges.filter((e) => ids.has(e.source));
    const out = {nodes: partNodes, edges: partEdges};
    const outName = parts === 1 ? `batch-${idx}.json` : `batch-${idx}-part-${k + 1}.json`;
    fs.writeFileSync(path.join(ua, 'intermediate', outName), JSON.stringify(out, null, 2));
  }
  console.log(JSON.stringify({batch: idx, files: batch.files.length, nodes: nodes.length, edges: edges.length, imports: actualImports, parts, skipped: extract.filesSkipped?.length ?? 0}));
}
