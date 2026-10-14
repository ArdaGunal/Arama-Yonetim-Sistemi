/** Yeni projeyi kişi yan dosyası ve metadata olarak kaydeder; metadata hatasında yan dosyayı geri alır. */
export async function writeNewProject(project, { loadProjects, getContacts, setContacts,
  removeContacts, saveProjects, saveSource, removeSource }) {
  const projects = await loadProjects();
  if (projects.some((item) => item.id === project.id) || await getContacts(project.id)) {
    throw new Error('Bu proje kimliği cihazda zaten var. Mevcut veriler korunuyor.');
  }

  const contacts = project.contacts || [];
  const metaProject = { ...project };
  delete metaProject.contacts;
  delete metaProject.sourceWorkbook;
  metaProject.totalContacts = contacts.length;
  metaProject.completedContacts = contacts.filter((contact) => contact.completed).length;
  const sourceMeta = await saveSource(project.id, project.sourceWorkbook);
  metaProject.sourceWorkbookMeta = sourceMeta;

  try {
    await setContacts(project.id, JSON.stringify(contacts));
    projects.unshift(metaProject);
    await saveProjects(projects);
  } catch (error) {
    await removeContacts(project.id).catch(() => {});
    if (sourceMeta) await removeSource(sourceMeta.ref).catch(() => {});
    throw error;
  }
  return project;
}

/** Listesiz anket yanıtını ve proje sayaçlarını birlikte günceller; metadata hatasında yanıtları geri alır. */
export async function writeSurveyResponse(projectId, input, { loadProjects, getContacts,
  setContacts, saveProjects, createId, now }) {
  const projects = await loadProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project || project.mode !== 'survey') throw new Error('Anket bulunamadı.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Cevaplar geçersiz.');
  const fieldIds = new Set(project.fields.map((field) => field.id));
  if (Object.keys(input).some((key) => !fieldIds.has(key))) throw new Error('Anket soruları değişti. Ekranı yeniden açın.');
  const data = {};
  for (const field of project.fields) {
    const value = String(input[field.id] ?? '').trim();
    if (field.required && !value) throw new Error(`"${field.label}" boş bırakılamaz.`);
    if (field.type === 'select' && value && !field.options.includes(value)) {
      throw new Error(`"${field.label}" için geçersiz şık.`);
    }
    if (value.length > 10000) throw new Error(`"${field.label}" cevabı çok uzun.`);
    if (value) data[field.id] = value;
  }
  if (!Object.keys(data).length) throw new Error('Kaydetmek için en az bir soruyu cevaplayın.');
  const before = await getContacts(projectId);
  const contacts = before ? JSON.parse(before) : [];
  if (!Array.isArray(contacts)) throw new Error('Anket cevapları okunamadı.');
  const id = createId();
  const response = { id, recordId: id, phone: '', data, completed: true, completedAt: now() };
  const next = [...contacts, response];
  const previousMeta = { ...project };
  project.totalContacts = next.length;
  project.completedContacts = next.length;
  project.formLocked = true;
  try {
    await setContacts(projectId, JSON.stringify(next));
    await saveProjects(projects);
  } catch (error) {
    await setContacts(projectId, before || '[]').catch(() => {});
    Object.assign(project, previousMeta);
    throw error;
  }
  return response;
}

/** Kişi listesi ve sayaçları birlikte kaydeder; metadata hatasında önceki yan dosyayı geri yükler. */
export async function writeUpdatedProject(projectId, updates, { loadProjects, getContacts,
  setContacts, removeContacts, saveProjects }) {
  const projects = await loadProjects();
  const index = projects.findIndex((project) => project.id === projectId);
  if (index < 0) return null;
  const project = { ...projects[index] };
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
    if (nextContacts !== undefined) await setContacts(projectId, nextContacts);
    await saveProjects(projects);
  } catch (error) {
    if (nextContacts !== undefined) {
      try {
        if (before == null) await removeContacts(projectId);
        else await setContacts(projectId, before);
      } catch (rollbackError) {
        throw new Error(`Kişi kaydı başarısız oldu ve önceki veri geri yüklenemedi: ${rollbackError.message}`);
      }
    }
    throw error;
  }
  return { ...project, contacts: updates.contacts };
}
