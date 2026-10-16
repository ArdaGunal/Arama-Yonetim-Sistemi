const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');
const nodeCrypto = require('node:crypto');
const XLSX = require('xlsx');
const { unzipSync } = require('fflate');

function loadSource(relativePath, mocks = {}) {
  const file = path.join(__dirname, '..', '..', relativePath);
  const { code } = babel.transformFileSync(file, {
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const module = { exports: {} };
  const localRequire = (name) => mocks[name] || (name === './backupFormat' ? backupFormat :
    name === 'expo-crypto' ? cryptoMock :
    name === './phoneUtils' ? phoneUtils : name === './canonicalJson' ? canonicalModule :
      name === '../features/surveys/surveyDraft' ? surveyDraft :
      name === '../features/surveys/surveyResponses' ? surveyResponses :
      name === '../features/surveys/surveyExport' ? surveyExport :
      name === '../features/calls/callExport' ? callExport :
      name === '../features/calls/pool/assignmentPool' ? assignmentPool :
      name === '../data/projectStore/assignment/assignmentWrites' ? assignmentWrites :
      name === '../data/projectStore/assignment/coordinatorAnswer' ? coordinatorAnswer :
      name === '../data/projectStore/backup/projectBackups' ? projectBackups :
      name === '../../../utils/backupFormat' ? backupFormat :
      name === '../../../features/surveys/surveyResponses' ? surveyResponses :
      name === '../../../features/calls/pool/assignmentPool' ? assignmentPool :
      name === '../../../utils/phoneUtils' ? phoneUtils :
      name === '../../../utils/assignmentFormat' ? assignmentFormat :
      name === '../../../utils/resultFormat' ? resultFormat :
      name === '../../../utils/formValidation' ? formValidation :
      name === './surveyResponses' ? surveyResponses :
      name === '../../features/surveys/surveyResponses' ? surveyResponses :
      name === '../../utils/canonicalJson' ? canonicalModule :
      name === '../../utils/backupFormat' ? backupFormat :
      name === './surveyFormFormat' ? surveyFormFormat :
      name === './surveyResultFormat' ? surveyResultFormat :
      name === '../features/survey-transfer/surveyFormImport' ? surveyFormImport :
      name === '../features/survey-transfer/surveyTransferBackup' ? surveyTransferBackup :
      name === '../features/survey-transfer/surveyResultFormat' ? surveyResultFormat :
      name === '../features/survey-transfer/surveyMerge' ? surveyMerge :
      name === '../surveys/surveyResponses' ? surveyResponses :
      name === './sourceWorkbookArchive' ? sourceWorkbookArchive :
        name === './sourceWorkbookStore' ? sourceWorkbookStore :
      name === './assignmentFormat' ? assignmentFormat :
        name === './resultFormat' ? resultFormat :
          name === './appSettings' ? appSettingsModule :
          name === './formValidation' ? formValidation :
          name === './resultMerge' ? resultMerge :
            name === '../data/projectStore/projectReads' ? projectReads :
              name === '../data/projectStore/projectUpdateJournal' ? projectUpdateJournal :
                name === '../data/projectStore/projectUpdateJournalStore' ? projectUpdateJournalStore :
              name === '../data/projectStore/projectWrites' ? projectWrites : require(name));
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}

const cryptoMock = {
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm, value) => nodeCrypto.createHash('sha256').update(value, 'utf8').digest('hex'),
  randomUUID: () => nodeCrypto.randomUUID(),
};
const sourceFiles = new Map();
const sourceWorkbookStore = {
  async writeSourceWorkbook(ref, base64) { sourceFiles.set(ref, base64); },
  async readSourceWorkbook(ref) { return sourceFiles.get(ref) || null; },
  async removeSourceWorkbook(ref) { sourceFiles.delete(ref); },
};
const sourceWorkbookArchive = loadSource('src/utils/sourceWorkbookArchive.js', { 'expo-crypto': cryptoMock });
const canonicalModule = loadSource('src/utils/canonicalJson.js');
const phoneUtils = loadSource('src/utils/phoneUtils.js');
const newProjectFields = loadSource('src/utils/newProjectFields.js');
const appSettingsModule = loadSource('src/utils/appSettings.js', {
  '@react-native-async-storage/async-storage': memoryStorage(),
});
const assignmentFormat = loadSource('src/utils/assignmentFormat.js', { 'expo-crypto': cryptoMock });
const resultFormat = loadSource('src/utils/resultFormat.js', { 'expo-crypto': cryptoMock });
const formValidation = loadSource('src/utils/formValidation.js');
const resultMerge = loadSource('src/utils/resultMerge.js');
const surveyDraft = loadSource('src/features/surveys/surveyDraft.js');
const surveyResponses = loadSource('src/features/surveys/surveyResponses.js');
const surveyExport = loadSource('src/features/surveys/surveyExport.js');
const callExport = loadSource('src/features/calls/callExport.js');
const assignmentPool = loadSource('src/features/calls/pool/assignmentPool.js', {
  '../../../utils/phoneUtils': phoneUtils,
});
const assignmentWrites = loadSource('src/data/projectStore/assignment/assignmentWrites.js');
const coordinatorAnswer = loadSource('src/data/projectStore/assignment/coordinatorAnswer.js');
const surveyTransferBackup = loadSource('src/features/survey-transfer/surveyTransferBackup.js');
const backupFormat = loadSource('src/utils/backupFormat.js', { 'expo-crypto': cryptoMock });
const projectBackups = loadSource('src/data/projectStore/backup/projectBackups.js');
const surveyFormFormat = loadSource('src/features/survey-transfer/surveyFormFormat.js', { 'expo-crypto': cryptoMock });
const surveyFormImport = loadSource('src/features/survey-transfer/surveyFormImport.js');
const surveyResultFormat = loadSource('src/features/survey-transfer/surveyResultFormat.js', { 'expo-crypto': cryptoMock });
const surveyMerge = loadSource('src/features/survey-transfer/surveyMerge.js');
const projectReads = loadSource('src/data/projectStore/projectReads.js');
const projectWrites = loadSource('src/data/projectStore/projectWrites.js');
const projectUpdateJournal = loadSource('src/data/projectStore/projectUpdateJournal.js');
const journalFiles = new Map();
let journalEvents = null;
const journalFileSystem = {
  documentDirectory: 'file:///docs/', EncodingType: { UTF8: 'utf8' },
  async getInfoAsync(uri) { return { exists: journalFiles.has(uri) }; },
  async readAsStringAsync(uri) { return journalFiles.get(uri); },
  async writeAsStringAsync(uri, value) {
    if (journalEvents) journalEvents.push('write:journal-temp');
    journalFiles.set(uri, value);
  },
  async moveAsync({ from, to }) {
    if (!journalFiles.has(from)) throw new Error('Geçici kurtarma dosyası yok.');
    if (journalEvents) journalEvents.push('move:journal');
    journalFiles.set(to, journalFiles.get(from)); journalFiles.delete(from);
  },
  async deleteAsync(uri) {
    if (journalEvents && !uri.endsWith('.tmp')) journalEvents.push('delete:journal');
    journalFiles.delete(uri);
  },
};
const projectUpdateJournalStore = loadSource('src/data/projectStore/projectUpdateJournalStore.js', {
  'react-native': { Platform: { OS: 'android' } },
  'expo-file-system/legacy': journalFileSystem,
});
const projectNames = loadSource('src/domain/projects/projectNames.js');

function memoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
}


