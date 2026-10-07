/**
 * AsyncStorage CRUD işlemleri
 * Tüm proje verilerini yerel olarak yönetir.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

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
