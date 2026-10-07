const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');
const nodeCrypto = require('node:crypto');

function loadSource(relativePath, mocks = {}) {
  const file = path.join(__dirname, '..', relativePath);
  const { code } = babel.transformFileSync(file, {
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const module = { exports: {} };
  const localRequire = (name) => mocks[name] || (name === './backupFormat' ? backupFormat :
    name === './phoneUtils' ? phoneUtils : name === './canonicalJson' ? canonicalModule :
      name === './assignmentFormat' ? assignmentFormat : require(name));
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}

const cryptoMock = {
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm, value) => nodeCrypto.createHash('sha256').update(value, 'utf8').digest('hex'),
  randomUUID: () => nodeCrypto.randomUUID(),
};
const canonicalModule = loadSource('src/utils/canonicalJson.js');
const phoneUtils = loadSource('src/utils/phoneUtils.js');
const assignmentFormat = loadSource('src/utils/assignmentFormat.js', { 'expo-crypto': cryptoMock });
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
  await storage.createProject({ id: 'p', name: 'Deneme', contacts: [] });
  const draft = storage.saveDraft('p', { contactIndex: 0, formData: { name: 'Ali' } });
  const clear = storage.clearDraft('p');
  await Promise.all([draft, clear, storage.waitForPendingWrites()]);
  assert.equal(await storage.loadDraft('p'), null);
  await Promise.race([
    storage.deleteProject('p'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('deleteProject stuck')), 2000)),
  ]);
  assert.equal((await storage.getAllProjects()).length, 0);
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
  unsupported.schemaVersion = 4;
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

test('form version increases before calls and locks after the first completed call', async () => {
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
  await assert.rejects(storage.updateProjectForm(project.id, project.fields), /Arama başladıktan sonra/);
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
  await assert.rejects(storage.createAssignment('large-event', {
    assignmentId: 'too-many', volunteerName: 'D', count: 1924, createdAt: '2026-10-08T08:01:00.000Z',
  }), /1923/);
  await storage.setAssignmentStatus('large-event', 'task-A', 'sent');
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
