const { test, assert, XLSX, unzipSync, loadSource, cryptoMock, sourceFiles, sourceWorkbookStore, sourceWorkbookArchive, canonicalModule, phoneUtils, newProjectFields, appSettingsModule, assignmentFormat, resultFormat, formValidation, resultMerge, surveyDraft, surveyResponses, surveyExport, callExport, assignmentPool, surveyTransferBackup, backupFormat, surveyFormFormat, surveyFormImport, surveyResultFormat, surveyMerge, projectReads, projectWrites, projectUpdateJournal, journalFiles, journalFileSystem, projectUpdateJournalStore, projectNames, memoryStorage, sampleProject, distributionProject, setJournalEvents } = require('./support/regressionHarness.cjs');

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

test('failed task reservation does not remove people from the pool', async (t) => {
  t.mock.method(console, 'error', () => {});
  const memory = memoryStorage();
  const storage = loadSource('src/utils/storage.js', { '@react-native-async-storage/async-storage': memory });
  await storage.createProject(distributionProject(2));
  const originalSet = memory.setItem;
  memory.setItem = async (key, value) => key === '@ays_projects'
    ? Promise.reject(new Error('sentetik metadata hatası')) : originalSet(key, value);
  await assert.rejects(storage.createAssignment('large-event', {
    assignmentId: 'failed-task', volunteerName: 'A', count: 1,
    createdAt: '2026-10-08T08:01:00.000Z',
  }), /Proje verisi kaydedilemedi/);
  memory.setItem = originalSet;
  const project = await storage.getProject('large-event');
  assert.equal(project.assignments?.length || 0, 0);
  assert.equal(storage.getAvailableContacts(project).length, 2);
  const retry = await storage.createAssignment('large-event', {
    assignmentId: 'failed-task', volunteerName: 'A', count: 1,
    createdAt: '2026-10-08T08:01:00.000Z',
  });
  assert.equal(retry.contacts.length, 1);
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

test('call Excel and CSV share column order and keep leading zero identifiers as text', () => {
  const exports = loadSource('src/utils/exportUtils.js', { 'react-native': { Platform: { OS: 'web' } } });
  const project = sampleProject();
  project.fields.push({ id: 'school', label: 'Okul numarası', type: 'text', options: [], order: 1 });
  project.contacts[0].phone = '05321234567';
  project.contacts[0].data.school = '001234';
  const sheet = exports.buildWorkbook(project).Sheets['Güncel Durum'];
  const header = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
  const csv = exports.buildCSV(project).replace(/^\uFEFF/, '').split('\n');
  assert.deepEqual(csv[0].split(';').map((value) => value.slice(1, -1)), header.slice(0, -1));
  assert.equal(sheet.B2.t, 's');
  assert.equal(sheet.B2.v, '05321234567');
  assert.equal(sheet.C2.v, '001234');
  assert.match(csv[1], /"05321234567";"001234"/);
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

