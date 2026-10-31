import fs from 'node:fs';
import path from 'node:path';

const root = 'D:/Projects/restoflow-erp';
const ua = path.join(root, '.ua');
const sourceBatches = JSON.parse(fs.readFileSync(path.join(ua, 'intermediate/batches.json'), 'utf8'));

const arName = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
const complexity = (n) => n > 200 ? 'complex' : n >= 50 ? 'moderate' : 'simple';
const cleanTag = (s) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-|-$/g, '') || 'project-file';

function fileKind(file) {
  const p = file.path.toLowerCase();
  if (file.fileCategory === 'config') return ['config', `config:${file.path}`];
  if (file.fileCategory === 'docs') return ['document', `document:${file.path}`];
  if (file.fileCategory === 'infra') {
    if (p.includes('.github/workflows') || p.includes('.gitlab-ci') || p.includes('jenkins')) return ['pipeline', `pipeline:${file.path}`];
    if (p.endsWith('.tf') || p.endsWith('.tfvars')) return ['resource', `resource:${file.path}`];
    return ['service', `service:${file.path}`];
  }
  if (file.fileCategory === 'data') {
    if (p.endsWith('.graphql') || p.endsWith('.proto') || p.endsWith('.prisma')) return ['schema', `schema:${file.path}`];
    if (p.includes('openapi') || p.includes('swagger')) return ['endpoint', `endpoint:${file.path}:${path.basename(file.path)}`];
    return ['table', `table:${file.path}:${path.basename(file.path, path.extname(file.path))}`];
  }
  return ['file', `file:${file.path}`];
}

function topic(p) {
  const s = p.toLowerCase();
  if (s.includes('business-day') || s.includes('close-day') || s.includes('advance-business') || s.includes('future-days') || s.includes('move-day')) return 'دورة يوم العمل والإغلاق اليومي';
  if (s.includes('ai') || s.includes('copilot') || s.includes('groq')) return 'التكاملات الذكية ومساعد النظام';
  if (s.includes('paymob') || s.includes('payment') || s.includes('fawry') || s.includes('stripe') || s.includes('vodafone') || s.includes('instapay')) return 'بوابات الدفع والتحصيل الإلكتروني';
  if (s.includes('callcenter')) return 'تشغيل مركز الاتصال ومتابعة الطلبات';
  if (s.includes('backup')) return 'النسخ الاحتياطي واستعادة قاعدة البيانات';
  if (s.includes('schema') || s.endsWith('.sql')) return 'مخطط قاعدة البيانات وصيانته';
  if (s.includes('theme')) return 'نظام السمات والهوية البصرية';
  if (s.includes('butchery')) return 'عمليات التصنيع والتقطيع';
  if (s.includes('print')) return 'جسر الطباعة وتوجيه المهام';
  if (s.includes('catalog')) return 'تحديث وتصدير كتالوج المنتجات';
  if (s.includes('maintenance') || s.includes('cleardata')) return 'صيانة بيانات النظام وتنظيفها';
  if (s.includes('kds') || s.includes('packing') || s.includes('operator')) return 'شاشات التشغيل والمطبخ';
  if (s.includes('env')) return 'إعداد متغيرات البيئة والتشغيل';
  if (s.includes('ci.yml')) return 'التكامل المستمر وفحوصات الجودة';
  return 'تشغيل وتهيئة منصة RestoFlow';
}

