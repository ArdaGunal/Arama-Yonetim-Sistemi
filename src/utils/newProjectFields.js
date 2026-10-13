import { normalizeString } from './phoneUtils';

/** Telefonu olan fakat adı yazılmamış satır da aranabilir bir kişi olarak kalır. */
export function importedContactName(value) {
  return String(value || '').trim() || 'İsimsiz kişi';
}

/** Kaynak sütunlarını sorulara bağlar; kullanıcının eklediği soruları korur. */
export function alignSourceFields(source, fields, templateColumns, createId) {
  const activeColumns = source.columns.filter((column) => column.role === 'field');
  const activeIndexes = new Set(activeColumns.map((column) => column.index));
  const nextFields = fields.filter((field) =>
    field.importColumn === undefined || activeIndexes.has(field.importColumn));
  const mapping = {};

  for (const column of activeColumns) {
    const templateId = templateColumns.find((item) =>
      normalizeString(item.label) === normalizeString(column.label))?.fieldId;
    const match = nextFields.find((field) => field.importColumn === column.index) ||
      nextFields.find((field) => !field.isSystemField && field.id === templateId) ||
      nextFields.find((field) => !field.isSystemField &&
        normalizeString(field.label) === normalizeString(column.label));
    if (match) {
      mapping[column.index] = match.id;
    } else {
      const id = createId();
      mapping[column.index] = id;
      nextFields.push({ id, label: column.label, type: 'text', options: [],
        required: false, importColumn: column.index });
    }
  }
  return { fields: nextFields, mapping };
}

/** Tekrarlarda ilk satırı varsayılan tutar; kullanıcının seçimi önceliklidir. */
export function resolveDuplicateSelections(analysis, selections = {}) {
  const resolved = { ...selections };
  for (const group of analysis.duplicates) {
    if (!group.rows.some((row) => row.sourceRow === resolved[group.phone])) {
      resolved[group.phone] = group.rows[0].sourceRow;
    }
  }
  return resolved;
}

/** Şıklı soruya ilk geçişte kullanıcıya iki boş şık hazırlar. */
export function withAnswerType(field, type) {
  const options = field.options || [];
  return { ...field, type, options: type === 'select' && options.length < 2
    ? [...options, ...Array(2 - options.length).fill('')] : options };
}
