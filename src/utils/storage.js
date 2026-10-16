/**
 * AsyncStorage CRUD işlemleri
 * Tüm proje verilerini yerel olarak yönetir.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifySourceWorkbook } from './sourceWorkbookArchive';
import { writeSourceWorkbook, readSourceWorkbook, removeSourceWorkbook } from './sourceWorkbookStore';
import { readProjectMetadata, readProjectSummaries, readProjectContacts } from '../data/projectStore/projectReads';
import { writeNewProject, writeSurveyResponse, writeSurveyResponseChange,
  writeUpdatedProject } from '../data/projectStore/projectWrites';
import { recoverProjectUpdateJournal } from '../data/projectStore/projectUpdateJournal';
import { readProjectUpdateJournal, writeProjectUpdateJournal,
  removeProjectUpdateJournal } from '../data/projectStore/projectUpdateJournalStore';
import { normalizeSurveyDraft } from '../features/surveys/surveyDraft';
import { fromLegacySurveyContact,
  parseSurveyResponses } from '../features/surveys/surveyResponses';
export { getAvailableContacts, getReturnedContacts, getCallbackCandidates } from '../features/calls/pool/assignmentPool';
import { writeCallbackAssignment, writeNewAssignment, writeAssignmentStatus,
  writeTransferredContacts } from '../data/projectStore/assignment/assignmentWrites';
import { prepareCoordinatorAnswer } from '../data/projectStore/assignment/coordinatorAnswer';
import { createBackupOperations } from '../data/projectStore/backup/projectBackups';
import { createSurveyTransferOperations } from '../data/projectStore/survey-transfer/surveyTransfer';
import { createCallTransferOperations } from '../data/projectStore/call-transfer/callTransfer';
import { createProjectLifecycleOperations } from '../data/projectStore/lifecycle/projectLifecycle';
import * as Crypto from 'expo-crypto';

const PROJECTS_KEY = '@ays_projects';
const PROJECT_DATA_PREFIX = '@ays_project_data_';
const RESPONSES_PREFIX = '@ays_survey_responses_';
const DRAFT_KEY = '@ays_draft_';
const DIAGNOSTIC_KEY = '@ays_last_diagnostic';
const TEMPLATES_KEY = '@ays_templates';
const MERGE_JOURNAL_KEY = '@ays_merge_journal';
let mergeInProgress = false;
let recoveryPromise = null;
let projectSidecarWriteInProgress = false;
let projectUpdateRecoveryPromise = null;

async function storeAttachedSource(projectId, source) {
  if (!source) return null;
  const verified = await verifySourceWorkbook(source);
  const projectDigest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, projectId);
  const meta = { ref: `src-${projectDigest}-${verified.sha256}`, name: verified.name,
    format: verified.format, byteLength: verified.byteLength, sha256: verified.sha256 };
  await writeSourceWorkbook(meta.ref, verified.base64);
  return meta;
}

async function loadAttachedSource(meta) {
  if (!meta) return null;
  const base64 = await readSourceWorkbook(meta.ref);
  if (!base64) throw new Error('Orijinal Excel eki cihazda bulunamadı.');
  return verifySourceWorkbook({ name: meta.name, format: meta.format,
    byteLength: meta.byteLength, sha256: meta.sha256, base64 });
}

async function recoverPendingMerge() {
  if (mergeInProgress) return;
  if (recoveryPromise) return recoveryPromise;
  recoveryPromise = (async () => {
    const raw = await AsyncStorage.getItem(MERGE_JOURNAL_KEY);
    if (!raw) return;
    const journal = JSON.parse(raw);
    if (journal.kind === 'new-restore') {
      if (!journal.projectId || typeof journal.projectsRaw !== 'string') {
        throw new Error('Geri yükleme kurtarma kaydı bozuk.');
      }
      await AsyncStorage.removeItem(PROJECT_DATA_PREFIX + journal.projectId);
      await AsyncStorage.removeItem(RESPONSES_PREFIX + journal.projectId);
      await AsyncStorage.removeItem(DRAFT_KEY + journal.projectId);
      await AsyncStorage.setItem(PROJECTS_KEY, journal.projectsRaw);
      if (journal.sourceRef) await removeSourceWorkbook(journal.sourceRef);
      await AsyncStorage.removeItem(MERGE_JOURNAL_KEY);
      return;
    }
    if (!journal.projectId || typeof journal.projectsRaw !== 'string' ||
        !(typeof journal.contactsRaw === 'string' || (journal.restoreResponses && journal.contactsRaw === null))) {
      throw new Error('Birleştirme kurtarma kaydı bozuk.');
    }
    if (journal.contactsRaw === null) await AsyncStorage.removeItem(PROJECT_DATA_PREFIX + journal.projectId);
    else await AsyncStorage.setItem(PROJECT_DATA_PREFIX + journal.projectId, journal.contactsRaw);
    if (journal.restoreResponses) {
      if (typeof journal.responsesRaw === 'string') {
        await AsyncStorage.setItem(RESPONSES_PREFIX + journal.projectId, journal.responsesRaw);
      } else {
        await AsyncStorage.removeItem(RESPONSES_PREFIX + journal.projectId);
      }
    }
    await AsyncStorage.setItem(PROJECTS_KEY, journal.projectsRaw);
    if (journal.restoreDraft) {
      if (typeof journal.draftRaw === 'string') {
        await AsyncStorage.setItem(DRAFT_KEY + journal.projectId, journal.draftRaw);
      } else {
        await AsyncStorage.removeItem(DRAFT_KEY + journal.projectId);
      }
    }
    await AsyncStorage.removeItem(MERGE_JOURNAL_KEY);
  })();
  try { await recoveryPromise; } finally { recoveryPromise = null; }
}

async function recoverMergeAfterFailure(error, operation) {
  try { await recoverPendingMerge(); }
  catch (recoveryError) {
    throw new Error(`${operation} başarısız oldu: ${error.message || error}. Önceki veri geri yüklenemedi: ${recoveryError.message || recoveryError}. Kurtarma kaydı saklandı; uygulamayı yeniden açın.`);
  }
  throw error;
}

async function recoverPendingProjectUpdate(force = false) {
  if (projectSidecarWriteInProgress && !force) return;
  if (projectUpdateRecoveryPromise) return projectUpdateRecoveryPromise;
  projectUpdateRecoveryPromise = recoverProjectUpdateJournal({
    readJournal: () => readProjectUpdateJournal(AsyncStorage),
    readProjects: () => AsyncStorage.getItem(PROJECTS_KEY),
    readContacts: (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id),
    readResponses: (id) => AsyncStorage.getItem(RESPONSES_PREFIX + id),
    readDraft: (id) => AsyncStorage.getItem(DRAFT_KEY + id),
    setProjects: (raw) => AsyncStorage.setItem(PROJECTS_KEY, raw),
    setContacts: (id, raw) => AsyncStorage.setItem(PROJECT_DATA_PREFIX + id, raw),
    removeContacts: (id) => AsyncStorage.removeItem(PROJECT_DATA_PREFIX + id),
    setResponses: (id, raw) => AsyncStorage.setItem(RESPONSES_PREFIX + id, raw),
    removeResponses: (id) => AsyncStorage.removeItem(RESPONSES_PREFIX + id),
    setDraft: (id, raw) => AsyncStorage.setItem(DRAFT_KEY + id, raw),
    removeDraft: (id) => AsyncStorage.removeItem(DRAFT_KEY + id),
    removeJournal: () => removeProjectUpdateJournal(AsyncStorage),
  });
  try { await projectUpdateRecoveryPromise; } finally { projectUpdateRecoveryPromise = null; }
}

const sidecarUpdateJournal = {
  beginUpdate: async (projectId, contactsRaw, restoreDraft = false, responsesRaw = undefined) => {
    const projectsRaw = await AsyncStorage.getItem(PROJECTS_KEY);
    if (projectsRaw == null) throw new Error('Proje bilgileri bulunamadı; kayıt durduruldu.');
    const draftRaw = restoreDraft ? await AsyncStorage.getItem(DRAFT_KEY + projectId) : undefined;
    await writeProjectUpdateJournal(AsyncStorage, JSON.stringify({
      version: 1, projectId, projectsRaw, contactsRaw, restoreDraft, draftRaw,
      restoreResponses: responsesRaw !== undefined, responsesRaw,
    }));
  },
  finishUpdate: () => removeProjectUpdateJournal(AsyncStorage),
  recoverUpdate: () => recoverPendingProjectUpdate(true),
};

export async function getLastDiagnostic() {
  const value = await AsyncStorage.getItem(DIAGNOSTIC_KEY);
  return value ? JSON.parse(value) : null;
}

export async function saveLastDiagnostic(report) {
  await AsyncStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify(report));
}

export async function deleteLastDiagnostic() {
  await AsyncStorage.removeItem(DIAGNOSTIC_KEY);
}

export async function getTemplates() {
  const value = await AsyncStorage.getItem(TEMPLATES_KEY);
  return value ? JSON.parse(value) : [];
}

export async function saveTemplate(template) {
  return enqueueWrite(async () => {
    const templates = await getTemplates();
    const existing = templates.find((item) => item.id === template.id ||
      (item.name === template.name && (item.pasteMode || 'name-phone') === (template.pasteMode || 'name-phone') &&
        JSON.stringify(item.fields) === JSON.stringify(template.fields) &&
        JSON.stringify(item.sourceColumns || []) === JSON.stringify(template.sourceColumns || [])));
    if (existing) return existing;
    const next = [template, ...templates];
    await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
    return template;
  });
}

// Eşzamanlı okuma-yazma yarışlarını önlemek için basit bir Mutex (kuyruk)
let writeQueue = Promise.resolve();
const enqueueWrite = (task) => {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
};

/**
 * Tüm projelerin metadatalarını getirir
 */
