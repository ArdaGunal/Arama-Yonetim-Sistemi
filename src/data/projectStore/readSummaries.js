/** Eski projelerde eksik olan sayaçları kişi/yanıt yan dosyasından hesaplar. */
export async function readProjectSummaries(projects, readContacts) {
  return Promise.all(projects.map(async (project) => {
    if (Number.isInteger(project.totalContacts) && Number.isInteger(project.completedContacts)) {
      return project;
    }
    const storedContacts = await readContacts(project.id);
    const contacts = storedContacts ? JSON.parse(storedContacts) : (project.contacts || []);
    if (!Array.isArray(contacts)) throw new Error('Proje kişi listesi okunamadı.');
    return { ...project, totalContacts: contacts.length,
      completedContacts: contacts.filter((contact) => contact.completed).length };
  }));
}
