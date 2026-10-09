const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');
const nodeCrypto = require('node:crypto');
const XLSX = require('xlsx');
const { unzipSync } = require('fflate');

function loadSource(relativePath, mocks = {}) {
  const file = path.join(__dirname, '..', relativePath);
  const { code } = babel.transformFileSync(file, {
    babelrc: false,
    configFile: false,
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
const assignmentFormat = loadSource('src/utils/assignmentFormat.js', { 'expo-crypto': cryptoMock });
const resultFormat = loadSource('src/utils/resultFormat.js', { 'expo-crypto': cryptoMock });
const resultMerge = loadSource('src/utils/resultMerge.js');
const backupFormat = loadSource('src/utils/backupFormat.js', { 'expo-crypto': cryptoMock });

function memoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
}

test('project summaries survive separated contact storage and update progress', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  const contacts = [
    { id: '1', phone: '+905321234567', completed: true, data: {} },
    { id: '2', phone: '+905321234568', completed: false, data: {} },
  ];
  await storage.createProject({ id: 'p', name: 'Deneme', contacts, currentIndex: 0 });
  assert.equal((await storage.getAllProjects())[0].contacts, undefined);
  assert.deepEqual((await storage.getProjectSummaries()).map(({ totalContacts, completedContacts }) =>
    [totalContacts, completedContacts]), [[2, 1]]);
  assert.equal((await storage.getProject('p')).contacts.length, 2);

  await storage.updateProject('p', { contacts: contacts.map(c => ({ ...c, completed: true })) });
  assert.equal((await storage.getProjectSummaries())[0].completedContacts, 2);

  // Önceki sürümlerde metadata sayacı yoktu.
  memory.values.set('@ays_projects', JSON.stringify([{ id: 'p', name: 'Eski', currentIndex: 0 }]));
  assert.deepEqual((await storage.getProjectSummaries()).map(({ totalContacts, completedContacts }) =>
    [totalContacts, completedContacts]), [[2, 2]]);
});

test('draft writes and deletion finish in order without deadlock', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  await storage.createProject(distributionProject(1));
  const draft = storage.saveDraft('large-event', { contactIndex: 0, formData: { name: 'Ali' } });
  const clear = storage.clearDraft('large-event');
  await Promise.all([draft, clear, storage.waitForPendingWrites()]);
  assert.equal(await storage.loadDraft('large-event'), null);
  const savedSnapshot = await storage.getProjectForBackup('large-event');
  await Promise.race([
    storage.deleteProject('large-event', savedSnapshot),
    new Promise((_, reject) => setTimeout(() => reject(new Error('deleteProject stuck')), 2000)),
  ]);
  assert.equal((await storage.getAllProjects()).length, 0);
});

test('project deletion requires a backup snapshot and refuses changes made afterward', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await storage.createProject(distributionProject(1));
  await assert.rejects(storage.deleteProject('large-event'), /yedeği/);
  const oldSnapshot = await storage.getProjectForBackup('large-event');
  await storage.saveDraft('large-event', { contactIndex: 0, formData: { name: 'Yeni cevap' } });
  await assert.rejects(storage.deleteProject('large-event', oldSnapshot), /değişti/);
  assert.equal((await storage.getProject('large-event')).contacts.length, 1);
  const currentSnapshot = await storage.getProjectForBackup('large-event');
  await storage.deleteProject('large-event', currentSnapshot);
  assert.equal(await storage.getProject('large-event'), null);
});

test('headerless spreadsheets find the phone column and preserve the name', () => {
  const { parseExcelContacts } = loadSource('src/utils/phoneUtils.js');
  const fields = [
    { id: 'name', label: 'İsim Soyisim', type: 'text', isSystemField: 'name' },
    { id: 'phone', label: 'Numara', type: 'phone', isSystemField: 'phone' },
    { id: 'school', label: 'Okul', type: 'text' },
  ];
  const phone = '+905321234567';
  const firstColumn = parseExcelContacts([['05321234567', 'Ayşe', 'Anadolu']], fields);
  assert.deepEqual(firstColumn.phones, [phone]);
  assert.deepEqual(firstColumn.data[phone], { name: 'Ayşe', school: 'Anadolu' });

  const secondColumn = parseExcelContacts([['Ayşe', '05321234567', 'Anadolu']], fields);
  assert.deepEqual(secondColumn.data[phone], { name: 'Ayşe', school: 'Anadolu' });

  const headered = parseExcelContacts([['Okul', 'Telefon', 'İsim Soyisim'], ['Anadolu', '05321234567', 'Ayşe']], fields);
  assert.deepEqual(headered.data[phone], { school: 'Anadolu', name: 'Ayşe' });
});

function sampleProject() {
  return {
    id: 'event-1', name: 'Güz Etkinliği', createdAt: '2026-10-07T08:00:00.000Z', currentIndex: 0,
    fields: [{ id: 'name', label: 'İsim Soyisim', type: 'text', options: [], order: 0, isSystemField: 'name' }],
    contacts: [{ id: 'record-1', phone: '+905321234567', data: { name: 'Ayşe Yılmaz' }, completed: false, completedAt: null }],
  };
}

test('versioned backup restores legacy IDs and detects changed content', async () => {
  const file = await backupFormat.createBackupFile(sampleProject());
  const parsed = await backupFormat.readBackupFile(file);
  assert.equal(parsed.project.eventId, 'event-1');
  assert.equal(parsed.project.contacts[0].recordId, 'record-1');
  assert.equal(parsed.project.contacts[0].data.name, 'Ayşe Yılmaz');

  const tampered = JSON.parse(file);
  tampered.payload.project.contacts[0].data.name = 'Değiştirildi';
  await assert.rejects(backupFormat.readBackupFile(JSON.stringify(tampered)), /değişmiş veya bozulmuş/);

  const unsupported = JSON.parse(file);
  unsupported.schemaVersion = 6;
  await assert.rejects(backupFormat.readBackupFile(JSON.stringify(unsupported)), /sürümü desteklenmiyor/);
  const duplicate = sampleProject();
  duplicate.contacts.push({ ...duplicate.contacts[0] });
  await assert.rejects(backupFormat.createBackupFile(duplicate), /yinelenen/);
});

