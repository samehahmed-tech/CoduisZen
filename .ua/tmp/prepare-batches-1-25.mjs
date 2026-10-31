import fs from 'node:fs';
import path from 'node:path';

const root = 'D:/Projects/restoflow-erp';
const ua = path.join(root, '.ua');
const all = JSON.parse(fs.readFileSync(path.join(ua, 'intermediate', 'batches.json'), 'utf8'));
for (const batch of all.batches.filter((b) => b.batchIndex >= 1 && b.batchIndex <= 25)) {
  const input = {
    projectRoot: root,
    batchFiles: batch.files.map(({path, language, sizeLines, fileCategory}) => ({path, language, sizeLines, fileCategory})),
    batchImportData: batch.batchImportData,
  };
  fs.writeFileSync(path.join(ua, 'tmp', `ua-file-analyzer-input-${batch.batchIndex}.json`), JSON.stringify(input, null, 2));
}
