/**
 * AsyncStorage CRUD işlemleri
 * Tüm proje verilerini yerel olarak yönetir.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeBackupProject, sameBackupProject } from './backupFormat';
import { createAssignmentFile, normalizeAssignment } from './assignmentFormat';
import { canonicalJson } from './canonicalJson';
import { createResultFile, normalizeResult } from './resultFormat';
import { applyPreview, previewResultMerge } from './resultMerge';
import { verifySourceWorkbook } from './sourceWorkbookArchive';
import { writeSourceWorkbook, readSourceWorkbook, removeSourceWorkbook } from './sourceWorkbookStore';
import { readProjectMetadata, readProjectSummaries, readProjectContacts } from '../data/projectStore/projectReads';
import { writeNewProject, writeSurveyResponse, writeSurveyResponseChange,
  writeUpdatedProject } from '../data/projectStore/projectWrites';
import { recoverProjectUpdateJournal } from '../data/projectStore/projectUpdateJournal';
import { readProjectUpdateJournal, writeProjectUpdateJournal,
  removeProjectUpdateJournal } from '../data/projectStore/projectUpdateJournalStore';
import { normalizeSurveyDraft } from '../features/surveys/surveyDraft';
import { activeSurveyResponses, fromLegacySurveyContact,
  parseSurveyResponses } from '../features/surveys/surveyResponses';
export { getAvailableContacts, getReturnedContacts, getCallbackCandidates } from '../features/calls/pool/assignmentPool';
import { writeCallbackAssignment, writeNewAssignment, writeAssignmentStatus,
  writeTransferredContacts } from '../data/projectStore/assignment/assignmentWrites';
import { prepareCoordinatorAnswer } from '../data/projectStore/assignment/coordinatorAnswer';
import { writeImportedSurveyForm } from '../features/survey-transfer/surveyFormImport';
import { createSurveyResultFile } from '../features/survey-transfer/surveyResultFormat';
import { previewSurveyMerge, applySurveyMerge } from '../features/survey-transfer/surveyMerge';
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

/** Ana anketten gelen soruları aynı kimlikle yerel, boş bir gönüllü anketi olarak açar. */
export async function importSurveyForm(form, digest) {
  return enqueueWrite(() => writeImportedSurveyForm(form, digest, {
    loadProjects: getAllProjects,
    getResponses: (id) => AsyncStorage.getItem(RESPONSES_PREFIX + id),
    setResponses: (id, raw) => AsyncStorage.setItem(RESPONSES_PREFIX + id, raw),
    removeResponses: (id) => AsyncStorage.removeItem(RESPONSES_PREFIX + id),
    saveProjects: saveAllProjects, createId: Crypto.randomUUID,
  }));
}

/** Gönüllünün tüm anket cevaplarını kalıcı kimlikleriyle yeniden gönderilebilir dosyaya koyar. */
export async function createSurveyResponsePacket(projectId) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const project = projects.find((item) => item.id === projectId && item.mode === 'survey' && item.role === 'volunteer');
    if (!project) throw new Error('Bana gelen anket bulunamadı.');
    const raw = await AsyncStorage.getItem(RESPONSES_PREFIX + projectId);
    if (raw === null) throw new Error('Anket cevap dosyası bulunamadı. Paylaşım durduruldu.');
    const responses = parseSurveyResponses(raw);
    if (!responses.length) throw new Error('Paylaşılacak kaydedilmiş cevap yok.');
    const revision = (project.resultRevision || 0) + 1;
    const sourceId = project.resultSourceId || Crypto.randomUUID();
    const content = await createSurveyResultFile({ eventId: project.eventId,
      eventName: project.name, formVersion: project.formVersion, fields: project.fields,
      sourceId, packetId: Crypto.randomUUID(), revision,
      exportedAt: new Date().toISOString(), responses });
    project.resultSourceId = sourceId;
    project.resultRevision = revision;
    await saveAllProjects(projects);
    return { content, revision, epoch: project.surveyDataEpoch || 0, count: activeSurveyResponses(responses).length };
  });
}

