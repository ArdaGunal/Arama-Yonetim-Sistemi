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
const backupFormat = loadSource('src/utils/backupFormat.js', { 'expo-crypto': cryptoMock });
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

test('two-step project review prepares imported questions and updates changed column roles', () => {
  const base = [
    { id: 'name', label: 'İsim Soyisim', type: 'text', options: [], isSystemField: 'name' },
    { id: 'phone', label: 'Telefon', type: 'phone', options: [], isSystemField: 'phone' },
  ];
  const source = { columns: [
    { index: 0, label: 'İsim Soyisim', role: 'name' },
    { index: 1, label: 'Telefon', role: 'phone' },
    { index: 2, label: 'Okul Numarası', role: 'field' },
  ] };
  let nextId = 0;
  const createId = () => `field-${++nextId}`;
  const first = newProjectFields.alignSourceFields(source, base, [], createId);
  assert.equal(first.fields.length, 3);
  assert.equal(first.fields[2].label, 'Okul Numarası');
  assert.equal(first.mapping[2], 'field-1');
  const revised = newProjectFields.alignSourceFields(source, first.fields, [], createId);
  assert.equal(revised.mapping[2], 'field-1');
  assert.equal(nextId, 1);
  const ignored = newProjectFields.alignSourceFields({ columns: source.columns.map((column) =>
    column.index === 2 ? { ...column, role: 'ignore' } : column) }, revised.fields, [], createId);
  assert.deepEqual(ignored.fields.map((field) => field.id), ['name', 'phone']);
  const template = newProjectFields.alignSourceFields(source,
    [...base, { id: 'school', label: 'Öğrenci No', type: 'text', options: [] }],
    [{ label: 'Okul Numarası', fieldId: 'school' }], createId);
  assert.equal(template.mapping[2], 'school');
  assert.equal(template.fields.length, 3);
  const selectTemplate = newProjectFields.alignSourceFields({ columns: [
    ...source.columns.slice(0, 2), { index: 2, label: 'Geliyor musun?', role: 'field' },
  ] }, [...base, { id: 'attendance', label: 'Geliyor musun?', type: 'select', options: ['Evet', 'Hayır'] }],
  [], createId);
  assert.equal(selectTemplate.mapping[2], 'attendance');
});

test('duplicate review selects the first row by default and keeps a manual choice', () => {
  const analysis = { duplicates: [
    { phone: '+905550001001', rows: [{ sourceRow: 2 }, { sourceRow: 3 }] },
    { phone: '+905550001002', rows: [{ sourceRow: 5 }, { sourceRow: 7 }] },
  ] };
  assert.deepEqual(newProjectFields.resolveDuplicateSelections(analysis, {}), {
    '+905550001001': 2, '+905550001002': 5,
  });
  assert.deepEqual(newProjectFields.resolveDuplicateSelections(analysis, { '+905550001001': 3 }), {
    '+905550001001': 3, '+905550001002': 5,
  });
});

test('select questions start with two empty choices and keep existing choices', () => {
  const field = { id: 'attendance', label: 'Geliyor musun?', type: 'text', options: [] };
  const select = newProjectFields.withAnswerType(field, 'select');
  assert.deepEqual(select.options, ['', '']);
  assert.deepEqual(field.options, []);
  const filled = { ...select, options: ['Evet', 'Hayır'] };
  assert.deepEqual(newProjectFields.withAnswerType(newProjectFields.withAnswerType(filled, 'text'), 'select').options,
    ['Evet', 'Hayır']);
});

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

test('projects with the same visible name remain separate by identity', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await storage.createProject({ id: 'event-a', eventId: 'event-a', name: 'Aynı etkinlik', contacts: [{ id: 'a' }] });
  await storage.createProject({ id: 'event-b', eventId: 'event-b', name: 'Aynı etkinlik', contacts: [{ id: 'b' }] });
  const projects = await storage.getProjectSummaries();
  assert.equal(projects.filter((project) => project.name === 'Aynı etkinlik').length, 2);
  assert.deepEqual((await storage.getProject('event-a')).contacts.map((contact) => contact.id), ['a']);
  assert.deepEqual((await storage.getProject('event-b')).contacts.map((contact) => contact.id), ['b']);
});

test('duplicate project names ignore letter case and repeated spaces without matching other names', () => {
  const projects = [{ id: 'first', name: 'Bahar Etkinliği' }, { id: 'second', name: 'Başka proje' }];
  assert.equal(projectNames.findSameNameProject('  bahar   etkinliği  ', projects)?.id, 'first');
  assert.equal(projectNames.findSameNameProject('Bahar Anketi', projects), null);
  assert.equal(projectNames.findSameNameProject('  ', projects), null);
});

