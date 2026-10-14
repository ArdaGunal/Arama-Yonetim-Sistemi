import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const roots = ['src/features/calls', 'src/features/surveys', 'src/features/forms',
  'src/features/new-project', 'src/data/projectStore'];
const limit = 400;
let failed = false;

async function checkDirectory(relative) {
  const entries = await readdir(relative, { withFileTypes: true });
  const sourceFiles = entries.filter((entry) => entry.isFile() && /\.[jt]sx?$/.test(entry.name));
  let lines = 0;
  for (const file of sourceFiles) {
    const content = await readFile(path.join(relative, file.name), 'utf8');
    lines += content.split(/\r?\n/).length - (content.endsWith('\n') ? 1 : 0);
  }
  console.log(`${relative}: ${lines}/${limit} satır (${sourceFiles.length} dosya)`);
  if (lines > limit) failed = true;
  for (const entry of entries.filter((item) => item.isDirectory())) {
    await checkDirectory(path.join(relative, entry.name));
  }
}

for (const root of roots) await checkDirectory(root);
if (failed) {
  console.error('Denetlenen klasörlerden biri 400 kaynak satırı sınırını aştı.');
  process.exitCode = 1;
}
