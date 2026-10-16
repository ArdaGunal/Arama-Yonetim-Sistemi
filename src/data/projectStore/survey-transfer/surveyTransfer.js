import { writeImportedSurveyForm } from '../../../features/survey-transfer/surveyFormImport';
import { activeSurveyResponses, parseSurveyResponses } from '../../../features/surveys/surveyResponses';
import { createSurveyResultFile } from '../../../features/survey-transfer/surveyResultFormat';
import { previewSurveyMerge, applySurveyMerge } from '../../../features/survey-transfer/surveyMerge';

/** Anket dosyası alışverişi; yazma sırası ve günlük yaşam döngüsü depo tarafından sağlanır. */
export function createSurveyTransferOperations({
  AsyncStorage, Crypto, keys, enqueueWrite, getAllProjects, saveAllProjects,
  getProject, waitForPendingWrites, sidecarUpdateJournal,
}) {
  const { PROJECT_DATA_PREFIX, RESPONSES_PREFIX } = keys;

  /** Ana anketten gelen soruları aynı kimlikle yerel, boş bir gönüllü anketi olarak açar. */
  async function importSurveyForm(form, digest) {
    return enqueueWrite(() => writeImportedSurveyForm(form, digest, {
      loadProjects: getAllProjects,
      getResponses: (id) => AsyncStorage.getItem(RESPONSES_PREFIX + id),
      setResponses: (id, raw) => AsyncStorage.setItem(RESPONSES_PREFIX + id, raw),
      removeResponses: (id) => AsyncStorage.removeItem(RESPONSES_PREFIX + id),
      saveProjects: saveAllProjects, createId: Crypto.randomUUID,
    }));
  }

  /** Gönüllünün tüm anket cevaplarını kalıcı kimlikleriyle yeniden gönderilebilir dosyaya koyar. */
  async function createSurveyResponsePacket(projectId) {
    return enqueueWrite(async () => {
      const projects = await getAllProjects();
      const project = projects.find((item) => item.id === projectId && item.mode === 'survey' && item.role === 'volunteer');
      if (!project) throw new Error('Bana gelen anket bulunamadı.');
      const raw = await AsyncStorage.getItem(RESPONSES_PREFIX + projectId);
      if (raw === null) throw new Error('Anket cevap dosyası bulunamadı. Paylaşım durduruldu.');
      const responses = parseSurveyResponses(raw);
      if (!responses.length) throw new Error('Paylaşılacak kaydedilmiş cevap yok.');
      const revision = (project.resultRevision || 0) + 1;
      const sourceId = project.resultSourceId || Crypto.randomUUID();
      const content = await createSurveyResultFile({ eventId: project.eventId,
        eventName: project.name, formVersion: project.formVersion, fields: project.fields,
        sourceId, packetId: Crypto.randomUUID(), revision,
        exportedAt: new Date().toISOString(), responses });
      project.resultSourceId = sourceId;
      project.resultRevision = revision;
      await saveAllProjects(projects);
      return { content, revision, epoch: project.surveyDataEpoch || 0, count: activeSurveyResponses(responses).length };
    });
  }

  /** Paylaşım menüsü değil, kullanıcının dosya kontrolü hatırlatmayı kapatır. */
  async function markSurveyResponsesShared(projectId, revision, expectedEpoch) {
    return enqueueWrite(async () => {
      const projects = await getAllProjects();
      const project = projects.find((item) => item.id === projectId && item.mode === 'survey' && item.role === 'volunteer');
      if (!project) throw new Error('Bana gelen anket bulunamadı.');
      if (project.resultRevision !== revision || (project.surveyDataEpoch || 0) !== expectedEpoch) return false;
      project.surveyExportedEpoch = expectedEpoch;
      await saveAllProjects(projects);
      return true;
    });
  }

  function hasUnsharedSurveyResponses(project) {
    return project?.mode === 'survey' && project.role === 'volunteer' &&
      (project.surveyDataEpoch || 0) > (project.surveyExportedEpoch || 0);
  }

  /** Cevap paketi uygulanmadan önce koordinatöre yeni/aynı/çakışan kayıtları gösterir. */
  async function previewIncomingSurveyResponses(projectId, packet, digest) {
    await waitForPendingWrites();
    const project = await getProject(projectId);
    if (!project) throw new Error('Ana anket bulunamadı.');
    return previewSurveyMerge(project, packet, digest);
  }

  /** Önizleme ve dış yedek güncelse, yanıt ile metadata aynı kurtarma günlüğünde yazılır. */
  async function applyIncomingSurveyResponses(projectId, packet, digest, decisions, expectedSnapshot) {
    return enqueueWrite(async () => {
      const projects = await getAllProjects();
      const index = projects.findIndex((item) => item.id === projectId);
      const meta = projects[index];
      if (!meta || meta.mode !== 'survey' || meta.role === 'volunteer') throw new Error('Ana anket bulunamadı.');
      if (meta.backupSavedEpoch == null || meta.backupSavedEpoch !== (meta.backupEpoch || 0)) {
        throw new Error('Birleştirmeden önce ana anketin güncel .ays yedeğini alın ve dosyayı kontrol edin.');
      }
      const project = await getProject(projectId);
      const preview = previewSurveyMerge(project, packet, digest);
      if (preview.snapshot !== expectedSnapshot) throw new Error('Anket önizlemeden sonra değişti. Dosyayı yeniden inceleyin.');
      if (preview.alreadyProcessed) return { status: 'already-processed', added: 0, conflicts: 0 };
      const next = applySurveyMerge(project, preview, decisions, new Date().toISOString());
      const contactsRaw = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
      const responsesRaw = await AsyncStorage.getItem(RESPONSES_PREFIX + projectId);
      if (meta.responseStorage === 1 && responsesRaw === null) throw new Error('Ana anketin yanıt dosyası eksik.');
      const { responses, ...nextMeta } = next;
      delete nextMeta.contacts;
      nextMeta.responseStorage = 1;
      nextMeta.totalContacts = activeSurveyResponses(responses).length;
      nextMeta.completedContacts = nextMeta.totalContacts;
      nextMeta.formLocked = true;
      nextMeta.backupPending = true;
      nextMeta.backupEpoch = (meta.backupEpoch || 0) + 1;
      projects[index] = nextMeta;
      try {
        await sidecarUpdateJournal.beginUpdate(projectId, contactsRaw, false, responsesRaw);
        await AsyncStorage.setItem(RESPONSES_PREFIX + projectId, JSON.stringify(responses));
        if (contactsRaw !== null) await AsyncStorage.removeItem(PROJECT_DATA_PREFIX + projectId);
        await saveAllProjects(projects);
        await sidecarUpdateJournal.finishUpdate();
      } catch (error) {
        try { await sidecarUpdateJournal.recoverUpdate(); }
        catch (rollbackError) {
          throw new Error(`Anket birleştirmesi başarısız oldu ve önceki veri geri yüklenemedi: ${rollbackError.message}`);
        }
        throw error;
      }
      return { status: 'merged', added: preview.added.length, conflicts: preview.conflicts.length };
    });
  }

  return { importSurveyForm, createSurveyResponsePacket, markSurveyResponsesShared, hasUnsharedSurveyResponses, previewIncomingSurveyResponses, applyIncomingSurveyResponses };
}
