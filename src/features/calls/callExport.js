const statusLabel = { contacted: 'Görüşüldü', unreached: 'Ulaşılamadı',
  later: 'Sonra ara', wrong_number: 'Yanlış numara' };

/** Arama Excel ve CSV çıktısının ortak, yan etkisiz satır modeli. */
export function callExportRows(project) {
  const fields = project.fields || [];
  const currentIds = new Set(fields.map((field) => field.id));
  const historical = new Map();
  for (const snapshot of project.formHistory || []) for (const field of snapshot.fields || []) {
    if (!currentIds.has(field.id) && field.isSystemField !== 'name') {
      historical.set(field.id, { ...field, label: `${field.label} (Form ${snapshot.version})` });
    }
  }
  const nameField = fields.find((field) => field.isSystemField === 'name') ||
    fields.find((field) => field.type === 'text');
  const otherFields = [...fields.filter((field) => field !== nameField), ...historical.values()];
  const outputFields = [...fields, ...historical.values()];
  const headers = [
    ...(nameField ? [nameField.label] : []), 'Tel No', ...otherFields.map((field) => field.label),
    'Arama Durumu', 'Geri Arama Tarihi', 'Geri Arama Notu', 'Kayıt Kimliği', 'Kaynak Satırı',
  ];
  const rows = (project.contacts || []).map((contact) => {
    const row = {};
    if (nameField) row[nameField.label] = contact.data?.[nameField.id] || '';
    row['Tel No'] = contact.phone;
    otherFields.forEach((field) => { row[field.label] = contact.data?.[field.id] || ''; });
    row['Arama Durumu'] = statusLabel[contact.callStatus] || (contact.completed ? 'Tamamlandı' : 'Aranmadı');
    row['Geri Arama Tarihi'] = contact.callbackAt?.slice(0, 10) || '';
    row['Geri Arama Notu'] = contact.callbackNote || '';
    row['Kayıt Kimliği'] = contact.recordId || contact.id;
    row['Kaynak Satırı'] = contact.sourceRow || '';
    return row;
  });
  return { nameField, otherFields, outputFields, headers, rows, statusLabel };
}