/** Paylaşım menüsü değil, kullanıcının dosya kontrolü hatırlatmayı kapatır. */
export async function markSurveyResponsesShared(projectId, revision, expectedEpoch) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const project = projects.find((item) => item.id === projectId && item.mode === 'survey' && item.role === 'volunteer');
    if (!project) throw new Error('Bana gelen anket bulunamadı.');
    if (project.resultRevision !== revision || (project.surveyDataEpoch || 0) !== expectedEpoch) return false;
    project.surveyExportedEpoch = expectedEpoch;
    await saveAllProjects(projects);
    return true;
  });
}

export function hasUnsharedSurveyResponses(project) {
  return project?.mode === 'survey' && project.role === 'volunteer' &&
    (project.surveyDataEpoch || 0) > (project.surveyExportedEpoch || 0);
}

/** Cevap paketi uygulanmadan önce koordinatöre yeni/aynı/çakışan kayıtları gösterir. */
export async function previewIncomingSurveyResponses(projectId, packet, digest) {
  await waitForPendingWrites();
  const project = await getProject(projectId);
  if (!project) throw new Error('Ana anket bulunamadı.');
  return previewSurveyMerge(project, packet, digest);
}

/** Önizleme ve dış yedek güncelse, yanıt ile metadata aynı kurtarma günlüğünde yazılır. */
export async function applyIncomingSurveyResponses(projectId, packet, digest, decisions, expectedSnapshot) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const index = projects.findIndex((item) => item.id === projectId);
    const meta = projects[index];
    if (!meta || meta.mode !== 'survey' || meta.role === 'volunteer') throw new Error('Ana anket bulunamadı.');
    if (meta.backupSavedEpoch == null || meta.backupSavedEpoch !== (meta.backupEpoch || 0)) {
      throw new Error('Birleştirmeden önce ana anketin güncel .ays yedeğini alın ve dosyayı kontrol edin.');
    }
    const project = await getProject(projectId);
    const preview = previewSurveyMerge(project, packet, digest);
    if (preview.snapshot !== expectedSnapshot) throw new Error('Anket önizlemeden sonra değişti. Dosyayı yeniden inceleyin.');
    if (preview.alreadyProcessed) return { status: 'already-processed', added: 0, conflicts: 0 };
    const next = applySurveyMerge(project, preview, decisions, new Date().toISOString());
    const contactsRaw = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
    const responsesRaw = await AsyncStorage.getItem(RESPONSES_PREFIX + projectId);
    if (meta.responseStorage === 1 && responsesRaw === null) throw new Error('Ana anketin yanıt dosyası eksik.');
    const { responses, ...nextMeta } = next;
    delete nextMeta.contacts;
    nextMeta.responseStorage = 1;
    nextMeta.totalContacts = activeSurveyResponses(responses).length;
    nextMeta.completedContacts = nextMeta.totalContacts;
    nextMeta.formLocked = true;
    nextMeta.backupPending = true;
    nextMeta.backupEpoch = (meta.backupEpoch || 0) + 1;
    projects[index] = nextMeta;
    try {
      await sidecarUpdateJournal.beginUpdate(projectId, contactsRaw, false, responsesRaw);
      await AsyncStorage.setItem(RESPONSES_PREFIX + projectId, JSON.stringify(responses));
      if (contactsRaw !== null) await AsyncStorage.removeItem(PROJECT_DATA_PREFIX + projectId);
      await saveAllProjects(projects);
      await sidecarUpdateJournal.finishUpdate();
    } catch (error) {
      try { await sidecarUpdateJournal.recoverUpdate(); }
      catch (rollbackError) {
        throw new Error(`Anket birleştirmesi başarısız oldu ve önceki veri geri yüklenemedi: ${rollbackError.message}`);
      }
      throw error;
    }
    return { status: 'merged', added: preview.added.length, conflicts: preview.conflicts.length };
  });
}