test('project reading keeps legacy inline contacts but prefers the sidecar when present', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  const legacy = [{ id: 'inline', completed: false }];
  const sidecar = [{ id: 'sidecar', completed: true }];
  memory.values.set('@ays_projects', JSON.stringify([{ id: 'old', name: 'Eski', contacts: legacy }]));
  assert.deepEqual((await storage.getProject('old')).contacts, legacy);
  memory.values.set('@ays_project_data_old', JSON.stringify(sidecar));
  assert.deepEqual((await storage.getProject('old')).contacts, sidecar);
  assert.deepEqual((await storage.getProjectSummaries()).map(({ totalContacts, completedContacts }) =>
    [totalContacts, completedContacts]), [[1, 1]]);
});

test('failed project metadata write removes the new contacts sidecar', async (t) => {
  const loggedError = t.mock.method(console, 'error', () => {});
  const memory = memoryStorage();
  const originalSet = memory.setItem;
  memory.setItem = async (key, value) => {
    if (key === '@ays_projects') throw new Error('sentetik metadata hatası');
    return originalSet(key, value);
  };
  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  await assert.rejects(storage.createProject({ id: 'failed', name: 'Deneme', contacts: [{ id: 'one' }] }),
    /Proje verisi kaydedilemedi/);
  assert.equal(memory.values.has('@ays_project_data_failed'), false);
  assert.equal(memory.values.has('@ays_projects'), false);
  assert.equal(loggedError.mock.callCount(), 1);
});

test('failed contact update restores its sidecar and counters', async (t) => {
  t.mock.method(console, 'error', () => {});
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await storage.createProject({ id: 'update-fail', name: 'Deneme', contacts: [
    { id: 'one', phone: '05000000001', completed: false, data: {} },
  ], currentIndex: 0 });
  const oldContactsRaw = memory.values.get('@ays_project_data_update-fail');
  const oldProjectsRaw = memory.values.get('@ays_projects');
  const originalSet = memory.setItem;
  memory.setItem = async (key, value) => {
    if (key === '@ays_projects') throw new Error('sentetik metadata hatası');
    return originalSet(key, value);
  };
  await assert.rejects(storage.updateProject('update-fail', { currentIndex: 1, contacts: [
    { id: 'one', phone: '05000000001', completed: true, data: { answer: 'Evet' } },
  ] }), /Proje verisi kaydedilemedi/);
  assert.equal(memory.values.get('@ays_project_data_update-fail'), oldContactsRaw);
  assert.equal(memory.values.get('@ays_projects'), oldProjectsRaw);
});

test('failed legacy contact update leaves no orphan sidecar', async (t) => {
  t.mock.method(console, 'error', () => {});
  const memory = memoryStorage();
  const legacy = [{ id: 'old', phone: '05000000002', completed: false, data: {} }];
  memory.values.set('@ays_projects', JSON.stringify([{ id: 'legacy-update', name: 'Eski', contacts: legacy }]));
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const originalSet = memory.setItem;
  memory.setItem = async (key, value) => {
    if (key === '@ays_projects') throw new Error('sentetik metadata hatası');
    return originalSet(key, value);
  };
  await assert.rejects(storage.updateProject('legacy-update', { contacts: [
    { ...legacy[0], completed: true },
  ] }), /Proje verisi kaydedilemedi/);
  assert.equal(memory.values.has('@ays_project_data_legacy-update'), false);
  assert.deepEqual((await storage.getProject('legacy-update')).contacts, legacy);
});

test('interrupted contact update restores metadata and contacts on restart', async () => {
  const memory = memoryStorage();
  const first = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await first.createProject({ id: 'interrupted-update', name: 'Deneme', contacts: [
    { id: 'one', phone: '05000000003', completed: false, data: {} },
  ], currentIndex: 0 });
  const projectsRaw = memory.values.get('@ays_projects');
  const contactsRaw = memory.values.get('@ays_project_data_interrupted-update');
  await projectUpdateJournalStore.writeProjectUpdateJournal(memory, JSON.stringify({ version: 1,
    projectId: 'interrupted-update', projectsRaw, contactsRaw }));
  memory.values.set('@ays_project_data_interrupted-update', JSON.stringify([
    { id: 'one', phone: '05000000003', completed: true, data: { answer: 'Evet' } },
  ]));
  memory.values.set('@ays_projects', JSON.stringify([{ ...JSON.parse(projectsRaw)[0],
    currentIndex: 1, completedContacts: 1 }]));
  const reopened = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const project = await reopened.getProject('interrupted-update');
  assert.equal(memory.values.get('@ays_projects'), projectsRaw);
  assert.equal(memory.values.get('@ays_project_data_interrupted-update'), contactsRaw);
  assert.equal(await projectUpdateJournalStore.readProjectUpdateJournal(memory), null);
  assert.equal(project.currentIndex, 0);
  assert.equal(project.contacts[0].completed, false);
});

