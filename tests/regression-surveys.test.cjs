const { test, assert, XLSX, unzipSync, loadSource, cryptoMock, sourceFiles, sourceWorkbookStore, sourceWorkbookArchive, canonicalModule, phoneUtils, newProjectFields, appSettingsModule, assignmentFormat, resultFormat, formValidation, resultMerge, surveyDraft, surveyResponses, surveyExport, callExport, assignmentPool, surveyTransferBackup, backupFormat, surveyFormFormat, surveyFormImport, surveyResultFormat, surveyMerge, projectReads, projectWrites, projectUpdateJournal, journalFiles, journalFileSystem, projectUpdateJournalStore, projectNames, memoryStorage, sampleProject, distributionProject, setJournalEvents } = require('./support/regressionHarness.cjs');

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
  assert.equal(project.responses.length, 2);
  assert.equal(new Set(project.responses.map((item) => item.id)).size, 2);
  assert.ok(project.responses.every((item) => item.submittedAt && !('phone' in item)));
  assert.equal(project.contacts, undefined);
  const restored = (await backupFormat.readBackupFile(await backupFormat.createBackupFile(project))).project;
  assert.equal(restored.mode, 'survey');
  assert.equal(restored.responses[1].data.attend, 'Hayır');
  const exports = loadSource('src/utils/exportUtils.js', { 'react-native': { Platform: { OS: 'web' } } });
  const wb = exports.buildWorkbook(project);
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
  assert.equal(revised.responses.length, 3);
  assert.equal(revised.responses[0].data.attend, 'Evet');
  const revisedBackup = (await backupFormat.readBackupFile(await backupFormat.createBackupFile(revised))).project;
  assert.equal(revisedBackup.responses.length, 3);
});

test('old survey answers keep their form rules and distinct Excel/CSV columns after revision', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  const fields = [
    { id: 'school', label: 'Okul numarası', type: 'text', options: [], required: true },
    { id: 'attend', label: 'Geliyor musun?', type: 'select', options: ['Evet', 'Hayır'], required: true },
    { id: 'note', label: 'Geliyor musun?', type: 'text', options: [], required: false },
  ];
  await storage.createProject({ id: 'versioned-survey', eventId: 'versioned-survey', name: 'Sürümlü anket',
    mode: 'survey', createdAt: '2026-10-15T00:00:00.000Z', currentIndex: 0,
    formVersion: 1, fields, formHistory: [{ version: 1, fields }], responses: [] });
  const first = await storage.appendSurveyResponse('versioned-survey', {
    school: '00123', attend: 'Evet', note: 'A; "B"',
  });
  await storage.updateProjectForm('versioned-survey', [fields[0],
    { ...fields[1], options: ['Evet', 'Hayır', 'Belki'] },
    { id: 'paid', label: 'Parayı ödedin mi?', type: 'text', options: [], required: true },
  ]);
  let project = await storage.getProject('versioned-survey');
  const newAttendId = project.fields[1].id;
  assert.notEqual(newAttendId, 'attend');
  assert.deepEqual(surveyResponses.surveyResponseFields(project, first).map((field) => field.id),
    ['school', 'attend', 'note']);
  await assert.rejects(storage.appendSurveyResponse(project.id, {
    school: '00456', [newAttendId]: 'Belki',
  }), /Parayı ödedin mi.*boş bırakılamaz/);
  await storage.changeSurveyResponse(project.id, first.id, first, 'edit', {
    school: '00123', attend: 'Hayır', note: 'A; "B"',
  });
  await storage.appendSurveyResponse(project.id, {
    school: '00456', [newAttendId]: 'Belki', paid: 'Evet',
  });
  project = await storage.getProject(project.id);
  const expectedHeader = ['Yanıt zamanı', 'Yanıt kimliği', 'Okul numarası', 'Geliyor musun?',
    'Parayı ödedin mi?', 'Geliyor musun? (Form 1)', 'Geliyor musun? (Form 1) [2]'];
  const exports = loadSource('src/utils/exportUtils.js', { 'react-native': { Platform: { OS: 'web' } } });
  const excel = XLSX.utils.sheet_to_json(exports.buildWorkbook(project).Sheets['Anket Yanıtları'], { header: 1 });
  assert.deepEqual(excel[0], expectedHeader);
  assert.deepEqual(excel[1].slice(2), ['00123', '', '', 'Hayır', 'A; "B"']);
  assert.deepEqual(excel[2].slice(2), ['00456', 'Belki', 'Evet', '', '']);
  const csv = exports.buildCSV(project);
  assert.equal(csv.split('\n')[0], '\uFEFF' + expectedHeader.map((label) => `"${label}"`).join(';'));
  assert.ok(csv.includes('"A; ""B"""'));
  assert.equal(csv.split('\n').length, excel.length);
  const restored = (await backupFormat.readBackupFile(await backupFormat.createBackupFile(project))).project;
  assert.deepEqual(surveyResponses.surveyResponseFields(restored, restored.responses[0]).map((field) => field.id),
    ['school', 'attend', 'note']);
  assert.equal(restored.responses[0].history[0].data.attend, 'Evet');
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
  assert.deepEqual(project.responses, []);
  assert.equal(memory.values.has('@ays_project_data_rollback-survey'), false);
  assert.equal(project.totalContacts, 0);
  assert.equal(project.completedContacts, 0);
});