export async function getAllProjects() {
  try {
    await recoverPendingMerge();
    await recoverPendingProjectUpdate();
    return await readProjectMetadata(() => AsyncStorage.getItem(PROJECTS_KEY));
  } catch (e) {
    console.error('Projeler yüklenemedi:', e);
    throw new Error('Depolama hatası: Projeler yüklenemedi.');
  }
}

/**
 * Ana ekran için küçük proje özetlerini getirir. Önceki sürümlerde tamamlanan
 * kişi sayısı metadata'ya yazılmadığından, bu kayıtlar için kişi verisini okur.
 */
export async function getProjectSummaries() {
  await waitForPendingWrites();
  const projects = await getAllProjects();
  return readProjectSummaries(projects, (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id),
    (id) => AsyncStorage.getItem(RESPONSES_PREFIX + id));
}

/**
 * Tüm projelerin metadatalarını kaydeder
 */
export async function saveAllProjects(projects) {
  try {
    await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('Projeler kaydedilemedi:', e);
    throw new Error('Depolama hatası: Proje verisi kaydedilemedi.');
  }
}

/**
 * Tek bir projeyi ID ile getirir (detaylı verisiyle)
 */
export async function getProject(projectId) {
  const projects = await getAllProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return null;

  try {
    return await readProjectContacts(project,
      (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id),
      (id) => AsyncStorage.getItem(RESPONSES_PREFIX + id),
      fromLegacySurveyContact, parseSurveyResponses);
  } catch (e) {
    console.error('Proje detayları yüklenemedi:', e);
    throw new Error(`Depolama hatası: ${e.message || 'Proje verisi yüklenemedi.'}`);
  }
}