test('interrupted legacy update removes a sidecar that did not exist before', async () => {
  const memory = memoryStorage();
  const legacy = [{ id: 'old', phone: '05000000004', completed: false, data: {} }];
  const projectsRaw = JSON.stringify([{ id: 'legacy-interrupted', name: 'Eski', contacts: legacy }]);
  memory.values.set('@ays_projects', projectsRaw);
  await projectUpdateJournalStore.writeProjectUpdateJournal(memory, JSON.stringify({ version: 1,
    projectId: 'legacy-interrupted', projectsRaw, contactsRaw: null }));
  memory.values.set('@ays_project_data_legacy-interrupted', JSON.stringify([{ ...legacy[0], completed: true }]));
  const reopened = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  assert.deepEqual((await reopened.getProject('legacy-interrupted')).contacts, legacy);
  assert.equal(memory.values.has('@ays_project_data_legacy-interrupted'), false);
  assert.equal(await projectUpdateJournalStore.readProjectUpdateJournal(memory), null);
});

test('incomplete temporary journal is ignored before any contact change', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await storage.createProject({ id: 'temporary-only', name: 'Deneme', contacts: [{ id: 'one', completed: false }] });
  const temporary = 'file:///docs/ays-project-update-journal.json.tmp';
  journalFiles.set(temporary, '{yarım kalmış kayıt');
  assert.equal((await storage.getProject('temporary-only')).contacts[0].completed, false);
  assert.equal(journalFiles.has(temporary), false);
});

test('contact update writes its recovery journal before data and clears it after metadata', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await storage.createProject({ id: 'ordered-update', name: 'Deneme', contacts: [
    { id: 'one', phone: '05000000005', completed: false, data: {} },
  ] });
  const order = [];
  const originalSet = memory.setItem;
  const originalRemove = memory.removeItem;
  memory.setItem = async (key, value) => { order.push(`set:${key}`); return originalSet(key, value); };
  memory.removeItem = async (key) => { order.push(`remove:${key}`); return originalRemove(key); };
  journalEvents = order;
  try {
    await storage.updateProject('ordered-update', { contacts: [
      { id: 'one', phone: '05000000005', completed: true, data: {} },
    ] });
  } finally { journalEvents = null; }
  assert.deepEqual(order, [
    'write:journal-temp',
    'move:journal',
    'set:@ays_project_data_ordered-update',
    'set:@ays_projects',
    'delete:journal',
  ]);
  assert.equal(await projectUpdateJournalStore.readProjectUpdateJournal(memory), null);
});

test('failed recovery keeps the contact update journal for a later retry', async (t) => {
  t.mock.method(console, 'error', () => {});
  const memory = memoryStorage();
  const first = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await first.createProject({ id: 'retry-update', name: 'Deneme', contacts: [
    { id: 'one', phone: '05000000006', completed: false, data: {} },
  ] });
  const projectsRaw = memory.values.get('@ays_projects');
  const contactsRaw = memory.values.get('@ays_project_data_retry-update');
  await projectUpdateJournalStore.writeProjectUpdateJournal(memory, JSON.stringify({ version: 1,
    projectId: 'retry-update', projectsRaw, contactsRaw }));
  memory.values.set('@ays_project_data_retry-update', JSON.stringify([
    { id: 'one', phone: '05000000006', completed: true, data: {} },
  ]));
  const originalSet = memory.setItem;
  memory.setItem = async (key, value) => {
    if (key === '@ays_project_data_retry-update') throw new Error('sentetik geri alma hatası');
    return originalSet(key, value);
  };
  const reopened = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await assert.rejects(reopened.getProject('retry-update'), /Projeler yüklenemedi/);
  assert.notEqual(await projectUpdateJournalStore.readProjectUpdateJournal(memory), null);
  memory.setItem = originalSet;
  assert.equal((await reopened.getProject('retry-update')).contacts[0].completed, false);
  assert.equal(await projectUpdateJournalStore.readProjectUpdateJournal(memory), null);
});

