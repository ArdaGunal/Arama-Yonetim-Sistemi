/** Yarım kalan kişi güncellemesini önceki metadata ve kişi görüntüsüne döndürür. */
export async function recoverProjectUpdateJournal({ readJournal, readProjects, readContacts,
  setProjects, setContacts, removeContacts, removeJournal }) {
  const raw = await readJournal();
  if (raw == null) return false;
  let journal;
  try { journal = JSON.parse(raw); } catch { throw new Error('Kişi güncelleme kurtarma kaydı bozuk.'); }
  if (journal?.version !== 1 || typeof journal.projectId !== 'string' || !journal.projectId ||
      typeof journal.projectsRaw !== 'string' ||
      !(typeof journal.contactsRaw === 'string' || journal.contactsRaw === null)) {
    throw new Error('Kişi güncelleme kurtarma kaydı bozuk.');
  }

  const currentContacts = await readContacts(journal.projectId);
  if (journal.contactsRaw === null) {
    if (currentContacts !== null) await removeContacts(journal.projectId);
  } else if (currentContacts !== journal.contactsRaw) {
    await setContacts(journal.projectId, journal.contactsRaw);
  }
  if (await readProjects() !== journal.projectsRaw) await setProjects(journal.projectsRaw);
  await removeJournal();
  return true;
}