test('source preview maps a different column order and requires duplicate review', () => {
  const sourcePreview = loadSource('src/utils/sourcePreview.js');
  const rows = [['Okul No', 'Telefon', 'İsim Soyisim', 'Geliyor musun'],
    ['00127', '05321234567', 'Ayşe', 'Evet'],
    ['00128', '05321234567', 'Ayşe', 'Hayır'],
    ['00129', '05421234567', 'Ayşe', 'Belki'],
    ['00130', 'hatalı', 'Can', 'Hayır']];
  const source = sourcePreview.prepareSource(rows, 'liste.xlsx');
  assert.equal(source.hasHeader, true);
  assert.equal(source.columns.find((column) => column.role === 'phone').index, 1);
  assert.equal(source.columns.find((column) => column.role === 'name').index, 2);
  const analysis = sourcePreview.analyzeSource(source);
  assert.equal(analysis.duplicates.length, 1);
  assert.equal(analysis.invalid.length, 1);
  assert.throws(() => sourcePreview.selectSourceRows(analysis, {}), /tekrar eden telefon/);
  const result = sourcePreview.selectSourceRows(analysis, { '+905321234567': 3 });
  assert.equal(result.selected.length, 2);
  assert.equal(result.selected[0].cells[3], 'Hayır');
  assert.equal(result.excluded.length, 2);
  assert.equal(result.selected[1].cells[0], '00129');
});

test('default pasted name and phone format keeps distinct rows', () => {
  const sourcePreview = loadSource('src/utils/sourcePreview.js');
  const rows = sourcePreview.textToRows('Umut Aydın Tosun\t5355519177\nBurakhan Seferoğlu 0542 731 6116');
  const source = sourcePreview.prepareSource(rows);
  const analysis = sourcePreview.analyzeSource(source);
  assert.deepEqual(analysis.valid.map((row) => row.name), ['Umut Aydın Tosun', 'Burakhan Seferoğlu']);
  assert.equal(analysis.duplicates.length, 0);
});

test('shared template keeps fields and source mapping but no contacts', async () => {
  const templates = loadSource('src/utils/templateFormat.js', { 'expo-crypto': cryptoMock });
  const fields = [
    { id: 'name', label: 'İsim Soyisim', type: 'text', options: [], isSystemField: 'name' },
    { id: 'phone', label: 'Telefon', type: 'phone', options: [], isSystemField: 'phone' },
    { id: 'answer', label: 'Geliyor musun?', type: 'select', options: ['Evet', 'Hayır'] },
  ];
  const content = await templates.createTemplateFile('Bahar etkinliği', fields,
    [{ label: 'İsim Soyisim', role: 'name' }, { label: 'Telefon', role: 'phone' },
      { label: 'Katılım', role: 'field', fieldId: 'answer' }]);
  const parsed = await templates.readTemplateFile(content);
  assert.equal(parsed.fields[2].options[0], 'Evet');
  assert.equal(parsed.sourceColumns[1].role, 'phone');
  assert.equal(parsed.sourceColumns[2].fieldId, 'answer');
  assert.equal(content.includes('contacts'), false);
  const changed = JSON.parse(content);
  changed.fields[2].options[0] = 'Belki';
  await assert.rejects(templates.readTemplateFile(JSON.stringify(changed)), /değişmiş veya bozulmuş/);
});

test('version 2 backup preserves source review and reads version 1', async () => {
  const project = { ...sampleProject(), formVersion: 1, formLocked: false, templateId: 'template-1',
    sourceReview: { sourceName: 'liste.xlsx', hasHeader: true, totalRows: 2,
      columns: [{ index: 0, label: 'Telefon', role: 'phone', fieldId: null }],
      excludedRows: [{ sourceRow: 2, cells: ['05321234567'], reason: 'Tekrar' }] },
    contacts: [{ ...sampleProject().contacts[0], sourceRow: 1 }] };
  const parsed = await backupFormat.readBackupFile(await backupFormat.createBackupFile(project));
  assert.equal(parsed.project.sourceReview.excludedRows[0].reason, 'Tekrar');
  assert.equal(parsed.project.contacts[0].sourceRow, 1);
  const old = { format: 'arama-yonetim-sistemi', schemaVersion: 1, kind: 'backup',
    createdAt: project.createdAt, eventId: project.id, payload: { project: sampleProject() } };
  const sha256 = await cryptoMock.digestStringAsync('SHA-256', backupFormat.canonicalJson(old));
  const restored = await backupFormat.readBackupFile(JSON.stringify({ ...old, integrity: { algorithm: 'SHA-256', sha256 } }));
  assert.equal(restored.project.formVersion, 1);
  assert.equal(restored.project.sourceReview, null);
});

test('form version increases and completed calls remain tied to the old version', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  const project = sampleProject();
  await storage.createProject(project);
  const updated = await storage.updateProjectForm(project.id, [
    ...project.fields,
    { id: 'answer', label: 'Geliyor musun?', type: 'select', options: ['Evet', 'Hayır'], order: 1 },
  ]);
  assert.equal(updated.formVersion, 2);
  assert.equal((await storage.getProject(project.id)).fields.length, 2);
  await storage.updateProject(project.id, { contacts: [{ ...project.contacts[0], completed: true }] });
  assert.equal((await storage.getProject(project.id)).formLocked, true);
  const next = await storage.updateProjectForm(project.id, [project.fields[0],
    { id: 'answer', label: 'Katılıyor musun?', type: 'select', options: ['Evet', 'Hayır'], order: 1, required: true }]);
  assert.equal(next.formVersion, 3);
  assert.equal(next.fields[1].id, 'answer_v3');
  assert.deepEqual(next.formHistory.map((item) => item.version), [1, 2, 3]);
});

test('required answers are checked only for a completed conversation', () => {
  const { missingRequiredField } = loadSource('src/utils/formValidation.js');
  const fields = [{ id: 'name', label: 'İsim', isSystemField: 'name' },
    { id: 'answer', label: 'Geliyor musun?', required: true }];
  assert.equal(missingRequiredField(fields, { name: 'Ayşe', answer: '  ' }, 'contacted').id, 'answer');
  assert.equal(missingRequiredField(fields, { name: 'Ayşe' }, 'unreached'), null);
  assert.equal(missingRequiredField(fields, { name: 'Ayşe', answer: 'Evet' }, 'contacted'), null);
  const packet = { eventId: 'event', assignmentId: 'assignment', formVersion: 1, round: 1,
    revision: 1, assignmentDigest: 'a'.repeat(64), exportedAt: '2026-10-08T08:00:00.000Z',
    fields: [{ id: 'answer', label: 'Geliyor musun?', required: true }],
    contacts: [{ recordId: 'record', phone: '+905321234567', completed: true, callStatus: 'contacted', data: {} }] };
  assert.throws(() => resultFormat.normalizeResult(packet), /zorunlu cevabı eksik/);
  assert.doesNotThrow(() => resultFormat.normalizeResult({ ...packet,
    contacts: [{ ...packet.contacts[0], callStatus: 'unreached' }] }));
});