test('web keeps the contact recovery journal in IndexedDB and restores an interrupted write', async () => {
  const previousIndexedDB = global.indexedDB;
  global.indexedDB = require('fake-indexeddb').indexedDB;
  try {
    const webJournalStore = loadSource('src/data/projectStore/projectUpdateJournalStore.js', {
      'react-native': { Platform: { OS: 'web' } },
      'expo-file-system/legacy': {},
    });
    const memory = memoryStorage();
    const mocks = { '@react-native-async-storage/async-storage': memory,
      '../data/projectStore/projectUpdateJournalStore': webJournalStore };
    const storage = loadSource('src/utils/storage.js', mocks);
    await storage.createProject({ id: 'web-update', name: 'Web deneme', contacts: [
      { id: 'one', phone: '05000000007', completed: false, data: {} },
    ] });
    await storage.updateProject('web-update', { contacts: [
      { id: 'one', phone: '05000000007', completed: true, data: {} },
    ] });
    assert.equal(await webJournalStore.readProjectUpdateJournal(memory), null);
    assert.equal(memory.values.has('@ays_project_update_journal'), false);

    const projectsRaw = memory.values.get('@ays_projects');
    const contactsRaw = memory.values.get('@ays_project_data_web-update');
    await webJournalStore.writeProjectUpdateJournal(memory, JSON.stringify({ version: 1,
      projectId: 'web-update', projectsRaw, contactsRaw }));
    memory.values.set('@ays_project_data_web-update', JSON.stringify([
      { id: 'one', phone: '05000000007', completed: false, data: {} },
    ]));
    const reopened = loadSource('src/utils/storage.js', mocks);
    assert.equal((await reopened.getProject('web-update')).contacts[0].completed, true);
    assert.equal(await webJournalStore.readProjectUpdateJournal(memory), null);
    assert.equal(memory.values.has('@ays_project_update_journal'), false);
  } finally { global.indexedDB = previousIndexedDB; }
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
  unsupported.schemaVersion = 8;
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
  const rows = sourcePreview.textToRows('Deneme Kişi A\t0555 000 10 01\nDeneme Kişi B 0555 000 10 02');
  const source = sourcePreview.prepareSource(rows);
  const analysis = sourcePreview.analyzeSource(source);
  assert.deepEqual(analysis.valid.map((row) => row.name), ['Deneme Kişi A', 'Deneme Kişi B']);
  assert.equal(analysis.duplicates.length, 0);
});

