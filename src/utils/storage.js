/**
 * AsyncStorage CRUD işlemleri
 * Tüm proje verilerini yerel olarak yönetir.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeBackupProject, sameBackupProject } from './backupFormat';
import { createAssignmentFile, normalizeAssignment } from './assignmentFormat';
import { cleanPhoneNumber } from './phoneUtils';
import { canonicalJson } from './canonicalJson';
import { CALL_STATUSES, createResultFile, normalizeResult } from './resultFormat';
import { applyPreview, previewResultMerge } from './resultMerge';
import { missingRequiredField } from './formValidation';
import { verifySourceWorkbook } from './sourceWorkbookArchive';
import { writeSourceWorkbook, readSourceWorkbook, removeSourceWorkbook } from './sourceWorkbookStore';
import { readProjectMetadata, readProjectSummaries, readProjectContacts } from '../data/projectStore/projectReads';
import { writeNewProject, writeSurveyResponse, writeUpdatedProject } from '../data/projectStore/projectWrites';
import { recoverProjectUpdateJournal } from '../data/projectStore/projectUpdateJournal';
import { readProjectUpdateJournal, writeProjectUpdateJournal,
  removeProjectUpdateJournal } from '../data/projectStore/projectUpdateJournalStore';
import * as Crypto from 'expo-crypto';

const PROJECTS_KEY = '@ays_projects';
const PROJECT_DATA_PREFIX = '@ays_project_data_';
const DRAFT_KEY = '@ays_draft_';
const DIAGNOSTIC_KEY = '@ays_last_diagnostic';
const TEMPLATES_KEY = '@ays_templates';
const MERGE_JOURNAL_KEY = '@ays_merge_journal';
let mergeInProgress = false;
let recoveryPromise = null;
let projectUpdateInProgress = false;
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
    if (!journal.projectId || typeof journal.projectsRaw !== 'string' ||
        typeof journal.contactsRaw !== 'string') throw new Error('Birleştirme kurtarma kaydı bozuk.');
    await AsyncStorage.setItem(PROJECT_DATA_PREFIX + journal.projectId, journal.contactsRaw);
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

async function recoverPendingProjectUpdate(force = false) {
  if (projectUpdateInProgress && !force) return;
  if (projectUpdateRecoveryPromise) return projectUpdateRecoveryPromise;
  projectUpdateRecoveryPromise = recoverProjectUpdateJournal({
    readJournal: () => readProjectUpdateJournal(AsyncStorage),
    readProjects: () => AsyncStorage.getItem(PROJECTS_KEY),
    readContacts: (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id),
    setProjects: (raw) => AsyncStorage.setItem(PROJECTS_KEY, raw),
    setContacts: (id, raw) => AsyncStorage.setItem(PROJECT_DATA_PREFIX + id, raw),
    removeContacts: (id) => AsyncStorage.removeItem(PROJECT_DATA_PREFIX + id),
    removeJournal: () => removeProjectUpdateJournal(AsyncStorage),
  });
  try { await projectUpdateRecoveryPromise; } finally { projectUpdateRecoveryPromise = null; }
}

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
  return readProjectSummaries(projects, (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id));
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
    return await readProjectContacts(project, (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id));
  } catch (e) {
    console.error('Proje detayları yüklenemedi:', e);
    throw new Error('Depolama hatası: Kişiler yüklenemedi.');
  }
}

/**
 * Yeni proje oluşturur
 */
export async function createProject(project) {
  return enqueueWrite(() => writeNewProject(project, {
    loadProjects: getAllProjects,
    getContacts: (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id),
    setContacts: (id, data) => AsyncStorage.setItem(PROJECT_DATA_PREFIX + id, data),
    removeContacts: (id) => AsyncStorage.removeItem(PROJECT_DATA_PREFIX + id),
    saveProjects: saveAllProjects,
    saveSource: storeAttachedSource,
    removeSource: removeSourceWorkbook,
  }));
}

