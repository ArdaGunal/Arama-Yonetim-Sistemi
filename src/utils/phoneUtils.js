/**
 * Telefon numarası temizleme ve formatlama yardımcıları
 */

/**
 * Tek bir telefon numarasını temizler ve +90 formatına çevirir.
 * - Boşlukları siler
 * - Parantezleri siler
 * - Tireleri siler
 * - Başındaki 0'ı atar
 * - 10 haneli numaraların başına +90 ekler
 * - Zaten +90 ile başlıyorsa doğrular
 */
export function cleanPhoneNumber(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // Tüm boşluk, parantez, tire, nokta, alt çizgi kaldır
  let cleaned = raw.replace(/[\s\-\(\)\._]/g, '');

  // Eğer sadece rakam ve + içermiyorsa geçersiz
  if (!/^[\+]?[0-9]+$/.test(cleaned)) return null;

  // Başında + veya 0090 varsa kaldır
  if (cleaned.startsWith('+90')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('0090')) {
    cleaned = cleaned.substring(4);
  } else if (cleaned.startsWith('90') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('+')) {
    // Başka ülke kodu - olduğu gibi bırak
    return cleaned;
  }

  // Başındaki 0'ı at
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // Yalnızca 10 haneli Türkiye numaralarını kabul et (mobil 5xx, sabit 2xx/3xx/4xx)
  // 11 haneli (TCKN, Okul No vb.) numaraları engelle
  if (cleaned.length === 10 && /^[2-5]/.test(cleaned)) {
    return `+90${cleaned}`;
  }

  return null;
}

/**
 * Çok satırlı metinden telefon numaralarını ayrıştırır ve temizler.
 * Her satırda bir numara olduğunu varsayar.
 * Geçersiz numaraları atlar.
 * Tekrar edenleri filtreler.
 */
export function parsePhoneNumbers(text) {
  if (!text || typeof text !== 'string') return [];

  const lines = text.split(/[\n\r,;]+/);
  const numbers = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const cleaned = cleanPhoneNumber(trimmed);
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      numbers.push(cleaned);
    }
  }

  return numbers;
}

/**
 * Telefon numarasını gösterim formatına çevirir: +90 5XX XXX XX XX
 */
export function formatPhoneDisplay(phone) {
  if (!phone) return '';
  if (phone.startsWith('+90') && phone.length === 13) {
    const n = phone.substring(3);
    return `+90 ${n.substring(0, 3)} ${n.substring(3, 6)} ${n.substring(6, 8)} ${n.substring(8, 10)}`;
  }
  return phone;
}

/**
 * Akıllı Kopyala-Yapıştır Ayrıştırıcı
 */
export function parsePastedText(text) {
  if (!text || typeof text !== 'string') return [];

  const lines = text.split(/[\n\r]+/);
  const results = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/[+\d]/);
    if (!match) continue;

    const digitStart = trimmed.indexOf(match[0]);
    let name = trimmed.substring(0, digitStart).replace(/[\t]+/g, ' ').trim();
    const phoneRaw = trimmed.substring(digitStart);
    const cleaned = cleanPhoneNumber(phoneRaw);
    if (!cleaned) continue;

    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      results.push({ phone: cleaned, name: name });
    }
  }

  return results;
}

export function normalizeString(str) {
  if (!str) return '';
  return String(str)
    .toLocaleLowerCase('tr-TR')
    .replace(/[\s\-_]/g, '')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
}

function phonesInExcelCell(cell) {
  const value = String(cell ?? '').trim();
  if (!value) return [];
  const numbers = parsePhoneNumbers(value);
  return numbers.length ? numbers : parsePastedText(value).map(item => item.phone);
}

function findPhoneColumnIndex(rows) {
  const scores = [];
  for (const row of rows.slice(0, 100)) {
    if (!Array.isArray(row)) continue;
    row.forEach((cell, colIdx) => {
      const phones = phonesInExcelCell(cell);
      if (!phones.length) return;
      if (!scores[colIdx]) scores[colIdx] = { rows: 0, mobileRows: 0 };
      scores[colIdx].rows += 1;
      if (phones.some(phone => phone.startsWith('+905'))) scores[colIdx].mobileRows += 1;
    });
  }

  let bestIndex = -1;
  scores.forEach((score, colIdx) => {
    if (!score) return;
    const best = scores[bestIndex];
    if (!best || score.rows > best.rows ||
        (score.rows === best.rows && score.mobileRows > best.mobileRows)) {
      bestIndex = colIdx;
    }
  });
  return bestIndex;
}