test('automatic Android backups reuse the selected external folder', async () => {
  const memory = memoryStorage();
  let permissions = 0;
  const written = [];
  const fileSystem = {
    EncodingType: { UTF8: 'utf8' },
    StorageAccessFramework: {
      async requestDirectoryPermissionsAsync() { permissions += 1; return { granted: true, directoryUri: 'content://backup-folder' }; },
      async createFileAsync(directory, name) { assert.equal(directory, 'content://backup-folder'); return `content://backup-folder/${name}`; },
    },
    async writeAsStringAsync(uri, content) { written.push({ uri, content }); },
  };
  const backup = loadSource('src/utils/automaticBackup.js', {
    '@react-native-async-storage/async-storage': memory,
    'react-native': { Platform: { OS: 'android' } },
    'expo-file-system/legacy': fileSystem,
    'expo-sharing': {},
    './backupFormat': backupFormat,
    './storage': { getProjectForBackup: async () => sampleProject(), markProjectBackupSaved: async () => true },
    './webFileTransfer': {},
  });
  assert.equal((await backup.saveEventBackup('event-1', 'Gorev')).saved, true);
  assert.equal((await backup.saveEventBackup('event-1', 'Sonuc')).saved, true);
  assert.equal(permissions, 1);
  assert.equal(written.length, 2);
  for (const item of written) assert.equal((await backupFormat.readBackupFile(item.content)).project.id, 'event-1');
});

test('backup restore is idempotent and never silently overwrites a changed event', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  const project = (await backupFormat.readBackupFile(await backupFormat.createBackupFile(sampleProject()))).project;
  assert.equal(await storage.restoreProjectBackup(project), 'restored');
  assert.equal(await storage.restoreProjectBackup(project), 'already-present');
  assert.equal((await storage.getAllProjects()).length, 1);
  const altered = { ...project, contacts: [{ ...project.contacts[0], data: { name: 'Başka cevap' } }] };
  await assert.rejects(storage.restoreProjectBackup(altered), /farklı içerikle/);
  assert.equal((await storage.getProject(project.id)).contacts[0].data.name, 'Ayşe Yılmaz');
});

test('backup snapshot includes a pending form draft', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  const project = sampleProject();
  await storage.createProject(project);
  await storage.saveDraft(project.id, { contactIndex: 0, formData: { name: 'Yeni cevap' } });
  const snapshot = await storage.getProjectForBackup(project.id);
  assert.equal(snapshot.contacts[0].data.name, 'Yeni cevap');
  assert.equal((await storage.getProject(project.id)).contacts[0].data.name, 'Ayşe Yılmaz');
  assert.equal(await storage.restoreProjectBackup(snapshot), 'already-present');
});

test('explicit backup replacement checks the saved copy and preserves an interrupted write', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  const original = sampleProject();
  await storage.createProject(original);
  await storage.saveDraft(original.id, { contactIndex: 0, formData: { name: 'Kaydedilmemiş cevap' } });
  const savedCopy = await storage.getProjectForBackup(original.id);
  const incoming = { ...original, contacts: [{ ...original.contacts[0], data: { name: 'Dosyadaki cevap' } }] };
  const staleCopy = { ...savedCopy, contacts: [{ ...savedCopy.contacts[0], data: { name: 'Eski görüntü' } }] };
  await assert.rejects(storage.replaceProjectBackup(incoming, staleCopy), /Yeniden yedek alın/);
  assert.equal((await storage.getProject(original.id)).contacts[0].data.name, 'Ayşe Yılmaz');

  const setItem = memory.setItem.bind(memory);
  let failOnce = true;
  memory.setItem = async (key, value) => {
    if (key === '@ays_projects' && failOnce) {
      failOnce = false;
      throw new Error('Kesilen yazma');
    }
    return setItem(key, value);
  };
  await assert.rejects(storage.replaceProjectBackup(incoming, savedCopy), /Kesilen yazma/);
  assert.equal((await storage.getProject(original.id)).contacts[0].data.name, 'Ayşe Yılmaz');
  assert.equal((await storage.loadDraft(original.id)).formData.name, 'Kaydedilmemiş cevap');
  assert.equal(memory.values.has('@ays_merge_journal'), false);

  assert.equal(await storage.replaceProjectBackup(incoming, savedCopy), 'replaced');
  assert.equal((await storage.getProject(original.id)).contacts[0].data.name, 'Dosyadaki cevap');
  assert.equal(await storage.loadDraft(original.id), null);
  assert.equal((await storage.getProjectSummaries())[0].completedContacts, 0);
});

test('restart rolls back an unfinished backup replacement including its draft', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  const original = sampleProject();
  await storage.createProject(original);
  await storage.saveDraft(original.id, { contactIndex: 0, formData: { name: 'Taslak cevap' } });
  const projectsRaw = memory.values.get('@ays_projects');
  const contactsRaw = memory.values.get('@ays_project_data_event-1');
  const draftRaw = memory.values.get('@ays_draft_event-1');
  memory.values.set('@ays_merge_journal', JSON.stringify({
    projectId: original.id, projectsRaw, contactsRaw, draftRaw, restoreDraft: true,
  }));
  memory.values.set('@ays_project_data_event-1', JSON.stringify([{ ...original.contacts[0],
    data: { name: 'Yarım kalmış değişiklik' } }]));
  memory.values.delete('@ays_draft_event-1');

  const restarted = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  assert.equal((await restarted.getProject(original.id)).contacts[0].data.name, 'Ayşe Yılmaz');
  assert.equal((await restarted.loadDraft(original.id)).formData.name, 'Taslak cevap');
  assert.equal(memory.values.has('@ays_merge_journal'), false);
});