/** Bekleyen form taslağını da katarak dışa aktarılabilir tam görüntüyü döndürür. */
export async function getProjectForBackup(projectId, allowMissingSource = false) {
  return enqueueWrite(async () => {
    const project = await getProject(projectId);
    if (!project) throw new Error('Yedeklenecek proje bulunamadı.');
    if (project.mode === 'survey') project.surveyDraft = await readSurveyDraft(projectId, project);
    const draft = await loadDraft(projectId);
    if (project.mode !== 'survey' && draft && Number.isInteger(draft.contactIndex) &&
        draft.contactIndex >= 0 && draft.contactIndex < project.contacts.length &&
        draft.formData && typeof draft.formData === 'object' && !Array.isArray(draft.formData)) {
      project.contacts = project.contacts.map((contact, index) =>
        index === draft.contactIndex ? { ...contact, data: { ...draft.formData } } : contact
      );
    }
    try {
      project.sourceWorkbook = await loadAttachedSource(project.sourceWorkbookMeta);
    } catch (error) {
      if (!allowMissingSource) throw error;
      project.sourceWorkbook = null;
      project.sourceWorkbookMissing = true;
    }
    return project;
  });
}

/** Nihai Excel için kaynak dosyayı ve son taslağı da yükler. */
export const getProjectForExport = (projectId) => getProjectForBackup(projectId, true);

/** Dış dosya başarıyla üretildikten sonra kalıcı yedek uyarısını kapatır. */
export async function markProjectBackupSaved(projectId, expectedEpoch) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const project = projects.find((item) => item.id === projectId);
    if (!project) throw new Error('Etkinlik bulunamadı.');
    if ((project.backupEpoch || 0) !== expectedEpoch) return false;
    if (project.backupPending || project.backupSavedEpoch !== expectedEpoch) {
      project.backupPending = false;
      project.backupSavedEpoch = expectedEpoch;
      await saveAllProjects(projects);
    }
    return true;
  });
}

/** Aynı etkinliği çoğaltmaz; farklı içerikle gelen dosya mevcut projeyi ezemez. */
export async function restoreProjectBackup(input) {
  const project = normalizeBackupProject(input);
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const existing = projects.find((item) => item.id === project.id ||
      (project.role !== 'volunteer' && item.role !== 'volunteer' && item.eventId === project.eventId));
    if (existing) {
      if (existing.id !== project.id) throw new Error('Etkinlik kimliği başka bir projede kullanılıyor.');
      const oldProject = await getProject(project.id);
      oldProject.sourceWorkbook = await loadAttachedSource(existing.sourceWorkbookMeta);
      if (oldProject.mode === 'survey') oldProject.surveyDraft = await readSurveyDraft(project.id, oldProject);
      const draftValue = await AsyncStorage.getItem(DRAFT_KEY + project.id);
      if (oldProject.mode !== 'survey' && draftValue) {
        const draft = JSON.parse(draftValue);
        if (Number.isInteger(draft.contactIndex) && draft.contactIndex >= 0 &&
            draft.contactIndex < oldProject.contacts.length && draft.formData &&
            typeof draft.formData === 'object' && !Array.isArray(draft.formData)) {
          oldProject.contacts[draft.contactIndex] = {
            ...oldProject.contacts[draft.contactIndex], data: { ...draft.formData },
          };
        }
      }
      if (sameBackupProject(oldProject, project)) return 'already-present';
      throw new Error('Bu etkinlik cihazda farklı içerikle var. Mevcut proje otomatik olarak değiştirilmedi.');
    }
    const survey = project.mode === 'survey';
    const key = (survey ? RESPONSES_PREFIX : PROJECT_DATA_PREFIX) + project.id;
    if (await AsyncStorage.getItem(key) || await AsyncStorage.getItem(PROJECT_DATA_PREFIX + project.id) ||
        await AsyncStorage.getItem(RESPONSES_PREFIX + project.id)) {
      throw new Error('Bu kimlikte tamamlanmamış bir yerel kayıt var. Geri yükleme durduruldu.');
    }
    const { contacts, responses, sourceWorkbook, surveyDraft, ...meta } = project;
    if (survey) meta.responseStorage = 1;
    const sourceMeta = await storeAttachedSource(project.id, sourceWorkbook);
    meta.sourceWorkbookMeta = sourceMeta;
    const rows = survey ? responses : contacts;
    meta.totalContacts = survey ? activeSurveyResponses(rows).length : rows.length;
    meta.completedContacts = survey ? meta.totalContacts : rows.filter((contact) => contact.completed).length;
    await AsyncStorage.setItem(MERGE_JOURNAL_KEY, JSON.stringify({
      kind: 'new-restore', projectId: project.id,
      projectsRaw: await AsyncStorage.getItem(PROJECTS_KEY) || '[]', sourceRef: sourceMeta?.ref || null,
    }));
    mergeInProgress = true;
    try {
      if (surveyDraft) await AsyncStorage.setItem(DRAFT_KEY + project.id, JSON.stringify(surveyDraft));
      await AsyncStorage.setItem(key, JSON.stringify(rows));
      await saveAllProjects([meta, ...projects]);
      await AsyncStorage.removeItem(MERGE_JOURNAL_KEY);
    } catch (error) {
      mergeInProgress = false;
      await recoverMergeAfterFailure(error, 'Yedek geri yükleme');
    } finally { mergeInProgress = false; }
    return 'restored';
  });
}

