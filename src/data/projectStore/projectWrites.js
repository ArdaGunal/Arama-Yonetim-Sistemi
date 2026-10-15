/** Yeni projeyi kişi yan dosyası ve metadata olarak kaydeder; metadata hatasında yan dosyayı geri alır. */
import { activeSurveyResponses, surveyResponseFields, validateSurveyAnswer } from '../../features/surveys/surveyResponses';
import { canonicalJson } from '../../utils/canonicalJson';

export async function writeNewProject(project, { loadProjects, getContacts, getResponses,
  setContacts, setResponses, removeContacts, removeResponses, saveProjects, saveSource, removeSource }) {
  const projects = await loadProjects();
  if (projects.some((item) => item.id === project.id) || await getContacts(project.id) ||
      await getResponses(project.id)) {
    throw new Error('Bu proje kimliği cihazda zaten var. Mevcut veriler korunuyor.');
  }

  const survey = project.mode === 'survey';
  if (survey && (project.contacts?.length || (project.responses && !Array.isArray(project.responses)))) {
    throw new Error('Anket yanıtları geçersiz; proje veri kaybı olmadan oluşturulamadı.');
  }
  const contacts = survey ? (project.responses || []) : (project.contacts || []);
  const metaProject = { ...project };
  delete metaProject.contacts;
  delete metaProject.responses;
  delete metaProject.sourceWorkbook;
  if (survey) metaProject.responseStorage = 1;
  metaProject.totalContacts = survey ? activeSurveyResponses(contacts).length : contacts.length;
  metaProject.completedContacts = survey ? metaProject.totalContacts :
    contacts.filter((contact) => contact.completed).length;
  const sourceMeta = await saveSource(project.id, project.sourceWorkbook);
  metaProject.sourceWorkbookMeta = sourceMeta;

  try {
    if (survey) await setResponses(project.id, JSON.stringify(contacts));
    else await setContacts(project.id, JSON.stringify(contacts));
    projects.unshift(metaProject);
    await saveProjects(projects);
  } catch (error) {
    const cleanupErrors = [];
    for (const cleanup of [() => removeContacts(project.id),
      ...(survey ? [() => removeResponses(project.id)] : []),
      ...(sourceMeta ? [() => removeSource(sourceMeta.ref)] : [])]) {
      try { await cleanup(); }
      catch (cleanupError) { cleanupErrors.push(cleanupError.message || String(cleanupError)); }
    }
    if (cleanupErrors.length) {
      throw new Error(`Proje kaydedilemedi: ${error.message || error}. Oluşturulan yerel dosyalar temizlenemedi: ${cleanupErrors.join('; ')}.`);
    }
    throw error;
  }
  return project;
}

/** Listesiz anket yanıtını ve sayaçlarını kalıcı kurtarma günlüğüyle birlikte günceller. */
export async function writeSurveyResponse(projectId, input, { loadProjects, getContacts, getResponses,
  setResponses, removeContacts, saveProjects, clearDraft, createId, now,
  fromLegacy, parseResponses, beginUpdate, finishUpdate, recoverUpdate }) {
  const projects = await loadProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project || project.mode !== 'survey') throw new Error('Anket bulunamadı.');
  const data = validateSurveyAnswer(project.fields, input);
  const legacyRaw = await getContacts(projectId);
  const responsesRaw = await getResponses(projectId);
  if (project.responseStorage === 1 && responsesRaw === null) throw new Error('Anket yanıt dosyası bulunamadı.');
  const legacy = project.responseStorage === 1 ? [] : (legacyRaw ? JSON.parse(legacyRaw) : project.contacts || []);
  if (!Array.isArray(legacy)) throw new Error('Anket cevapları okunamadı.');
  const responses = project.responseStorage === 1 ? parseResponses(responsesRaw) : legacy.map(fromLegacy);
  const id = createId();
  const response = { id, data, submittedAt: now(), formVersion: project.formVersion || 1,
    history: [], deletedAt: null };
  const next = [...responses, response];
  project.totalContacts = activeSurveyResponses(next).length;
  project.completedContacts = project.totalContacts;
  project.formLocked = true;
  project.responseStorage = 1;
  project.backupPending = true;
  project.backupEpoch = (project.backupEpoch || 0) + 1;
  if (project.role === 'volunteer') project.surveyDataEpoch = (project.surveyDataEpoch || 0) + 1;
  delete project.contacts;
  try {
    await beginUpdate(projectId, legacyRaw, true, responsesRaw);
    await setResponses(projectId, JSON.stringify(next));
    if (legacyRaw !== null) await removeContacts(projectId);
    await saveProjects(projects);
    await clearDraft(projectId);
    await finishUpdate();
  } catch (error) {
    try {
      await recoverUpdate();
    } catch (rollbackError) {
      throw new Error(`Anket cevabı kaydedilemedi ve önceki veri geri yüklenemedi: ${rollbackError.message}`);
    }
    throw error;
  }
  return response;
}

