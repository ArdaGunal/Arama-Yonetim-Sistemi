// Sentetik 5.000 anket yanıtı ölçümü. Gerçek telefon süresinin yerini tutmaz.
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const XLSX = require('xlsx');
const { loadSource, memoryStorage, backupFormat } = require('../tests/support/regressionHarness.cjs');

const durations = {};
async function measure(label, operation) {
  const started = performance.now();
  const result = await operation();
  durations[label] = Math.round(performance.now() - started);
  return result;
}

async function main() {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  const fields = [
    { id: 'attendance', label: 'Katılıyor musun?', type: 'select',
      options: ['Evet', 'Hayır'], order: 0, required: true },
    { id: 'payment', label: 'Ödeme yapıldı mı?', type: 'select',
      options: ['Evet', 'Hayır'], order: 1 },
    { id: 'school', label: 'Okul numarası', type: 'text', options: [], order: 2 },
    { id: 'note', label: 'Not', type: 'text', options: [], order: 3 },
  ];
  const responses = Array.from({ length: 5000 }, (_, index) => ({
    id: `response-${index + 1}`,
    data: { attendance: index % 2 ? 'Evet' : 'Hayır', payment: index % 3 ? 'Evet' : 'Hayır',
      school: `0${100000 + index}`, note: `Sentetik cevap ${index + 1}` },
    submittedAt: '2026-10-16T08:00:00.000Z', formVersion: 1, history: [], deletedAt: null,
  }));
  const project = {
    id: 'survey-benchmark', eventId: 'survey-benchmark', name: 'Sentetik Anket',
    mode: 'survey', role: 'coordinator', createdAt: '2026-10-16T08:00:00.000Z',
    currentIndex: 0, formVersion: 1, formLocked: true, fields,
    formHistory: [{ version: 1, fields }], responses,
  };
  await measure('projeKaydet', () => storage.createProject(project));
  const loaded = await measure('projeAc', () => storage.getProject(project.id));
  assert.equal(loaded.responses.length, 5000);
  assert.equal(loaded.completedContacts, 5000);

  const exportProject = await storage.getProjectForExport(project.id);
  const exports = loadSource('src/utils/exportUtils.js', { 'react-native': { Platform: { OS: 'web' } } });
  const excel = await measure('excelOlustur', () => exports.createExcelOutput(exportProject));
  const sheet = XLSX.read(excel, { type: 'array' }).Sheets['Anket Yanıtları'];
  assert.equal(XLSX.utils.sheet_to_json(sheet, { header: 1 }).length, 5001);
  const csv = await measure('csvOlustur', () => exports.buildCSV(exportProject));
  assert.equal(csv.trim().split('\n').length, 5001);
  assert.match(csv, /0100000/);

  const backupProject = await storage.getProjectForBackup(project.id);
  const backup = await measure('yedekOlustur', () => backupFormat.createBackupFile(backupProject));
  const parsed = await measure('yedekDogrula', () => backupFormat.readBackupFile(backup));
  assert.equal(parsed.project.responses.length, 5000);
  const fresh = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memoryStorage(),
  });
  await measure('bosCihazaGeriYukle', () => fresh.restoreProjectBackup(parsed.project));
  assert.equal((await fresh.getProject(project.id)).responses.length, 5000);

  console.log(JSON.stringify({ scenario: '5000 sentetik anket yanıtı', unit: 'ms',
    durations, excelBytes: excel.length, csvBytes: Buffer.byteLength(csv),
    backupBytes: Buffer.byteLength(backup),
    metadataBytes: Buffer.byteLength(memory.values.get('@ays_projects')),
    responseBytes: Buffer.byteLength(memory.values.get('@ays_survey_responses_survey-benchmark')) }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