/** Kullanıcının dışarı kaydettiği mevcut kopyayı doğrulayarak etkinliği yedekle değiştirir. */
export async function replaceProjectBackup(input, expectedCurrent) {
  const incoming = normalizeBackupProject(input);
  const expected = normalizeBackupProject(expectedCurrent);
  if (incoming.id !== expected.id || incoming.eventId !== expected.eventId) {
    throw new Error('Seçilen yedek bu etkinliğe ait değil.');
  }
  return enqueueWrite(async () => {
    await recoverPendingMerge();
    const projectsRaw = await AsyncStorage.getItem(PROJECTS_KEY);
    const contactsRaw = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + incoming.id);
    const responsesRaw = await AsyncStorage.getItem(RESPONSES_PREFIX + incoming.id);
    if (!projectsRaw || (!contactsRaw && !responsesRaw)) throw new Error('Değiştirilecek etkinlik bulunamadı.');
    const projects = JSON.parse(projectsRaw);
    const index = projects.findIndex((item) => item.id === incoming.id);
    if (index < 0) throw new Error('Değiştirilecek etkinlik bulunamadı.');
    if (projects.some((item, i) => i !== index && item.role !== 'volunteer' &&
        incoming.role !== 'volunteer' && item.eventId === incoming.eventId)) {
      throw new Error('Bu etkinlik kimliği başka bir projede de kullanılıyor.');
    }
    const draftRaw = await AsyncStorage.getItem(DRAFT_KEY + incoming.id);
    const current = await getProject(incoming.id);
    current.sourceWorkbook = await loadAttachedSource(projects[index].sourceWorkbookMeta);
    if (current.mode === 'survey') current.surveyDraft = await readSurveyDraft(incoming.id, current);
    if (current.mode !== 'survey' && draftRaw) {
      const draft = JSON.parse(draftRaw);
      if (Number.isInteger(draft.contactIndex) && draft.contactIndex >= 0 &&
          draft.contactIndex < current.contacts.length && draft.formData &&
          typeof draft.formData === 'object' && !Array.isArray(draft.formData)) {
        current.contacts[draft.contactIndex] = {
          ...current.contacts[draft.contactIndex], data: { ...draft.formData },
        };
      }
    }
    if (!sameBackupProject(current, expected)) {
      throw new Error('Etkinlik, güvenlik yedeği alındıktan sonra değişti. Yeniden yedek alın.');
    }
    if (sameBackupProject(current, incoming)) return 'already-present';
    const { contacts, responses, sourceWorkbook, surveyDraft, ...meta } = incoming;
    const survey = incoming.mode === 'survey';
    if (survey) meta.responseStorage = 1;
    const oldSourceMeta = projects[index].sourceWorkbookMeta;
    const sourceMeta = await storeAttachedSource(incoming.id, sourceWorkbook);
    meta.sourceWorkbookMeta = sourceMeta;
    const rows = survey ? responses : contacts;
    meta.totalContacts = survey ? activeSurveyResponses(rows).length : rows.length;
    meta.completedContacts = survey ? meta.totalContacts : rows.filter((contact) => contact.completed).length;
    projects[index] = meta;
    await AsyncStorage.setItem(MERGE_JOURNAL_KEY, JSON.stringify({
      projectId: incoming.id, projectsRaw, contactsRaw, draftRaw, restoreDraft: true,
      restoreResponses: true, responsesRaw,
    }));
    try {
      if (survey) {
        await AsyncStorage.setItem(RESPONSES_PREFIX + incoming.id, JSON.stringify(rows));
        await AsyncStorage.removeItem(PROJECT_DATA_PREFIX + incoming.id);
      } else {
        await AsyncStorage.setItem(PROJECT_DATA_PREFIX + incoming.id, JSON.stringify(contacts));
        await AsyncStorage.removeItem(RESPONSES_PREFIX + incoming.id);
      }
      await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      if (surveyDraft) await AsyncStorage.setItem(DRAFT_KEY + incoming.id, JSON.stringify(surveyDraft));
      else await AsyncStorage.removeItem(DRAFT_KEY + incoming.id);
      await AsyncStorage.removeItem(MERGE_JOURNAL_KEY);
    } catch (error) {
      try { await recoverPendingMerge(); }
      catch (recoveryError) {
        throw new Error(`Yedek değiştirme başarısız oldu: ${error.message || error}. Önceki veri geri yüklenemedi: ${recoveryError.message || recoveryError}. Kurtarma kaydı saklandı; uygulamayı yeniden açın.`);
      }
      if (sourceMeta && sourceMeta.ref !== oldSourceMeta?.ref) {
        try { await removeSourceWorkbook(sourceMeta.ref); }
        catch (cleanupError) {
          throw new Error(`Yedek değiştirme başarısız oldu: ${error.message || error}. Yeni Excel eki de temizlenemedi: ${cleanupError.message || cleanupError}.`);
        }
      }
      throw error;
    }
    if (oldSourceMeta && oldSourceMeta.ref !== sourceMeta?.ref) {
      await removeSourceWorkbook(oldSourceMeta.ref).catch(() => {});
    }
    return 'replaced';
  });
}

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
export async function importVolunteerAssignment(assignment, digest) {
  const packet = normalizeAssignment(assignment);
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Görev özeti geçersiz.');
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const existing = projects.find((item) => item.id === packet.assignmentId);
    if (existing) {
      if (existing.role === 'volunteer' && existing.eventId === packet.eventId && existing.importDigest === digest) return 'already-present';
      throw new Error('Bu görev kimliği cihazda farklı içerikle var. Mevcut veriler korunuyor.');
    }
    const contacts = packet.contacts.map((contact) => ({ id: contact.recordId, recordId: contact.recordId,
      phone: contact.phone, data: { ...contact.data }, completed: false, completedAt: null,
      callStatus: null, callbackNote: '', callbackAt: null, attempts: [],
      previousCallbackNote: contact.previousCallbackNote || '', sourceRow: null }));
    const project = {
      id: packet.assignmentId, eventId: packet.eventId, assignmentId: packet.assignmentId,
      role: 'volunteer', importDigest: digest, round: packet.round, resultRevision: 0,
      resultSourceId: Crypto.randomUUID(),
      resultDataEpoch: 0, resultExportedEpoch: 0,
      name: `${packet.eventName} · ${packet.volunteerName}`,
      createdAt: packet.createdAt, currentIndex: 0, formVersion: packet.formVersion, formLocked: true,
      templateId: null, sourceReview: null, fields: packet.fields,
      totalContacts: contacts.length, completedContacts: 0, assignments: [],
    };
    const key = PROJECT_DATA_PREFIX + project.id;
    if (await AsyncStorage.getItem(key)) throw new Error('Bu kimlikte eksik bir yerel kayıt var.');
    await AsyncStorage.setItem(key, JSON.stringify(contacts));
    try { await saveAllProjects([project, ...projects]); }
    catch (error) {
      try { await AsyncStorage.removeItem(key); }
      catch (cleanupError) {
        throw new Error(`Görev kaydedilemedi: ${error.message || error}. Oluşturulan kişi dosyası temizlenemedi: ${cleanupError.message || cleanupError}.`);
      }
      throw error;
    }
    return 'imported';
  });
}