test('legacy survey responses remain readable and migrate once when a new answer is saved', async () => {
  const memory = memoryStorage();
  const fields = [{ id: 'q', label: 'Soru', type: 'text', options: [] }];
  const old = { id: 'legacy-survey', eventId: 'legacy-survey', name: 'Eski anket', mode: 'survey',
    createdAt: '2026-10-14T00:00:00.000Z', fields, formHistory: [{ version: 1, fields }],
    formVersion: 1, currentIndex: 0, totalContacts: 1, completedContacts: 1 };
  const oldAnswer = { id: 'old-answer', recordId: 'old-answer', phone: '',
    data: { q: 'İlk' }, completed: true, completedAt: '2026-10-14T01:00:00.000Z' };
  memory.values.set('@ays_projects', JSON.stringify([old]));
  memory.values.set('@ays_project_data_legacy-survey', JSON.stringify([oldAnswer]));
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const before = await storage.getProject('legacy-survey');
  assert.equal(before.responses[0].submittedAt, oldAnswer.completedAt);
  assert.equal(before.contacts, undefined);
  assert.equal(memory.values.has('@ays_survey_responses_legacy-survey'), false);
  await storage.appendSurveyResponse('legacy-survey', { q: 'İkinci' });
  const after = await storage.getProject('legacy-survey');
  assert.deepEqual(after.responses.map((row) => row.data.q), ['İlk', 'İkinci']);
  assert.equal(memory.values.has('@ays_project_data_legacy-survey'), false);
  assert.equal(JSON.parse(memory.values.get('@ays_projects'))[0].responseStorage, 1);
  assert.equal((await backupFormat.readBackupFile(await backupFormat.createBackupFile(after)))
    .project.responses.length, 2);
});

test('interrupted legacy survey migration restores the old store and unsaved draft', async () => {
  const memory = memoryStorage();
  const fields = [{ id: 'q', label: 'Soru', type: 'text', options: [] }];
  const old = { id: 'legacy-crash', eventId: 'legacy-crash', name: 'Eski anket', mode: 'survey',
    createdAt: '2026-10-14T00:00:00.000Z', fields, formHistory: [{ version: 1, fields }],
    formVersion: 1, currentIndex: 0, totalContacts: 1, completedContacts: 1 };
  const oldAnswer = { id: 'old-answer', recordId: 'old-answer', phone: '',
    data: { q: 'İlk' }, completed: true, completedAt: '2026-10-14T01:00:00.000Z' };
  const projectsRaw = JSON.stringify([old]);
  const contactsRaw = JSON.stringify([oldAnswer]);
  const draftRaw = JSON.stringify({ formVersion: 1, data: { q: 'Yeni' } });
  memory.values.set('@ays_projects', projectsRaw);
  memory.values.set('@ays_project_data_legacy-crash', contactsRaw);
  memory.values.set('@ays_draft_legacy-crash', draftRaw);
  await projectUpdateJournalStore.writeProjectUpdateJournal(memory, JSON.stringify({ version: 1,
    projectId: 'legacy-crash', projectsRaw, contactsRaw, restoreResponses: true,
    responsesRaw: null, restoreDraft: true, draftRaw }));
  memory.values.set('@ays_survey_responses_legacy-crash', JSON.stringify([
    surveyResponses.fromLegacySurveyContact(oldAnswer),
    { id: 'new-answer', data: { q: 'Yeni' }, submittedAt: '2026-10-14T02:00:00.000Z' },
  ]));
  memory.values.delete('@ays_project_data_legacy-crash');
  memory.values.delete('@ays_draft_legacy-crash');
  memory.values.set('@ays_projects', JSON.stringify([{ ...old, responseStorage: 1,
    totalContacts: 2, completedContacts: 2 }]));
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const recovered = await storage.getProject('legacy-crash');
  assert.equal(memory.values.get('@ays_projects'), projectsRaw);
  assert.equal(memory.values.get('@ays_project_data_legacy-crash'), contactsRaw);
  assert.equal(memory.values.has('@ays_survey_responses_legacy-crash'), false);
  assert.equal(recovered.responses.length, 1);
  assert.deepEqual((await storage.loadSurveyDraft('legacy-crash')).data, { q: 'Yeni' });
  await storage.appendSurveyResponse('legacy-crash', { q: 'Yeni' });
  assert.equal((await storage.getProject('legacy-crash')).responses.length, 2);
});

test('survey backup replacement moves legacy data into responses and interruption restores both stores', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const fields = [{ id: 'q', label: 'Soru', type: 'text', options: [] }];
  const base = { id: 'replace-survey', eventId: 'replace-survey', name: 'Anket', mode: 'survey',
    createdAt: '2026-10-14T00:00:00.000Z', fields, currentIndex: 0, formVersion: 1,
    formHistory: [{ version: 1, fields }], contacts: [] };
  await storage.createProject(base);
  await storage.appendSurveyResponse(base.id, { q: 'Cihaz' });
  const safety = await storage.getProjectForBackup(base.id);
  const incoming = { ...safety, responses: [{ id: 'file-answer',
    data: { q: 'Dosya' }, submittedAt: '2026-10-14T01:00:00.000Z' }] };
  assert.equal(await storage.replaceProjectBackup(incoming, safety), 'replaced');
  assert.deepEqual((await storage.getProject(base.id)).responses.map((row) => row.data.q), ['Dosya']);
  assert.equal(memory.values.has('@ays_project_data_replace-survey'), false);

  const projectsRaw = memory.values.get('@ays_projects');
  const responsesRaw = memory.values.get('@ays_survey_responses_replace-survey');
  await memory.setItem('@ays_merge_journal', JSON.stringify({ projectId: base.id,
    projectsRaw, contactsRaw: null, responsesRaw, restoreResponses: true, restoreDraft: true, draftRaw: null }));
  await memory.setItem('@ays_project_data_replace-survey', '[]');
  await memory.setItem('@ays_survey_responses_replace-survey', '[]');
  const reopened = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  assert.deepEqual((await reopened.getProject(base.id)).responses.map((row) => row.data.q), ['Dosya']);
  assert.equal(memory.values.get('@ays_survey_responses_replace-survey'), responsesRaw);
  assert.equal(memory.values.has('@ays_project_data_replace-survey'), false);
});

