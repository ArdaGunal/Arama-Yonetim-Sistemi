import { canonicalJson } from '../../utils/canonicalJson';
import { normalizeSurveyForm } from './surveyFormFormat';

/** Aynı form tekrar geldiğinde gönüllünün yerel cevaplarına dokunmaz. */
export async function writeImportedSurveyForm(input, digest, {
  loadProjects, getResponses, setResponses, removeResponses, saveProjects, createId,
}) {
  const form = normalizeSurveyForm(input);
  if (!/^[a-f0-9]{64}$/.test(digest || '')) throw new Error('Anket dosyası özeti geçersiz.');
  const projects = await loadProjects();
  const sameEvent = projects.filter((item) => item.mode === 'survey' && item.eventId === form.eventId);
  const coordinator = sameEvent.find((item) => item.role !== 'volunteer');
  if (coordinator) {
    if (coordinator.formVersion !== form.formVersion ||
        canonicalJson(coordinator.fields) !== canonicalJson(form.fields)) {
      throw new Error('Bu cihazdaki ana anketin soruları dosyadan farklı. Dosyayı açmadan önce kontrol edin.');
    }
    return { projectId: coordinator.id, state: 'already-present' };
  }
  const existing = sameEvent.find((item) => item.role === 'volunteer' && item.importDigest === digest);
  if (existing) return { projectId: existing.id, state: 'already-present' };
  const sameVersion = sameEvent.find((item) => item.role === 'volunteer' && item.formVersion === form.formVersion);
  if (sameVersion) {
    if (canonicalJson(sameVersion.fields) !== canonicalJson(form.fields)) {
      throw new Error('Aynı anket sürümünde farklı sorular var. Önce ana kişiden doğru dosyayı isteyin.');
    }
    return { projectId: sameVersion.id, state: 'already-present' };
  }
  const id = createId();
  const project = {
    id, eventId: form.eventId, mode: 'survey', role: 'volunteer', assignmentId: id,
    importDigest: digest, resultSourceId: createId(), resultRevision: 0,
    surveyDataEpoch: 0, surveyExportedEpoch: 0,
    name: form.eventName, createdAt: new Date().toISOString(), currentIndex: 0,
    fields: form.fields, formHistory: form.formHistory, formVersion: form.formVersion,
    formLocked: true, templateId: null, sourceReview: null, sourceWorkbookMeta: null,
    totalContacts: 0, completedContacts: 0, responseStorage: 1,
  };
  if (projects.some((item) => item.id === id) || await getResponses(id)) {
    throw new Error('Yeni anket kimliği cihazda zaten var. Dosyayı tekrar açın.');
  }
  await setResponses(id, '[]');
  try { await saveProjects([project, ...projects]); }
  catch (error) { await removeResponses(id).catch(() => {}); throw error; }
  return { projectId: id, state: 'imported' };
}
