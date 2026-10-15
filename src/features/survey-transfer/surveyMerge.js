import { canonicalJson } from '../../utils/canonicalJson';
import { normalizeSurveyResult } from './surveyResultFormat';

/** Dosya yalnız aynı etkinlikte ve kaydedilmiş form sürümünde birleştirilir. */
export function previewSurveyMerge(project, packet, digest) {
  const result = normalizeSurveyResult(packet);
  if (project?.mode !== 'survey' || project.role === 'volunteer' || project.eventId !== result.eventId) {
    throw new Error('Cevap dosyası bu ana ankete ait değil.');
  }
  const version = (project.formHistory || []).find((item) => item.version === result.formVersion);
  if (!version || canonicalJson(version.fields) !== canonicalJson(result.fields)) {
    throw new Error('Cevap dosyasının soruları veya form sürümü ana anketle uyuşmuyor.');
  }
  const imported = project.surveyImportedPackets || [];
  const reusedId = imported.find((item) => item.packetId === result.packetId);
  if (reusedId && reusedId.digest !== digest) throw new Error('Aynı paket kimliği farklı içerikle geldi. Dosya incelenmeli.');
  const previousSource = imported.filter((item) => item.sourceId === result.sourceId);
  const newer = previousSource.find((item) => item.revision > result.revision);
  if (newer) throw new Error('Bu cihazdan daha yeni bir cevap dosyası zaten işlendi. Eski dosya uygulanmadı.');
  const sameRevision = previousSource.find((item) => item.revision === result.revision);
  if (sameRevision && sameRevision.digest !== digest) throw new Error('Aynı cihaz sürümü farklı içerikle geldi. Dosya incelenmeli.');
  const known = new Map((project.responses || []).map((row) => [row.id, row]));
  const added = [];
  const duplicates = [];
  const conflicts = [];
  for (const response of result.responses) {
    const existing = known.get(response.id);
    if (!existing) added.push(response);
    else if (canonicalJson(existing) === canonicalJson(response)) duplicates.push(response.id);
    else conflicts.push({ id: response.id, current: existing, incoming: response });
  }
  return { result, digest, added, duplicates, conflicts,
    alreadyProcessed: imported.some((item) => item.digest === digest),
    snapshot: canonicalJson({ responses: project.responses || [],
      imported, formHistory: project.formHistory, backupEpoch: project.backupEpoch || 0 }) };
}

/** Çakışmanın iki görüntüsü kararda kalır; gelen cevap sessizce eskisini ezmez. */
export function applySurveyMerge(project, preview, decisions, at) {
  if (preview.alreadyProcessed) return project;
  const choices = decisions || {};
  for (const conflict of preview.conflicts) {
    if (!['keep', 'incoming'].includes(choices[conflict.id])) {
      throw new Error('Her farklı yanıt için bir karar verin.');
    }
  }
  const nextRows = [...(project.responses || [])];
  const positions = new Map(nextRows.map((row, index) => [row.id, index]));
  for (const response of preview.added) nextRows.push(response);
  for (const conflict of preview.conflicts) {
    if (choices[conflict.id] === 'incoming') nextRows[positions.get(conflict.id)] = conflict.incoming;
  }
  const conflicts = [...(project.surveyMergeConflicts || []), ...preview.conflicts.map((item) => ({
    responseId: item.id, packetId: preview.result.packetId, decision: choices[item.id],
    at, previous: item.current, incoming: item.incoming,
  }))];
  if (conflicts.length > 1000) throw new Error('Anket çakışma geçmişi sınırına ulaştı. Yedek alıp inceleyin.');
  const imported = [...(project.surveyImportedPackets || []), {
    packetId: preview.result.packetId, digest: preview.digest,
    sourceId: preview.result.sourceId, revision: preview.result.revision, at,
  }];
  if (imported.length > 10000) throw new Error('İşlenmiş dosya sınırına ulaşıldı.');
  return { ...project, responses: nextRows, surveyMergeConflicts: conflicts,
    surveyImportedPackets: imported };
}
