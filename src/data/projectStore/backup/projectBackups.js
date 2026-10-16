import { normalizeBackupProject, sameBackupProject } from '../../../utils/backupFormat';
import { activeSurveyResponses } from '../../../features/surveys/surveyResponses';

/** Yedek okuma/yazma işlemleri; tek yazma sırası ve kurtarma kapıları depoda kalır. */
export function createBackupOperations({
  AsyncStorage, keys, enqueueWrite, getProject, getAllProjects, saveAllProjects,
  readSurveyDraft, loadDraft, loadAttachedSource, storeAttachedSource,
  removeSourceWorkbook, recoverPendingMerge, recoverMergeAfterFailure, setMergeInProgress,
}) {
  const { PROJECTS_KEY, PROJECT_DATA_PREFIX, RESPONSES_PREFIX, DRAFT_KEY,
    MERGE_JOURNAL_KEY } = keys;

  /** Bekleyen form taslağını da katarak dışa aktarılabilir tam görüntüyü döndürür. */
  async function getProjectForBackup(projectId, allowMissingSource = false) {
    return enqueueWrite(async () => {
      const project = await getProject(projectId);
      if (!project) throw new Error('Yedeklenecek proje bulunamadı.');
      if (project.mode === 'survey') project.surveyDraft = await readSurveyDraft(projectId, project);
      const draft = await loadDraft(projectId);
      if (project.mode !== 'survey' && draft && Number.isInteger(draft.contactIndex) &&
          draft.contactIndex >= 0 && draft.contactIndex < project.contacts.length &&
          draft.formData && typeof draft.formData === 'object' && !Array.isArray(draft.formData)) {
        project.contacts = project.contacts.map((contact, index) =>
          index === draft.contactIndex ? { ...contact, data: { ...draft.formData } } : contact
        );
      }
      try {
        project.sourceWorkbook = await loadAttachedSource(project.sourceWorkbookMeta);
      } catch (error) {
        if (!allowMissingSource) throw error;
        project.sourceWorkbook = null;
        project.sourceWorkbookMissing = true;
      }
      return project;
    });
  }

  /** Dış dosya başarıyla üretildikten sonra kalıcı yedek uyarısını kapatır. */
  async function markProjectBackupSaved(projectId, expectedEpoch) {
    return enqueueWrite(async () => {
      const projects = await getAllProjects();
      const project = projects.find((item) => item.id === projectId);
      if (!project) throw new Error('Etkinlik bulunamadı.');
      if ((project.backupEpoch || 0) !== expectedEpoch) return false;
      if (project.backupPending || project.backupSavedEpoch !== expectedEpoch) {
        project.backupPending = false;
        project.backupSavedEpoch = expectedEpoch;
        await saveAllProjects(projects);
      }
      return true;
    });
  }

  /** Aynı etkinliği çoğaltmaz; farklı içerikle gelen dosya mevcut projeyi ezemez. */
  async function restoreProjectBackup(input) {
    const project = normalizeBackupProject(input);
    return enqueueWrite(async () => {
      const projects = await getAllProjects();
      const existing = projects.find((item) => item.id === project.id ||
        (project.role !== 'volunteer' && item.role !== 'volunteer' && item.eventId === project.eventId));
      if (existing) {
        if (existing.id !== project.id) throw new Error('Etkinlik kimliği başka bir projede kullanılıyor.');
        const oldProject = await getProject(project.id);
        oldProject.sourceWorkbook = await loadAttachedSource(existing.sourceWorkbookMeta);
        if (oldProject.mode === 'survey') oldProject.surveyDraft = await readSurveyDraft(project.id, oldProject);
        const draftValue = await AsyncStorage.getItem(DRAFT_KEY + project.id);
        if (oldProject.mode !== 'survey' && draftValue) {
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
      const survey = project.mode === 'survey';
      const key = (survey ? RESPONSES_PREFIX : PROJECT_DATA_PREFIX) + project.id;
      if (await AsyncStorage.getItem(key) || await AsyncStorage.getItem(PROJECT_DATA_PREFIX + project.id) ||
          await AsyncStorage.getItem(RESPONSES_PREFIX + project.id)) {
        throw new Error('Bu kimlikte tamamlanmamış bir yerel kayıt var. Geri yükleme durduruldu.');
      }
      const { contacts, responses, sourceWorkbook, surveyDraft, ...meta } = project;
      if (survey) meta.responseStorage = 1;
      const sourceMeta = await storeAttachedSource(project.id, sourceWorkbook);
      meta.sourceWorkbookMeta = sourceMeta;
      const rows = survey ? responses : contacts;
      meta.totalContacts = survey ? activeSurveyResponses(rows).length : rows.length;
      meta.completedContacts = survey ? meta.totalContacts : rows.filter((contact) => contact.completed).length;
      await AsyncStorage.setItem(MERGE_JOURNAL_KEY, JSON.stringify({
        kind: 'new-restore', projectId: project.id,
        projectsRaw: await AsyncStorage.getItem(PROJECTS_KEY) || '[]', sourceRef: sourceMeta?.ref || null,
      }));
      setMergeInProgress(true);
      try {
        if (surveyDraft) await AsyncStorage.setItem(DRAFT_KEY + project.id, JSON.stringify(surveyDraft));
        await AsyncStorage.setItem(key, JSON.stringify(rows));
        await saveAllProjects([meta, ...projects]);
        await AsyncStorage.removeItem(MERGE_JOURNAL_KEY);
      } catch (error) {
        setMergeInProgress(false);
        await recoverMergeAfterFailure(error, 'Yedek geri yükleme');
      } finally { setMergeInProgress(false); }
      return 'restored';
    });
  }

  /** Kullanıcının dışarı kaydettiği mevcut kopyayı doğrulayarak etkinliği yedekle değiştirir. */
  async function replaceProjectBackup(input, expectedCurrent) {
    const incoming = normalizeBackupProject(input);
    const expected = normalizeBackupProject(expectedCurrent);
    if (incoming.id !== expected.id || incoming.eventId !== expected.eventId) {
      throw new Error('Seçilen yedek bu etkinliğe ait değil.');
    }
    return enqueueWrite(async () => {
      await recoverPendingMerge();
      const projectsRaw = await AsyncStorage.getItem(PROJECTS_KEY);
      const contactsRaw = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + incoming.id);
      const responsesRaw = await AsyncStorage.getItem(RESPONSES_PREFIX + incoming.id);
      if (!projectsRaw || (!contactsRaw && !responsesRaw)) throw new Error('Değiştirilecek etkinlik bulunamadı.');
      const projects = JSON.parse(projectsRaw);
      const index = projects.findIndex((item) => item.id === incoming.id);
      if (index < 0) throw new Error('Değiştirilecek etkinlik bulunamadı.');
      if (projects.some((item, i) => i !== index && item.role !== 'volunteer' &&
          incoming.role !== 'volunteer' && item.eventId === incoming.eventId)) {
        throw new Error('Bu etkinlik kimliği başka bir projede de kullanılıyor.');
      }
      const draftRaw = await AsyncStorage.getItem(DRAFT_KEY + incoming.id);
      const current = await getProject(incoming.id);
      current.sourceWorkbook = await loadAttachedSource(projects[index].sourceWorkbookMeta);
      if (current.mode === 'survey') current.surveyDraft = await readSurveyDraft(incoming.id, current);
      if (current.mode !== 'survey' && draftRaw) {
        const draft = JSON.parse(draftRaw);
        if (Number.isInteger(draft.contactIndex) && draft.contactIndex >= 0 &&
            draft.contactIndex < current.contacts.length && draft.formData &&
            typeof draft.formData === 'object' && !Array.isArray(draft.formData)) {
          current.contacts[draft.contactIndex] = {
            ...current.contacts[draft.contactIndex], data: { ...draft.formData },
          };
        }
      }
      if (!sameBackupProject(current, expected)) {
        throw new Error('Etkinlik, güvenlik yedeği alındıktan sonra değişti. Yeniden yedek alın.');
      }
      if (sameBackupProject(current, incoming)) return 'already-present';
      const { contacts, responses, sourceWorkbook, surveyDraft, ...meta } = incoming;
      const survey = incoming.mode === 'survey';
      if (survey) meta.responseStorage = 1;
      const oldSourceMeta = projects[index].sourceWorkbookMeta;
      const sourceMeta = await storeAttachedSource(incoming.id, sourceWorkbook);
      meta.sourceWorkbookMeta = sourceMeta;
      const rows = survey ? responses : contacts;
      meta.totalContacts = survey ? activeSurveyResponses(rows).length : rows.length;
      meta.completedContacts = survey ? meta.totalContacts : rows.filter((contact) => contact.completed).length;
      projects[index] = meta;
      await AsyncStorage.setItem(MERGE_JOURNAL_KEY, JSON.stringify({
        projectId: incoming.id, projectsRaw, contactsRaw, draftRaw, restoreDraft: true,
        restoreResponses: true, responsesRaw,
      }));
      try {
        if (survey) {
          await AsyncStorage.setItem(RESPONSES_PREFIX + incoming.id, JSON.stringify(rows));
          await AsyncStorage.removeItem(PROJECT_DATA_PREFIX + incoming.id);
        } else {
          await AsyncStorage.setItem(PROJECT_DATA_PREFIX + incoming.id, JSON.stringify(contacts));
          await AsyncStorage.removeItem(RESPONSES_PREFIX + incoming.id);
        }
        await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
        if (surveyDraft) await AsyncStorage.setItem(DRAFT_KEY + incoming.id, JSON.stringify(surveyDraft));
        else await AsyncStorage.removeItem(DRAFT_KEY + incoming.id);
        await AsyncStorage.removeItem(MERGE_JOURNAL_KEY);
      } catch (error) {
        try { await recoverPendingMerge(); }
        catch (recoveryError) {
          throw new Error(`Yedek değiştirme başarısız oldu: ${error.message || error}. Önceki veri geri yüklenemedi: ${recoveryError.message || recoveryError}. Kurtarma kaydı saklandı; uygulamayı yeniden açın.`);
        }
        if (sourceMeta && sourceMeta.ref !== oldSourceMeta?.ref) {
          try { await removeSourceWorkbook(sourceMeta.ref); }
          catch (cleanupError) {
            throw new Error(`Yedek değiştirme başarısız oldu: ${error.message || error}. Yeni Excel eki de temizlenemedi: ${cleanupError.message || cleanupError}.`);
          }
        }
        throw error;
      }
      if (oldSourceMeta && oldSourceMeta.ref !== sourceMeta?.ref) {
        await removeSourceWorkbook(oldSourceMeta.ref).catch(() => {});
      }
      return 'replaced';
    });
  }

  return { getProjectForBackup, markProjectBackupSaved,
    restoreProjectBackup, replaceProjectBackup };
}