/** Her paylaşımda artan sürüm numarasıyla gönüllünün son durumunu dosyalar. */
export async function createVolunteerResultFile(projectId) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const project = projects.find((item) => item.id === projectId && item.role === 'volunteer');
    if (!project) throw new Error('Gönüllü görevi bulunamadı.');
    const raw = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
    if (!raw) throw new Error('Görev kişileri bulunamadı.');
    const contacts = JSON.parse(raw);
    const revision = (project.resultRevision || 0) + 1;
    project.resultSourceId ||= Crypto.randomUUID();
    const result = normalizeResult({ eventId: project.eventId, assignmentId: project.assignmentId,
      formVersion: project.formVersion, round: project.round || 1, revision,
      sourceId: project.resultSourceId,
      assignmentDigest: project.importDigest, exportedAt: new Date().toISOString(), fields: project.fields,
      contacts: contacts.map((contact) => ({ recordId: contact.recordId || contact.id,
        phone: contact.phone, data: contact.data || {}, completed: !!contact.completed,
        completedAt: contact.completedAt || null, callStatus: contact.callStatus || null,
        callbackNote: contact.callbackNote || '', callbackAt: contact.callbackAt || null,
        attempts: contact.attempts || [] })) });
    const content = await createResultFile(result);
    project.resultRevision = revision;
    await saveAllProjects(projects);
    return { content, revision, completed: contacts.filter((contact) => contact.completed).length,
      total: contacts.length,
      epoch: project.resultDataEpoch || (project.completedContacts > 0 ? 1 : 0) };
  });
}