test('personal list format persists and parses phone-first, phone-only and headed tables', async () => {
  const memory = memoryStorage();
  const settings = loadSource('src/utils/appSettings.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  assert.deepEqual(await settings.getAppSettings(), { pasteMode: 'name-phone', defaultTemplateId: null });
  await settings.saveAppSettings({ pasteMode: 'phone-name', defaultTemplateId: 'my-questions' });
  const restarted = loadSource('src/utils/appSettings.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  assert.deepEqual(await restarted.getAppSettings(), { pasteMode: 'phone-name', defaultTemplateId: 'my-questions' });
  assert.throws(() => restarted.saveAppSettings({ pasteMode: 'invalid', defaultTemplateId: null }), /okunamadı/);
  assert.equal((await restarted.getAppSettings()).pasteMode, 'phone-name');

  const preview = loadSource('src/utils/sourcePreview.js');
  const phoneFirst = preview.analyzeSource(preview.prepareSource(
    preview.textToRows('0555 000 10 01 Ayşe Örnek', 'phone-name'), 'Telefon önce', false));
  assert.equal(phoneFirst.valid[0].name, 'Ayşe Örnek');
  const onlyPhone = preview.analyzeSource(preview.prepareSource(
    preview.textToRows('0555 000 10 02', 'phone-only'), 'Telefon listesi', false));
  assert.equal(onlyPhone.valid.length, 1);
  assert.equal(newProjectFields.importedContactName(onlyPhone.valid[0].name), 'İsimsiz kişi');
  const headed = preview.prepareSource(preview.textToRows(
    'İsim Soyisim;Telefon;Okul Numarası\nAyşe Örnek;0555 000 10 03;1234', 'header-table'),
  'Başlıklı tablo', true);
  assert.equal(headed.columns.find((column) => column.role === 'phone').label, 'Telefon');
  assert.equal(headed.columns.find((column) => column.role === 'field').label, 'Okul Numarası');
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
      { label: 'Katılım', role: 'field', fieldId: 'answer' }], 'header-table');
  const parsed = await templates.readTemplateFile(content);
  assert.equal(parsed.pasteMode, 'header-table');
  assert.equal(parsed.fields[2].options[0], 'Evet');
  assert.equal(parsed.sourceColumns[1].role, 'phone');
  assert.equal(parsed.sourceColumns[2].fieldId, 'answer');
  assert.equal(content.includes('contacts'), false);
  const changed = JSON.parse(content);
  changed.fields[2].options[0] = 'Belki';
  await assert.rejects(templates.readTemplateFile(JSON.stringify(changed)), /değişmiş veya bozulmuş/);
  const legacy = JSON.parse(content);
  legacy.schemaVersion = 1;
  delete legacy.pasteMode;
  delete legacy.integrity;
  const legacyHash = await cryptoMock.digestStringAsync('SHA-256', backupFormat.canonicalJson(legacy));
  const oldTemplate = await templates.readTemplateFile(JSON.stringify({ ...legacy,
    integrity: { algorithm: 'SHA-256', sha256: legacyHash } }));
  assert.equal(oldTemplate.pasteMode, 'name-phone');
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

test('cancelled work returns to the front of the pool without losing unfinished people', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await storage.createProject(distributionProject(60));
  const first = await storage.createAssignment('large-event', {
    assignmentId: 'task-cancelled', volunteerName: 'A', count: 50, createdAt: '2026-10-08T08:01:00.000Z',
  });
  await storage.setAssignmentStatus('large-event', first.assignmentId, 'sent');
  await storage.setAssignmentStatus('large-event', first.assignmentId, 'cancelled', true);
  let project = await storage.getProject('large-event');
  assert.equal(storage.getReturnedContacts(project).length, 50);
  assert.equal(storage.getAvailableContacts(project).length, 60);
  const second = await storage.createAssignment('large-event', {
    assignmentId: 'task-new', volunteerName: 'B', count: 30, createdAt: '2026-10-08T08:02:00.000Z',
  });
  assert.deepEqual(second.contacts.map((row) => row.recordId),
    first.contacts.slice(0, 30).map((row) => row.recordId));
  project = await storage.getProject('large-event');
  assert.equal(storage.getReturnedContacts(project).length, 20);
  assert.equal(storage.getAvailableContacts(project).length, 30);
  const restored = await backupFormat.readBackupFile(await backupFormat.createBackupFile(project));
  assert.equal(storage.getReturnedContacts(restored.project).length, 20);
  assert.equal(new Set(project.assignments.filter((item) => item.status !== 'cancelled')
    .flatMap((item) => item.contacts.map((row) => row.phone))).size, 30);
});

test('unfinished rows of a partial assignment transfer without losing completed answers', async () => {
  const coordinator = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  const volunteer = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await coordinator.createProject(distributionProject(12));
  const first = await coordinator.createAssignment('large-event', {
    assignmentId: 'task-partial', volunteerName: 'A', count: 10, createdAt: '2026-10-08T08:01:00.000Z',
  });
  const opened = await assignmentFormat.readAssignmentFile(await assignmentFormat.createAssignmentFile(first));
  await volunteer.importVolunteerAssignment(opened.assignment, opened.sha256);
  const task = await volunteer.getProject(first.assignmentId);
  await volunteer.updateProject(task.id, { contacts: task.contacts.map((contact, index) => index < 3
    ? { ...contact, completed: true, callStatus: 'contacted', data: { ...contact.data, answer: 'Evet' },
      attempts: [{ id: `call-${index}`, at: '2026-10-08T09:00:00.000Z', status: 'contacted',
        note: '', data: { ...contact.data, answer: 'Evet' } }] }
    : contact) });
  const result = await resultFormat.readResultFile((await volunteer.createVolunteerResultFile(task.id)).content);
  const preview = await coordinator.previewImportedResults('large-event', [result]);
  await coordinator.applyImportedResults('large-event', [result], {}, preview.snapshot);
  const pending = first.contacts.slice(3).map((row) => row.recordId);
  const second = await coordinator.transferAssignmentContacts('large-event', first.assignmentId, pending, {
    assignmentId: 'task-reassigned', volunteerName: 'B', createdAt: '2026-10-08T10:00:00.000Z',
  });
  assert.deepEqual(second.contacts.map((row) => row.recordId), pending);
  const master = await coordinator.getProject('large-event');
  assert.equal(master.contacts.filter((row) => row.completed).length, 3);
  assert.equal(master.assignments[0].status, 'transferred');
  assert.deepEqual(master.assignments[0].releasedRecordIds, pending);
  assert.equal(coordinator.getReturnedContacts(master).length, 0);
  assert.equal(coordinator.getAvailableContacts(master).length, 2);
  const restored = await backupFormat.readBackupFile(await backupFormat.createBackupFile(master));
  assert.deepEqual(restored.project.assignments[0].releasedRecordIds, pending);
  assert.equal(coordinator.getAvailableContacts(restored.project).length, 2);
});

test('coordinator self assignment reserves people and writes answers into the master event', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await storage.createProject(distributionProject(4));
  const own = await storage.createAssignment('large-event', {
    assignmentId: 'task-self', volunteerName: 'Ben', ownerType: 'coordinator', count: 2,
    createdAt: '2026-10-08T08:01:00.000Z',
  });
  assert.equal(own.ownerType, 'coordinator');
  assert.deepEqual(storage.getAvailableContacts(await storage.getProject('large-event'))
    .map((row) => row.recordId), ['record-2', 'record-3']);
  await storage.saveCoordinatorTaskContact('large-event', own.assignmentId, own.contacts[0].recordId, {
    data: { name: 'Kişi 0', answer: 'Evet' }, callStatus: 'contacted', callbackNote: '', callbackAt: null,
  });
  let project = await storage.getProject('large-event');
  assert.equal(project.contacts[0].completed, true);
  assert.equal(project.contacts[0].attempts.length, 1);
  assert.equal(project.assignments[0].status, 'partial');
  await storage.saveCoordinatorTaskContact('large-event', own.assignmentId, own.contacts[1].recordId, {
    data: { name: 'Kişi 1', answer: 'Hayır' }, callStatus: 'later', callbackNote: 'Yarın', callbackAt: null,
  });
  project = await storage.getProject('large-event');
  assert.equal(project.assignments[0].status, 'completed');
  assert.equal(storage.getCallbackCandidates(project).length, 1);
  const restored = await backupFormat.readBackupFile(await backupFormat.createBackupFile(project));
  assert.equal(restored.project.assignments[0].ownerType, 'coordinator');
  assert.equal(restored.project.contacts[1].callbackNote, 'Yarın');
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
  assert.equal(coordinator.getCallbackCandidates(await coordinator.getProject('large-event')).length, 1);
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

async function syntheticResult(assignment, sourceId, revision, answer, attemptId) {
  const at = '2026-10-09T09:00:00.000Z';
  const content = await resultFormat.createResultFile({
    eventId: assignment.eventId, assignmentId: assignment.assignmentId,
    formVersion: assignment.formVersion, round: assignment.round, revision, sourceId,
    assignmentDigest: assignment.packetDigest, exportedAt: at, fields: assignment.fields,
    contacts: assignment.contacts.map((row) => ({ recordId: row.recordId, phone: row.phone,
      data: { ...row.data, answer }, completed: true, completedAt: at,
      callStatus: 'contacted', attempts: [{ id: attemptId, at, status: 'contacted', note: '',
        data: { ...row.data, answer } }] })),
  });
  return resultFormat.readResultFile(content);
}

test('cancelled result waits for a decision and keeping the answer still preserves its attempt', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await storage.createProject(distributionProject(1));
  const oldTask = await storage.createAssignment('large-event', {
    assignmentId: 'old-task-late', volunteerName: 'A', count: 1, createdAt: '2026-10-08T08:01:00.000Z',
  });
  const packet = await syntheticResult(oldTask, 'device-old', 1, 'Evet', 'attempt-late');
  await storage.setAssignmentStatus('large-event', oldTask.assignmentId, 'cancelled');
  const newTask = await storage.createAssignment('large-event', {
    assignmentId: 'new-task-late', volunteerName: 'B', count: 1, createdAt: '2026-10-08T08:02:00.000Z',
  });
  assert.equal(newTask.contacts[0].recordId, oldTask.contacts[0].recordId);
  const current = await storage.getProject('large-event');
  await storage.updateProject(current.id, { contacts: current.contacts.map((contact) => ({ ...contact,
    data: { ...contact.data, answer: 'Hayır' }, completed: true, callStatus: 'contacted' })) });
  const preview = await storage.previewImportedResults('large-event', [packet]);
  assert.equal(preview.conflicts[0].reason, 'Görev iptal edilmiş');
  await storage.applyImportedResults('large-event', [packet], { 'old-task-late:record-0': 'keep' }, preview.snapshot);
  const merged = await storage.getProject('large-event');
  assert.equal(merged.contacts[0].data.answer, 'Hayır');
  assert.equal(merged.contacts[0].attempts[0].id, 'attempt-late');
  assert.equal(merged.assignments[0].status, 'cancelled');
  assert.equal((await backupFormat.readBackupFile(await backupFormat.createBackupFile(merged))).project.contacts[0].attempts.length, 1);
});

test('higher revision from another device cannot replace the answer automatically', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await storage.createProject(distributionProject(1));
  const assignment = await storage.createAssignment('large-event', {
    assignmentId: 'two-devices', volunteerName: 'A', count: 1, createdAt: '2026-10-08T08:01:00.000Z',
  });
  const first = await syntheticResult(assignment, 'device-one', 1, 'Evet', 'attempt-one');
  const firstPreview = await storage.previewImportedResults('large-event', [first]);
  await storage.applyImportedResults('large-event', [first], {}, firstPreview.snapshot);
  const second = await syntheticResult(assignment, 'device-two', 999, 'Hayır', 'attempt-two');
  const review = await storage.previewImportedResults('large-event', [second]);
  assert.equal(review.conflicts[0].reason, 'Başka cihazdan sonuç');
  await storage.applyImportedResults('large-event', [second], { 'two-devices:record-0': 'keep' }, review.snapshot);
  const merged = await storage.getProject('large-event');
  assert.equal(merged.contacts[0].data.answer, 'Evet');
  assert.deepEqual(merged.contacts[0].attempts.map((attempt) => attempt.id), ['attempt-one', 'attempt-two']);
  assert.equal(merged.assignments[0].sourceConflict, true);
  const restored = (await backupFormat.readBackupFile(await backupFormat.createBackupFile(merged))).project;
  assert.equal(restored.assignments[0].sourceConflict, true);
  assert.equal((await storage.previewImportedResults('large-event', [second])).skipped.length, 1);
});

