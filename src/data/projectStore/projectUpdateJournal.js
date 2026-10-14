/** Yarım kalan kişi güncellemesini önceki metadata ve kişi görüntüsüne döndürür. */
export async function recoverProjectUpdateJournal({ readJournal, readProjects, readContacts,
  readDraft, setProjects, setContacts, removeContacts, setDraft, removeDraft, removeJournal }) {
  const raw = await readJournal();
  if (raw == null) return false;
  let journal;
  try { journal = JSON.parse(raw); } catch { throw new Error('Kişi güncelleme kurtarma kaydı bozuk.'); }
  if (journal?.version !== 1 || typeof journal.projectId !== 'string' || !journal.projectId ||
      typeof journal.projectsRaw !== 'string' ||
      !(typeof journal.contactsRaw === 'string' || journal.contactsRaw === null) ||
      (journal.restoreDraft !== undefined && typeof journal.restoreDraft !== 'boolean') ||
      (journal.restoreDraft && !(typeof journal.draftRaw === 'string' || journal.draftRaw === null))) {
    throw new Error('Kişi güncelleme kurtarma kaydı bozuk.');
  }

  const currentContacts = await readContacts(journal.projectId);
  if (journal.contactsRaw === null) {
    if (currentContacts !== null) await removeContacts(journal.projectId);
  } else if (currentContacts !== journal.contactsRaw) {
    await setContacts(journal.projectId, journal.contactsRaw);
  }
  if (await readProjects() !== journal.projectsRaw) await setProjects(journal.projectsRaw);
  if (journal.restoreDraft) {
    const currentDraft = await readDraft(journal.projectId);
    if (journal.draftRaw === null) {
      if (currentDraft !== null) await removeDraft(journal.projectId);
    } else if (currentDraft !== journal.draftRaw) {
      await setDraft(journal.projectId, journal.draftRaw);
    }
  }
  await removeJournal();
  return true;
}