export function findExcelColumnMapping(headers, fields, dataRows = []) {
  const mapping = {};
  let phoneColIdx = -1;
  const normalizedFields = fields.map(f => ({ ...f, norm: normalizeString(f.label) }));
  
  if (!headers || headers.length === 0) {
    // Telefon sütununu veriden bul; diğer alanları kalan sütunlara sırayla ata.
    phoneColIdx = findPhoneColumnIndex(dataRows);
    const phoneField = fields.find(f => f.isSystemField === 'phone');
    const otherFields = fields.filter(f => f.isSystemField !== 'phone');
    const columnCount = dataRows.reduce((max, row) =>
      Array.isArray(row) ? Math.max(max, row.length) : max, 0);
    let fieldIdx = 0;
    for (let colIdx = 0; colIdx < columnCount; colIdx++) {
      if (colIdx === phoneColIdx) {
        if (phoneField) mapping[colIdx] = phoneField.id;
      } else if (fieldIdx < otherFields.length) {
        mapping[colIdx] = otherFields[fieldIdx++].id;
      }
    }
    return { mapping, phoneColIdx };
  }
  
  headers.forEach((h, colIdx) => {
    const normH = normalizeString(h);
    if (!normH) return;
    
    // Telefon kontrolü (beyaz liste tabanlı eşleşme)
    if (['telefon', 'tel', 'telno', 'numara', 'gsm', 'cep', 'telefonnumarasi'].includes(normH) || normH.includes('telefon')) {
      const phoneField = fields.find(f => f.isSystemField === 'phone');
      if (phoneField && phoneColIdx === -1) {
        phoneColIdx = colIdx;
        mapping[colIdx] = phoneField.id;
        return;
      }
    }
    
    // İsim kontrolü (Adres alanıyla karışmaması için beyaz liste)
    if (['isim', 'ad', 'adsoyad', 'isimsoyisim', 'adisoyadi', 'adi', 'soyadi'].includes(normH)) {
      const nameField = fields.find(f => f.isSystemField === 'name');
      if (nameField && !Object.values(mapping).includes(nameField.id)) {
        mapping[colIdx] = nameField.id;
        return;
      }
    }
    
    // Diğer alanlar için tam eşleşme
    const matchedField = normalizedFields.find(f => f.norm === normH);
    if (matchedField && !Object.values(mapping).includes(matchedField.id)) {
      mapping[colIdx] = matchedField.id;
    }
  });

  if (phoneColIdx === -1) {
    phoneColIdx = findPhoneColumnIndex(dataRows);
    const phoneField = fields.find(f => f.isSystemField === 'phone');
    if (phoneColIdx !== -1 && phoneField) mapping[phoneColIdx] = phoneField.id;
  }

  return { mapping, phoneColIdx };
}

/** Önizleme ve kayıt için aynı Excel/CSV sütun keşfini kullanır. */
export function parseExcelContacts(rows, fields) {
  const empty = { phones: [], names: {}, data: {}, phoneColIdx: -1 };
  if (!Array.isArray(rows) || rows.length === 0) return empty;

  const firstRow = Array.isArray(rows[0]) ? rows[0] : [];
  const hasHeaders = !firstRow.some(cell => phonesInExcelCell(cell).length > 0);
  const headers = hasHeaders ? firstRow : [];
  const dataRows = hasHeaders ? rows.slice(1) : rows;
  const { mapping, phoneColIdx } = findExcelColumnMapping(headers, fields, dataRows);
  if (phoneColIdx === -1) return empty;

  const phones = [];
  const names = {};
  const data = {};
  const seen = new Set();
  const nameField = fields.find(f => f.isSystemField === 'name');

  for (const row of dataRows) {
    if (!Array.isArray(row)) continue;
    for (const phone of phonesInExcelCell(row[phoneColIdx])) {
      if (seen.has(phone)) continue;
      seen.add(phone);
      phones.push(phone);
      const rowData = {};
      Object.keys(mapping).forEach(colIdx => {
        const fieldId = mapping[colIdx];
        if (fields.some(f => f.id === fieldId && f.isSystemField === 'phone')) return;
        const value = String(row[colIdx] ?? '').trim();
        if (value) rowData[fieldId] = value;
      });
      data[phone] = rowData;
      if (nameField && rowData[nameField.id]) names[phone] = rowData[nameField.id];
    }
  }

  return { phones, names, data, phoneColIdx };
}