function distributionProject(size) {
  return { id: 'large-event', eventId: 'large-event', name: 'Topluluk buluşması',
    createdAt: '2026-10-08T08:00:00.000Z', currentIndex: 0, formVersion: 1, formLocked: false,
    fields: [{ id: 'name', label: 'İsim Soyisim', type: 'text', options: [], order: 0, isSystemField: 'name' },
      { id: 'answer', label: 'Geliyor musun?', type: 'select', options: ['Evet', 'Hayır'], order: 1 }],
    contacts: Array.from({ length: size }, (_, i) => ({ id: `record-${i}`, recordId: `record-${i}`,
      phone: `+90${5320000000 + i}`, data: { name: `Kişi ${i}` }, completed: false, completedAt: null })) };
}

test('2000-person pool distributes 10, 50 and 17 without overlap', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await storage.createProject(distributionProject(2000));
  const names = ['A', 'B', 'C'];
  const counts = [10, 50, 17];
  const assignments = await Promise.all(names.map((name, i) => storage.createAssignment('large-event', {
    assignmentId: `task-${name}`, volunteerName: name, count: counts[i], createdAt: '2026-10-08T08:01:00.000Z',
  })));
  assert.deepEqual(assignments.map((item) => item.contacts.length), counts);
  const allIds = assignments.flatMap((item) => item.contacts.map((contact) => contact.recordId));
  assert.equal(new Set(allIds).size, 77);
  const project = await storage.getProject('large-event');
  assert.equal(storage.getAvailableContacts(project).length, 1923);
  assert.equal(project.formLocked, true);
  assert.equal(project.backupPending, true);
  assert.equal(await storage.markProjectBackupSaved('large-event', project.backupEpoch), true);
  assert.equal((await storage.getProject('large-event')).backupPending, false);
  await assert.rejects(storage.createAssignment('large-event', {
    assignmentId: 'too-many', volunteerName: 'D', count: 1924, createdAt: '2026-10-08T08:01:00.000Z',
  }), /1923/);
  await storage.setAssignmentStatus('large-event', 'task-A', 'sent');
  assert.equal((await storage.getProject('large-event')).backupPending, true);
  assert.equal(await storage.markProjectBackupSaved('large-event', project.backupEpoch), false);
  await assert.rejects(storage.setAssignmentStatus('large-event', 'task-A', 'cancelled'), /durumu değiştirilemez/);
  await storage.setAssignmentStatus('large-event', 'task-A', 'cancelled', true);
  assert.equal(storage.getAvailableContacts(await storage.getProject('large-event')).length, 1933);
});

test('assignment packet is stable, private and idempotent on volunteer import', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await storage.createProject(distributionProject(5));
  const assignment = await storage.createAssignment('large-event', {
    assignmentId: 'task-one', volunteerName: 'Ayşe', count: 2, createdAt: '2026-10-08T08:01:00.000Z',
  });
  const file = await assignmentFormat.createAssignmentFile(assignment);
  assert.equal(JSON.parse(file).schemaVersion, 1);
  assert.equal(file, await assignmentFormat.createAssignmentFile(assignment));
  const parsed = await assignmentFormat.readAssignmentFile(file);
  assert.equal(parsed.assignment.contacts.length, 2);
  assert.equal(file.includes('Kişi 4'), false);
  const tampered = JSON.parse(file);
  tampered.payload.assignment.contacts[0].data.name = 'Değişti';
  await assert.rejects(assignmentFormat.readAssignmentFile(JSON.stringify(tampered)), /değişmiş veya bozulmuş/);
  assert.equal(await storage.importVolunteerAssignment(parsed.assignment, parsed.sha256), 'imported');
  const volunteer = await storage.getProject('task-one');
  assert.equal(volunteer.role, 'volunteer');
  assert.equal(volunteer.contacts.length, 2);
  const progressed = volunteer.contacts.map((contact, i) => i === 0 ?
    { ...contact, data: { ...contact.data, answer: 'Evet' }, completed: true } : contact);
  await storage.updateProject('task-one', { contacts: progressed });
  assert.equal(await storage.importVolunteerAssignment(parsed.assignment, parsed.sha256), 'already-present');
  assert.equal((await storage.getProject('task-one')).contacts[0].data.answer, 'Evet');
  await assert.rejects(storage.updateProject('task-one', { contacts: [...progressed, progressed[0]] }), /değiştirilemez/);
});

test('volunteer result reminder survives a stale export and clears only for current answers', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await storage.createProject(distributionProject(2));
  const assignment = await storage.createAssignment('large-event', {
    assignmentId: 'result-reminder', volunteerName: 'A', count: 1, createdAt: '2026-10-08T08:01:00.000Z',
  });
  const parsed = await assignmentFormat.readAssignmentFile(await assignmentFormat.createAssignmentFile(assignment));
  await storage.importVolunteerAssignment(parsed.assignment, parsed.sha256);
  const initial = await storage.getProject('result-reminder');
  assert.equal(storage.hasUnexportedVolunteerResult(initial), false);
  await storage.updateProject(initial.id, { currentIndex: 0, contacts: initial.contacts });
  assert.equal(storage.hasUnexportedVolunteerResult(await storage.getProject(initial.id)), false);

  const firstContacts = [{ ...initial.contacts[0], completed: true, callStatus: 'contacted',
    data: { ...initial.contacts[0].data, answer: 'Evet' } }];
  await storage.updateProject(initial.id, { contacts: firstContacts });
  assert.equal(storage.hasUnexportedVolunteerResult(await storage.getProject(initial.id)), true);
  const oldFile = await storage.createVolunteerResultFile(initial.id);
  await storage.updateProject(initial.id, { contacts: [{ ...firstContacts[0],
    data: { ...firstContacts[0].data, answer: 'Hayır' } }] });
  assert.equal(await storage.markVolunteerResultExported(initial.id, oldFile.revision, oldFile.epoch), false);
  assert.equal(storage.hasUnexportedVolunteerResult(await storage.getProject(initial.id)), true);

  const currentFile = await storage.createVolunteerResultFile(initial.id);
  assert.equal(await storage.markVolunteerResultExported(initial.id, currentFile.revision, currentFile.epoch), true);
  assert.equal(storage.hasUnexportedVolunteerResult(await storage.getProject(initial.id)), false);
  await storage.updateProject(initial.id, { contacts: firstContacts });
  assert.equal(storage.hasUnexportedVolunteerResult(await storage.getProject(initial.id)), true);
});