test('survey answer journal is committed before answers and removed after metadata', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await storage.createProject({ id: 'ordered-survey', name: 'Anket', mode: 'survey',
    fields: [{ id: 'answer', label: 'Cevap', type: 'text', options: [] }], contacts: [] });
  const order = [];
  const originalSet = memory.setItem;
  memory.setItem = async (key, value) => { order.push(`set:${key}`); return originalSet(key, value); };
  setJournalEvents(order);
  try { await storage.appendSurveyResponse('ordered-survey', { answer: 'Evet' }); }
  finally { setJournalEvents(null); }
  assert.deepEqual(order, [
    'write:journal-temp', 'move:journal',
    'set:@ays_survey_responses_ordered-survey', 'set:@ays_projects', 'delete:journal',
  ]);
  assert.equal(await projectUpdateJournalStore.readProjectUpdateJournal(memory), null);
});

test('interrupted survey answer restores old responses and allows one clean retry', async () => {
  const memory = memoryStorage();
  const first = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await first.createProject({ id: 'interrupted-survey', name: 'Anket', mode: 'survey',
    fields: [{ id: 'answer', label: 'Cevap', type: 'text', options: [] }], contacts: [] });
  await first.appendSurveyResponse('interrupted-survey', { answer: 'İlk' });
  const projectsRaw = memory.values.get('@ays_projects');
  const contactsRaw = null;
  const responsesRaw = memory.values.get('@ays_survey_responses_interrupted-survey');
  await projectUpdateJournalStore.writeProjectUpdateJournal(memory, JSON.stringify({ version: 1,
    projectId: 'interrupted-survey', projectsRaw, contactsRaw, restoreResponses: true, responsesRaw }));
  memory.values.set('@ays_survey_responses_interrupted-survey', JSON.stringify([
    ...JSON.parse(responsesRaw), { id: 'unfinished', data: { answer: 'Yarım' }, submittedAt: new Date().toISOString() },
  ]));
  memory.values.set('@ays_projects', JSON.stringify([{ ...JSON.parse(projectsRaw)[0],
    totalContacts: 2, completedContacts: 2 }]));

  const reopened = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const recovered = await reopened.getProject('interrupted-survey');
  assert.equal(memory.values.get('@ays_projects'), projectsRaw);
  assert.equal(memory.values.get('@ays_survey_responses_interrupted-survey'), responsesRaw);
  assert.equal(recovered.responses.length, 1);
  assert.equal(recovered.responses[0].data.answer, 'İlk');
  assert.equal(await projectUpdateJournalStore.readProjectUpdateJournal(memory), null);
  await reopened.appendSurveyResponse('interrupted-survey', { answer: 'Yeni' });
  const retried = await reopened.getProject('interrupted-survey');
  assert.deepEqual(retried.responses.map((item) => item.data.answer), ['İlk', 'Yeni']);
  assert.equal(retried.completedContacts, 2);
});

test('survey draft survives restart and backup restore, then clears only after saving the answer', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const fields = [{ id: 'school', label: 'Okul numarası', type: 'text', options: [], required: true },
    { id: 'attend', label: 'Geliyor musun?', type: 'select', options: ['Evet', 'Hayır'] }];
  await storage.createProject({ id: 'draft-survey', eventId: 'draft-survey', name: 'Taslak deneme', mode: 'survey',
    createdAt: '2026-10-15T00:00:00.000Z', fields, contacts: [] });
  await storage.saveSurveyDraft('draft-survey', { school: '00123' });
  const reopened = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  assert.deepEqual((await reopened.loadSurveyDraft('draft-survey')).data, { school: '00123' });
  await assert.rejects(reopened.updateProjectForm('draft-survey', fields), /Açık bir anket taslağı/);

  const backup = await backupFormat.createBackupFile(await reopened.getProjectForBackup('draft-survey'));
  assert.equal(JSON.parse(backup).schemaVersion, 10);
  const parsed = await backupFormat.readBackupFile(backup);
  assert.deepEqual(parsed.project.surveyDraft.data, { school: '00123' });
  const restored = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await restored.restoreProjectBackup(parsed.project);
  assert.deepEqual((await restored.loadSurveyDraft('draft-survey')).data, { school: '00123' });
  assert.equal(await restored.restoreProjectBackup(parsed.project), 'already-present');
  await restored.appendSurveyResponse('draft-survey', { school: '00123', attend: 'Evet' });
  assert.equal(await restored.loadSurveyDraft('draft-survey'), null);
  const saved = await restored.getProject('draft-survey');
  assert.equal(saved.responses.length, 1);
  assert.equal(saved.responses[0].data.school, '00123');
});

