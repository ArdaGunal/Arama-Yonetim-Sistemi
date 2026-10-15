// Kalıcı biçimi koruyan, yan etkisiz anket proje hazırlığı.
export function createSurveyProject({ projectName, fields, templateId, randomUUID, createdAt }) {
  if (!projectName.trim()) throw new Error('Önce ankete bir ad verin.');
  if (!fields.length || fields.length > 100 || new Set(fields.map((field) => field.id)).size !== fields.length ||
      fields.some((field) => !field.label.trim() || field.isSystemField)) {
    throw new Error('En az bir sorunun adını yazın veya boş soruyu silin.');
  }
  const saveFields = fields.map((field, index) => ({ id: field.id, label: field.label.trim(),
    type: field.type, options: field.type === 'select' ? field.options.map((option) => option.trim()) : [],
    order: index, required: !!field.required }));
  for (const field of saveFields) if (field.type === 'select' &&
    (field.options.length < 2 || field.options.some((option) => !option) ||
      new Set(field.options).size !== field.options.length)) {
    throw new Error(`"${field.label}" için en az iki farklı seçenek girin.`);
  }
  const id = randomUUID();
  return { id, eventId: id, mode: 'survey', name: projectName.trim(),
    createdAt, currentIndex: 0, formVersion: 1, formLocked: false,
    templateId, fields: saveFields, formHistory: [{ version: 1, fields: saveFields }],
    responses: [], sourceWorkbook: null, sourceReview: null };
}
