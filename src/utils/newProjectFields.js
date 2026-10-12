import { normalizeString } from './phoneUtils';

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
      nextFields.find((field) => !field.isSystemField && field.type === 'text' &&
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