test('survey backup recovers answers and draft after browser storage is cleared', async () => {
  const before = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memoryStorage(),
  });
  const fields = [{ id: 'q', label: 'Soru', type: 'text', options: [], required: true }];
  await before.createProject({ id: 'web-loss-survey', eventId: 'web-loss-survey', name: 'Deneme anketi',
    mode: 'survey', createdAt: '2026-10-15T00:00:00.000Z', currentIndex: 0, fields, responses: [] });
  const original = await before.appendSurveyResponse('web-loss-survey', { q: 'İlk' });
  await before.changeSurveyResponse('web-loss-survey', original.id, original, 'edit', { q: 'Düzeltildi' });
  await before.saveSurveyDraft('web-loss-survey', { q: 'Kaydedilmemiş' });
  const snapshot = await before.getProjectForBackup('web-loss-survey');
  const file = await backupFormat.createBackupFile(snapshot);
  await before.clearSurveyDraft('web-loss-survey');
  await before.appendSurveyResponse('web-loss-survey', { q: 'Yeni' });
  assert.equal(await before.markProjectBackupSaved('web-loss-survey', snapshot.backupEpoch || 0), false);
  assert.equal((await before.getProjectSummaries())[0].backupPending, true);
  const blankBrowser = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memoryStorage(),
  });
  assert.deepEqual(await blankBrowser.getProjectSummaries(), []);
  const parsed = await backupFormat.readBackupFile(file);
  assert.equal(await blankBrowser.restoreProjectBackup(parsed.project), 'restored');
  const recovered = await blankBrowser.getProject('web-loss-survey');
  assert.equal(recovered.responses[0].data.q, 'Düzeltildi');
  assert.equal(recovered.responses[0].history[0].data.q, 'İlk');
  assert.equal((await blankBrowser.loadSurveyDraft('web-loss-survey')).data.q, 'Kaydedilmemiş');
  assert.equal(await blankBrowser.restoreProjectBackup(parsed.project), 'already-present');
});

test('incoming survey answer remains in inbox across restart and duplicate opening', async () => {
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
    },
  };
  const result = { eventId: 'survey-inbox', eventName: 'Saha anketi', formVersion: 1,
    fields: [{ id: 'q', label: 'Soru', type: 'text', options: [] }],
    sourceId: 'volunteer-one', packetId: 'survey-file-one', revision: 1,
    exportedAt: '2026-10-15T00:00:00.000Z', responses: [{ id: 'answer-one',
      data: { q: 'Evet' }, submittedAt: '2026-10-15T00:00:00.000Z', formVersion: 1,
      history: [], deletedAt: null }] };
  const content = await surveyResultFormat.createSurveyResultFile(result);
  const packet = await surveyResultFormat.readSurveyResultFile(content);
  const inbox = loadSource('src/utils/incomingResultStore.js', mocks);
  assert.equal((await inbox.saveIncomingSurveyResponse(packet, content)).duplicate, undefined);
  assert.equal((await inbox.saveIncomingSurveyResponse(packet, content)).duplicate, true);
  const reopened = loadSource('src/utils/incomingResultStore.js', mocks);
  assert.equal((await reopened.listIncomingSurveyResponses()).length, 1);
  assert.equal((await reopened.readIncomingSurveyResponse(packet.sha256)).packet.result.responses[0].id, 'answer-one');
  await assert.rejects(reopened.saveIncomingSurveyResponse(packet, content,
    { id: 'wrong', mode: 'survey', eventId: 'other-event' }), /uyuşmuyor/);
  await reopened.markIncomingSurveyResponsesProcessed([packet.sha256]);
  assert.equal((await reopened.listIncomingSurveyResponses())[0].processed, true);
  assert.equal(files.size, 1);
});

test('survey form packet keeps event identity and reimport preserves volunteer answers', async () => {
  const fields = [{ id: 'question', label: 'Katılıyor musunuz?', type: 'text', options: [], order: 0, required: false }];
  const form = { eventId: 'shared-survey', eventName: 'Topluluk anketi',
    createdAt: '2026-10-15T00:00:00.000Z', formVersion: 1, fields,
    formHistory: [{ version: 1, fields }] };
  const content = await surveyFormFormat.createSurveyFormFile(form);
  const parsed = await surveyFormFormat.readSurveyFormFile(content);
  assert.equal(parsed.form.eventId, 'shared-survey');
  assert.deepEqual(parsed.form.fields, fields);
  const damaged = JSON.parse(content);
  damaged.payload.form.fields[0].label = 'Başka soru';
  await assert.rejects(surveyFormFormat.readSurveyFormFile(JSON.stringify(damaged)), /bozulmuş/);

  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memoryStorage(),
  });
  const first = await storage.importSurveyForm(parsed.form, parsed.sha256);
  assert.equal(first.state, 'imported');
  const response = await storage.appendSurveyResponse(first.projectId, { question: 'Evet' });
  const second = await storage.importSurveyForm(parsed.form, parsed.sha256);
  assert.deepEqual(second, { projectId: first.projectId, state: 'already-present' });
  const imported = await storage.getProject(first.projectId);
  assert.equal(imported.eventId, 'shared-survey');
  assert.equal(imported.formVersion, 1);
  assert.equal(imported.responses[0].id, response.id);
  assert.equal(imported.responses[0].data.question, 'Evet');
  await assert.rejects(storage.importSurveyForm({ ...parsed.form,
    fields: [{ ...fields[0], label: 'Değişik soru' }],
    formHistory: [{ version: 1, fields: [{ ...fields[0], label: 'Değişik soru' }] }] }, 'b'.repeat(64)),
  /farklı/);
  const backup = await backupFormat.createBackupFile(await storage.getProjectForBackup(first.projectId));
  assert.equal((await backupFormat.readBackupFile(backup)).project.responses[0].id, response.id);
});

