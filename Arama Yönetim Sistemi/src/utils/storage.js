/**
 * AsyncStorage CRUD işlemleri
 * Tüm proje verilerini yerel olarak yönetir.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROJECTS_KEY = '@ays_projects';
const DRAFT_KEY = '@ays_draft_'; // + projectId

/**
 * Tüm projeleri getirir
 */
export async function getAllProjects() {
  try {
    const data = await AsyncStorage.getItem(PROJECTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Projeler yüklenemedi:', e);
    return [];
  }
}

/**
 * Tüm projeleri kaydeder (üzerine yazar)
 */
export async function saveAllProjects(projects) {
  try {
    await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('Projeler kaydedilemedi:', e);
  }
}

/**
 * Tek bir projeyi ID ile getirir
 */
export async function getProject(projectId) {
  const projects = await getAllProjects();
  return projects.find((p) => p.id === projectId) || null;
}

/**
 * Yeni proje oluşturur
 */
export async function createProject(project) {
  const projects = await getAllProjects();
  projects.unshift(project); // en başa ekle
  await saveAllProjects(projects);
  return project;
}

/**
 * Projeyi günceller (contacts, currentIndex vb.)
 */
export async function updateProject(projectId, updates) {
  const projects = await getAllProjects();
  const index = projects.findIndex((p) => p.id === projectId);
  if (index !== -1) {
    projects[index] = { ...projects[index], ...updates };
    await saveAllProjects(projects);
    return projects[index];
  }
  return null;
}

/**
 * Projeyi siler
 */
export async function deleteProject(projectId) {
  const projects = await getAllProjects();
  const filtered = projects.filter((p) => p.id !== projectId);
  await saveAllProjects(filtered);
  // Draft'ı da sil
  await clearDraft(projectId);
}

/**
 * Geçici form verisini (draft) kaydeder - otomatik kaydetme için
 */
export async function saveDraft(projectId, draftData) {
  try {
    await AsyncStorage.setItem(
      DRAFT_KEY + projectId,
      JSON.stringify(draftData)
    );
  } catch (e) {
    console.error('Draft kaydedilemedi:', e);
  }
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
  try {
    await AsyncStorage.removeItem(DRAFT_KEY + projectId);
  } catch (e) {
    console.error('Draft silinemedi:', e);
  }
}