test('web storage protection reports browser support and permission result', async () => {
  const persistence = loadSource('src/utils/webStoragePersistence.js');
  assert.equal(await persistence.getWebStoragePersistence(null), 'unsupported');
  assert.equal(await persistence.requestWebStoragePersistence(null), 'unsupported');
  assert.equal(await persistence.getWebStoragePersistence({ persisted: async () => false }), 'temporary');
  assert.equal(await persistence.requestWebStoragePersistence({ persist: async () => true }), 'granted');
  assert.equal(await persistence.requestWebStoragePersistence({ persist: async () => false }), 'temporary');
  assert.equal(await persistence.getWebStoragePersistence({ persisted: async () => { throw new Error('blocked'); } }), 'unsupported');
});

test('new form version keeps old task answers and backup history', async () => {
  const coordinator = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  const volunteer = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await coordinator.createProject(distributionProject(2));
  const first = await coordinator.createAssignment('large-event', {
    assignmentId: 'old-task', volunteerName: 'A', count: 1, createdAt: '2026-10-08T08:01:00.000Z',
  });
  const oldFile = await assignmentFormat.createAssignmentFile(first);
  const oldParsed = await assignmentFormat.readAssignmentFile(oldFile);
  await volunteer.importVolunteerAssignment(oldParsed.assignment, oldParsed.sha256);
  const changed = await coordinator.updateProjectForm('large-event', [first.fields[0], {
    ...first.fields[1], label: 'Kesin katılıyor musun?', options: ['Evet', 'Hayır', 'Belki'], required: true,
  }]);
  assert.equal(changed.formVersion, 2);
  assert.equal(changed.fields[1].id, 'answer_v2');
  const second = await coordinator.createAssignment('large-event', {
    assignmentId: 'new-task', volunteerName: 'B', count: 1, createdAt: '2026-10-08T08:02:00.000Z',
  });
  assert.equal(second.formVersion, 2);
  assert.equal(second.fields[1].required, true);
  assert.equal(JSON.parse(await assignmentFormat.createAssignmentFile(second)).schemaVersion, 2);
  assert.equal(second.contacts[0].data.answer_v2, undefined);
  const volunteerProject = await volunteer.getProject('old-task');
  await volunteer.updateProject('old-task', { contacts: [{ ...volunteerProject.contacts[0],
    completed: true, callStatus: 'contacted', data: { ...volunteerProject.contacts[0].data, answer: 'Evet' },
  }] });
  const result = await resultFormat.readResultFile((await volunteer.createVolunteerResultFile('old-task')).content);
  const preview = await coordinator.previewImportedResults('large-event', [result]);
  assert.equal(preview.changes.length, 1);
  await coordinator.applyImportedResults('large-event', [result], {}, preview.snapshot);
  const master = await coordinator.getProject('large-event');
  assert.equal(master.contacts[0].data.answer, 'Evet');
  assert.equal(master.contacts[0].data.answer_v2, undefined);
  const backup = await backupFormat.readBackupFile(await backupFormat.createBackupFile(master));
  assert.equal(backup.project.formHistory.length, 2);
  assert.equal(backup.project.assignments[0].fields[1].id, 'answer');
  assert.equal(backup.project.contacts[0].data.answer, 'Evet');
  assert.equal((await assignmentFormat.readAssignmentFile(oldFile)).sha256, oldParsed.sha256);
  assert.equal(await assignmentFormat.createAssignmentFile(backup.project.assignments[0]), oldFile);
  const exports = loadSource('src/utils/exportUtils.js', { 'react-native': { Platform: { OS: 'web' } } });
  const sheet = exports.buildWorkbook(backup.project).Sheets['Güncel Durum'];
  assert.ok(Object.values(sheet).some((cell) => cell?.v === 'Geliyor musun? (Form 1)'));
  const current = await coordinator.getProject('large-event');
  await coordinator.updateProject('large-event', { contacts: current.contacts.map((contact, index) => index === 0
    ? { ...contact, data: { ...contact.data, answer_v2: 'Hayır' } } : contact) });
  const oldTask = await volunteer.getProject('old-task');
  await volunteer.updateProject('old-task', { contacts: [{ ...oldTask.contacts[0],
    data: { name: oldTask.contacts[0].data.name } }] });
  const cleared = await resultFormat.readResultFile((await volunteer.createVolunteerResultFile('old-task')).content);
  const clearPreview = await coordinator.previewImportedResults('large-event', [cleared]);
  assert.equal(clearPreview.conflicts.length, 0);
  await coordinator.applyImportedResults('large-event', [cleared], {}, clearPreview.snapshot);
  const combined = (await coordinator.getProject('large-event')).contacts[0].data;
  assert.equal(combined.answer, undefined);
  assert.equal(combined.answer_v2, 'Hayır');
});

test('version 3 backup retains task reservations and volunteer identity', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await storage.createProject(distributionProject(3));
  const assignment = await storage.createAssignment('large-event', {
    assignmentId: 'task-backup', volunteerName: 'Burak', count: 2, createdAt: '2026-10-08T08:01:00.000Z',
  });
  const coordinator = await backupFormat.readBackupFile(await backupFormat.createBackupFile(await storage.getProject('large-event')));
  assert.equal(coordinator.project.assignments[0].contacts.length, 2);
  const fresh = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await fresh.restoreProjectBackup(coordinator.project);
  assert.equal(fresh.getAvailableContacts(await fresh.getProject('large-event')).length, 1);
  const parsed = await assignmentFormat.readAssignmentFile(await assignmentFormat.createAssignmentFile(assignment));
  await storage.importVolunteerAssignment(parsed.assignment, parsed.sha256);
  const volunteerBackup = await backupFormat.readBackupFile(await backupFormat.createBackupFile(await storage.getProject('task-backup')));
  assert.equal(volunteerBackup.project.eventId, 'large-event');
  assert.equal(volunteerBackup.project.assignmentId, 'task-backup');
  assert.equal(await fresh.restoreProjectBackup(volunteerBackup.project), 'restored');
});