test('incoming result survives restart and opening the same file twice creates one inbox item', async () => {
  const memory = memoryStorage();
  const files = new Map();
  const mocks = {
    '@react-native-async-storage/async-storage': memory,
    'react-native': { Platform: { OS: 'android' } },
    'expo-file-system/legacy': {
      documentDirectory: 'file:///docs/', EncodingType: { UTF8: 'utf8' },
      async writeAsStringAsync(uri, value) { files.set(uri, value); },
      async getInfoAsync(uri) { return { exists: files.has(uri) }; },
      async readAsStringAsync(uri) { return files.get(uri); },
      async deleteAsync(uri) { files.delete(uri); },
    },
  };
  const inbox = loadSource('src/utils/incomingResultStore.js', mocks);
  const coordinator = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await coordinator.createProject(distributionProject(1));
  const assignment = await coordinator.createAssignment('large-event', {
    assignmentId: 'inbox-task', volunteerName: 'A', count: 1, createdAt: '2026-10-08T08:01:00.000Z',
  });
  const packet = await syntheticResult(assignment, 'inbox-device', 1, 'Evet', 'inbox-attempt');
  const content = await resultFormat.createResultFile(packet.result);
  const project = await coordinator.getProject('large-event');
  assert.equal((await inbox.saveIncomingResult(packet, content, project)).duplicate, undefined);
  assert.equal((await inbox.saveIncomingResult(packet, content, project)).duplicate, true);
  const restarted = loadSource('src/utils/incomingResultStore.js', mocks);
  assert.equal((await restarted.listIncomingResults()).length, 1);
  assert.equal((await restarted.readIncomingResult(packet.sha256)).packet.sha256, packet.sha256);
  await restarted.markIncomingResultsProcessed([packet.sha256]);
  assert.equal((await restarted.listIncomingResults())[0].processed, true);
  await assert.rejects(restarted.saveIncomingResult(packet, content, { ...project, eventId: 'wrong' }), /eşleşmiyor/);
  await restarted.removeIncomingResult(packet.sha256);
  assert.equal((await restarted.listIncomingResults()).length, 0);
  assert.equal(files.size, 0);
});

