import { selectSourceRows } from '../../utils/sourcePreview';
import { importedContactName, resolveDuplicateSelections } from '../../utils/newProjectFields';

// Kaynak satır kimlikleri ve sütun incelemesi kaybolmadan arama projesini hazırlar.
export function createCallProject({ projectName, analysis, selections, fields, source,
  sourceFieldIds, originalWorkbook, templateId, randomUUID, createdAt }) {
  if (!analysis || !source) throw new Error('Önce kişi listesini ekleyin.');
  if (analysis.error) throw new Error(analysis.error);
  const { selected, excluded } = selectSourceRows(analysis, resolveDuplicateSelections(analysis, selections));
  if (!selected.length) throw new Error('Geçerli telefonlu en az bir kişi gerekli.');
  const unnamedField = fields.find((field) => field.isSystemField !== 'phone' && !field.label.trim());
  if (unnamedField) throw new Error('Eklenen sorunun adını yazın veya soruyu silin.');
  const saveFields = fields.filter((field) => field.isSystemField !== 'phone' && field.label.trim())
    .map((field, index) => ({
      id: field.id, label: field.label.trim(), type: field.type,
      options: field.type === 'select' ? field.options.map((option) => option.trim()).filter(Boolean) : [],
      order: index, required: field.isSystemField === 'name' || !!field.required,
      ...(field.isSystemField ? { isSystemField: field.isSystemField } : {}),
    }));
  const nameField = saveFields.find((field) => field.isSystemField === 'name');
  if (!nameField) throw new Error('İsim alanı gerekli.');
  for (const field of saveFields) if (field.type === 'select' &&
    (field.options.length < 2 || new Set(field.options).size !== field.options.length)) {
    throw new Error(`"${field.label}" için en az iki farklı seçenek girin.`);
  }
  const usableIds = new Set(saveFields.map((field) => field.id));
  for (const column of source.columns.filter((item) => item.role === 'field')) {
    const field = saveFields.find((item) => item.id === sourceFieldIds[column.index]);
    if (field?.type === 'select') {
      const unknown = selected.map((row) => String(row.cells[column.index] ?? '').trim())
        .find((value) => value && !field.options.includes(value));
      if (unknown) throw new Error(`"${column.label}" sütunundaki "${unknown}" değeri şıklarda yok.`);
    }
  }
  const eventId = randomUUID();
  const contacts = selected.map((row) => {
    const data = { [nameField.id]: importedContactName(row.name) };
    source.columns.filter((column) => column.role === 'field').forEach((column) => {
      const fieldId = sourceFieldIds[column.index];
      const value = String(row.cells[column.index] ?? '').trim();
      if (fieldId && usableIds.has(fieldId) && value) data[fieldId] = value;
    });
    const recordId = randomUUID();
    return { id: recordId, recordId, phone: row.phone, data, completed: false, completedAt: null,
      sourceRow: row.sourceRow, sourceCells: [...row.cells] };
  });
  return {
    id: eventId, eventId, name: projectName.trim(), createdAt,
    currentIndex: 0, formVersion: 1, formLocked: false, templateId,
    fields: saveFields, formHistory: [{ version: 1, fields: saveFields }], contacts,
    sourceWorkbook: originalWorkbook,
    sourceReview: {
      sourceName: source.sourceName, hasHeader: source.hasHeader, totalRows: source.rows.length,
      columns: source.columns.map((column) => ({ index: column.index, label: column.label,
        role: column.role, fieldId: column.role === 'field' && usableIds.has(sourceFieldIds[column.index])
          ? sourceFieldIds[column.index] : null })),
      excludedRows: excluded,
    },
  };
}