test('two offline survey devices merge 10 + 7 answers once and preserve a visible conflict', async () => {
  const fields = [{ id: 'q', label: 'Cevap', type: 'text', options: [], order: 0, required: false }];
  const form = { eventId: 'multi-survey', eventName: 'Ortak anket',
    createdAt: '2026-10-15T00:00:00.000Z', formVersion: 1, fields,
    formHistory: [{ version: 1, fields }] };
  const digest = (await surveyFormFormat.readSurveyFormFile(
    await surveyFormFormat.createSurveyFormFile(form))).sha256;
  const coordinator = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memoryStorage(),
  });
  await coordinator.createProject({ id: form.eventId, eventId: form.eventId,
    mode: 'survey', name: form.eventName, createdAt: form.createdAt,
    currentIndex: 0, formVersion: 1, fields, formHistory: form.formHistory, responses: [] });
  const volunteers = [10, 7].map(() => loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memoryStorage(),
  }));
  const exports = [];
  let firstResponse;
  for (const [deviceIndex, volunteer] of volunteers.entries()) {
    const imported = await volunteer.importSurveyForm(form, digest);
    for (let i = 0; i < [10, 7][deviceIndex]; i += 1) {
      const response = await volunteer.appendSurveyResponse(imported.projectId, { q: `${deviceIndex}-${i}` });
      if (deviceIndex === 0 && i === 0) firstResponse = response;
    }
    const built = await volunteer.createSurveyResponsePacket(imported.projectId);
    assert.equal(await volunteer.markSurveyResponsesShared(imported.projectId, built.revision, built.epoch), true);
    exports.push({ volunteer, projectId: imported.projectId,
      packet: await surveyResultFormat.readSurveyResultFile(built.content) });
  }
  for (const item of [exports[1], exports[0]]) {
    const snapshot = await coordinator.getProjectForBackup(form.eventId);
    await backupFormat.createBackupFile(snapshot);
    assert.equal(await coordinator.markProjectBackupSaved(form.eventId, snapshot.backupEpoch || 0), true);
    const preview = await coordinator.previewIncomingSurveyResponses(form.eventId,
      item.packet.result, item.packet.sha256);
    assert.equal(preview.conflicts.length, 0);
    await coordinator.applyIncomingSurveyResponses(form.eventId, item.packet.result,
      item.packet.sha256, {}, preview.snapshot);
  }
  assert.equal((await coordinator.getProject(form.eventId)).responses.length, 17);
  const repeated = await coordinator.previewIncomingSurveyResponses(form.eventId,
    exports[0].packet.result, exports[0].packet.sha256);
  assert.equal(repeated.alreadyProcessed, true);
  assert.equal((await coordinator.getProject(form.eventId)).responses.length, 17);

  const changed = await exports[0].volunteer.changeSurveyResponse(exports[0].projectId,
    firstResponse.id, firstResponse, 'edit', { q: 'Düzeltildi' });
  assert.equal(changed.id, firstResponse.id);
  const update = await exports[0].volunteer.createSurveyResponsePacket(exports[0].projectId);
  const updatePacket = await surveyResultFormat.readSurveyResultFile(update.content);
  const conflict = await coordinator.previewIncomingSurveyResponses(form.eventId,
    updatePacket.result, updatePacket.sha256);
  assert.equal(conflict.added.length, 0);
  assert.equal(conflict.conflicts.length, 1);
  await assert.rejects(coordinator.applyIncomingSurveyResponses(form.eventId,
    updatePacket.result, updatePacket.sha256, {}, conflict.snapshot), /Birleştirmeden önce/);
  const before = await coordinator.getProjectForBackup(form.eventId);
  await backupFormat.createBackupFile(before);
  await coordinator.markProjectBackupSaved(form.eventId, before.backupEpoch || 0);
  await assert.rejects(coordinator.applyIncomingSurveyResponses(form.eventId,
    updatePacket.result, updatePacket.sha256, {}, conflict.snapshot), /karar/i);
  await coordinator.applyIncomingSurveyResponses(form.eventId, updatePacket.result,
    updatePacket.sha256, { [firstResponse.id]: 'keep' }, conflict.snapshot);
  const merged = await coordinator.getProject(form.eventId);
  assert.equal(merged.responses.length, 17);
  assert.equal(merged.responses.find((row) => row.id === firstResponse.id).data.q, '0-0');
  assert.equal(merged.surveyMergeConflicts[0].incoming.data.q, 'Düzeltildi');
  const fullBackup = await backupFormat.createBackupFile(await coordinator.getProjectForBackup(form.eventId));
  const recovered = await backupFormat.readBackupFile(fullBackup);
  assert.equal(recovered.project.surveyImportedPackets.length, 3);
  assert.equal(recovered.project.surveyMergeConflicts.length, 1);
});

test('survey response file rejects damage, wrong event, stale revision and missing form version', async () => {
  const fields = [{ id: 'q', label: 'Soru', type: 'text', options: [], order: 0, required: false }];
  const source = { eventId: 'survey-a', eventName: 'Anket A', formVersion: 1, fields,
    sourceId: 'source-a', packetId: 'packet-a', revision: 1,
    exportedAt: '2026-10-15T00:00:00.000Z', responses: [{ id: 'response-a',
      data: { q: 'Evet' }, submittedAt: '2026-10-15T00:00:00.000Z', formVersion: 1,
      history: [], deletedAt: null }] };
  const content = await surveyResultFormat.createSurveyResultFile(source);
  const parsed = await surveyResultFormat.readSurveyResultFile(content);
  const damaged = JSON.parse(content);
  damaged.payload.result.responses[0].data.q = 'Hayır';
  await assert.rejects(surveyResultFormat.readSurveyResultFile(JSON.stringify(damaged)), /bozulmuş/);
  const base = { id: 'survey-b', eventId: 'survey-b', mode: 'survey', role: 'coordinator',
    fields, formVersion: 1, formHistory: [{ version: 1, fields }], responses: [] };
  assert.throws(() => surveyMerge.previewSurveyMerge(base, parsed.result, parsed.sha256), /ait değil/);
  assert.throws(() => surveyMerge.previewSurveyMerge({ ...base, eventId: 'survey-a',
    formHistory: [{ version: 2, fields }] }, parsed.result, parsed.sha256), /sürümü/);
  const project = { ...base, eventId: 'survey-a', surveyImportedPackets: [{
    packetId: 'newer', digest: 'a'.repeat(64), sourceId: 'source-a', revision: 2,
    at: '2026-10-15T00:00:00.000Z' }] };
  assert.throws(() => surveyMerge.previewSurveyMerge(project, parsed.result, parsed.sha256), /daha yeni/);
  const oldBackup = JSON.parse(await backupFormat.createBackupFile({
    ...base, id: 'survey-a', eventId: 'survey-a', name: 'Anket A',
    createdAt: '2026-10-15T00:00:00.000Z', currentIndex: 0,
  }));
  oldBackup.schemaVersion = 9;
  delete oldBackup.payload.project.surveyImportedPackets;
  delete oldBackup.payload.project.surveyMergeConflicts;
  delete oldBackup.payload.project.surveyDataEpoch;
  delete oldBackup.payload.project.surveyExportedEpoch;
  const { integrity, ...body } = oldBackup;
  oldBackup.integrity.sha256 = await cryptoMock.digestStringAsync('SHA-256', canonicalModule.canonicalJson(body));
  assert.equal((await backupFormat.readBackupFile(JSON.stringify(oldBackup))).project.mode, 'survey');
});