test('incoming result file remains readable in web IndexedDB after reopening', async () => {
  const previousIndexedDB = global.indexedDB;
  global.indexedDB = require('fake-indexeddb').indexedDB;
  try {
    const memory = memoryStorage();
    const mocks = {
      '@react-native-async-storage/async-storage': memory,
      'react-native': { Platform: { OS: 'web' } },
      'expo-file-system/legacy': {},
    };
    const coordinator = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
    await coordinator.createProject(distributionProject(1));
    const assignment = await coordinator.createAssignment('large-event', {
      assignmentId: 'web-inbox-task', volunteerName: 'A', count: 1, createdAt: '2026-10-08T08:01:00.000Z',
    });
    const packet = await syntheticResult(assignment, 'web-inbox-device', 1, 'Evet', 'web-inbox-attempt');
    const content = await resultFormat.createResultFile(packet.result);
    const inbox = loadSource('src/utils/incomingResultStore.js', mocks);
    await inbox.saveIncomingResult(packet, content, await coordinator.getProject('large-event'));
    const reopened = loadSource('src/utils/incomingResultStore.js', mocks);
    assert.equal((await reopened.readIncomingResult(packet.sha256)).packet.sha256, packet.sha256);
    assert.equal((await reopened.saveIncomingResult(packet, content)).duplicate, true);
    await reopened.removeIncomingResult(packet.sha256);
    assert.equal((await reopened.listIncomingResults()).length, 0);
  } finally { global.indexedDB = previousIndexedDB; }
});

