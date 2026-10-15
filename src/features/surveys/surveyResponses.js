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
  if (!Array.isArray(responses) || responses.some((row) => !row ||
      typeof row.id !== 'string' || !row.id || !row.data ||
      typeof row.data !== 'object' || Array.isArray(row.data) ||
      Object.values(row.data).some((value) => typeof value !== 'string') ||
      typeof row.submittedAt !== 'string' || !Number.isFinite(Date.parse(row.submittedAt)))) {
    throw new Error(`${label} geçersiz.`);
  }
  if (new Set(responses.map((row) => row.id)).size !== responses.length) {
    throw new Error(`${label} içinde yinelenen kimlik var.`);
  }
  return responses;
}
