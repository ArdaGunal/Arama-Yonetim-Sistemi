/** Eski anketlerin kişi biçimindeki yanıtlarını yeni yanıta kayıpsız çevirir. */
export function fromLegacySurveyContact(contact) {
  return { id: contact.recordId || contact.id, data: { ...contact.data },
    submittedAt: contact.completedAt };
}

/** .ays v8 sözleşmesi için geçici dış dosya adaptörü. */
export function toLegacySurveyContact(response) {
  return { id: response.id, recordId: response.id, phone: '',
    data: { ...response.data }, completed: true, completedAt: response.submittedAt };
}

export function parseSurveyResponses(raw, label = 'Anket yanıtları') {
  let responses;
  try { responses = JSON.parse(raw); } catch { throw new Error(`${label} okunamadı.`); }
  const validDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const validData = (value) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value).every((answer) => typeof answer === 'string');
  const validHistory = (entry) => entry && ['edit', 'delete', 'restore'].includes(entry.action) &&
    validDate(entry.at) && (entry.action !== 'edit' || validData(entry.data));
  if (!Array.isArray(responses) || responses.some((row) => !row ||
      typeof row.id !== 'string' || !row.id || !validData(row.data) ||
      !validDate(row.submittedAt) || (row.deletedAt != null && !validDate(row.deletedAt)) ||
      (row.history != null && (!Array.isArray(row.history) || !row.history.every(validHistory))))) {
    throw new Error(`${label} geçersiz.`);
  }
  if (new Set(responses.map((row) => row.id)).size !== responses.length) {
    throw new Error(`${label} içinde yinelenen kimlik var.`);
  }
  return responses;
}

export function activeSurveyResponses(responses) {
  return responses.filter((response) => !response.deletedAt);
}

export function surveyResponseFields(project, response) {
  const history = project.formHistory || [{ version: project.formVersion || 1, fields: project.fields }];
  if (response.formVersion) {
    const found = history.find((item) => item.version === response.formVersion);
    if (found) return found.fields;
  }
  const keys = Object.keys(response.data || {});
  return history.find((item) => keys.every((key) => item.fields.some((field) => field.id === key)))?.fields ||
    project.fields;
}

export function normalizeSurveyResponse(raw, fieldIds, formVersion) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      typeof raw.id !== 'string' || !raw.id || raw.id.length > 128 ||
      typeof raw.submittedAt !== 'string' || !Number.isFinite(Date.parse(raw.submittedAt)) ||
      !raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data) ||
      Object.entries(raw.data).some(([key, value]) => !fieldIds.has(key) || typeof value !== 'string' || value.length > 10000) ||
      !Object.values(raw.data).some((value) => value.trim()) ||
      (raw.deletedAt != null && (typeof raw.deletedAt !== 'string' || !Number.isFinite(Date.parse(raw.deletedAt)))) ||
      (raw.formVersion != null && (!Number.isInteger(raw.formVersion) || raw.formVersion < 1 || raw.formVersion > formVersion)) ||
      (raw.history != null && (!Array.isArray(raw.history) || raw.history.length > 10000))) {
    throw new Error('Anket yanıtı geçersiz.');
  }
  const history = (raw.history || []).map((entry) => {
    if (!entry || !['edit', 'delete', 'restore'].includes(entry.action) ||
        typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at)) ||
        (entry.action === 'edit' && (!entry.data || typeof entry.data !== 'object' ||
          Array.isArray(entry.data) || Object.entries(entry.data).some(([key, value]) =>
            !fieldIds.has(key) || typeof value !== 'string' || value.length > 10000)))) {
      throw new Error('Anket yanıtı geçmişi geçersiz.');
    }
    return { action: entry.action, at: entry.at,
      ...(entry.action === 'edit' ? { data: { ...entry.data } } : {}) };
  });
  return { id: raw.id, data: { ...raw.data }, submittedAt: raw.submittedAt,
    formVersion: raw.formVersion || null, history, deletedAt: raw.deletedAt || null };
}

export function validateSurveyAnswer(fields, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Cevaplar geçersiz.');
  const fieldIds = new Set(fields.map((field) => field.id));
  if (Object.keys(input).some((key) => !fieldIds.has(key))) {
    throw new Error('Anket soruları değişti. Ekranı yeniden açın.');
  }
  const data = {};
  for (const field of fields) {
    const value = String(input[field.id] ?? '').trim();
    if (field.required && !value) throw new Error(`"${field.label}" boş bırakılamaz.`);
    if (field.type === 'select' && value && !field.options.includes(value)) {
      throw new Error(`"${field.label}" için geçersiz şık.`);
    }
    if (value.length > 10000) throw new Error(`"${field.label}" cevabı çok uzun.`);
    if (value) data[field.id] = value;
  }
  if (!Object.keys(data).length) throw new Error('Kaydetmek için en az bir soruyu cevaplayın.');
  return data;
}
