// Sentetik 5.000 kişi / 100 görev ölçümü. Gerçek cihaz ölçümünün yerini tutmaz.
const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const babel = require('@babel/core');
const XLSX = require('xlsx');

function loadSource(relativePath, mocks = {}) {
  const file = path.join(__dirname, '..', relativePath);
  const { code } = babel.transformFileSync(file, {
    babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const module = { exports: {} };
  const localRequire = (name) => mocks[name] || (name === './backupFormat' ? backupFormat :
    name === 'expo-crypto' ? cryptoMock :
    name === './phoneUtils' ? phoneUtils : name === './canonicalJson' ? canonicalModule :
      name === './sourceWorkbookArchive' ? sourceWorkbookArchive :
        name === './sourceWorkbookStore' ? sourceWorkbookStore :
      name === './assignmentFormat' ? assignmentFormat :
        name === './resultFormat' ? resultFormat :
          name === './resultMerge' ? resultMerge : require(name));
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}

const cryptoMock = {
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm, value) =>
    nodeCrypto.createHash('sha256').update(value, 'utf8').digest('hex'),
};
const sourceFiles = new Map();
const sourceWorkbookStore = {
  async writeSourceWorkbook(ref, data) { sourceFiles.set(ref, data); },
  async readSourceWorkbook(ref) { return sourceFiles.get(ref) || null; },
  async removeSourceWorkbook(ref) { sourceFiles.delete(ref); },
};
const sourceWorkbookArchive = loadSource('src/utils/sourceWorkbookArchive.js', { 'expo-crypto': cryptoMock });
const canonicalModule = loadSource('src/utils/canonicalJson.js');
const phoneUtils = loadSource('src/utils/phoneUtils.js');
const assignmentFormat = loadSource('src/utils/assignmentFormat.js', { 'expo-crypto': cryptoMock });
const resultFormat = loadSource('src/utils/resultFormat.js', { 'expo-crypto': cryptoMock });
const resultMerge = loadSource('src/utils/resultMerge.js');
const backupFormat = loadSource('src/utils/backupFormat.js', { 'expo-crypto': cryptoMock });
const sourcePreview = loadSource('src/utils/sourcePreview.js');
const workbookUtils = loadSource('src/utils/exportUtils.js', { 'react-native': { Platform: { OS: 'web' } } });

const values = new Map();
let peakBytes = 0;
const memory = {
  async getItem(key) { return values.get(key) ?? null; },
  async setItem(key, value) {
    values.set(key, value);
    peakBytes = Math.max(peakBytes, [...values.values()].reduce((sum, item) => sum + Buffer.byteLength(item), 0));
  },
  async removeItem(key) { values.delete(key); },
};
const storage = loadSource('src/utils/storage.js', {
  '@react-native-async-storage/async-storage': memory,
});
const durations = {};
async function measure(label, operation) {
  const start = performance.now();
  const value = await operation();
  durations[label] = Math.round(performance.now() - start);
  return value;
}

async function main() {
  const fields = [
    { id: 'name', label: 'İsim Soyisim', type: 'text', options: [], order: 0, isSystemField: 'name' },
    { id: 'answer', label: 'Geliyor musun?', type: 'select', options: ['Evet', 'Hayır'], order: 1 },
  ];
  const rows = Array.from({ length: 5000 }, (_, index) =>
    [`Deneme ${index + 1}`, `0${5320000000 + index}`]);
  const source = await measure('kaynakOnizleme', () => sourcePreview.prepareSource(rows, 'sentetik.tsv', false));
  const analyzed = await measure('kaynakInceleme', () => sourcePreview.analyzeSource(source));
  assert.equal(analyzed.valid.length, 5000);
  assert.equal(analyzed.duplicates.length, 0);

  const originalBook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(originalBook,
    XLSX.utils.aoa_to_sheet([['İsim Soyisim', 'Telefon'], ...rows]), 'Ana Liste');
  XLSX.utils.book_append_sheet(originalBook,
    XLSX.utils.aoa_to_sheet([['Notlar'], ['Kaynak dosya saklanır']]), 'Ek Sayfa');
  const originalBytes = new Uint8Array(XLSX.write(originalBook, { bookType: 'xlsx', type: 'array' }));
  const originalWorkbook = await measure('orijinalExcelHazirla', () =>
    sourceWorkbookArchive.captureSourceWorkbook('sentetik.xlsx', originalBytes, 'array'));

  const project = {
    id: 'large-event', eventId: 'large-event', name: 'Sentetik Etkinlik',
    createdAt: '2026-10-08T08:00:00.000Z', currentIndex: 0,
    role: 'coordinator', formVersion: 1, formLocked: false, fields,
    sourceWorkbook: originalWorkbook,
    contacts: analyzed.valid.map((row, index) => ({
      id: `record-${index}`, recordId: `record-${index}`, phone: row.phone,
      data: { name: row.name }, completed: false, completedAt: null,
      sourceRow: row.sourceRow, sourceCells: row.cells,
    })),
  };
  await measure('projeKaydet', () => storage.createProject(project));
  const assignments = await measure('yuzGorevAyir', async () => {
    const created = [];
    for (let index = 0; index < 100; index++) {
      created.push(await storage.createAssignment(project.id, {
        assignmentId: `task-${index}`, volunteerName: `Gönüllü ${index + 1}`,
        count: 50, createdAt: '2026-10-08T08:01:00.000Z',
      }));
    }
    return created;
  });
  assert.equal(new Set(assignments.flatMap((task) => task.contacts.map((row) => row.recordId))).size, 5000);
  const assigned = await storage.getProject(project.id);
  assert.equal(storage.getAvailableContacts(assigned).length, 0);

  const packets = await measure('yuzSonucDosyasiHazirla', async () => Promise.all(assignments.map(async (assignment, index) => {
    const result = {
      eventId: project.id, assignmentId: assignment.assignmentId,
      formVersion: 1, round: 1, revision: 1,
      assignmentDigest: assignment.packetDigest,
      exportedAt: '2026-10-08T09:00:00.000Z', fields,
      contacts: assignment.contacts.map((row) => ({
        recordId: row.recordId, phone: row.phone,
        data: { ...row.data, answer: 'Evet' }, completed: true,
        completedAt: '2026-10-08T09:00:00.000Z', callStatus: 'later',
        callbackNote: 'Yarın ara', callbackAt: null,
        attempts: [{ id: `attempt-${index}-${row.recordId}`, at: '2026-10-08T09:00:00.000Z',
          status: 'later', note: 'Yarın ara', data: { ...row.data, answer: 'Evet' } }],
      })),
    };
    return resultFormat.readResultFile(await resultFormat.createResultFile(result));
  })));
  const preview = await measure('sonucOnizleme', () => storage.previewImportedResults(project.id, packets));
  assert.equal(preview.changes.length, 5000);
  assert.equal(preview.conflicts.length, 0);
  await measure('sonuclariBirlestir', () => storage.applyImportedResults(project.id, packets, {}, preview.snapshot));
  const merged = await storage.getProject(project.id);
  assert.equal(merged.completedContacts, 5000);
  const callbacks = await measure('geriAramaAdaylari', () => storage.getCallbackCandidates(merged));
  assert.equal(callbacks.length, 5000);
  const exportProject = await storage.getProjectForExport(project.id);
  const finalExcel = await measure('excelOlustur', () => workbookUtils.createExcelOutput(exportProject));
  assert.deepEqual(XLSX.read(finalExcel, { type: 'array', bookSheets: true }).SheetNames.slice(0, 2),
    ['Ana Liste', 'Ek Sayfa']);
  const backupProject = await storage.getProjectForBackup(project.id);
  const backup = await measure('yedekOlustur', () => backupFormat.createBackupFile(backupProject));
  await measure('yedekDogrula', () => backupFormat.readBackupFile(backup));
  if (process.argv[2] === '--write-backup') {
    if (!process.argv[3]) throw new Error('Çıktı .ays dosyası yolu gerekli.');
    const output = path.resolve(process.argv[3]);
    if (!output.toLowerCase().endsWith('.ays') || fs.existsSync(output)) {
      throw new Error('Çıktı yeni bir .ays dosyası olmalı; mevcut dosya değiştirilemez.');
    }
    fs.writeFileSync(output, backup, { flag: 'wx' });
  }

  console.log(JSON.stringify({ scenario: '5000 kişi / 100 görev / 100 sonuç dosyası',
    unit: 'ms', durations, backupBytes: Buffer.byteLength(backup),
    metadataBytes: Buffer.byteLength(values.get('@ays_projects')),
    contactBytes: Buffer.byteLength(values.get('@ays_project_data_large-event')),
    sourceAttachmentBytes: Buffer.byteLength(originalWorkbook.base64),
    peakStorageBytes: peakBytes }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