/** Bekleyen form taslağını da katarak dışa aktarılabilir tam görüntüyü döndürür. */
export async function getProjectForBackup(projectId, allowMissingSource = false) {
  return enqueueWrite(async () => {
    const project = await getProject(projectId);
    if (!project) throw new Error('Yedeklenecek proje bulunamadı.');
    const draft = await loadDraft(projectId);
    if (draft && Number.isInteger(draft.contactIndex) &&
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
    if (project.backupPending) {
      project.backupPending = false;
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
      const stored = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + project.id);
      const oldProject = { ...existing, contacts: stored ? JSON.parse(stored) : existing.contacts || [] };
      oldProject.sourceWorkbook = await loadAttachedSource(existing.sourceWorkbookMeta);
      const draftValue = await AsyncStorage.getItem(DRAFT_KEY + project.id);
      if (draftValue) {
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
    const key = PROJECT_DATA_PREFIX + project.id;
    if (await AsyncStorage.getItem(key)) {
      throw new Error('Bu kimlikte tamamlanmamış bir yerel kayıt var. Geri yükleme durduruldu.');
    }
    const { contacts, sourceWorkbook, ...meta } = project;
    const sourceMeta = await storeAttachedSource(project.id, sourceWorkbook);
    meta.sourceWorkbookMeta = sourceMeta;
    meta.totalContacts = contacts.length;
    meta.completedContacts = contacts.filter((contact) => contact.completed).length;
    try {
      await AsyncStorage.setItem(key, JSON.stringify(contacts));
      await saveAllProjects([meta, ...projects]);
    } catch (error) {
      await AsyncStorage.removeItem(key).catch(() => {});
      if (sourceMeta) await removeSourceWorkbook(sourceMeta.ref).catch(() => {});
      throw error;
    }
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
    if (!projectsRaw || !contactsRaw) throw new Error('Değiştirilecek etkinlik bulunamadı.');
    const projects = JSON.parse(projectsRaw);
    const index = projects.findIndex((item) => item.id === incoming.id);
    if (index < 0) throw new Error('Değiştirilecek etkinlik bulunamadı.');
    if (projects.some((item, i) => i !== index && item.role !== 'volunteer' &&
        incoming.role !== 'volunteer' && item.eventId === incoming.eventId)) {
      throw new Error('Bu etkinlik kimliği başka bir projede de kullanılıyor.');
    }
    const draftRaw = await AsyncStorage.getItem(DRAFT_KEY + incoming.id);
    const current = { ...projects[index], contacts: JSON.parse(contactsRaw) };
    current.sourceWorkbook = await loadAttachedSource(projects[index].sourceWorkbookMeta);
    if (draftRaw) {
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
    const { contacts, sourceWorkbook, ...meta } = incoming;
    const oldSourceMeta = projects[index].sourceWorkbookMeta;
    const sourceMeta = await storeAttachedSource(incoming.id, sourceWorkbook);
    meta.sourceWorkbookMeta = sourceMeta;
    meta.totalContacts = contacts.length;
    meta.completedContacts = contacts.filter((contact) => contact.completed).length;
    projects[index] = meta;
    await AsyncStorage.setItem(MERGE_JOURNAL_KEY, JSON.stringify({
      projectId: incoming.id, projectsRaw, contactsRaw, draftRaw, restoreDraft: true,
    }));
    try {
      await AsyncStorage.setItem(PROJECT_DATA_PREFIX + incoming.id, JSON.stringify(contacts));
      await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      await AsyncStorage.removeItem(DRAFT_KEY + incoming.id);
      await AsyncStorage.removeItem(MERGE_JOURNAL_KEY);
    } catch (error) {
      await recoverPendingMerge().catch(() => {});
      if (sourceMeta && sourceMeta.ref !== oldSourceMeta?.ref) {
        await removeSourceWorkbook(sourceMeta.ref).catch(() => {});
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
    projectUpdateInProgress = true;
    try {
      return await writeUpdatedProject(projectId, updates, {
        loadProjects: getAllProjects,
        getContacts: (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id),
        setContacts: (id, data) => AsyncStorage.setItem(PROJECT_DATA_PREFIX + id, data),
        saveProjects: saveAllProjects,
        beginUpdate: async (id, contactsRaw) => {
          const projectsRaw = await AsyncStorage.getItem(PROJECTS_KEY);
          if (projectsRaw == null) throw new Error('Proje bilgileri bulunamadı; kişi kaydı durduruldu.');
          await writeProjectUpdateJournal(AsyncStorage, JSON.stringify({
            version: 1, projectId: id, projectsRaw, contactsRaw,
          }));
        },
        finishUpdate: () => removeProjectUpdateJournal(AsyncStorage),
        recoverUpdate: () => recoverPendingProjectUpdate(true),
      });
    } finally { projectUpdateInProgress = false; }
  });
}

/** Listesiz ankette her doldurma yeni bir kayıt oluşturur; yazılar sıraya alınır. */
export async function appendSurveyResponse(projectId, input) {
  return enqueueWrite(() => writeSurveyResponse(projectId, input, {
    loadProjects: getAllProjects,
    getContacts: (id) => AsyncStorage.getItem(PROJECT_DATA_PREFIX + id),
    setContacts: (id, data) => AsyncStorage.setItem(PROJECT_DATA_PREFIX + id, data),
    saveProjects: saveAllProjects,
    createId: Crypto.randomUUID,
    now: () => new Date().toISOString(),
  }));
}

const ACTIVE_ASSIGNMENT_STATUSES = new Set(['prepared', 'sent', 'partial', 'completed']);
const currentAnswers = (data, fields) => Object.fromEntries(
  (fields || []).filter((field) => typeof data?.[field.id] === 'string')
    .map((field) => [field.id, data[field.id]]));

/** İlk turda kimliği veya telefonu etkin göreve ayrılmış kişileri havuzdan çıkarır. */
export function getAvailableContacts(project) {
  const reservedIds = new Set();
  const reservedPhones = new Set();
  const returnedIds = new Set();
  for (const assignment of project.assignments || []) {
    if (assignment.round !== 1) continue;
    if (assignment.status === 'cancelled') {
      for (const contact of assignment.contacts || []) returnedIds.add(contact.recordId);
      continue;
    }
    for (const recordId of assignment.releasedRecordIds || []) returnedIds.add(recordId);
    if (!ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)) continue;
    const released = new Set(assignment.releasedRecordIds || []);
    for (const contact of assignment.contacts || []) {
      if (released.has(contact.recordId)) continue;
      reservedIds.add(contact.recordId);
      reservedPhones.add(cleanPhoneNumber(contact.phone));
    }
  }
  const seenPhones = new Set();
  const available = (project.contacts || []).filter((contact) => {
    const phone = cleanPhoneNumber(contact.phone);
    const recordId = contact.recordId || contact.id;
    if (!phone || contact.completed || reservedIds.has(recordId) || reservedPhones.has(phone) || seenPhones.has(phone)) return false;
    seenPhones.add(phone);
    return true;
  });
  return [...available.filter((contact) => returnedIds.has(contact.recordId || contact.id)),
    ...available.filter((contact) => !returnedIds.has(contact.recordId || contact.id))];
}

/** İptal sonrası bekleyen ve henüz yeni bir göreve ayrılmamış ilk tur kişileri. */
export function getReturnedContacts(project) {
  const returnedIds = new Set((project.assignments || [])
    .filter((assignment) => assignment.round === 1)
    .flatMap((assignment) => assignment.status === 'cancelled'
      ? (assignment.contacts || []).map((contact) => contact.recordId)
      : assignment.releasedRecordIds || []));
  return getAvailableContacts(project).filter((contact) => returnedIds.has(contact.recordId || contact.id));
}

/** Sonra ara sonucunu almış ve hâlihazırda geri arama görevinde olmayan kişiler. */
export function getCallbackCandidates(project) {
  const activeIds = new Set();
  const activePhones = new Set();
  const latestByRecord = new Map();
  for (const assignment of project.assignments || []) {
    if (assignment.status === 'cancelled') continue;
    const round = assignment.round || 1;
    const isActiveCallback = round >= 2 && ['prepared', 'sent', 'partial'].includes(assignment.status);
    for (const row of assignment.contacts || []) {
      if ((assignment.releasedRecordIds || []).includes(row.recordId)) continue;
      const rowDone = assignment.status === 'completed' || assignment.status === 'transferred' ||
        !!assignment.lastApplied?.[row.recordId]?.completed;
      if (isActiveCallback && !rowDone) {
        activeIds.add(row.recordId);
        activePhones.add(cleanPhoneNumber(row.phone));
      }
      const prior = latestByRecord.get(row.recordId);
      if (!prior || round > prior.round) {
        latestByRecord.set(row.recordId, { round, unfinished: !rowDone });
      } else if (round === prior.round && !rowDone) {
        prior.unfinished = true;
      }
    }
  }
  const seenPhones = new Set();
  return (project.contacts || []).flatMap((contact) => {
    if (contact.callStatus !== 'later' || !contact.completed) return [];
    const recordId = contact.recordId || contact.id;
    const phone = cleanPhoneNumber(contact.phone);
    if (!phone || seenPhones.has(phone) || activeIds.has(recordId) || activePhones.has(phone)) return [];
    seenPhones.add(phone);
    const prior = latestByRecord.get(recordId);
    if (prior?.unfinished) return [];
    return [{ contact, round: (prior?.round || 1) + 1 }];
  });
}

export async function createCallbackAssignment(projectId, input) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const project = projects.find((item) => item.id === projectId && item.role !== 'volunteer');
    if (!project) throw new Error('Koordinatör etkinliği bulunamadı.');
    const count = Number(input.count);
    if (!Number.isInteger(count) || count < 1) throw new Error('Kişi sayısı en az 1 olmalı.');
    if ((project.assignments || []).some((item) => item.assignmentId === input.assignmentId)) {
      throw new Error('Görev kimliği zaten kullanılıyor.');
    }
    const raw = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
    if (!raw) throw new Error('Etkinliğin kişi listesi bulunamadı.');
    const candidates = getCallbackCandidates({ ...project, contacts: JSON.parse(raw) });
    if (!candidates.length) throw new Error('Şu anda geri aranacak kişi yok.');
    const round = candidates[0].round;
    const selected = candidates.filter((item) => item.round === round).slice(0, count);
    if (selected.length < count) throw new Error(`Bu turda yalnızca ${selected.length} kişi atanabilir.`);
    const assignment = normalizeAssignment({
      eventId: project.eventId || project.id, assignmentId: input.assignmentId,
      eventName: project.name, volunteerName: input.volunteerName,
      formVersion: project.formVersion || 1, round, createdAt: input.createdAt,
      fields: project.fields, contacts: selected.map(({ contact }) => ({
        recordId: contact.recordId || contact.id, phone: contact.phone, data: currentAnswers(contact.data, project.fields),
        previousCallbackNote: contact.callbackNote || '',
        baseline: { completed: !!contact.completed, callStatus: contact.callStatus || null,
          callbackNote: contact.callbackNote || '', callbackAt: contact.callbackAt || null },
      })),
    });
    const packetDigest = JSON.parse(await createAssignmentFile(assignment)).integrity.sha256;
    const record = { ...assignment, packetDigest, status: 'prepared', sentAt: null, cancelledAt: null,
      resultRevision: 0, resultDigest: null, lastApplied: {}, releasedRecordIds: [],
      ownerType: input.ownerType === 'coordinator' ? 'coordinator' : 'volunteer', reassignedFrom: null };
    project.assignments = [...(project.assignments || []), record];
    project.backupPending = true;
    project.backupEpoch = (project.backupEpoch || 0) + 1;
    await saveAllProjects(projects);
    return record;
  });
}

/** Görevi ve rezervasyonu tek metadata yazımında oluşturur. */
export async function createAssignment(projectId, input) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const project = projects.find((item) => item.id === projectId);
    if (!project || project.role === 'volunteer') throw new Error('Koordinatör etkinliği bulunamadı.');
    const count = Number(input.count);
    if (!Number.isInteger(count) || count < 1) throw new Error('Kişi sayısı en az 1 olmalı.');
    if ((project.assignments || []).some((item) => item.assignmentId === input.assignmentId)) {
      throw new Error('Görev kimliği zaten kullanılıyor.');
    }
    const saved = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
    if (!saved) throw new Error('Etkinliğin kişi listesi bulunamadı.');
    const available = getAvailableContacts({ ...project, contacts: JSON.parse(saved) });
    if (count > available.length) throw new Error(`Yalnızca ${available.length} kişi atanabilir.`);
    const assignment = normalizeAssignment({
      eventId: project.eventId || project.id, assignmentId: input.assignmentId,
      eventName: project.name, volunteerName: input.volunteerName,
      formVersion: project.formVersion || 1, round: 1, createdAt: input.createdAt,
      fields: project.fields, contacts: available.slice(0, count).map((contact) => ({
        recordId: contact.recordId || contact.id, phone: contact.phone, data: currentAnswers(contact.data, project.fields),
      })),
    });
    const packetDigest = JSON.parse(await createAssignmentFile(assignment)).integrity.sha256;
    const record = { ...assignment, packetDigest, status: 'prepared', sentAt: null, cancelledAt: null,
      resultRevision: 0, resultDigest: null, lastApplied: {}, releasedRecordIds: [],
      ownerType: input.ownerType === 'coordinator' ? 'coordinator' : 'volunteer', reassignedFrom: null };
    project.assignments = [...(project.assignments || []), record];
    project.formLocked = true;
    project.backupPending = true;
    project.backupEpoch = (project.backupEpoch || 0) + 1;
    await saveAllProjects(projects);
    return record;
  });
}