async function readSurveyDraft(projectId, project) {
  const raw = await AsyncStorage.getItem(DRAFT_KEY + projectId);
  return raw ? normalizeSurveyDraft(JSON.parse(raw), project.fields, project.formVersion || 1) : null;
}

/** Listesiz anketin henüz kaydedilmemiş cevabı ayrı tutulur. Yazma hatası ekrana iletilir. */
export async function saveSurveyDraft(projectId, data) {
  return enqueueWrite(async () => {
    const project = (await getAllProjects()).find((item) => item.id === projectId);
    if (!project || project.mode !== 'survey') throw new Error('Anket bulunamadı.');
    const draft = normalizeSurveyDraft({ formVersion: project.formVersion || 1, data },
      project.fields, project.formVersion || 1);
    if (draft) await AsyncStorage.setItem(DRAFT_KEY + projectId, JSON.stringify(draft));
    else await AsyncStorage.removeItem(DRAFT_KEY + projectId);
    return draft;
  });
}

export async function loadSurveyDraft(projectId, project) {
  await waitForPendingWrites();
  const current = project || await getProject(projectId);
  if (!current || current.mode !== 'survey') throw new Error('Anket bulunamadı.');
  return readSurveyDraft(projectId, current);
}

export async function clearSurveyDraft(projectId) {
  return enqueueWrite(() => AsyncStorage.removeItem(DRAFT_KEY + projectId));
}