test('version 4 coordinator backup reconstructs form history from old tasks', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await storage.createProject(distributionProject(2));
  await storage.createAssignment('large-event', {
    assignmentId: 'old-task', volunteerName: 'A', count: 1, createdAt: '2026-10-08T08:01:00.000Z',
  });
  const legacy = JSON.parse(await backupFormat.createBackupFile(await storage.getProject('large-event')));
  legacy.schemaVersion = 4;
  delete legacy.payload.project.formHistory;
  const { integrity, ...body } = legacy;
  legacy.integrity.sha256 = await cryptoMock.digestStringAsync('SHA-256', backupFormat.canonicalJson(body));
  const restored = await backupFormat.readBackupFile(JSON.stringify(legacy));
  assert.equal(restored.project.formHistory[0].version, 1);
  assert.equal(restored.project.assignments[0].packetDigest.length, 64);
});

test('partial result, newer revision and callback round merge without losing the first answer', async () => {
  const coordinator = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  const volunteer = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await coordinator.createProject(distributionProject(3));
  const assignment = await coordinator.createAssignment('large-event', {
    assignmentId: 'task-results', volunteerName: 'A', count: 2, createdAt: '2026-10-08T08:01:00.000Z',
  });
  const parsed = await assignmentFormat.readAssignmentFile(await assignmentFormat.createAssignmentFile(assignment));
  await volunteer.importVolunteerAssignment(parsed.assignment, parsed.sha256);
  const project = await volunteer.getProject('task-results');
  const contacts = project.contacts.map((contact, index) => index === 0 ? {
    ...contact, completed: true, callStatus: 'later', callbackNote: 'Öğleden sonra',
    data: { ...contact.data, answer: 'Evet' },
    attempts: [{ id: 'attempt-1', at: '2026-10-08T09:00:00.000Z', status: 'later',
      note: 'Öğleden sonra', data: { ...contact.data, answer: 'Evet' } }],
  } : contact);
  await volunteer.updateProject('task-results', { contacts });
  const file1 = await resultFormat.readResultFile((await volunteer.createVolunteerResultFile('task-results')).content);
  const preview1 = await coordinator.previewImportedResults('large-event', [file1]);
  assert.equal(preview1.changes.length, 1);
  assert.equal(preview1.conflicts.length, 0);
  await coordinator.applyImportedResults('large-event', [file1], {}, preview1.snapshot);
  assert.equal((await coordinator.getProject('large-event')).contacts[0].data.answer, 'Evet');
  assert.equal(coordinator.getCallbackCandidates(await coordinator.getProject('large-event')).length, 0);
  const duplicate = await coordinator.previewImportedResults('large-event', [file1]);
  assert.equal(duplicate.skipped.length, 1);
  const changed = contacts.map((contact, index) => index === 1 ? {
    ...contact, completed: true, callStatus: 'unreached',
    attempts: [{ id: 'attempt-2', at: '2026-10-08T10:00:00.000Z', status: 'unreached', note: '', data: contact.data }],
  } : contact);
  await volunteer.updateProject('task-results', { contacts: changed });
  const file2 = await resultFormat.readResultFile((await volunteer.createVolunteerResultFile('task-results')).content);
  const preview2 = await coordinator.previewImportedResults('large-event', [file2, file1]);
  assert.equal(preview2.changes.length, 2);
  await coordinator.applyImportedResults('large-event', [file2, file1], {}, preview2.snapshot);
  const master = await coordinator.getProject('large-event');
  assert.equal(master.contacts[0].attempts.length, 1);
  assert.equal(master.contacts[1].callStatus, 'unreached');
  assert.equal(coordinator.getCallbackCandidates(master).length, 1);
  const callback = await coordinator.createCallbackAssignment('large-event', {
    assignmentId: 'task-callback', volunteerName: 'B', count: 1, createdAt: '2026-10-08T11:00:00.000Z',
  });
  assert.equal(callback.round, 2);
  assert.equal(callback.contacts[0].previousCallbackNote, 'Öğleden sonra');
  assert.equal(coordinator.getCallbackCandidates(await coordinator.getProject('large-event')).length, 0);
  const callbackVolunteer = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  const callbackPacket = await assignmentFormat.readAssignmentFile(await assignmentFormat.createAssignmentFile(callback));
  await callbackVolunteer.importVolunteerAssignment(callbackPacket.assignment, callbackPacket.sha256);
  const callbackTask = await callbackVolunteer.getProject('task-callback');
  await callbackVolunteer.updateProject(callbackTask.id, { contacts: [{ ...callbackTask.contacts[0],
    completed: true, callStatus: 'unreached', data: { ...callbackTask.contacts[0].data },
    attempts: [{ id: 'attempt-3', at: '2026-10-09T09:00:00.000Z', status: 'unreached', note: '',
      data: { ...callbackTask.contacts[0].data } }],
  }] });
  const callbackResult = await resultFormat.readResultFile((await callbackVolunteer.createVolunteerResultFile('task-callback')).content);
  const callbackPreview = await coordinator.previewImportedResults('large-event', [callbackResult]);
  assert.equal(callbackPreview.conflicts.length, 0);
  await coordinator.applyImportedResults('large-event', [callbackResult], {}, callbackPreview.snapshot);
  assert.equal((await coordinator.getProject('large-event')).contacts[0].data.answer, 'Evet');
  assert.equal((await coordinator.getProject('large-event')).contacts[0].attempts.length, 2);
  const backup = await backupFormat.readBackupFile(await backupFormat.createBackupFile(await coordinator.getProject('large-event')));
  assert.equal(backup.project.assignments[1].round, 2);
  assert.equal(backup.project.contacts[0].attempts.length, 2);
});

