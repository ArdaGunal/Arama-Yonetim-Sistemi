import { activeSurveyResponses } from './surveyResponses';

/** Güncel ve eski soru kimlikleri için tek, ayırt edilebilir sütun listesi üretir. */
export function surveyExportFields(project) {
  const current = project.fields || [];
  const seenIds = new Set(current.map((field) => field.id));
  const candidates = current.map((field) => ({ ...field }));
  const history = [...(project.formHistory || [])].sort((a, b) => a.version - b.version);
  for (const snapshot of history) for (const field of snapshot.fields || []) {
    if (seenIds.has(field.id)) continue;
    seenIds.add(field.id);
    candidates.push({ ...field, label: `${field.label} (Form ${snapshot.version})` });
  }
  const usedLabels = new Set();
  return candidates.map((field) => {
    const base = field.label;
    let label = base;
    let number = 2;
    while (usedLabels.has(label)) label = `${base} [${number++}]`;
    usedLabels.add(label);
    return { ...field, label };
  });
}

/** Excel ve CSV aynı sütun sırası ile aynı etkin yanıtları kullanır. */
export function surveyExportRows(project) {
  const fields = surveyExportFields(project);
  return {
    fields,
    header: ['Yanıt zamanı', 'Yanıt kimliği', ...fields.map((field) => field.label)],
    rows: activeSurveyResponses(project.responses || []).map((response) => [
      response.submittedAt || '', response.id,
      ...fields.map((field) => response.data?.[field.id] || ''),
    ]),
  };
}