/** Düzeltme ve geri alınabilir silme, aynı kesinti günlüğüyle tüm yanıt dizisini günceller. */
export async function writeSurveyResponseChange(projectId, responseId, expected, action, input, {
  loadProjects, getContacts, getResponses, setResponses, removeContacts, saveProjects,
  fromLegacy, parseResponses, beginUpdate, finishUpdate, recoverUpdate, now,
}) {
  const projects = await loadProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project || project.mode !== 'survey') throw new Error('Anket bulunamadı.');
  const legacyRaw = await getContacts(projectId);
  const responsesRaw = await getResponses(projectId);
  if (project.responseStorage === 1 && responsesRaw === null) throw new Error('Anket yanıt dosyası bulunamadı.');
  const legacy = project.responseStorage === 1 ? [] : (legacyRaw ? JSON.parse(legacyRaw) : project.contacts || []);
  if (!Array.isArray(legacy)) throw new Error('Anket yanıtları okunamadı.');
  const responses = project.responseStorage === 1 ? parseResponses(responsesRaw) : legacy.map(fromLegacy);
  const index = responses.findIndex((row) => row.id === responseId);
  if (index < 0) throw new Error('Yanıt bulunamadı. Listeyi yenileyin.');
  const previous = responses[index];
  if (canonicalJson(previous) !== canonicalJson(expected)) {
    throw new Error('Bu yanıt başka bir işlemde değişti. Listeyi yenileyin.');
  }
  const at = now();
  const history = [...(previous.history || [])];
  let updated;
  if (action === 'edit') {
    if (previous.deletedAt) throw new Error('Silinmiş yanıtı önce geri alın.');
    const data = validateSurveyAnswer(surveyResponseFields(project, previous), input);
    if (canonicalJson(data) === canonicalJson(previous.data)) return previous;
    history.push({ action: 'edit', at, data: { ...previous.data } });
    updated = { ...previous, data, history };
  } else if (action === 'delete' || action === 'restore') {
    if (action === 'delete' && previous.deletedAt) throw new Error('Yanıt zaten silinmiş.');
    if (action === 'restore' && !previous.deletedAt) throw new Error('Yanıt zaten listede.');
    history.push({ action, at });
    updated = { ...previous, deletedAt: action === 'delete' ? at : null, history };
  } else throw new Error('Yanıt işlemi geçersiz.');
  if (history.length > 10000) throw new Error('Yanıt geçmişi sınırına ulaşıldı.');
  responses[index] = updated;
  project.responseStorage = 1;
  delete project.contacts;
  project.totalContacts = activeSurveyResponses(responses).length;
  project.completedContacts = project.totalContacts;
  project.backupPending = true;
  project.backupEpoch = (project.backupEpoch || 0) + 1;
  if (project.role === 'volunteer') project.surveyDataEpoch = (project.surveyDataEpoch || 0) + 1;
  try {
    await beginUpdate(projectId, legacyRaw, false, responsesRaw);
    await setResponses(projectId, JSON.stringify(responses));
    if (legacyRaw !== null) await removeContacts(projectId);
    await saveProjects(projects);
    await finishUpdate();
  } catch (error) {
    try { await recoverUpdate(); }
    catch (rollbackError) {
      throw new Error(`Yanıt değiştirilemedi ve önceki veri geri yüklenemedi: ${rollbackError.message}`);
    }
    throw error;
  }
  return updated;
}

/** Kişi listesi ve sayaçları birlikte kaydeder; metadata hatasında önceki yan dosyayı geri yükler. */
export async function writeUpdatedProject(projectId, updates, { loadProjects, getContacts,
  setContacts, saveProjects, beginUpdate, finishUpdate, recoverUpdate }) {
  const projects = await loadProjects();
  const index = projects.findIndex((project) => project.id === projectId);
  if (index < 0) return null;
  const project = { ...projects[index] };
  if (project.mode === 'survey' && updates.contacts) {
    throw new Error('Anket yanıtları kişi listesi işlemiyle değiştirilemez.');
  }
  if (updates.currentIndex !== undefined) project.currentIndex = updates.currentIndex;

  let before;
  let nextContacts;
  if (updates.contacts) {
    nextContacts = JSON.stringify(updates.contacts);
    before = await getContacts(projectId);
    if (project.role === 'volunteer') {
      const previous = before ? JSON.parse(before) : [];
      if (updates.contacts.length !== previous.length || updates.contacts.some((contact, i) =>
        (contact.recordId || contact.id) !== (previous[i].recordId || previous[i].id) ||
        contact.phone !== previous[i].phone)) {
        throw new Error('Görevdeki kişi listesi değiştirilemez.');
      }
      if (before !== nextContacts) project.resultDataEpoch = (project.resultDataEpoch || 0) + 1;
    }
    project.totalContacts = updates.contacts.length;
    project.completedContacts = updates.contacts.filter((contact) => contact.completed).length;
    if (project.completedContacts > 0) project.formLocked = true;
  }

  projects[index] = project;
  try {
    if (nextContacts !== undefined) {
      await beginUpdate(projectId, before);
      await setContacts(projectId, nextContacts);
    }
    await saveProjects(projects);
    if (nextContacts !== undefined) await finishUpdate();
  } catch (error) {
    if (nextContacts !== undefined) {
      try {
        await recoverUpdate();
      } catch (rollbackError) {
        throw new Error(`Kişi kaydı başarısız oldu ve önceki veri geri yüklenemedi: ${rollbackError.message}`);
      }
    }
    throw error;
  }
  return { ...project, contacts: updates.contacts };
}