test('failed survey merge restores both answer sidecar and packet history', async () => {
  const memory = memoryStorage();
  const originalSet = memory.setItem.bind(memory);
  let failMetadata = false;
  memory.setItem = async (key, value) => {
    if (key === '@ays_projects' && failMetadata) { failMetadata = false; throw new Error('disk full'); }
    return originalSet(key, value);
  };
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const fields = [{ id: 'q', label: 'Soru', type: 'text', options: [], order: 0, required: false }];
  await storage.createProject({ id: 'merge-crash', eventId: 'merge-crash', mode: 'survey',
    name: 'Anket', createdAt: '2026-10-15T00:00:00.000Z', currentIndex: 0,
    fields, formVersion: 1, formHistory: [{ version: 1, fields }], responses: [] });
  const file = await surveyResultFormat.createSurveyResultFile({ eventId: 'merge-crash',
    eventName: 'Anket', formVersion: 1, fields, sourceId: 'device-a', packetId: 'packet-a',
    revision: 1, exportedAt: '2026-10-15T00:00:00.000Z',
    responses: [{ id: 'answer-a', data: { q: 'Evet' },
      submittedAt: '2026-10-15T00:00:00.000Z', formVersion: 1, history: [], deletedAt: null }] });
  const packet = await surveyResultFormat.readSurveyResultFile(file);
  const snapshot = await storage.getProjectForBackup('merge-crash');
  await backupFormat.createBackupFile(snapshot);
  await storage.markProjectBackupSaved('merge-crash', snapshot.backupEpoch || 0);
  const preview = await storage.previewIncomingSurveyResponses('merge-crash', packet.result, packet.sha256);
  failMetadata = true;
  await assert.rejects(storage.applyIncomingSurveyResponses('merge-crash', packet.result,
    packet.sha256, {}, preview.snapshot), /kaydedilemedi/);
  const reopened = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const project = await reopened.getProject('merge-crash');
  assert.equal(project.responses.length, 0);
  assert.equal(project.surveyImportedPackets?.length || 0, 0);
  const retry = await reopened.previewIncomingSurveyResponses('merge-crash', packet.result, packet.sha256);
  assert.equal((await reopened.applyIncomingSurveyResponses('merge-crash', packet.result,
    packet.sha256, {}, retry.snapshot)).added, 1);
});

test('a changed survey draft invalidates the older deletion backup', async () => {
  const storage = loadSource('src/utils/storage.js', {
    '@react-native-async-storage/async-storage': memoryStorage(),
  });
  await storage.createProject({ id: 'draft-delete', eventId: 'draft-delete', name: 'Anket', mode: 'survey',
    createdAt: '2026-10-15T00:00:00.000Z',
    fields: [{ id: 'q', label: 'Soru', type: 'text', options: [] }], contacts: [] });
  await storage.saveSurveyDraft('draft-delete', { q: 'Önceki' });
  const oldBackup = await storage.getProjectForBackup('draft-delete');
  await storage.saveSurveyDraft('draft-delete', { q: 'Yeni' });
  await assert.rejects(storage.deleteProject('draft-delete', oldBackup), /değişti/);
  assert.deepEqual((await storage.loadSurveyDraft('draft-delete')).data, { q: 'Yeni' });
});

test('failed or interrupted survey answer restores its unsaved draft', async (t) => {
  t.mock.method(console, 'error', () => {});
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await storage.createProject({ id: 'draft-rollback', eventId: 'draft-rollback', name: 'Anket', mode: 'survey',
    fields: [{ id: 'q', label: 'Soru', type: 'text', options: [] }], contacts: [] });
  await storage.saveSurveyDraft('draft-rollback', { q: 'Cevap' });
  const originalSet = memory.setItem;
  memory.setItem = async (key, value) => {
    if (key === '@ays_projects') throw new Error('sentetik metadata hatası');
    return originalSet(key, value);
  };
  await assert.rejects(storage.appendSurveyResponse('draft-rollback', { q: 'Cevap' }), /Proje verisi kaydedilemedi/);
  memory.setItem = originalSet;
  assert.deepEqual((await storage.loadSurveyDraft('draft-rollback')).data, { q: 'Cevap' });
  assert.equal((await storage.getProject('draft-rollback')).responses.length, 0);

  const projectsRaw = memory.values.get('@ays_projects');
  const contactsRaw = null;
  const responsesRaw = memory.values.get('@ays_survey_responses_draft-rollback');
  const draftRaw = memory.values.get('@ays_draft_draft-rollback');
  await projectUpdateJournalStore.writeProjectUpdateJournal(memory, JSON.stringify({ version: 1,
    projectId: 'draft-rollback', projectsRaw, contactsRaw, restoreDraft: true, draftRaw,
    restoreResponses: true, responsesRaw }));
  memory.values.set('@ays_survey_responses_draft-rollback', JSON.stringify([
    { id: 'unfinished', data: { q: 'Cevap' }, submittedAt: new Date().toISOString() },
  ]));
  memory.values.set('@ays_projects', JSON.stringify([{ ...JSON.parse(projectsRaw)[0],
    totalContacts: 1, completedContacts: 1 }]));
  memory.values.delete('@ays_draft_draft-rollback');
  const reopened = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  assert.equal((await reopened.getProject('draft-rollback')).responses.length, 0);
  assert.deepEqual((await reopened.loadSurveyDraft('draft-rollback')).data, { q: 'Cevap' });
  assert.equal(await projectUpdateJournalStore.readProjectUpdateJournal(memory), null);
});