test('conflicting coordinator answer requires a choice and stale preview cannot overwrite changes', async () => {
  const coordinator = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  const volunteer = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await coordinator.createProject(distributionProject(1));
  const assignment = await coordinator.createAssignment('large-event', {
    assignmentId: 'task-conflict', volunteerName: 'A', count: 1, createdAt: '2026-10-08T08:01:00.000Z',
  });
  const parsed = await assignmentFormat.readAssignmentFile(await assignmentFormat.createAssignmentFile(assignment));
  await volunteer.importVolunteerAssignment(parsed.assignment, parsed.sha256);
  const v = await volunteer.getProject('task-conflict');
  await volunteer.updateProject(v.id, { contacts: [{ ...v.contacts[0], completed: true, callStatus: 'contacted',
    data: { ...v.contacts[0].data, answer: 'Evet' } }] });
  const packet = await resultFormat.readResultFile((await volunteer.createVolunteerResultFile(v.id)).content);
  const master = await coordinator.getProject('large-event');
  await coordinator.updateProject(master.id, { contacts: [{ ...master.contacts[0], data: { ...master.contacts[0].data, answer: 'Hayır' } }] });
  const preview = await coordinator.previewImportedResults(master.id, [packet]);
  assert.equal(preview.conflicts.length, 1);
  await assert.rejects(coordinator.applyImportedResults(master.id, [packet], {}, preview.snapshot), /karar/);
  await coordinator.updateProject(master.id, { contacts: [{ ...(await coordinator.getProject(master.id)).contacts[0], callbackNote: 'Değişti' }] });
  await assert.rejects(coordinator.applyImportedResults(master.id, [packet],
    { 'task-conflict:record-0': 'incoming' }, preview.snapshot), /önizlemeden sonra değişti/);
  const fresh = await coordinator.previewImportedResults(master.id, [packet]);
  await coordinator.applyImportedResults(master.id, [packet], { 'task-conflict:record-0': 'incoming' }, fresh.snapshot);
  assert.equal((await coordinator.getProject(master.id)).contacts[0].data.answer, 'Evet');
});

test('final workbook separates current status, call history and reviewed conflicts', () => {
  const exports = loadSource('src/utils/exportUtils.js', { 'react-native': { Platform: { OS: 'web' } } });
  const project = sampleProject();
  project.contacts[0].callStatus = 'later';
  project.contacts[0].callbackNote = 'Yarın ara';
  project.contacts[0].attempts = [{ id: 'attempt-1', at: '2026-10-08T09:00:00.000Z',
    status: 'later', note: 'Yarın ara', data: { name: 'Ayşe Yılmaz' } }];
  project.mergeConflicts = [{ recordId: 'record-1', assignmentId: 'task-1', decision: 'incoming',
    at: '2026-10-08T10:00:00.000Z', oldAnswer: '{}', incomingAnswer: '{}' }];
  const wb = exports.buildWorkbook(project);
  assert.deepEqual(wb.SheetNames, ['Güncel Durum', 'Arama Geçmişi', 'İncelenecek Çakışmalar']);
  assert.equal(wb.Sheets['Güncel Durum'].B2.t, 's');
  assert.equal(wb.Sheets['Güncel Durum'].B2.v, '+905321234567');
});

test('source columns survive backup and appear before current answers in final Excel', async () => {
  const exports = loadSource('src/utils/exportUtils.js', { 'react-native': { Platform: { OS: 'web' } } });
  const project = sampleProject();
  project.sourceReview = { sourceName: 'Liste.xlsx', hasHeader: true, totalRows: 1,
    columns: [{ index: 0, label: 'Okul Numarası', role: 'field', fieldId: null },
      { index: 1, label: 'Telefon', role: 'phone', fieldId: null }], excludedRows: [] };
  project.contacts[0].sourceCells = ['001234', '0532 123 45 67'];
  const restored = (await backupFormat.readBackupFile(await backupFormat.createBackupFile(project))).project;
  assert.deepEqual(restored.contacts[0].sourceCells, ['001234', '0532 123 45 67']);
  const sheet = exports.buildWorkbook(restored).Sheets['Güncel Durum'];
  assert.equal(sheet.A1.v, 'Okul Numarası');
  assert.equal(sheet.A2.v, '001234');
  assert.equal(sheet.B2.v, '0532 123 45 67');
  assert.equal(sheet.A2.t, 's');
  assert.equal(sheet.B2.t, 's');
  assert.equal(sheet.D1.v, 'Güncel: Tel No');
});

test('original Excel sheets survive export byte for byte and backup restores the attachment', async () => {
  const sourceBook = XLSX.utils.book_new();
  const people = XLSX.utils.aoa_to_sheet([['İsim', 'Telefon'], ['Ayşe', '05321234567']]);
  people['!cols'] = [{ wch: 24 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(sourceBook, people, 'Ana Liste');
  const notes = XLSX.utils.aoa_to_sheet([['Notlar', 'Hesap'], [7, 14]]);
  notes.B2 = { t: 'n', f: 'A2*2', v: 14 };
  notes['!merges'] = [{ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }];
  XLSX.utils.book_append_sheet(sourceBook, notes, 'Güncel Durum');
  const originalBytes = new Uint8Array(XLSX.write(sourceBook, { bookType: 'xlsx', type: 'array', cellStyles: true }));
  const attachment = await sourceWorkbookArchive.captureSourceWorkbook('Liste.xlsx', originalBytes, 'array');
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await storage.createProject({ ...distributionProject(1), sourceWorkbook: attachment });
  assert.equal(memory.values.get('@ays_projects').includes(attachment.base64), false);
  const project = await storage.getProjectForExport('large-event');
  assert.deepEqual(Buffer.from(sourceWorkbookArchive.sourceWorkbookBytes(project.sourceWorkbook)), Buffer.from(originalBytes));

  const exports = loadSource('src/utils/exportUtils.js', { 'react-native': { Platform: { OS: 'web' } } });
  const resultBytes = exports.createExcelOutput(project);
  const originalZip = unzipSync(originalBytes);
  const resultZip = unzipSync(resultBytes);
  for (const path of Object.keys(originalZip).filter((name) =>
    !['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml'].includes(name))) {
    assert.deepEqual(Buffer.from(resultZip[path]), Buffer.from(originalZip[path]), `${path} changed`);
  }
  const resultBook = XLSX.read(resultBytes, { type: 'array', cellFormula: true });
  assert.deepEqual(resultBook.SheetNames, ['Ana Liste', 'Güncel Durum', 'Güncel Durum (2)', 'Arama Geçmişi']);
  assert.equal(resultBook.Sheets['Güncel Durum'].B2.f, 'A2*2');
  assert.equal(resultBook.Sheets['Ana Liste'].B2.v, '05321234567');
  assert.equal(resultBook.Sheets['Güncel Durum (2)'].B2.v, '+905320000000');

  const backup = await backupFormat.readBackupFile(await backupFormat.createBackupFile(project));
  const restoredStorage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await restoredStorage.restoreProjectBackup(backup.project);
  const restored = await restoredStorage.getProjectForBackup('large-event');
  assert.deepEqual(Buffer.from(sourceWorkbookArchive.sourceWorkbookBytes(restored.sourceWorkbook)), Buffer.from(originalBytes));
  sourceFiles.delete(restored.sourceWorkbookMeta.ref);
  await assert.rejects(restoredStorage.getProjectForBackup('large-event'), /bulunamadı/);
  const fallback = await restoredStorage.getProjectForExport('large-event');
  assert.equal(fallback.sourceWorkbookMissing, true);
  assert.equal(XLSX.read(exports.createExcelOutput(fallback), { type: 'array' }).SheetNames[0], 'Güncel Durum');
});

test('corrupted original Excel attachment is rejected before creating a project', async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['İsim'], ['Ayşe']]), 'Liste');
  const bytes = new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array' }));
  const source = await sourceWorkbookArchive.captureSourceWorkbook('Liste.xlsx', bytes, 'array');
  const corrupted = { ...source, base64: `A${source.base64.slice(1)}` };
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await assert.rejects(storage.createProject({ ...distributionProject(1), sourceWorkbook: corrupted }), /bozulmuş/);
  assert.equal((await storage.getAllProjects()).length, 0);
});

