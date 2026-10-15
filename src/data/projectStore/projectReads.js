/** Depodan okunan proje metadatasını çözümler. Kurtarma kontrolü çağıran taraftadır. */
export async function readProjectMetadata(readMetadata) {
  const data = await readMetadata();
  return data ? JSON.parse(data) : [];
}

/** Eski projelerde eksik olan sayaçları kişi/yanıt yan dosyasından hesaplar. */
export async function readProjectSummaries(projects, readContacts, readResponses) {
  return Promise.all(projects.map(async (project) => {
    if (Number.isInteger(project.totalContacts) && Number.isInteger(project.completedContacts)) {
      return project;
    }
    const storedContacts = project.mode === 'survey' && project.responseStorage === 1
      ? await readResponses(project.id) : await readContacts(project.id);
    if (project.mode === 'survey' && project.responseStorage === 1 && storedContacts === null) {
      throw new Error('Anket yanıt dosyası bulunamadı.');
    }
    const contacts = storedContacts ? JSON.parse(storedContacts) : (project.contacts || []);
    if (!Array.isArray(contacts)) throw new Error('Proje kişi listesi okunamadı.');
    return { ...project, totalContacts: contacts.length,
      completedContacts: project.mode === 'survey' && project.responseStorage === 1
        ? contacts.length : contacts.filter((contact) => contact.completed).length };
  }));
}

/** Kişi/yanıt yan dosyası varsa onu, eski projede yoksa metadata içindeki veriyi kullanır. */
export async function readProjectContacts(project, readContacts, readResponses, fromLegacy, parseResponses) {
  if (project.mode === 'survey') {
    const raw = project.responseStorage === 1
      ? await readResponses(project.id) : await readContacts(project.id);
    if (project.responseStorage === 1 && raw === null) throw new Error('Anket yanıt dosyası bulunamadı.');
    const legacy = raw ? JSON.parse(raw) : (project.contacts || []);
    if (!Array.isArray(legacy)) throw new Error('Anket yanıtları okunamadı.');
    project.responses = project.responseStorage === 1 ? parseResponses(raw) : legacy.map(fromLegacy);
    delete project.contacts;
    return project;
  }
  const contactsData = await readContacts(project.id);
  if (contactsData) {
    project.contacts = JSON.parse(contactsData);
  } else if (!project.contacts) {
    project.contacts = [];
  }
  return project;
}