test('old survey backups remain readable without a draft and invalid drafts are rejected', async () => {
  const fields = [{ id: 'q', label: 'Soru', type: 'text', options: [] }];
  const project = { id: 'old-survey', eventId: 'old-survey', name: 'Eski anket', mode: 'survey',
    createdAt: '2026-10-15T00:00:00.000Z', fields, contacts: [] };
  const oldFile = JSON.parse(await backupFormat.createBackupFile(project));
  oldFile.schemaVersion = 7;
  oldFile.payload.project.contacts = oldFile.payload.project.responses.map(surveyResponses.toLegacySurveyContact);
  delete oldFile.payload.project.responses;
  delete oldFile.payload.project.surveyDraft;
  const { integrity, ...body } = oldFile;
  oldFile.integrity.sha256 = await cryptoMock.digestStringAsync('SHA-256', canonicalModule.canonicalJson(body));
  assert.equal((await backupFormat.readBackupFile(JSON.stringify(oldFile))).project.surveyDraft, null);
  assert.deepEqual((await backupFormat.readBackupFile(JSON.stringify(oldFile))).project.responses, []);
  await assert.rejects(backupFormat.createBackupFile({ ...project,
    surveyDraft: { formVersion: 1, data: { unknown: 'Kaybolmasın' } } }), /taslağındaki cevaplar/);
});

test('survey correction history and reversible deletion survive v9 backup and restore', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const fields = [{ id: 'q', label: 'Katılıyor musun?', type: 'select',
    options: ['Evet', 'Hayır'], required: true }];
  await storage.createProject({ id: 'history-survey', eventId: 'history-survey', name: 'Anket', mode: 'survey',
    createdAt: '2026-10-15T00:00:00.000Z', currentIndex: 0, formVersion: 1,
    fields, formHistory: [{ version: 1, fields }], responses: [] });
  const first = await storage.appendSurveyResponse('history-survey', { q: 'Evet' });
  const corrected = await storage.changeSurveyResponse('history-survey', first.id, first, 'edit', { q: 'Hayır' });
  assert.equal(corrected.id, first.id);
  assert.equal(corrected.history[0].data.q, 'Evet');
  await assert.rejects(storage.changeSurveyResponse('history-survey', first.id, first, 'delete'), /değişti/);
  await assert.rejects(storage.changeSurveyResponse('history-survey', first.id, corrected, 'edit', { q: 'Belki' }),
    /geçersiz şık/);
  const deleted = await storage.changeSurveyResponse('history-survey', first.id, corrected, 'delete');
  assert.ok(deleted.deletedAt);
  assert.deepEqual(deleted.history.map((entry) => entry.action), ['edit', 'delete']);
  assert.equal((await storage.getProjectSummaries())[0].totalContacts, 0);
  const exports = loadSource('src/utils/exportUtils.js', { 'react-native': { Platform: { OS: 'web' } } });
  const wb = exports.buildWorkbook(await storage.getProjectForExport('history-survey'));
  assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['Anket Yanıtları'], { header: 1 }).length, 1);
  const file = await backupFormat.createBackupFile(await storage.getProjectForBackup('history-survey'));
  assert.equal(JSON.parse(file).schemaVersion, 10);
  assert.equal(JSON.parse(file).payload.project.responses[0].history.length, 2);
  const parsed = await backupFormat.readBackupFile(file);
  const restored = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  assert.equal(await restored.restoreProjectBackup(parsed.project), 'restored');
  const saved = (await restored.getProject('history-survey')).responses[0];
  assert.equal(saved.data.q, 'Hayır');
  assert.ok(saved.deletedAt);
  assert.equal(saved.history[0].data.q, 'Evet');
  const active = await restored.changeSurveyResponse('history-survey', saved.id, saved, 'restore');
  assert.equal(active.deletedAt, null);
  assert.deepEqual(active.history.map((entry) => entry.action), ['edit', 'delete', 'restore']);
  assert.equal((await restored.getProjectSummaries())[0].totalContacts, 1);
});

test('new survey counts only active responses and rejects damaged local history', async () => {
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  const fields = [{ id: 'q', label: 'Soru', type: 'text', options: [] }];
  const response = { id: 'r1', data: { q: 'Cevap' }, submittedAt: '2026-10-15T00:00:00.000Z',
    deletedAt: '2026-10-15T00:01:00.000Z', history: [{ action: 'delete', at: '2026-10-15T00:01:00.000Z' }] };
  await storage.createProject({ id: 'deleted-new-survey', eventId: 'deleted-new-survey', name: 'Anket',
    mode: 'survey', createdAt: '2026-10-15T00:00:00.000Z', currentIndex: 0, fields,
    responses: [response] });
  assert.equal((await storage.getProjectSummaries())[0].totalContacts, 0);
  assert.equal((await storage.getProject('deleted-new-survey')).responses[0].history[0].action, 'delete');
  assert.throws(() => surveyResponses.parseSurveyResponses(JSON.stringify([{ ...response,
    history: [{ action: 'edit', at: '2026-10-15T00:02:00.000Z', data: { q: 3 } }] }])), /geçersiz/);
});