/** Yalnızca dışa aktarılan görüntü hâlâ güncelse hatırlatmayı kapatır. */
export async function markVolunteerResultExported(projectId, revision, expectedEpoch) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const project = projects.find((item) => item.id === projectId && item.role === 'volunteer');
    if (!project) throw new Error('Gönüllü görevi bulunamadı.');
    const currentEpoch = project.resultDataEpoch || (project.completedContacts > 0 ? 1 : 0);
    if (project.resultRevision !== revision || currentEpoch !== expectedEpoch) return false;
    project.resultDataEpoch = currentEpoch;
    project.resultExportedEpoch = currentEpoch;
    await saveAllProjects(projects);
    return true;
  });
}

/** Eski görevler için güvenli tarafta kalıp tamamlanan cevapları yeniden dışa aktarmayı ister. */
export function hasUnexportedVolunteerResult(project) {
  if (project?.role !== 'volunteer') return false;
  if (!Number.isInteger(project.resultDataEpoch)) return (project.completedContacts || 0) > 0;
  return project.resultDataEpoch > (project.resultExportedEpoch || 0);
}

async function projectWithDigests(project) {
  const assignments = await Promise.all((project.assignments || []).map(async (item) => ({ ...item,
    packetDigest: item.packetDigest || JSON.parse(await createAssignmentFile(item)).integrity.sha256 })));
  return { ...project, assignments };
}

export async function previewImportedResults(projectId, packets) {
  await waitForPendingWrites();
  const project = await getProject(projectId);
  if (!project) throw new Error('Etkinlik bulunamadı.');
  const prepared = await projectWithDigests(project);
  const preview = previewResultMerge(prepared, packets);
  return { ...preview, snapshot: canonicalJson({ contacts: project.contacts, assignments: project.assignments }) };
}

