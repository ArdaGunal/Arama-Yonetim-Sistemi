/**
 * AsyncStorage CRUD işlemleri
 * Tüm proje verilerini yerel olarak yönetir.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeBackupProject, sameBackupProject } from './backupFormat';

const PROJECTS_KEY = '@ays_projects';
const PROJECT_DATA_PREFIX = '@ays_project_data_';
const DRAFT_KEY = '@ays_draft_';
const DIAGNOSTIC_KEY = '@ays_last_diagnostic';

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

/** Aynı etkinliği çoğaltmaz; farklı içerikle gelen dosya mevcut projeyi ezemez. */
export async function restoreProjectBackup(input) {
  const project = normalizeBackupProject(input);
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const existing = projects.find((item) => item.id === project.id || item.eventId === project.eventId);
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
        pMeta.totalContacts = updates.contacts.length;
        pMeta.completedContacts = updates.contacts.filter((contact) => contact.completed).length;
        await AsyncStorage.setItem(PROJECT_DATA_PREFIX + projectId, JSON.stringify(updates.contacts));
      }

      projects[index] = pMeta;
      await saveAllProjects(projects);
      return { ...pMeta, contacts: updates.contacts }; // Yeni objeyi döndür
    }
    return null;
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