function fileSummary(file, result, text) {
  const p = file.path;
  const base = path.basename(p);
  const area = topic(p);
  if (file.fileCategory === 'code') {
    if (/\.test\.|\.spec\./i.test(base)) return `اختبارات آلية تتحقق من سلوك ${area} وحالات النجاح والفشل المرتبطة به.`;
    if (p.includes('/controllers/')) return `Controller يعرّف نقاط المعالجة الخاصة بـ${area}، ويتولى التحقق من الطلبات وتنسيق الاستجابات مع طبقة الخدمات.`;
    if (p.includes('/services/')) return `خدمة تطبيقية تنفذ منطق ${area} وتنسّق الوصول إلى البيانات والتكاملات التابعة.`;
    if (p.includes('/gateway-adapters/')) return `Adapter يوحّد ربط ${base.replace(/Adapter\.ts$/i, '')} ضمن واجهة بوابات الدفع المشتركة للنظام.`;
    if (p.endsWith('.tsx')) return `مكوّن React لواجهة ${area}، يعرض البيانات والإجراءات التشغيلية الخاصة بالمستخدم.`;
    if (base === 'index.ts') return `نقطة تشغيل الخادم التي تهيئ الاعتماديات، تبدأ الخدمات، وتدير الإيقاف المنظّم للتطبيق.`;
    return `ملف TypeScript يدعم ${area} من خلال منطق تطبيقي قابل لإعادة الاستخدام.`;
  }
  if (file.fileCategory === 'config') return `ملف إعداد يتحكم في ${area} ويجمع القيم والخيارات اللازمة للبناء أو التشغيل.`;
  if (file.fileCategory === 'docs') return `توثيق يشرح ${area} وخطوات الاستخدام أو التحقق المرتبطة به.`;
  if (file.fileCategory === 'infra') return `تعريف بنية تشغيلية لأتمتة ${area} عبر مراحل وفحوصات قابلة للتكرار.`;
  if (file.fileCategory === 'data') return `ملف بيانات/SQL يعرّف أو يعدّل ${area} مع القيود والفهارس اللازمة للتشغيل.`;
  if (file.fileCategory === 'script') return `سكريبت تشغيلي لأتمتة ${area} وتقليل خطوات التنفيذ اليدوية على بيئات العملاء.`;
  if (file.fileCategory === 'markup') return `واجهة ثابتة تدعم ${area} وتوفر بنية العرض والتنسيق اللازمة للمستخدم.`;
  return `ملف مشروع يخدم ${area}.`;
}

function tagsFor(file) {
  const p = file.path.toLowerCase();
  let tags = [];
  if (/\.test\.|\.spec\./.test(p)) tags.push('test', 'quality-assurance');
  if (file.fileCategory === 'code') tags.push(p.endsWith('.tsx') ? 'component' : 'service', 'typescript');
  if (file.fileCategory === 'config') tags.push('configuration', 'runtime-settings');
  if (file.fileCategory === 'docs') tags.push('documentation', 'operations-guide');
  if (file.fileCategory === 'infra') tags.push('ci-cd', 'infrastructure', 'deployment');
  if (file.fileCategory === 'data') tags.push('database', 'schema-definition', 'sql');
  if (file.fileCategory === 'script') tags.push('automation', p.endsWith('.ps1') ? 'powershell' : 'batch-script');
  if (file.fileCategory === 'markup') tags.push('frontend', 'markup', 'user-interface');
  if (p.includes('ai')) tags.push('ai-integration');
  else if (p.includes('payment') || p.includes('paymob')) tags.push('payments');
  else if (p.includes('callcenter')) tags.push('call-center');
  else if (p.includes('backup')) tags.push('backup');
  else if (p.includes('business-day') || p.includes('close-day')) tags.push('day-close');
  else tags.push(cleanTag(path.basename(file.path, path.extname(file.path))));
  return [...new Set(tags)].slice(0, 5);
}

function symbolSummary(name, filePath, kind) {
  const n = name.toLowerCase();
  const label = arName(name);
  if (n.includes('normalize')) return `توحّد الدالة ${label} شكل البيانات الواردة قبل تمريرها إلى بقية مسار التنفيذ.`;
  if (n.includes('validate') || n.includes('guard') || n.includes('authoriz') || n.includes('permission')) return `تتحقق ${label} من صحة ومدى سماح العملية قبل تنفيذها، وتعيد قرارًا واضحًا عند الرفض.`;
  if (n.includes('encrypt') || n.includes('decrypt') || n.includes('key') || n.includes('secret')) return `تعالج ${label} بيانات الاعتماد الحساسة مع تطبيق قواعد الحماية والتخزين الآمن.`;
  if (n.includes('backup')) return `تنفذ ${label} مسار النسخ الاحتياطي وتتحقق من قابلية استخدام الناتج.`;
  if (n.includes('forecast') || n.includes('pricing') || n.includes('revenue')) return `تحسب ${label} مخرجات تحليلية مرتبطة بالإيرادات والتسعير اعتمادًا على بيانات التشغيل.`;
  if (n.includes('chat') || n.includes('copilot') || n.includes('query')) return `تنفذ ${label} تفاعل المساعد الذكي وتنسّق السياق والاستجابة مع مزود النموذج.`;
  if (n.includes('start') || n.includes('init')) return `تهيئ ${label} الموارد المطلوبة وتبدأ مسار التشغيل المرتبط بها.`;
  if (n.includes('shutdown') || n.includes('close')) return `تنفذ ${label} إيقافًا منظمًا وتحافظ على اتساق الموارد قبل إنهاء العملية.`;
  if (n.includes('create') || n.includes('update') || n.includes('save') || n.includes('execute')) return `تنفذ ${label} العملية التطبيقية المطلوبة مع تجهيز البيانات ومعالجة نتيجة التنفيذ.`;
  if (n.includes('get') || n.includes('load') || n.includes('read') || n.includes('list')) return `تسترجع ${label} البيانات المطلوبة وتجهزها للاستخدام في الطبقات الأعلى.`;
  if (kind === 'class') return `تجمع ${label} مسؤوليات ${topic(filePath)} خلف واجهة موحدة قابلة لإعادة الاستخدام.`;
  return `تنفذ ${label} جزءًا محددًا من منطق ${topic(filePath)}.`;
}

