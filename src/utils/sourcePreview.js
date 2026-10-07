import { cleanPhoneNumber, normalizeString } from './phoneUtils';

const PHONE_HEADERS = new Set(['telefon', 'tel', 'telno', 'numara', 'gsm', 'cep', 'telefonnumarasi']);
const NAME_HEADERS = new Set(['isim', 'ad', 'adsoyad', 'isimsoyisim', 'adisoyadi', 'adi']);

function cellText(value) { return String(value ?? '').trim(); }

/** Yapıştırılan varsayılan "Ad Soyad<TAB>Telefon" metnini satırlara çevirir. */
export function textToRows(text) {
  return String(text || '').split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    if (trimmed.includes('\t')) return trimmed.split('\t').map(cellText);
    const phoneAtEnd = trimmed.match(/(?:\+?90|0090|0)?[2-5](?:[\s().-]*\d){9}$/);
    if (phoneAtEnd) return [trimmed.slice(0, phoneAtEnd.index).trim(), phoneAtEnd[0].trim()];
    return [trimmed, ''];
  }).filter((row) => row.some(Boolean));
}

/** Başlık ve olası telefon/isim sütunlarını önerir; kullanıcı önizlemede onaylar. */
export function prepareSource(rawRows, sourceName = '', headerOverride) {
  const rows = (Array.isArray(rawRows) ? rawRows : []).map((row, index) => ({
    sourceRow: index + 1,
    cells: (Array.isArray(row) ? row : []).map(cellText),
  })).filter((row) => row.cells.some(Boolean));
  if (!rows.length) throw new Error('Listede okunabilir satır yok.');
  const hasHeader = typeof headerOverride === 'boolean'
    ? headerOverride : !rows[0].cells.some((cell) => cleanPhoneNumber(cell));
  const sampleRows = hasHeader ? rows.slice(1) : rows;
  if (!sampleRows.length) throw new Error('Başlıktan sonra kişi satırı bulunamadı.');
  const count = Math.max(...rows.map((row) => row.cells.length));
  const columns = Array.from({ length: count }, (_, index) => {
    const header = hasHeader ? cellText(rows[0].cells[index]) : '';
    const phoneHits = sampleRows.slice(0, 100).filter((row) => cleanPhoneNumber(cellText(row.cells[index]))).length;
    return { index, label: header || `Sütun ${index + 1}`, phoneHits };
  });
  const namedPhone = columns.find((col) => PHONE_HEADERS.has(normalizeString(col.label)) || normalizeString(col.label).includes('telefon'));
  const candidates = columns.filter((col) => col.phoneHits > 0).sort((a, b) => b.phoneHits - a.phoneHits);
  // Eşit puanlı iki sayısal sütunda telefon seçimini koordinatöre bırak.
  const phoneIndex = namedPhone?.index ?? (candidates.length &&
    (!candidates[1] || candidates[0].phoneHits > candidates[1].phoneHits) ? candidates[0].index : -1);
  const namedName = columns.find((col) => NAME_HEADERS.has(normalizeString(col.label)));
  const nameIndex = namedName?.index ?? columns.find((col) => col.index !== phoneIndex &&
    sampleRows.slice(0, 10).some((row) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(cellText(row.cells[col.index]))))?.index ?? -1;
  return {
    sourceName, hasHeader, rows: sampleRows,
    columns: columns.map((col) => ({ ...col, role: col.index === phoneIndex ? 'phone' :
      col.index === nameIndex ? 'name' : 'field' })),
  };
}

export function setColumnRole(columns, columnIndex, role) {
  if (!['phone', 'name', 'field', 'ignore'].includes(role)) throw new Error('Geçersiz sütun görevi.');
  return columns.map((column) => ({
    ...column,
    role: column.index === columnIndex ? role :
      (role === 'phone' || role === 'name') && column.role === role ? 'field' : column.role,
  }));
}

/** Her kaynak satırını ayrı tutar; tekrarlar seçilene kadar atılmaz. */
export function analyzeSource(source) {
  const phoneColumn = source.columns.find((column) => column.role === 'phone');
  const nameColumn = source.columns.find((column) => column.role === 'name');
  if (!phoneColumn) return { valid: [], invalid: [], duplicates: [], error: 'Telefon sütununu seçin.' };
  const valid = [];
  const invalid = [];
  const byPhone = new Map();
  for (const row of source.rows) {
    const rawPhone = cellText(row.cells[phoneColumn.index]);
    const phone = cleanPhoneNumber(rawPhone);
    if (!phone) {
      invalid.push({ ...row, reason: rawPhone ? 'Telefon okunamadı' : 'Telefon boş' });
      continue;
    }
    const item = { ...row, phone, name: nameColumn ? cellText(row.cells[nameColumn.index]) : '' };
    valid.push(item);
    const group = byPhone.get(phone) || [];
    group.push(item);
    byPhone.set(phone, group);
  }
  return {
    valid, invalid, duplicates: [...byPhone.entries()].filter(([, group]) => group.length > 1)
      .map(([phone, rows]) => ({ phone, rows })), error: '',
  };
}

export function selectSourceRows(analysis, selections) {
  const duplicatePhones = new Set(analysis.duplicates.map((group) => group.phone));
  const unresolved = analysis.duplicates.filter((group) =>
    !group.rows.some((row) => row.sourceRow === selections[group.phone]));
  if (unresolved.length) throw new Error(`${unresolved.length} tekrar eden telefon için kullanılacak satırı seçin.`);
  const selected = analysis.valid.filter((row) =>
    !duplicatePhones.has(row.phone) || selections[row.phone] === row.sourceRow);
  const excluded = analysis.valid.filter((row) =>
    duplicatePhones.has(row.phone) && selections[row.phone] !== row.sourceRow)
    .map((row) => ({ sourceRow: row.sourceRow, cells: row.cells, reason: 'Aynı telefonun başka satırı seçildi' }));
  return { selected, excluded: [...analysis.invalid, ...excluded] };
}