/** Önizleme değişmediyse bütün sonucu uygular; kesinti halinde eski duruma dönen günlük bırakır. */
export async function applyImportedResults(projectId, packets, decisions, expectedSnapshot) {
  return enqueueWrite(async () => {
    const projectsRaw = await AsyncStorage.getItem(PROJECTS_KEY);
    const contactsRaw = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
    if (!projectsRaw || !contactsRaw) throw new Error('Ana etkinlik bulunamadı.');
    const projects = JSON.parse(projectsRaw);
    const index = projects.findIndex((item) => item.id === projectId && item.role !== 'volunteer');
    if (index < 0) throw new Error('Ana etkinlik bulunamadı.');
    const project = { ...projects[index], contacts: JSON.parse(contactsRaw) };
    if (canonicalJson({ contacts: project.contacts, assignments: project.assignments }) !== expectedSnapshot) {
      throw new Error('Etkinlik önizlemeden sonra değişti. Dosyaları yeniden inceleyin.');
    }
    const prepared = await projectWithDigests(project);
    const preview = previewResultMerge(prepared, packets);
    const next = applyPreview(prepared, preview, decisions);
    const { contacts, ...meta } = next;
    meta.backupPending = true;
    meta.backupEpoch = (project.backupEpoch || 0) + 1;
    projects[index] = meta;
    const journal = JSON.stringify({ projectId, projectsRaw, contactsRaw });
    await AsyncStorage.setItem(MERGE_JOURNAL_KEY, journal);
    mergeInProgress = true;
    try {
      await AsyncStorage.setItem(PROJECT_DATA_PREFIX + projectId, JSON.stringify(contacts));
      await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      await AsyncStorage.removeItem(MERGE_JOURNAL_KEY);
    } catch (error) {
      mergeInProgress = false;
      await recoverMergeAfterFailure(error, 'Görev sonuçlarını birleştirme');
    } finally { mergeInProgress = false; }
    return { changed: preview.changes.length, conflicts: preview.conflicts.length,
      skipped: preview.skipped.length };
  });
}

/** Tamamlanan arama veya görev dağıtımından sonra form değişmez. */
export async function lockProjectForm(projectId) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const project = projects.find((item) => item.id === projectId);
    if (!project) throw new Error('Etkinlik bulunamadı.');
    if (project.formLocked) return project;
    project.formLocked = true;
    await saveAllProjects(projects);
    return project;
  });
}

/** Formun yeni sürümünü oluşturur; eski görevlerin soruları ve cevapları saklanır. */
export async function updateProjectForm(projectId, fields) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const project = projects.find((item) => item.id === projectId);
    if (!project || project.role === 'volunteer') throw new Error('Koordinatör etkinliği bulunamadı.');
    const surveyOnly = project.mode === 'survey';
    const stored = await AsyncStorage.getItem((surveyOnly && project.responseStorage === 1
      ? RESPONSES_PREFIX : PROJECT_DATA_PREFIX) + projectId);
    if (surveyOnly && project.responseStorage === 1 && stored === null) {
      throw new Error('Anket yanıt dosyası bulunamadı.');
    }
    const contacts = stored ? JSON.parse(stored) : project.contacts || [];
    if (await AsyncStorage.getItem(DRAFT_KEY + projectId)) {
      throw new Error(surveyOnly
        ? 'Açık bir anket taslağı var. Önce cevabı kaydedin veya taslağı silin.'
        : 'Açık bir cevap taslağı var. Önce arama ekranındaki kişiyi kaydedin.');
    }
    if (!Array.isArray(fields) || !fields.length ||
        (surveyOnly ? fields.some((field) => field.isSystemField) :
          fields.filter((field) => field.isSystemField === 'name' && field.type === 'text').length !== 1 ||
          fields.some((field) => field.isSystemField && field.isSystemField !== 'name'))) {
      throw new Error(surveyOnly ? 'En az bir anket sorusu gerekli.' : 'İsim alanı gerekli.');
    }
    const ids = new Set();
    for (const field of fields) {
      if (!field.id || ids.has(field.id) || !field.label?.trim() ||
          !['text', 'select'].includes(field.type) || !Array.isArray(field.options) ||
          (field.required !== undefined && typeof field.required !== 'boolean')) {
        throw new Error('Formda geçersiz veya tekrar eden alan var.');
      }
      ids.add(field.id);
      if (field.type === 'select' && (field.options.length < 2 ||
          field.options.some((option) => !option.trim()) ||
          new Set(field.options).size !== field.options.length)) {
        throw new Error(`"${field.label}" şıkları geçersiz.`);
      }
    }
    const locked = !!project.formLocked || contacts.some((contact) => contact.completed);
    if (!locked) {
      for (const contact of contacts) {
        for (const [fieldId, answer] of Object.entries(contact.data || {})) {
          const field = fields.find((item) => item.id === fieldId);
          if (!field) throw new Error('Kaynak kişide dolu olan bir alan silinemez.');
          if (field.type === 'select' && answer && !field.options.includes(answer)) {
            throw new Error(`"${field.label}" için mevcut cevap şıklarda yok.`);
          }
        }
      }
    }
    if (JSON.stringify(project.fields) === JSON.stringify(fields)) return project;
    const oldVersion = project.formVersion || 1;
    const oldFields = project.fields;
    const usedIds = new Set([...(project.formHistory || []).flatMap((item) => item.fields.map((field) => field.id)),
      ...oldFields.map((field) => field.id), ...fields.map((field) => field.id)]);
    const previous = new Map(oldFields.map((field) => [field.id, field]));
    const nextFields = fields.map((field) => {
      const old = previous.get(field.id);
      if (!locked || !old || field.isSystemField === 'name' ||
          (old.label === field.label && old.type === field.type &&
            JSON.stringify(old.options) === JSON.stringify(field.options))) return field;
      let id = `${field.id}_v${oldVersion + 1}`;
      while (usedIds.has(id)) id += '_';
      usedIds.add(id);
      return { ...field, id };
    });
    project.fields = nextFields;
    project.formVersion = oldVersion + 1;
    project.formLocked = locked;
    project.formHistory = [...(project.formHistory || [{ version: oldVersion, fields: oldFields }]),
      { version: project.formVersion, fields: nextFields }];
    const nextIds = new Set(nextFields.map((field) => field.id));
    if (project.sourceReview) project.sourceReview.columns = project.sourceReview.columns.map((column) => ({
      ...column, fieldId: nextIds.has(column.fieldId) ? column.fieldId : null,
    }));
    await saveAllProjects(projects);
    return project;
  });
}

