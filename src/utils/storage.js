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
const TEMPLATES_KEY = '@ays_templates';

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
        if (pMeta.completedContacts > 0) pMeta.formLocked = true;
        await AsyncStorage.setItem(PROJECT_DATA_PREFIX + projectId, JSON.stringify(updates.contacts));
      }

      projects[index] = pMeta;
      await saveAllProjects(projects);
      return { ...pMeta, contacts: updates.contacts }; // Yeni objeyi döndür
    }
    return null;
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

/** İlk aramadan önce formu atomik olarak günceller ve sürümünü artırır. */
export async function updateProjectForm(projectId, fields) {
  return enqueueWrite(async () => {
    const projects = await getAllProjects();
    const project = projects.find((item) => item.id === projectId);
    if (!project) throw new Error('Etkinlik bulunamadı.');
    const stored = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
    const contacts = stored ? JSON.parse(stored) : project.contacts || [];
    if (project.formLocked || contacts.some((contact) => contact.completed) ||
        await AsyncStorage.getItem(DRAFT_KEY + projectId)) {
      throw new Error('Arama başladıktan sonra sorular değiştirilemez.');
    }
    if (!Array.isArray(fields) || fields.filter((field) => field.isSystemField === 'name' && field.type === 'text').length !== 1 ||
        fields.some((field) => field.isSystemField && field.isSystemField !== 'name')) {
      throw new Error('İsim alanı gerekli.');
    }
    const ids = new Set();
    for (const field of fields) {
      if (!field.id || ids.has(field.id) || !field.label?.trim() ||
          !['text', 'select'].includes(field.type) || !Array.isArray(field.options)) {
        throw new Error('Formda geçersiz veya tekrar eden alan var.');
      }
      ids.add(field.id);
      if (field.type === 'select' && (field.options.length < 2 ||
          field.options.some((option) => !option.trim()) ||
          new Set(field.options).size !== field.options.length)) {
        throw new Error(`"${field.label}" şıkları geçersiz.`);
      }
    }
    for (const contact of contacts) {
      for (const [fieldId, answer] of Object.entries(contact.data || {})) {
        const field = fields.find((item) => item.id === fieldId);
        if (!field) throw new Error('Kaynak kişide dolu olan bir alan silinemez.');
        if (field.type === 'select' && answer && !field.options.includes(answer)) {
          throw new Error(`"${field.label}" için mevcut cevap şıklarda yok.`);
        }
      }
    }
    if (JSON.stringify(project.fields) === JSON.stringify(fields)) return project;
    project.fields = fields;
    project.formVersion = (project.formVersion || 1) + 1;
    if (project.sourceReview) project.sourceReview.columns = project.sourceReview.columns.map((column) => ({
      ...column, fieldId: ids.has(column.fieldId) ? column.fieldId : null,
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
