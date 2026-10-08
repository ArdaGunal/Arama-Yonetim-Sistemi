/** Ulaşılamayan kişilerde anket cevabı beklenmez; görüşülen kişide zorunlu alanlar dolmalıdır. */
export function missingRequiredField(fields, data, callStatus) {
  if (callStatus !== 'contacted') return null;
  return (fields || []).find((field) =>
    (field.isSystemField === 'name' || field.required) &&
    !String(data?.[field.id] || '').trim()) || null;
}