function findBraceEnd(lines, start) {
  let depth = 0, seen = false;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { depth++; seen = true; }
      else if (ch === '}') depth--;
    }
    if (seen && depth <= 0) return i + 1;
  }
  return lines.length;
}

function manualSymbols(file, text) {
  const lines = text.split(/\r?\n/), out = [];
  if (file.language === 'powershell') {
    lines.forEach((line, i) => {
      const m = line.match(/^\s*function\s+([\w-]+)\s*\{/i);
      if (m) { const end = findBraceEnd(lines, i); if (end - i >= 10) out.push({name:m[1], startLine:i+1, endLine:end, exported:false}); }
    });
  } else if (file.language === 'batch') {
    const labels = [];
    lines.forEach((line, i) => { const m=line.match(/^:([^:\s][^\s]*)\s*$/); if(m) labels.push({name:m[1], startLine:i+1}); });
    labels.forEach((s, j) => { const end=(labels[j+1]?.startLine || lines.length+1)-1; if(end-s.startLine+1>=10) out.push({...s,endLine:end,exported:false}); });
  }
  return out;
}

function makeNode(id, type, name, filePath, summary, tags, cx, lineRange) {
  const n = {id, type, name, filePath, summary, tags, complexity:cx};
  if (lineRange) n.lineRange = lineRange;
  return n;
}

for (const batch of sourceBatches.batches.filter(b => b.batchIndex >= 26 && b.batchIndex <= 50)) {
  const extract = JSON.parse(fs.readFileSync(path.join(ua, `tmp/ua-file-extract-results-${batch.batchIndex}.json`), 'utf8'));
  if (extract.filesUnreadable?.length) throw new Error(`Unreadable files in batch ${batch.batchIndex}`);
  const byPath = new Map(extract.results.map(r => [r.path, r]));
  const nodes = [], edges = [], fileNodeIds = new Map(), symbolIds = new Set();
  for (const file of batch.files) {
    const abs = path.join(root, file.path);
    const text = fs.readFileSync(abs, 'utf8');
    const result = byPath.get(file.path);
    const [type, id] = fileKind(file);
    fileNodeIds.set(file.path, id);
    const lineCount = result?.nonEmptyLines ?? text.split(/\r?\n/).filter(Boolean).length;
    nodes.push(makeNode(id, type, path.basename(file.path), file.path, fileSummary(file, result, text), tagsFor(file), complexity(lineCount)));

    let functions = (result?.functions || []).map(fn => ({...fn, exported:(result.exports||[]).some(e=>e.name===fn.name)}));
    if (!result && file.fileCategory === 'script') functions = manualSymbols(file, text);
    for (const fn of functions) {
      const span = fn.endLine - fn.startLine + 1;
      if (span < 10 && !fn.exported) continue;
      const sid = `function:${file.path}:${fn.name}`;
      if (symbolIds.has(sid)) continue;
      symbolIds.add(sid);
      nodes.push(makeNode(sid, 'function', fn.name, file.path, symbolSummary(fn.name, file.path, 'function'), ['function', cleanTag(fn.name), ...tagsFor(file).slice(0,2)].slice(0,5), complexity(span), [fn.startLine, fn.endLine]));
      edges.push({source:id,target:sid,type:'contains',direction:'forward',weight:1.0});
      if (fn.exported) edges.push({source:id,target:sid,type:'exports',direction:'forward',weight:0.8});
    }
    for (const cls of result?.classes || []) {
      const span=cls.endLine-cls.startLine+1;
      const exported=(result.exports||[]).some(e=>e.name===cls.name);
      if (span < 20 && (cls.methods||[]).length < 2 && !exported) continue;
      const sid=`class:${file.path}:${cls.name}`;
      if (symbolIds.has(sid)) continue;
      symbolIds.add(sid);
      nodes.push(makeNode(sid,'class',cls.name,file.path,symbolSummary(cls.name,file.path,'class'),['class',cleanTag(cls.name),...tagsFor(file).slice(0,2)].slice(0,5),complexity(span),[cls.startLine,cls.endLine]));
      edges.push({source:id,target:sid,type:'contains',direction:'forward',weight:1.0});
      if(exported) edges.push({source:id,target:sid,type:'exports',direction:'forward',weight:0.8});
    }
    // SQL table definitions are significant schema entities; env variables are intentionally not emitted.
    const seenDefs = new Set();
    for (const def of result?.definitions || []) {
      if (def.kind !== 'table' || seenDefs.has(def.name)) continue;
      seenDefs.add(def.name);
      const tid=`table:${file.path}:${def.name}`;
      nodes.push(makeNode(tid,'table',def.name,file.path,`جدول ${def.name} ضمن مخطط RestoFlow، ويعرّف الحقول اللازمة لنطاقه التشغيلي.`,['database','table',cleanTag(def.name)],'moderate',[def.startLine,def.endLine]));
      edges.push({source:id,target:tid,type:'defines_schema',direction:'forward',weight:0.8});
    }
  }

  // Emit every scanner-resolved internal import exactly once.
  for (const file of batch.files.filter(f=>f.fileCategory==='code')) {
    const source=fileNodeIds.get(file.path);
    for (const targetPath of batch.batchImportData[file.path] || []) edges.push({source,target:`file:${targetPath}`,type:'imports',direction:'forward',weight:0.7});
    if (/\.(test|spec)\./i.test(file.path)) for (const targetPath of batch.batchImportData[file.path] || []) edges.push({source,target:`file:${targetPath}`,type:'tested_by',direction:'forward',weight:0.5});
  }
  // High-confidence cross-batch calls: callee must be listed in neighborMap and caller must have a node.
  for (const file of batch.files.filter(f=>f.fileCategory==='code')) {
    const result=byPath.get(file.path); if(!result) continue;
    const localFns=new Set(nodes.filter(n=>n.filePath===file.path && n.type==='function').map(n=>n.name));
    for (const call of result.callGraph || []) {
      if(!localFns.has(call.caller)) continue;
      const tail=String(call.callee).split('.').pop().replace(/\(.*/, '');
      for (const nb of batch.neighborMap?.[file.path] || []) {
        if ((nb.symbols||[]).includes(tail)) edges.push({source:`function:${file.path}:${call.caller}`,target:`function:${nb.path}:${tail}`,type:'calls',direction:'forward',weight:0.8});
      }
    }
  }
  const dedupEdges=[...new Map(edges.filter(e=>e.source!==e.target).map(e=>[`${e.source}|${e.target}|${e.type}`,e])).values()];
  const importExpected=batch.files.filter(f=>f.fileCategory==='code').reduce((n,f)=>n+(batch.batchImportData[f.path]||[]).length,0);
  const importActual=dedupEdges.filter(e=>e.type==='imports').length;
  if(importExpected!==importActual) throw new Error(`Import mismatch batch ${batch.batchIndex}: ${importExpected} != ${importActual}`);

  const old = fs.readdirSync(path.join(ua,'intermediate')).filter(n=>new RegExp(`^batch-${batch.batchIndex}(?:-part-\\d+)?\\.json$`).test(n));
  for(const name of old) fs.unlinkSync(path.join(ua,'intermediate',name));
  const parts=Math.ceil(Math.max(nodes.length/60,dedupEdges.length/120,1));
  if(parts===1){fs.writeFileSync(path.join(ua,'intermediate',`batch-${batch.batchIndex}.json`),JSON.stringify({nodes,edges:dedupEdges},null,2));continue;}
  const sorted=[...batch.files].sort((a,b)=>a.path.localeCompare(b.path));
  const chunkSize=Math.ceil(sorted.length/parts);
  for(let k=0;k<parts;k++){
    const paths=new Set(sorted.slice(k*chunkSize,(k+1)*chunkSize).map(f=>f.path));
    const partNodes=nodes.filter(n=>paths.has(n.filePath));
    const ids=new Set(partNodes.map(n=>n.id));
    const partEdges=dedupEdges.filter(e=>ids.has(e.source));
    fs.writeFileSync(path.join(ua,'intermediate',`batch-${batch.batchIndex}-part-${k+1}.json`),JSON.stringify({nodes:partNodes,edges:partEdges},null,2));
  }
}

console.log('generated batches 26..50');
