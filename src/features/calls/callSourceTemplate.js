import { prepareSource } from '../../utils/sourcePreview';
import { normalizeString } from '../../utils/phoneUtils';

/** Şablon sütunlarını yalnız aynı başlıklı kaynağa uygular; bozuk eşleme varsayılan algılamaya döner. */
export function prepareCallSource(rows, name, headerOverride, template) {
  const detected = prepareSource(rows, name, headerOverride);
  if (!template?.sourceColumns?.length) return detected;
  const used = new Set();
  const prepared = { ...detected, columns: detected.columns.map((column) => {
    const match = template.sourceColumns.find((item, index) => !used.has(index) &&
      normalizeString(item.label) === normalizeString(column.label));
    if (!match) return column;
    const index = template.sourceColumns.indexOf(match);
    used.add(index);
    return { ...column, role: match.role };
  }) };
  if (prepared.columns.filter((column) => column.role === 'phone').length !== 1 ||
      prepared.columns.filter((column) => column.role === 'name').length > 1) return detected;
  return prepared;
}