test('v8 survey backup with answers opens and its next correction migrates without loss', async () => {
  const fields = [{ id: 'q', label: 'Soru', type: 'text', options: [] }];
  const project = { id: 'v8-answer', eventId: 'v8-answer', name: 'Eski', mode: 'survey',
    createdAt: '2026-10-15T00:00:00.000Z', currentIndex: 0, fields,
    contacts: [{ id: 'old-r', recordId: 'old-r', phone: '', data: { q: 'Önceki' },
      completed: true, completedAt: '2026-10-15T01:00:00.000Z' }] };
  const v9 = JSON.parse(await backupFormat.createBackupFile(project));
  v9.schemaVersion = 8;
  v9.payload.project.contacts = v9.payload.project.responses.map(surveyResponses.toLegacySurveyContact);
  delete v9.payload.project.responses;
  const { integrity, ...body } = v9;
  v9.integrity.sha256 = await cryptoMock.digestStringAsync('SHA-256', canonicalModule.canonicalJson(body));
  const parsed = await backupFormat.readBackupFile(JSON.stringify(v9));
  assert.equal(parsed.project.responses[0].data.q, 'Önceki');
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memoryStorage() });
  await storage.restoreProjectBackup(parsed.project);
  const old = (await storage.getProject('v8-answer')).responses[0];
  const changed = await storage.changeSurveyResponse('v8-answer', old.id, old, 'edit', { q: 'Güncel' });
  assert.equal(changed.history[0].data.q, 'Önceki');
  assert.equal((await storage.getProject('v8-answer')).responses[0].data.q, 'Güncel');
});

test('interrupted survey edit restores the previous answer and history', async () => {
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const fields = [{ id: 'q', label: 'Soru', type: 'text', options: [] }];
  await storage.createProject({ id: 'edit-crash', eventId: 'edit-crash', name: 'Anket', mode: 'survey',
    createdAt: '2026-10-15T00:00:00.000Z', currentIndex: 0, fields, responses: [] });
  const response = await storage.appendSurveyResponse('edit-crash', { q: 'Önceki' });
  const projectsRaw = memory.values.get('@ays_projects');
  const responsesRaw = memory.values.get('@ays_survey_responses_edit-crash');
  await projectUpdateJournalStore.writeProjectUpdateJournal(memory, JSON.stringify({ version: 1,
    projectId: 'edit-crash', projectsRaw, contactsRaw: null, restoreResponses: true, responsesRaw }));
  memory.values.set('@ays_survey_responses_edit-crash', JSON.stringify([{ ...response,
    data: { q: 'Yarım' }, history: [{ action: 'edit', at: '2026-10-15T02:00:00.000Z', data: response.data }] }]));
  const reopened = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const recovered = (await reopened.getProject('edit-crash')).responses[0];
  assert.equal(recovered.data.q, 'Önceki');
  assert.deepEqual(recovered.history, []);
  assert.equal(memory.values.get('@ays_survey_responses_edit-crash'), responsesRaw);
  assert.equal(await projectUpdateJournalStore.readProjectUpdateJournal(memory), null);
});

test('failed survey deletion leaves the answer visible and does not add a history entry', async (t) => {
  t.mock.method(console, 'error', () => {});
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  const fields = [{ id: 'q', label: 'Soru', type: 'text', options: [] }];
  await storage.createProject({ id: 'delete-fail', eventId: 'delete-fail', name: 'Anket', mode: 'survey',
    createdAt: '2026-10-15T00:00:00.000Z', currentIndex: 0, fields, responses: [] });
  const response = await storage.appendSurveyResponse('delete-fail', { q: 'Sakla' });
  const originalRaw = memory.values.get('@ays_survey_responses_delete-fail');
  const originalSet = memory.setItem;
  memory.setItem = async (key, value) => {
    if (key === '@ays_projects') throw new Error('sentetik metadata hatası');
    return originalSet(key, value);
  };
  await assert.rejects(storage.changeSurveyResponse('delete-fail', response.id, response, 'delete'),
    /Proje verisi kaydedilemedi/);
  memory.setItem = originalSet;
  assert.equal(memory.values.get('@ays_survey_responses_delete-fail'), originalRaw);
  const saved = (await storage.getProject('delete-fail')).responses[0];
  assert.equal(saved.deletedAt, null);
  assert.deepEqual(saved.history, []);
  assert.equal((await storage.getProjectSummaries())[0].totalContacts, 1);
});

test('interrupted new backup restore removes its orphan sidecar and draft', async () => {
  const memory = memoryStorage();
  const projectsRaw = '[]';
  memory.values.set('@ays_projects', projectsRaw);
  memory.values.set('@ays_merge_journal', JSON.stringify({ kind: 'new-restore',
    projectId: 'orphan-survey', projectsRaw, sourceRef: null }));
  memory.values.set('@ays_project_data_orphan-survey', '[]');
  memory.values.set('@ays_draft_orphan-survey', '{"formVersion":1,"data":{"q":"Cevap"}}');
  const reopened = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  assert.deepEqual(await reopened.getAllProjects(), []);
  assert.equal(memory.values.has('@ays_project_data_orphan-survey'), false);
  assert.equal(memory.values.has('@ays_draft_orphan-survey'), false);
  assert.equal(memory.values.has('@ays_merge_journal'), false);
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