export async function setAssignmentStatus(projectId, assignmentId, nextStatus, allowSentCancellation = false) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const project = projects.find((item) => item.id === projectId && item.role !== 'volunteer');
    const assignment = project?.assignments?.find((item) => item.assignmentId === assignmentId);
    if (!assignment) throw new Error('Görev bulunamadı.');
    if (nextStatus === 'sent' && assignment.status === 'prepared') {
      assignment.status = 'sent'; assignment.sentAt = new Date().toISOString();
    } else if (nextStatus === 'cancelled' &&
        (assignment.status === 'prepared' || (assignment.status === 'sent' && allowSentCancellation))) {
      assignment.status = 'cancelled'; assignment.cancelledAt = new Date().toISOString();
    } else throw new Error('Bu görev durumu değiştirilemez.');
    project.backupPending = true;
    project.backupEpoch = (project.backupEpoch || 0) + 1;
    await saveAllProjects(projects);
    return assignment;
  });
}

/** Sonuçlanmamış kişileri eski görevden çıkarır; istenirse aynı yazımda yeni görev açar. */
export async function transferAssignmentContacts(projectId, oldAssignmentId, recordIds, nextInput = null) {
  return enqueueWrite(async () => {
    if (!Array.isArray(recordIds) || !recordIds.length || new Set(recordIds).size !== recordIds.length) {
      throw new Error('Devredilecek kişileri seçin.');
    }
    const projects = await getAllProjects();
    const project = projects.find((item) => item.id === projectId && item.role !== 'volunteer');
    const old = project?.assignments?.find((item) => item.assignmentId === oldAssignmentId);
    if (!old || !['prepared', 'sent', 'partial'].includes(old.status)) {
      throw new Error('Bu görevden kişi devredilemez.');
    }
    const raw = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
    if (!raw) throw new Error('Ana kişi listesi bulunamadı.');
    const contacts = JSON.parse(raw);
    const master = new Map(contacts.map((contact) => [contact.recordId || contact.id, contact]));
    const oldRows = new Map(old.contacts.map((contact) => [contact.recordId, contact]));
    const alreadyReleased = new Set(old.releasedRecordIds || []);
    const selected = recordIds.map((recordId) => {
      const row = oldRows.get(recordId);
      const contact = master.get(recordId);
      if (!row || !contact || alreadyReleased.has(recordId) || contact.completed ||
          cleanPhoneNumber(row.phone) !== cleanPhoneNumber(contact.phone)) {
        throw new Error('Seçilen kişi artık bu görevde devredilebilir durumda değil.');
      }
      return contact;
    });
    if (nextInput) {
      if (!nextInput.assignmentId || project.assignments.some((item) => item.assignmentId === nextInput.assignmentId)) {
        throw new Error('Yeni görev kimliği zaten kullanılıyor veya boş.');
      }
      const selectedIds = new Set(recordIds);
      const selectedPhones = new Set(selected.map((contact) => cleanPhoneNumber(contact.phone)));
      for (const assignment of project.assignments || []) {
        if (assignment.round !== old.round || ['cancelled', 'transferred'].includes(assignment.status)) continue;
        const released = new Set(assignment.releasedRecordIds || []);
        for (const row of assignment.contacts || []) {
          if (released.has(row.recordId) || (assignment.assignmentId === oldAssignmentId && selectedIds.has(row.recordId))) continue;
          if (selectedIds.has(row.recordId) || selectedPhones.has(cleanPhoneNumber(row.phone))) {
            throw new Error('Kişi başka bir etkin görevde bulunuyor.');
          }
        }
      }
    }
    old.releasedRecordIds = [...alreadyReleased, ...recordIds];
    const remaining = old.contacts.filter((row) => !old.releasedRecordIds.includes(row.recordId) &&
      !master.get(row.recordId)?.completed);
    if (!remaining.length) {
      old.status = old.contacts.some((row) => master.get(row.recordId)?.completed) ? 'transferred' : 'cancelled';
      old.cancelledAt = new Date().toISOString();
    }
    let replacement = null;
    if (nextInput) {
      const assignment = normalizeAssignment({
        eventId: project.eventId || project.id, assignmentId: nextInput.assignmentId,
        eventName: project.name, volunteerName: nextInput.volunteerName,
        formVersion: project.formVersion || 1, round: old.round, createdAt: nextInput.createdAt,
        fields: project.fields, contacts: selected.map((contact) => ({
          recordId: contact.recordId || contact.id, phone: contact.phone,
          data: currentAnswers(contact.data, project.fields),
          ...(old.round >= 2 ? { previousCallbackNote: contact.callbackNote || '',
            baseline: { completed: !!contact.completed, callStatus: contact.callStatus || null,
              callbackNote: contact.callbackNote || '', callbackAt: contact.callbackAt || null } } : {}),
        })),
      });
      const packetDigest = JSON.parse(await createAssignmentFile(assignment)).integrity.sha256;
      replacement = { ...assignment, packetDigest, status: 'prepared', sentAt: null, cancelledAt: null,
        resultRevision: 0, resultDigest: null, lastApplied: {}, releasedRecordIds: [],
        ownerType: nextInput.ownerType === 'coordinator' ? 'coordinator' : 'volunteer',
        reassignedFrom: oldAssignmentId };
      project.assignments.push(replacement);
    }
    project.backupPending = true;
    project.backupEpoch = (project.backupEpoch || 0) + 1;
    await saveAllProjects(projects);
    return replacement || { released: recordIds.length };
  });
}