function sampleProject() {
  return {
    id: 'event-1', name: 'Güz Etkinliği', createdAt: '2026-10-07T08:00:00.000Z', currentIndex: 0,
    fields: [{ id: 'name', label: 'İsim Soyisim', type: 'text', options: [], order: 0, isSystemField: 'name' }],
    contacts: [{ id: 'record-1', phone: '+905321234567', data: { name: 'Ayşe Yılmaz' }, completed: false, completedAt: null }],
  };
}

function distributionProject(size) {
  return { id: 'large-event', eventId: 'large-event', name: 'Topluluk buluşması',
    createdAt: '2026-10-08T08:00:00.000Z', currentIndex: 0, formVersion: 1, formLocked: false,
    fields: [{ id: 'name', label: 'İsim Soyisim', type: 'text', options: [], order: 0, isSystemField: 'name' },
      { id: 'answer', label: 'Geliyor musun?', type: 'select', options: ['Evet', 'Hayır'], order: 1 }],
    contacts: Array.from({ length: size }, (_, i) => ({ id: `record-${i}`, recordId: `record-${i}`,
      phone: `+90${5320000000 + i}`, data: { name: `Kişi ${i}` }, completed: false, completedAt: null })) };
}

function setJournalEvents(value) { journalEvents = value; }

module.exports = { test, assert, XLSX, unzipSync, loadSource, cryptoMock, sourceFiles, sourceWorkbookStore, sourceWorkbookArchive, canonicalModule, phoneUtils, newProjectFields, appSettingsModule, assignmentFormat, resultFormat, formValidation, resultMerge, surveyDraft, surveyResponses, surveyExport, callExport, assignmentPool, surveyTransferBackup, backupFormat, surveyFormFormat, surveyFormImport, surveyResultFormat, surveyMerge, projectReads, projectWrites, projectUpdateJournal, journalFiles, journalFileSystem, projectUpdateJournalStore, projectNames, memoryStorage, sampleProject, distributionProject, setJournalEvents };
