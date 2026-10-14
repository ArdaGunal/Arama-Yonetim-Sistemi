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
