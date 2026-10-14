/** Kaydedilmemiş anket cevabını güncel form ile doğrular; boş taslak tutmaz. */
export function normalizeSurveyDraft(input, fields, formVersion) {
  if (input == null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      input.formVersion !== formVersion || !input.data ||
      typeof input.data !== 'object' || Array.isArray(input.data)) {
    throw new Error('Anket taslağı geçersiz veya sorular değişmiş.');
  }
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const data = {};
  for (const [id, value] of Object.entries(input.data)) {
    const field = fieldById.get(id);
    if (!field || ['__proto__', 'constructor', 'prototype'].includes(id) ||
        typeof value !== 'string' || value.length > 10000 ||
        (field.type === 'select' && value && !field.options.includes(value))) {
      throw new Error('Anket taslağındaki cevaplar sorularla uyuşmuyor.');
    }
    if (value) data[id] = value;
  }
  return Object.values(data).some((value) => value.trim())
    ? { formVersion, data } : null;
}
