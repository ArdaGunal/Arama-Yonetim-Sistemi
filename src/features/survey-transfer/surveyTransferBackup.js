import { normalizeSurveyResponse } from '../surveys/surveyResponses';

const digest = (value) => /^[a-f0-9]{64}$/.test(value || '');
const id = (value) => typeof value === 'string' && !!value.trim() && value.length <= 128;
const date = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** v9 yedeklerindeki eksik alanları boş kabul eder; v10 aktarma geçmişini korur. */
export function normalizeSurveyTransferState(project, fieldIds, formVersion, role) {
  const rawPackets = project.surveyImportedPackets || [];
  const rawConflicts = project.surveyMergeConflicts || [];
  if (!Array.isArray(rawPackets) || rawPackets.length > 10000 ||
      !Array.isArray(rawConflicts) || rawConflicts.length > 1000) {
    throw new Error('Anket dosya geçmişi geçersiz.');
  }
  const surveyImportedPackets = rawPackets.map((item) => {
    if (!item || !id(item.packetId) || !digest(item.digest) || !id(item.sourceId) ||
        !Number.isSafeInteger(item.revision) || item.revision < 1 || !date(item.at)) {
      throw new Error('İşlenmiş anket paketi geçersiz.');
    }
    return { packetId: item.packetId, digest: item.digest, sourceId: item.sourceId,
      revision: item.revision, at: item.at };
  });
  if (new Set(surveyImportedPackets.map((item) => item.packetId)).size !== surveyImportedPackets.length) {
    throw new Error('Yedekte yinelenen anket paketi var.');
  }
  const surveyMergeConflicts = rawConflicts.map((item) => {
    if (!item || !id(item.responseId) || !id(item.packetId) ||
        !['keep', 'incoming'].includes(item.decision) || !date(item.at)) {
      throw new Error('Anket çakışma geçmişi geçersiz.');
    }
    const previous = normalizeSurveyResponse(item.previous, fieldIds, formVersion);
    const incoming = normalizeSurveyResponse(item.incoming, fieldIds, formVersion);
    if (previous.id !== item.responseId || incoming.id !== item.responseId) {
      throw new Error('Anket çakışma kimliği uyuşmuyor.');
    }
    return { responseId: item.responseId, packetId: item.packetId,
      decision: item.decision, at: item.at, previous, incoming };
  });
  const surveyDataEpoch = project.surveyDataEpoch || 0;
  const surveyExportedEpoch = project.surveyExportedEpoch || 0;
  if (!Number.isSafeInteger(surveyDataEpoch) || surveyDataEpoch < 0 ||
      !Number.isSafeInteger(surveyExportedEpoch) || surveyExportedEpoch < 0 ||
      surveyExportedEpoch > surveyDataEpoch ||
      (role === 'volunteer' && (surveyImportedPackets.length || surveyMergeConflicts.length))) {
    throw new Error('Anket aktarım durumu geçersiz.');
  }
  return { surveyImportedPackets, surveyMergeConflicts, surveyDataEpoch, surveyExportedEpoch };
}