test('original Excel sidecar persists on web and native storage without filling project metadata', async () => {
  const previousIndexedDB = global.indexedDB;
  global.indexedDB = require('fake-indexeddb').indexedDB;
  try {
    const webStore = loadSource('src/utils/sourceWorkbookStore.js', {
      'react-native': { Platform: { OS: 'web' } }, 'expo-file-system/legacy': {},
    });
    await webStore.writeSourceWorkbook('web-source', 'UEsDBA==');
    assert.equal(await webStore.readSourceWorkbook('web-source'), 'UEsDBA==');
    await webStore.removeSourceWorkbook('web-source');
    assert.equal(await webStore.readSourceWorkbook('web-source'), null);
  } finally { global.indexedDB = previousIndexedDB; }

  const files = new Map();
  const nativeStore = loadSource('src/utils/sourceWorkbookStore.js', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-file-system/legacy': {
      documentDirectory: 'file:///docs/', EncodingType: { Base64: 'base64' },
      async writeAsStringAsync(uri, value) { files.set(uri, value); },
      async getInfoAsync(uri) { return { exists: files.has(uri) }; },
      async readAsStringAsync(uri) { return files.get(uri); },
      async deleteAsync(uri) { files.delete(uri); },
    },
  });
  await nativeStore.writeSourceWorkbook('native-source', 'UEsDBA==');
  assert.equal(await nativeStore.readSourceWorkbook('native-source'), 'UEsDBA==');
  await nativeStore.removeSourceWorkbook('native-source');
  assert.equal(await nativeStore.readSourceWorkbook('native-source'), null);
});

test('replacing and deleting an event switches immutable source attachments safely', async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Liste'], ['A']]), 'İlk');
  const first = await sourceWorkbookArchive.captureSourceWorkbook('ilk.xlsx',
    new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array' })), 'array');
  book.Sheets['İlk'].A2.v = 'B';
  const second = await sourceWorkbookArchive.captureSourceWorkbook('yeni.xlsx',
    new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array' })), 'array');
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await storage.createProject({ ...distributionProject(1), sourceWorkbook: first });
  const expected = await storage.getProjectForBackup('large-event');
  const oldRef = expected.sourceWorkbookMeta.ref;
  const incoming = { ...expected, sourceWorkbook: second };
  assert.equal(await storage.replaceProjectBackup(incoming, expected), 'replaced');
  const replaced = await storage.getProjectForBackup('large-event');
  assert.equal(replaced.sourceWorkbook.sha256, second.sha256);
  assert.equal(sourceFiles.has(oldRef), false);
  const newRef = replaced.sourceWorkbookMeta.ref;
  await storage.deleteProject('large-event', replaced);
  assert.equal(sourceFiles.has(newRef), false);
});

test('macro workbook remains macro-enabled and old XLS keeps a separate result workbook', async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['İsim'], ['Ayşe']]), 'Kaynak');
  const macroBytes = new Uint8Array(XLSX.write(book, { bookType: 'xlsm', type: 'array' }));
  const macroSource = await sourceWorkbookArchive.captureSourceWorkbook('Kaynak.xlsm', macroBytes, 'array');
  const exports = loadSource('src/utils/exportUtils.js', { 'react-native': { Platform: { OS: 'web' } } });
  const macroOutput = exports.createExcelOutput({ ...distributionProject(1), sourceWorkbook: macroSource });
  assert.match(Buffer.from(unzipSync(macroOutput)['[Content_Types].xml']).toString(), /macroEnabled/);
  assert.deepEqual(XLSX.read(macroOutput, { type: 'array' }).SheetNames,
    ['Kaynak', 'Güncel Durum', 'Arama Geçmişi']);

  const oldBytes = new Uint8Array(XLSX.write(book, { bookType: 'biff8', type: 'array' }));
  const oldSource = await sourceWorkbookArchive.captureSourceWorkbook('Kaynak.xls', oldBytes, 'array');
  const oldOutput = exports.createExcelOutput({ ...distributionProject(1), sourceWorkbook: oldSource });
  assert.deepEqual(XLSX.read(oldOutput, { type: 'array' }).SheetNames,
    ['Güncel Durum', 'Arama Geçmişi']);
  assert.deepEqual(Buffer.from(sourceWorkbookArchive.sourceWorkbookBytes(oldSource)), Buffer.from(oldBytes));
});

test('interrupted merge journal restores the previous project before reading', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await storage.createProject(sampleProject());
  const projectsRaw = memory.values.get('@ays_projects');
  const contactsRaw = memory.values.get('@ays_project_data_event-1');
  memory.values.set('@ays_merge_journal', JSON.stringify({ projectId: 'event-1', projectsRaw, contactsRaw }));
  memory.values.set('@ays_project_data_event-1', JSON.stringify([{ id: 'record-1', phone: 'wrong', data: {}, completed: true }]));
  const recovered = await storage.getProject('event-1');
  assert.equal(recovered.contacts[0].phone, '+905321234567');
  assert.equal(memory.values.has('@ays_merge_journal'), false);
});