/**
 * Yeni proje oluşturur
 */
export async function createProject(project) {
  return enqueueWrite(() => writeNewProject(project, {
    loadProjects: getAllProjects,
    getContacts: (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id),
    getResponses: (id) => AsyncStorage.getItem(RESPONSES_PREFIX + id),
    setContacts: (id, data) => AsyncStorage.setItem(PROJECT_DATA_PREFIX + id, data),
    setResponses: (id, data) => AsyncStorage.setItem(RESPONSES_PREFIX + id, data),
    removeContacts: (id) => AsyncStorage.removeItem(PROJECT_DATA_PREFIX + id),
    removeResponses: (id) => AsyncStorage.removeItem(RESPONSES_PREFIX + id),
    saveProjects: saveAllProjects,
    saveSource: storeAttachedSource,
    removeSource: removeSourceWorkbook,
  }));
}

const surveyTransferOperations = createSurveyTransferOperations({
  AsyncStorage, Crypto,
  keys: { PROJECT_DATA_PREFIX, RESPONSES_PREFIX },
  enqueueWrite, getAllProjects, saveAllProjects, getProject, waitForPendingWrites,
  sidecarUpdateJournal,
});
export const importSurveyForm = surveyTransferOperations.importSurveyForm;
export const createSurveyResponsePacket = surveyTransferOperations.createSurveyResponsePacket;
export const markSurveyResponsesShared = surveyTransferOperations.markSurveyResponsesShared;
export const hasUnsharedSurveyResponses = surveyTransferOperations.hasUnsharedSurveyResponses;
export const previewIncomingSurveyResponses = surveyTransferOperations.previewIncomingSurveyResponses;
export const applyIncomingSurveyResponses = surveyTransferOperations.applyIncomingSurveyResponses;

const backupOperations = createBackupOperations({
  AsyncStorage,
  keys: { PROJECTS_KEY, PROJECT_DATA_PREFIX, RESPONSES_PREFIX, DRAFT_KEY, MERGE_JOURNAL_KEY },
  enqueueWrite, getProject, getAllProjects, saveAllProjects, readSurveyDraft, loadDraft,
  loadAttachedSource, storeAttachedSource, removeSourceWorkbook,
  recoverPendingMerge, recoverMergeAfterFailure,
  setMergeInProgress: (value) => { mergeInProgress = value; },
});
export const getProjectForBackup = backupOperations.getProjectForBackup;
export const getProjectForExport = (projectId) => getProjectForBackup(projectId, true);
export const markProjectBackupSaved = backupOperations.markProjectBackupSaved;
export const restoreProjectBackup = backupOperations.restoreProjectBackup;
export const replaceProjectBackup = backupOperations.replaceProjectBackup;