/** Koordinatörün kendine ayırdığı kişi için cevabı doğrudan ana etkinliğe yazar. */
export async function saveCoordinatorTaskContact(projectId, assignmentId, recordId, input) {
  return enqueueWrite(async () => {
    await recoverPendingMerge();
    const projectsRaw = await AsyncStorage.getItem(PROJECTS_KEY);
    const contactsRaw = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
    if (!projectsRaw || !contactsRaw) throw new Error('Ana etkinlik bulunamadı.');
    const projects = JSON.parse(projectsRaw);
    const index = projects.findIndex((item) => item.id === projectId && item.role !== 'volunteer');
    if (index < 0) throw new Error('Ana etkinlik bulunamadı.');
    const project = projects[index];
    const assignment = project.assignments?.find((item) => item.assignmentId === assignmentId);
    if (!assignment || assignment.ownerType !== 'coordinator' ||
        ['cancelled', 'transferred'].includes(assignment.status) ||
        (assignment.releasedRecordIds || []).includes(recordId)) {
      throw new Error('Bu kişi artık sizin görevinizde değil.');
    }
    const taskRow = assignment.contacts.find((row) => row.recordId === recordId);
    const contacts = JSON.parse(contactsRaw);
    const contactIndex = contacts.findIndex((row) => (row.recordId || row.id) === recordId);
    const old = contacts[contactIndex];
    if (!taskRow || !old || cleanPhoneNumber(taskRow.phone) !== cleanPhoneNumber(old.phone)) {
      throw new Error('Görev kişisi ana listeyle uyuşmuyor.');
    }
    const newer = (project.assignments || []).some((item) => item.assignmentId !== assignmentId &&
      !['cancelled', 'transferred'].includes(item.status) && item.round >= assignment.round &&
      !(item.releasedRecordIds || []).includes(recordId) &&
      item.contacts.some((row) => row.recordId === recordId));
    if (newer) throw new Error('Bu kişi başka bir göreve devredilmiş. Ekranı yenileyin.');
    if (!input || !CALL_STATUSES.includes(input.callStatus) ||
        !input.data || typeof input.data !== 'object' || Array.isArray(input.data) ||
        typeof input.callbackNote !== 'string' || input.callbackNote.length > 2000 ||
        (input.callbackAt != null && !Number.isFinite(Date.parse(input.callbackAt)))) {
      throw new Error('Arama cevabı geçersiz.');
    }
    const fieldIds = new Set(assignment.fields.map((field) => field.id));
    if (Object.entries(input.data).some(([id, value]) => !fieldIds.has(id) || typeof value !== 'string')) {
      throw new Error('Arama cevabı görevin formuna uymuyor.');
    }
    const data = { ...old.data, ...input.data };
    const missing = missingRequiredField(assignment.fields, data, input.callStatus);
    if (missing) throw new Error(`"${missing.label}" cevabını girin.`);
    const now = new Date().toISOString();
    const callbackNote = input.callStatus === 'later' ? input.callbackNote.trim() : '';
    const callbackAt = input.callStatus === 'later' ? input.callbackAt || null : null;
    const attempt = { id: Crypto.randomUUID(), at: now, status: input.callStatus,
      note: callbackNote, data: currentAnswers(data, assignment.fields) };
    const updated = { ...old, data, completed: true, completedAt: now,
      callStatus: input.callStatus, callbackNote, callbackAt,
      attempts: [...(old.attempts || []), attempt] };
    contacts[contactIndex] = updated;
    assignment.lastApplied = { ...(assignment.lastApplied || {}), [recordId]: {
      data: currentAnswers(data, assignment.fields), completed: true,
      callStatus: input.callStatus, callbackNote, callbackAt,
    } };
    const released = new Set(assignment.releasedRecordIds || []);
    assignment.status = assignment.contacts.every((row) => released.has(row.recordId) ||
      !!assignment.lastApplied[row.recordId]?.completed)
      ? released.size ? 'transferred' : 'completed' : 'partial';
    project.completedContacts = contacts.filter((row) => row.completed).length;
    project.backupPending = true;
    project.backupEpoch = (project.backupEpoch || 0) + 1;
    await AsyncStorage.setItem(MERGE_JOURNAL_KEY, JSON.stringify({ projectId, projectsRaw, contactsRaw }));
    mergeInProgress = true;
    try {
      await AsyncStorage.setItem(PROJECT_DATA_PREFIX + projectId, JSON.stringify(contacts));
      await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      await AsyncStorage.removeItem(MERGE_JOURNAL_KEY);
    } catch (error) {
      await AsyncStorage.setItem(PROJECT_DATA_PREFIX + projectId, contactsRaw).catch(() => {});
      await AsyncStorage.setItem(PROJECTS_KEY, projectsRaw).catch(() => {});
      throw error;
    } finally { mergeInProgress = false; }
    return { contact: updated, assignmentStatus: assignment.status };
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
    catch (error) { await AsyncStorage.removeItem(key).catch(() => {}); throw error; }
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
      await AsyncStorage.setItem(PROJECT_DATA_PREFIX + projectId, contactsRaw).catch(() => {});
      await AsyncStorage.setItem(PROJECTS_KEY, projectsRaw).catch(() => {});
      throw error;
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
    const stored = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
    const contacts = stored ? JSON.parse(stored) : project.contacts || [];
    if (await AsyncStorage.getItem(DRAFT_KEY + projectId)) {
      throw new Error('Açık bir cevap taslağı var. Önce arama ekranındaki kişiyi kaydedin.');
    }
    const surveyOnly = project.mode === 'survey';
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
    if (draft && Number.isInteger(draft.contactIndex) &&
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
    
    try {
      await AsyncStorage.removeItem(PROJECT_DATA_PREFIX + projectId);
    } catch (e) {}
    try {
      await AsyncStorage.removeItem(DRAFT_KEY + projectId);
    } catch (e) {
      console.error('Draft silinemedi:', e);
    }
    if (project.sourceWorkbookMeta) {
      await removeSourceWorkbook(project.sourceWorkbookMeta.ref).catch(() => {});
    }
  });
}

/**
 * Geçici form verisini (draft) kaydeder
 */
export async function saveDraft(projectId, draftData) {
  return enqueueWrite(async () => {
    try {
      await AsyncStorage.setItem(DRAFT_KEY + projectId, JSON.stringify(draftData));
    } catch (e) {
      console.error('Draft kaydedilemedi:', e);
    }
  });
}

/**
 * Geçici form verisini yükler
 */
export async function loadDraft(projectId) {
  try {
    const data = await AsyncStorage.getItem(DRAFT_KEY + projectId);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Draft yüklenemedi:', e);
    return null;
  }
}

/**
 * Geçici form verisini temizler
 */
export async function clearDraft(projectId) {
  return enqueueWrite(async () => {
    try {
      await AsyncStorage.removeItem(DRAFT_KEY + projectId);
    } catch (e) {
      console.error('Draft silinemedi:', e);
    }
  });
}

export function waitForPendingWrites() {
  // Önceki bir yazma hata vermiş olsa bile yeni okuma/yeniden denemeyi engelleme.
  return writeQueue.catch(() => {});
}
