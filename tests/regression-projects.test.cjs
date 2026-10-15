const { test, assert, XLSX, unzipSync, loadSource, cryptoMock, sourceFiles, sourceWorkbookStore, sourceWorkbookArchive, canonicalModule, phoneUtils, newProjectFields, appSettingsModule, assignmentFormat, resultFormat, formValidation, resultMerge, surveyDraft, surveyResponses, surveyExport, callExport, assignmentPool, surveyTransferBackup, backupFormat, surveyFormFormat, surveyFormImport, surveyResultFormat, surveyMerge, projectReads, projectWrites, projectUpdateJournal, journalFiles, journalFileSystem, projectUpdateJournalStore, projectNames, memoryStorage, sampleProject, distributionProject, setJournalEvents } = require('./support/regressionHarness.cjs');

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

test('failed project cleanup reports the leftover local file', async (t) => {
  t.mock.method(console, 'error', () => {});
  const memory = memoryStorage();
  const originalSet = memory.setItem;
  memory.setItem = async (key, value) => key === '@ays_projects'
    ? Promise.reject(new Error('sentetik metadata hatası')) : originalSet(key, value);
  const originalRemove = memory.removeItem;
  memory.removeItem = async (key) => key === '@ays_project_data_failed-cleanup'
    ? Promise.reject(new Error('sentetik temizleme hatası')) : originalRemove(key);
  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  await assert.rejects(storage.createProject({ id: 'failed-cleanup', name: 'Deneme',
    contacts: [{ id: 'one' }] }), /yerel dosyalar temizlenemedi: sentetik temizleme hatası/);
  assert.equal(memory.values.has('@ays_project_data_failed-cleanup'), true);
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
  setJournalEvents(order);
  try {
    await storage.updateProject('ordered-update', { contacts: [
      { id: 'one', phone: '05000000005', completed: true, data: {} },
    ] });
  } finally { setJournalEvents(null); }
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

test('call draft storage failures are returned so the screen can show a retry', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const originalSet = memory.setItem;
  const originalGet = memory.getItem;
  const originalRemove = memory.removeItem;
  memory.setItem = async (key, value) => key === '@ays_draft_failure'
    ? Promise.reject(new Error('sentetik yazma hatası')) : originalSet(key, value);
  await assert.rejects(storage.saveDraft('failure', { answer: 'Sakla' }), /sentetik yazma hatası/);
  memory.setItem = originalSet;
  await storage.saveDraft('failure', { answer: 'Sakla' });
  memory.getItem = async (key) => key === '@ays_draft_failure'
    ? Promise.reject(new Error('sentetik okuma hatası')) : originalGet(key);
  await assert.rejects(storage.loadDraft('failure'), /sentetik okuma hatası/);
  memory.getItem = originalGet;
  memory.removeItem = async (key) => key === '@ays_draft_failure'
    ? Promise.reject(new Error('sentetik silme hatası')) : originalRemove(key);
  await assert.rejects(storage.clearDraft('failure'), /sentetik silme hatası/);
  memory.removeItem = originalRemove;
  assert.deepEqual(await storage.loadDraft('failure'), { answer: 'Sakla' });
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

test('project deletion reports leftover local files after the saved project is removed', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await storage.createProject(distributionProject(1));
  const snapshot = await storage.getProjectForBackup('large-event');
  const remove = memory.removeItem;
  memory.removeItem = async (key) => key === '@ays_project_data_large-event'
    ? Promise.reject(new Error('sentetik dosya temizleme hatası')) : remove(key);
  const result = await storage.deleteProject('large-event', snapshot);
  assert.deepEqual(result.cleanupWarnings, ['sentetik dosya temizleme hatası']);
  assert.equal((await storage.getAllProjects()).length, 0);
  memory.removeItem = remove;
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
  unsupported.schemaVersion = 11;
  await assert.rejects(backupFormat.readBackupFile(JSON.stringify(unsupported)), /sürümü desteklenmiyor/);
  const duplicate = sampleProject();
  duplicate.contacts.push({ ...duplicate.contacts[0] });
  await assert.rejects(backupFormat.createBackupFile(duplicate), /yinelenen/);
});

test('call source template maps matching headers and falls back on invalid phone mapping', () => {
  const sourcePreview = loadSource('src/utils/sourcePreview.js');
  const sourceTemplate = loadSource('src/features/calls/callSourceTemplate.js', {
    '../../utils/sourcePreview': sourcePreview, '../../utils/phoneUtils': phoneUtils,
  });
  const rows = [['Telefon', 'İsim', 'Durum'], ['0555 000 10 01', 'Örnek Kişi', 'Evet']];
  const template = { sourceColumns: [
    { label: 'Telefon', role: 'phone' }, { label: 'İsim', role: 'name' },
    { label: 'Durum', role: 'field' },
  ] };
  const mapped = sourceTemplate.prepareCallSource(rows, 'liste.xlsx', true, template);
  assert.deepEqual(mapped.columns.map((item) => item.role), ['phone', 'name', 'field']);
  const invalid = { sourceColumns: [
    { label: 'Telefon', role: 'ignore' }, { label: 'İsim', role: 'name' },
  ] };
  assert.deepEqual(sourceTemplate.prepareCallSource(rows, 'liste.xlsx', true, invalid),
    sourcePreview.prepareSource(rows, 'liste.xlsx', true));
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
  let marked = 0;
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
    './storage': { getProjectForBackup: async () => sampleProject(),
      markProjectBackupSaved: async () => { marked += 1; return true; } },
    './webFileTransfer': {},
  });
  assert.equal((await backup.saveEventBackup('event-1', 'Gorev')).saved, true);
  assert.equal((await backup.saveEventBackup('event-1', 'Sonuc')).saved, true);
  assert.equal((await backup.saveEventBackup('event-1', 'Silmeden-once',
    { deferSavedMark: true })).saved, true);
  assert.equal(permissions, 1);
  assert.equal(written.length, 3);
  assert.equal(marked, 2);
  for (const item of written) assert.equal((await backupFormat.readBackupFile(item.content)).project.id, 'event-1');
});

