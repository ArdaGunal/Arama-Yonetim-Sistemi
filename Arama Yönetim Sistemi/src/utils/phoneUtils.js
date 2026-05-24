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

  // Başında + varsa kaldır, sonra işle
  if (cleaned.startsWith('+90')) {
    cleaned = cleaned.substring(3);
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

  // 10 haneli mi kontrol et
  if (cleaned.length === 10 && cleaned.startsWith('5')) {
    return `+90${cleaned}`;
  }

  // 10 hane değilse ama rakamlardan oluşuyorsa, olduğu gibi +90 ekle
  if (cleaned.length >= 10 && cleaned.length <= 11) {
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
 * Her satırdan hem isim hem numara çıkarır.
 * 
 * Desteklenen formatlar:
 *   "Emre bilir 5455175015"
 *   "Atilla Çakır \t +905333924918"
 *   "Sinan gürbüz 05530259866"
 *   "05321234567"  (sadece numara — isim boş kalır)
 *   "Geçersiz metin" (numara yok — satır yoksayılır)
 * 
 * @returns {{ phone: string, name: string }[]}  — tekil, temizlenmiş kayıtlar
 */
export function parsePastedText(text) {
  if (!text || typeof text !== 'string') return [];

  const lines = text.split(/[\n\r]+/);
  const results = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // İlk rakam veya + işaretinin başladığı pozisyonu bul
    const match = trimmed.match(/[+\d]/);
    if (!match) continue; // Satırda hiç rakam yok → yoksay

    const digitStart = trimmed.indexOf(match[0]);

    // Rakamdan önceki kısmı isim olarak al
    let name = trimmed.substring(0, digitStart).replace(/[\t]+/g, ' ').trim();

    // Rakamla başlayan kısmı numara olarak al
    const phoneRaw = trimmed.substring(digitStart);

    // Numarayı temizle ve formatla
    const cleaned = cleanPhoneNumber(phoneRaw);
    if (!cleaned) continue; // Geçersiz numara → yoksay

    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      results.push({ phone: cleaned, name: name });
    }
  }

  return results;
}

/**
 * Metni harf/boşluk duyarsız hale getirerek eşleştirme için normalize eder.
 */
export function normalizeString(str) {
  if (!str) return '';
  return String(str)
    .toLocaleLowerCase('tr-TR')
    .replace(/[\s\-_]/g, '')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
}

/**
 * Excel başlıklarını proje alanlarıyla akıllı olarak eşleştirir.
 */
export function findExcelColumnMapping(headers, fields) {
  const mapping = {};
  let phoneColIdx = -1;
  const normalizedFields = fields.map(f => ({ ...f, norm: normalizeString(f.label) }));
  
  headers.forEach((h, colIdx) => {
    const normH = normalizeString(h);
    if (!normH) return;
    
    // Check if it's phone
    if (normH.includes('telefon') || normH.includes('numara') || normH.includes('tel')) {
      const phoneField = fields.find(f => f.isSystemField === 'phone');
      if (phoneField) {
        phoneColIdx = colIdx;
        mapping[colIdx] = phoneField.id;
        return;
      }
    }
    
    // Check if it's name
    if (normH.includes('isim') || normH.includes('ad')) {
      const nameField = fields.find(f => f.isSystemField === 'name');
      if (nameField) {
        mapping[colIdx] = nameField.id;
        return;
      }
    }
    
    // Exact normalized match for other fields
    const matchedField = normalizedFields.find(f => f.norm === normH);
    if (matchedField) {
      mapping[colIdx] = matchedField.id;
    }
  });

  return { mapping, phoneColIdx };
}