/**
 * Projeyi günceller
 */
export async function updateProject(projectId, updates) {
  return enqueueWrite(async () => {
    await recoverPendingProjectUpdate();
    projectSidecarWriteInProgress = true;
    try {
      return await writeUpdatedProject(projectId, updates, {
        loadProjects: getAllProjects,
        getContacts: (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id),
        setContacts: (id, data) => AsyncStorage.setItem(PROJECT_DATA_PREFIX + id, data),
        saveProjects: saveAllProjects,
        ...sidecarUpdateJournal,
      });
    } finally { projectSidecarWriteInProgress = false; }
  });
}

/** Listesiz ankette her doldurma yeni bir kayıt oluşturur; yazılar sıraya alınır. */
export async function appendSurveyResponse(projectId, input) {
  return enqueueWrite(async () => {
    await recoverPendingProjectUpdate();
    projectSidecarWriteInProgress = true;
    try {
      return await writeSurveyResponse(projectId, input, {
        loadProjects: getAllProjects,
        getContacts: (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id),
        getResponses: (id) => AsyncStorage.getItem(RESPONSES_PREFIX + id),
        setResponses: (id, data) => AsyncStorage.setItem(RESPONSES_PREFIX + id, data),
        removeContacts: (id) => AsyncStorage.removeItem(PROJECT_DATA_PREFIX + id),
        saveProjects: saveAllProjects,
        clearDraft: (id) => AsyncStorage.removeItem(DRAFT_KEY + id),
        createId: Crypto.randomUUID,
        now: () => new Date().toISOString(),
        fromLegacy: fromLegacySurveyContact,
        parseResponses: parseSurveyResponses,
        ...sidecarUpdateJournal,
      });
    } finally { projectSidecarWriteInProgress = false; }
  });
}

/** Yanıt düzeltme, geri alınabilir silme ve geri getirme için tek sıralı yazma yolu. */
export async function changeSurveyResponse(projectId, responseId, expected, action, input = null) {
  return enqueueWrite(async () => {
    await recoverPendingProjectUpdate();
    projectSidecarWriteInProgress = true;
    try {
      return await writeSurveyResponseChange(projectId, responseId, expected, action, input, {
        loadProjects: getAllProjects,
        getContacts: (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id),
        getResponses: (id) => AsyncStorage.getItem(RESPONSES_PREFIX + id),
        setResponses: (id, data) => AsyncStorage.setItem(RESPONSES_PREFIX + id, data),
        removeContacts: (id) => AsyncStorage.removeItem(PROJECT_DATA_PREFIX + id),
        saveProjects: saveAllProjects,
        fromLegacy: fromLegacySurveyContact,
        parseResponses: parseSurveyResponses,
        now: () => new Date().toISOString(),
        ...sidecarUpdateJournal,
      });
    } finally { projectSidecarWriteInProgress = false; }
  });
}

const assignmentWritePorts = {
  loadProjects: getAllProjects,
  getContacts: (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id),
  saveProjects: saveAllProjects,
  now: () => new Date().toISOString(),
};

export async function createCallbackAssignment(projectId, input) {
  return enqueueWrite(() => writeCallbackAssignment(projectId, input, assignmentWritePorts));
}

export async function createAssignment(projectId, input) {
  return enqueueWrite(() => writeNewAssignment(projectId, input, assignmentWritePorts));
}

export async function setAssignmentStatus(projectId, assignmentId, nextStatus, allowSentCancellation = false) {
  return enqueueWrite(() => writeAssignmentStatus(projectId, assignmentId, nextStatus,
    allowSentCancellation, assignmentWritePorts));
}

export async function transferAssignmentContacts(projectId, oldAssignmentId, recordIds, nextInput = null) {
  return enqueueWrite(() => writeTransferredContacts(projectId, oldAssignmentId, recordIds,
    nextInput, assignmentWritePorts));
}