test('backup delivery reports cancellations and failures without claiming a saved file', async () => {
  const delivery = loadSource('src/utils/backupDelivery.js');
  const fileSystem = {
    EncodingType: { UTF8: 'utf8' }, cacheDirectory: 'file:///cache/',
    StorageAccessFramework: {
      async requestDirectoryPermissionsAsync() { return { granted: false }; },
      async createFileAsync() { return 'content://backup/test.ays'; },
    },
    async writeAsStringAsync() { throw new Error('disk full'); },
  };
  const adapters = { platform: 'android', fileSystem, sharing: {},
    downloadWebFile: () => {}, shareOrDownloadWebFile: async () => 'cancelled' };
  assert.equal(await delivery.deliverBackupFile('{}', 'test.ays', 'save', adapters), 'cancelled');
  fileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync = async () =>
    ({ granted: true, directoryUri: 'content://backup' });
  await assert.rejects(delivery.deliverBackupFile('{}', 'test.ays', 'save', adapters), /disk full/);
  fileSystem.writeAsStringAsync = async () => {};
  assert.equal(await delivery.deliverBackupFile('{}', 'test.ays', 'save', adapters), 'saved');
  assert.equal(await delivery.deliverBackupFile('{}', 'test.ays', 'share', {
    ...adapters, sharing: { isAvailableAsync: async () => true, shareAsync: async () => {} },
  }), 'confirm-file');
  const web = { ...adapters, platform: 'web' };
  assert.equal(await delivery.deliverBackupFile('{}', 'test.ays', 'share', web), 'cancelled');
  assert.equal(await delivery.deliverBackupFile('{}', 'test.ays', 'save', web), 'confirm-file');
  await assert.rejects(delivery.deliverBackupFile('{}', 'test.ays', 'save', {
    ...web, downloadWebFile: () => { throw new Error('download blocked'); },
  }), /download blocked/);
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

test('failed backup recovery keeps its journal and tells the user to reopen the app', async (t) => {
  t.mock.method(console, 'error', () => {});
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memory,
  });
  const project = (await backupFormat.readBackupFile(await backupFormat.createBackupFile(sampleProject()))).project;
  const originalSet = memory.setItem;
  memory.setItem = async (key, value) => key === '@ays_projects'
    ? Promise.reject(new Error('sentetik depolama kesintisi')) : originalSet(key, value);
  await assert.rejects(storage.restoreProjectBackup(project), /Önceki veri geri yüklenemedi.*Kurtarma kaydı saklandı/);
  assert.equal(memory.values.has('@ays_merge_journal'), true);
  memory.setItem = originalSet;
  assert.deepEqual(await storage.getAllProjects(), []);
  assert.equal(memory.values.has('@ays_merge_journal'), false);
  assert.equal(memory.values.has('@ays_project_data_event-1'), false);
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

