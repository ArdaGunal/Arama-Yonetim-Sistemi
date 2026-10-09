/**
 * AsyncStorage CRUD işlemleri
 * Tüm proje verilerini yerel olarak yönetir.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeBackupProject, sameBackupProject } from './backupFormat';
import { createAssignmentFile, normalizeAssignment } from './assignmentFormat';
import { cleanPhoneNumber } from './phoneUtils';
import { canonicalJson } from './canonicalJson';
import { createResultFile, normalizeResult } from './resultFormat';
import { applyPreview, previewResultMerge } from './resultMerge';

const PROJECTS_KEY = '@ays_projects';
const PROJECT_DATA_PREFIX = '@ays_project_data_';
const DRAFT_KEY = '@ays_draft_';
const DIAGNOSTIC_KEY = '@ays_last_diagnostic';
const TEMPLATES_KEY = '@ays_templates';
const MERGE_JOURNAL_KEY = '@ays_merge_journal';
let mergeInProgress = false;
let recoveryPromise = null;

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
      (item.name === template.name && JSON.stringify(item.fields) === JSON.stringify(template.fields) &&
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
    const data = await AsyncStorage.getItem(PROJECTS_KEY);
    return data ? JSON.parse(data) : [];
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
  return Promise.all(projects.map(async (project) => {
    if (Number.isInteger(project.totalContacts) && Number.isInteger(project.completedContacts)) {
      return project;
    }

    const storedContacts = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + project.id);
    const contacts = storedContacts ? JSON.parse(storedContacts) : (project.contacts || []);
    if (!Array.isArray(contacts)) throw new Error('Proje kişi listesi okunamadı.');
    return {
      ...project,
      totalContacts: contacts.length,
      completedContacts: contacts.filter((contact) => contact.completed).length,
    };
  }));
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

  // Kişi verilerini ayrı anahtardan yükle (eğer eski sürümde metadata içinde değilse)
  try {
    const contactsData = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
    if (contactsData) {
      project.contacts = JSON.parse(contactsData);
    } else if (!project.contacts) {
      project.contacts = [];
    }
  } catch (e) {
    console.error('Proje detayları yüklenemedi:', e);
    throw new Error('Depolama hatası: Kişiler yüklenemedi.');
  }
  return project;
}

/**
 * Yeni proje oluşturur
 */
export async function createProject(project) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    
    // Büyük veriyi ayır
    const contacts = project.contacts || [];
    const metaProject = { ...project };
    delete metaProject.contacts; 
    metaProject.totalContacts = contacts.length;
    metaProject.completedContacts = contacts.filter((contact) => contact.completed).length;

    await AsyncStorage.setItem(PROJECT_DATA_PREFIX + project.id, JSON.stringify(contacts));
    
    projects.unshift(metaProject);
    await saveAllProjects(projects);
    
    return project;
  });
}

/** Bekleyen form taslağını da katarak dışa aktarılabilir tam görüntüyü döndürür. */
export async function getProjectForBackup(projectId) {
  await waitForPendingWrites();
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
  return project;
}

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
    const { contacts, ...meta } = project;
    meta.totalContacts = contacts.length;
    meta.completedContacts = contacts.filter((contact) => contact.completed).length;
    await AsyncStorage.setItem(key, JSON.stringify(contacts));
    try {
      await saveAllProjects([meta, ...projects]);
    } catch (error) {
      await AsyncStorage.removeItem(key).catch(() => {});
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
    const { contacts, ...meta } = incoming;
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
      throw error;
    }
    return 'replaced';
  });
}

/**
 * Projeyi günceller
 */
export async function updateProject(projectId, updates) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const index = projects.findIndex((p) => p.id === projectId);
    
    if (index !== -1) {
      const pMeta = projects[index];
      
      // Sadece index ve genel meta güncellemeleri metadata'ya
      if (updates.currentIndex !== undefined) pMeta.currentIndex = updates.currentIndex;
      
      // Eğer contacts güncellenmişse, ayrı olarak kaydet
      if (updates.contacts) {
        const nextContacts = JSON.stringify(updates.contacts);
        if (pMeta.role === 'volunteer') {
          const saved = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
          const previous = saved ? JSON.parse(saved) : [];
          if (updates.contacts.length !== previous.length || updates.contacts.some((contact, i) =>
            (contact.recordId || contact.id) !== (previous[i].recordId || previous[i].id) ||
            contact.phone !== previous[i].phone)) {
            throw new Error('Görevdeki kişi listesi değiştirilemez.');
          }
          if (saved !== nextContacts) {
            pMeta.resultDataEpoch = (pMeta.resultDataEpoch || 0) + 1;
          }
        }
        pMeta.totalContacts = updates.contacts.length;
        pMeta.completedContacts = updates.contacts.filter((contact) => contact.completed).length;
        if (pMeta.completedContacts > 0) pMeta.formLocked = true;
        await AsyncStorage.setItem(PROJECT_DATA_PREFIX + projectId, nextContacts);
      }

      projects[index] = pMeta;
      await saveAllProjects(projects);
      return { ...pMeta, contacts: updates.contacts }; // Yeni objeyi döndür
    }
    return null;
  });
}

const ACTIVE_ASSIGNMENT_STATUSES = new Set(['prepared', 'sent', 'partial', 'completed']);
const currentAnswers = (data, fields) => Object.fromEntries(
  (fields || []).filter((field) => typeof data?.[field.id] === 'string')
    .map((field) => [field.id, data[field.id]]));

/** İlk turda kimliği veya telefonu etkin göreve ayrılmış kişileri havuzdan çıkarır. */
export function getAvailableContacts(project) {
  const reservedIds = new Set();
  const reservedPhones = new Set();
  for (const assignment of project.assignments || []) {
    if (assignment.round !== 1 || !ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)) continue;
    for (const contact of assignment.contacts || []) {
      reservedIds.add(contact.recordId);
      reservedPhones.add(cleanPhoneNumber(contact.phone));
    }
  }
  const seenPhones = new Set();
  return (project.contacts || []).filter((contact) => {
    const phone = cleanPhoneNumber(contact.phone);
    const recordId = contact.recordId || contact.id;
    if (!phone || contact.completed || reservedIds.has(recordId) || reservedPhones.has(phone) || seenPhones.has(phone)) return false;
    seenPhones.add(phone);
    return true;
  });
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
      if (isActiveCallback) {
        activeIds.add(row.recordId);
        activePhones.add(cleanPhoneNumber(row.phone));
      }
      const prior = latestByRecord.get(row.recordId);
      if (!prior || round > prior.round) {
        latestByRecord.set(row.recordId, { round, unfinished: assignment.status !== 'completed' });
      } else if (round === prior.round && assignment.status !== 'completed') {
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
      resultRevision: 0, resultDigest: null, lastApplied: {} };
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
      resultRevision: 0, resultDigest: null, lastApplied: {} };
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
    const result = normalizeResult({ eventId: project.eventId, assignmentId: project.assignmentId,
      formVersion: project.formVersion, round: project.round || 1, revision,
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
    if (!Array.isArray(fields) || fields.filter((field) => field.isSystemField === 'name' && field.type === 'text').length !== 1 ||
        fields.some((field) => field.isSystemField && field.isSystemField !== 'name')) {
      throw new Error('İsim alanı gerekli.');
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

/**
 * Projeyi siler
 */
export async function deleteProject(projectId) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
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