/** Koordinatörün kendine ayırdığı kişi için cevabı doğrudan ana etkinliğe yazar. */
export async function saveCoordinatorTaskContact(projectId, assignmentId, recordId, input) {
  return enqueueWrite(async () => {
    await recoverPendingMerge();
    const projectsRaw = await AsyncStorage.getItem(PROJECTS_KEY);
    const contactsRaw = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
    if (!projectsRaw || !contactsRaw) throw new Error('Ana etkinlik bulunamadı.');
    const { projects, contacts, updated, assignmentStatus } = prepareCoordinatorAnswer(
      projectsRaw, contactsRaw, projectId, assignmentId, recordId, input,
      { createId: () => Crypto.randomUUID(), now: () => new Date().toISOString() });
    await AsyncStorage.setItem(MERGE_JOURNAL_KEY, JSON.stringify({ projectId, projectsRaw, contactsRaw }));
    mergeInProgress = true;
    try {
      await AsyncStorage.setItem(PROJECT_DATA_PREFIX + projectId, JSON.stringify(contacts));
      await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      await AsyncStorage.removeItem(MERGE_JOURNAL_KEY);
    } catch (error) {
      mergeInProgress = false;
      await recoverMergeAfterFailure(error, 'Kendi görevim cevabı');
    } finally { mergeInProgress = false; }
    return { contact: updated, assignmentStatus };
  });
}

/** Aynı dosya ikinci kez açıldığında gönüllünün mevcut cevaplarını korur. */
const callTransferOperations = createCallTransferOperations({
  AsyncStorage, Crypto,
  keys: { PROJECTS_KEY, PROJECT_DATA_PREFIX, MERGE_JOURNAL_KEY },
  enqueueWrite, getAllProjects, saveAllProjects, getProject, waitForPendingWrites,
  recoverMergeAfterFailure, setMergeInProgress: (value) => { mergeInProgress = value; },
});
export const importVolunteerAssignment = callTransferOperations.importVolunteerAssignment;
export const createVolunteerResultFile = callTransferOperations.createVolunteerResultFile;
export const markVolunteerResultExported = callTransferOperations.markVolunteerResultExported;
export const hasUnexportedVolunteerResult = callTransferOperations.hasUnexportedVolunteerResult;
export const previewImportedResults = callTransferOperations.previewImportedResults;
export const applyImportedResults = callTransferOperations.applyImportedResults;

const projectLifecycleOperations = createProjectLifecycleOperations({
  AsyncStorage,
  keys: { PROJECT_DATA_PREFIX, RESPONSES_PREFIX, DRAFT_KEY },
  enqueueWrite, getAllProjects, saveAllProjects, getProject,
  loadDraft, readSurveyDraft, loadAttachedSource, removeSourceWorkbook,
});
export const lockProjectForm = projectLifecycleOperations.lockProjectForm;
export const updateProjectForm = projectLifecycleOperations.updateProjectForm;
export const deleteProject = projectLifecycleOperations.deleteProject;

/**
 * Geçici form verisini (draft) kaydeder
 */
export async function saveDraft(projectId, draftData) {
  return enqueueWrite(async () => {
    await AsyncStorage.setItem(DRAFT_KEY + projectId, JSON.stringify(draftData));
  });
}

/**
 * Geçici form verisini yükler
 */
export async function loadDraft(projectId) {
  const data = await AsyncStorage.getItem(DRAFT_KEY + projectId);
  return data ? JSON.parse(data) : null;
}

/**
 * Geçici form verisini temizler
 */
export async function clearDraft(projectId) {
  return enqueueWrite(async () => {
    await AsyncStorage.removeItem(DRAFT_KEY + projectId);
  });
}

export function waitForPendingWrites() {
  // Önceki bir yazma hata vermiş olsa bile yeni okuma/yeniden denemeyi engelleme.
  return writeQueue.catch(() => {});
}