test('listless survey saves independent responses and round trips through backup and Excel', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  const fields = [
    { id: 'school', label: 'Okul numarası', type: 'text', options: [], order: 0, required: true },
    { id: 'attend', label: 'Geliyor musun?', type: 'select', options: ['Evet', 'Hayır'], order: 1, required: true },
  ];
  await storage.createProject({ id: 'survey-1', eventId: 'survey-1', name: 'Listesiz deneme', mode: 'survey',
    createdAt: '2026-10-14T12:00:00.000Z', currentIndex: 0, formVersion: 1,
    fields, formHistory: [{ version: 1, fields }], contacts: [] });
  await assert.rejects(storage.appendSurveyResponse('survey-1', { attend: 'Evet' }), /boş bırakılamaz/);
  await assert.rejects(storage.appendSurveyResponse('survey-1', { school: '123', attend: 'Belki' }), /geçersiz şık/);
  await Promise.all([
    storage.appendSurveyResponse('survey-1', { school: '123', attend: 'Evet' }),
    storage.appendSurveyResponse('survey-1', { school: '456', attend: 'Hayır' }),
  ]);
  const project = await storage.getProject('survey-1');
  assert.equal(project.contacts.length, 2);
  assert.equal(new Set(project.contacts.map((item) => item.recordId)).size, 2);
  assert.ok(project.contacts.every((item) => item.phone === '' && item.completedAt));
  const restored = (await backupFormat.readBackupFile(await backupFormat.createBackupFile(project))).project;
  assert.equal(restored.mode, 'survey');
  assert.equal(restored.contacts[1].data.attend, 'Hayır');
  const exports = loadSource('src/utils/exportUtils.js', { 'react-native': { Platform: { OS: 'web' } } });
  const wb = exports.buildWorkbook(restored);
  assert.deepEqual(wb.SheetNames, ['Anket Yanıtları']);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Anket Yanıtları'], { header: 1 });
  assert.deepEqual(rows[0], ['Yanıt zamanı', 'Yanıt kimliği', 'Okul numarası', 'Geliyor musun?']);
  assert.equal(rows[1][2], '123');
  assert.equal(rows[2][3], 'Hayır');
  await storage.updateProjectForm('survey-1', [fields[0],
    { ...fields[1], label: 'Etkinliğe katılıyor musun?' }]);
  const newAnswerField = (await storage.getProject('survey-1')).fields[1].id;
  await storage.appendSurveyResponse('survey-1', { school: '789', [newAnswerField]: 'Evet' });
  const revised = await storage.getProject('survey-1');
  assert.equal(revised.formVersion, 2);
  assert.equal(revised.contacts.length, 3);
  assert.equal(revised.contacts[0].data.attend, 'Evet');
  const revisedBackup = (await backupFormat.readBackupFile(await backupFormat.createBackupFile(revised))).project;
  assert.equal(revisedBackup.contacts.length, 3);
});

test('survey response metadata failure restores the previous answer list', async (t) => {
  t.mock.method(console, 'error', () => {});
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await storage.createProject({ id: 'rollback-survey', eventId: 'rollback-survey', name: 'Anket', mode: 'survey',
    fields: [{ id: 'answer', label: 'Cevap', type: 'text', options: [] }], contacts: [] });
  const originalSet = memory.setItem;
  memory.setItem = async (key, value) => {
    if (key === '@ays_projects') throw new Error('sentetik metadata hatası');
    return originalSet(key, value);
  };
  await assert.rejects(storage.appendSurveyResponse('rollback-survey', { answer: 'Evet' }),
    /Proje verisi kaydedilemedi/);
  memory.setItem = originalSet;
  const project = await storage.getProject('rollback-survey');
  assert.deepEqual(project.contacts, []);
  assert.equal(project.totalContacts, 0);
  assert.equal(project.completedContacts, 0);
});

test('listless survey template keeps questions without name or phone', async () => {
  const templates = loadSource('src/utils/templateFormat.js', { 'expo-crypto': cryptoMock });
  const fields = [{ id: 'q', label: 'Geliyor musun?', type: 'select', options: ['Evet', 'Hayır'] }];
  const content = await templates.createTemplateFile('Katılım', fields, [], 'name-phone', 'survey');
  const imported = await templates.readTemplateFile(content);
  assert.equal(imported.mode, 'survey');
  assert.deepEqual(imported.fields.map((field) => field.id), ['q']);
  await assert.rejects(templates.createTemplateFile('Hatalı', fields, [{ label: 'Telefon', role: 'phone' }],
    'name-phone', 'survey'), /kaynak sütun/);
});
