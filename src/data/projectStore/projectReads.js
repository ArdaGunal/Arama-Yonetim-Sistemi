/** Depodan okunan proje metadatasını çözümler. Kurtarma kontrolü çağıran taraftadır. */
export async function readProjectMetadata(readMetadata) {
  const data = await readMetadata();
  return data ? JSON.parse(data) : [];
}

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

/** Kişi/yanıt yan dosyası varsa onu, eski projede yoksa metadata içindeki veriyi kullanır. */
export async function readProjectContacts(project, readContacts) {
  const contactsData = await readContacts(project.id);
  if (contactsData) {
    project.contacts = JSON.parse(contactsData);
  } else if (!project.contacts) {
    project.contacts = [];
  }
  return project;
}