/** Dışarı kaydedilen yedekten sonra yalnızca aynı proje görüntüsünü siler. */
export async function deleteProject(projectId, expectedBackup) {
  return enqueueWrite(async () => {
    if (!expectedBackup) throw new Error('Silmeden önce proje yedeği alın.');
    const projects = await getAllProjects();
    const project = await getProject(projectId);
    if (!project) throw new Error('Silinecek proje bulunamadı.');
    project.sourceWorkbook = await loadAttachedSource(project.sourceWorkbookMeta);
    const draft = await loadDraft(projectId);
    if (project.mode === 'survey') project.surveyDraft = await readSurveyDraft(projectId, project);
    if (project.mode !== 'survey' && draft && Number.isInteger(draft.contactIndex) &&
        draft.contactIndex >= 0 && draft.contactIndex < project.contacts.length &&
        draft.formData && typeof draft.formData === 'object' && !Array.isArray(draft.formData)) {
      project.contacts = project.contacts.map((contact, index) =>
        index === draft.contactIndex ? { ...contact, data: { ...draft.formData } } : contact);
    }
    if (!sameBackupProject(project, expectedBackup)) {
      throw new Error('Proje yedekten sonra değişti. Yeni yedek alıp tekrar deneyin.');
    }
    const filtered = projects.filter((p) => p.id !== projectId);
    await saveAllProjects(filtered);
    const cleanupWarnings = [];
    for (const key of [PROJECT_DATA_PREFIX + projectId, RESPONSES_PREFIX + projectId, DRAFT_KEY + projectId]) {
      try { await AsyncStorage.removeItem(key); }
      catch (error) { cleanupWarnings.push(error.message || 'Yerel dosya temizlenemedi.'); }
    }
    if (project.sourceWorkbookMeta) {
      try { await removeSourceWorkbook(project.sourceWorkbookMeta.ref); }
      catch (error) { cleanupWarnings.push(error.message || 'Excel eki temizlenemedi.'); }
    }
    return { cleanupWarnings };
  });
}

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
