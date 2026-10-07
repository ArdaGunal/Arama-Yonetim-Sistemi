/**
 * Excel/CSV dışa aktarma - Dinamik alan destekli
 * ─ Paylaş: expo-sharing ile WhatsApp, Mail vb.
 * ─ Kaydet: Android SAF ile istenilen konuma, iOS paylaş menüsü
 */
import * as XLSX from 'xlsx';
import { Platform } from 'react-native';

let FileSystem = null;
let Sharing = null;

if (Platform.OS !== 'web') {
  try {
    FileSystem = require('expo-file-system/legacy');
    Sharing = require('expo-sharing');
  } catch (e) {
    try {
      FileSystem = require('expo-file-system');
      Sharing = require('expo-sharing');
    } catch (e2) {
      console.warn('Expo modülleri yüklenemedi:', e2);
    }
  }
}

// ── Yardımcılar ──
function downloadBlobWeb(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function makeFileName(name, ext) {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${(name || 'anket').replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]/g, '').replace(/ /g, '_')}_${date}.${ext}`;
}

const statusLabel = { contacted: 'Görüşüldü', unreached: 'Ulaşılamadı', later: 'Sonra ara', wrong_number: 'Yanlış numara' };

export function buildWorkbook(project) {
  const fields = project.fields || [];
  // isSystemField:'name' alanını bul — label'a bağlı değil, kimlik bazlı
  const nameField = fields.find(f => f.isSystemField === 'name') || fields.find(f => f.type === 'text');
  const otherFields = fields.filter(f => f !== nameField);

  // Sütun sıralaması: İsim Soyisim | Tel No | diğer alanlar...
  const headers = [];
  if (nameField) headers.push(nameField.label);
  headers.push('Tel No');
  otherFields.forEach(f => headers.push(f.label));
  headers.push('Arama Durumu', 'Geri Arama Tarihi', 'Geri Arama Notu', 'Kayıt Kimliği', 'Kaynak Satırı');

  const rows = project.contacts.map((c) => {
    const row = {};
    if (nameField) row[nameField.label] = (c.data && c.data[nameField.id]) || '';
    row['Tel No'] = c.phone;
    otherFields.forEach((f) => { row[f.label] = (c.data && c.data[f.id]) || ''; });
    row['Arama Durumu'] = statusLabel[c.callStatus] || (c.completed ? 'Tamamlandı' : 'Aranmadı');
    row['Geri Arama Tarihi'] = c.callbackAt?.slice(0, 10) || '';
    row['Geri Arama Notu'] = c.callbackNote || '';
    row['Kayıt Kimliği'] = c.recordId || c.id;
    row['Kaynak Satırı'] = c.sourceRow || '';
    return row;
  });

  const sourceColumns = project.role !== 'volunteer' && project.sourceReview?.columns;
  const hasSourceCells = sourceColumns?.length && project.contacts.some((contact) => contact.sourceCells);
  const sourceHeaders = hasSourceCells ? sourceColumns.map((column) => column.label) : [];
  const currentHeaders = hasSourceCells ? [
    ...fields.map((field) => `Güncel: ${field.label}`), 'Güncel: Tel No',
    'Arama Durumu', 'Geri Arama Tarihi', 'Geri Arama Notu', 'Kayıt Kimliği', 'Kaynak Satırı',
  ] : headers;
  const ws = hasSourceCells
    ? XLSX.utils.aoa_to_sheet([
      [...sourceHeaders, ...currentHeaders],
      ...project.contacts.map((contact) => [
        ...sourceColumns.map((column) => String(contact.sourceCells?.[column.index] ?? '')),
        ...fields.map((field) => contact.data?.[field.id] || ''), contact.phone,
        statusLabel[contact.callStatus] || (contact.completed ? 'Tamamlandı' : 'Aranmadı'),
        contact.callbackAt?.slice(0, 10) || '', contact.callbackNote || '',
        contact.recordId || contact.id, contact.sourceRow || '',
      ]),
    ])
    : XLSX.utils.json_to_sheet(rows, { header: headers });
  ws['!cols'] = (hasSourceCells ? [...sourceHeaders, ...currentHeaders] : headers).map(() => ({ wch: 18 }));

  // Telefon ve kaynak kimlik sütunları metin olarak kalır.
  const phoneColIdx = hasSourceCells ? sourceHeaders.length + fields.length : nameField ? 1 : 0;
  const ref = ws['!ref'];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: phoneColIdx })];
      if (cell) { cell.t = 's'; cell.z = '@'; }
      if (hasSourceCells) for (const column of sourceColumns) {
        const original = ws[XLSX.utils.encode_cell({ r: R, c: column.index })];
        if (original) { original.t = 's'; original.z = '@'; }
      }
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, project.role === 'volunteer' ? 'Görev Sonucu' : 'Güncel Durum');
  if (project.role !== 'volunteer') {
    const history = project.contacts.flatMap((contact) => (contact.attempts || []).map((attempt) => ({
      'Kayıt Kimliği': contact.recordId || contact.id,
      'İsim Soyisim': nameField ? contact.data?.[nameField.id] || '' : '',
      'Tel No': contact.phone, 'Arama Tarihi': attempt.at,
      'Arama Durumu': statusLabel[attempt.status] || attempt.status,
      'Not': attempt.note || '',
      ...Object.fromEntries(otherFields.map((field) => [field.label, attempt.data?.[field.id] || ''])),
    })));
    const hw = XLSX.utils.json_to_sheet(history, { header: ['Kayıt Kimliği', 'İsim Soyisim', 'Tel No', 'Arama Tarihi', 'Arama Durumu', 'Not', ...otherFields.map((field) => field.label)] });
    XLSX.utils.book_append_sheet(wb, hw, 'Arama Geçmişi');
    if (project.mergeConflicts?.length) {
      const conflicts = project.mergeConflicts.map((item) => ({
        'Kayıt Kimliği': item.recordId, 'Görev Kimliği': item.assignmentId,
        'Karar': item.decision === 'incoming' ? 'Gelen alındı' : 'Mevcut korundu',
        'Karar Tarihi': item.at, 'Önceki': item.oldAnswer, 'Gelen': item.incomingAnswer,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(conflicts), 'İncelenecek Çakışmalar');
    }
  }
  return wb;
}

function buildCSV(project) {
  const fields = project.fields || [];
  const nameField = fields.find(f => f.isSystemField === 'name') || fields.find(f => f.type === 'text');
  const otherFields = fields.filter(f => f !== nameField);
  const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;

  // Sütun sıralaması: İsim Soyisim | Tel No | diğer alanlar...
  const headerParts = [];
  if (nameField) headerParts.push(nameField.label);
  headerParts.push('Tel No');
  otherFields.forEach(f => headerParts.push(f.label));
  headerParts.push('Arama Durumu', 'Geri Arama Tarihi', 'Geri Arama Notu', 'Kayıt Kimliği');
  const header = headerParts.map(esc).join(';');

  const rows = project.contacts.map((c) => {
    const parts = [];
    if (nameField) parts.push((c.data && c.data[nameField.id]) || '');
    parts.push(c.phone);
    otherFields.forEach((f) => parts.push((c.data && c.data[f.id]) || ''));
    parts.push(statusLabel[c.callStatus] || (c.completed ? 'Tamamlandı' : 'Aranmadı'));
    parts.push(c.callbackAt?.slice(0, 10) || '', c.callbackNote || '', c.recordId || c.id);
    return parts.map(esc).join(';');
  });
  return '\uFEFF' + header + '\n' + rows.join('\n');
}

// ── Mobil: Dosyayı diske yaz ve yolunu döndür ──
async function writeFileToDisk(data, fileName, isBase64) {
  if (!FileSystem) throw new Error('expo-file-system bulunamadı');
  const filePath = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + fileName;
  await FileSystem.writeAsStringAsync(filePath, data, {
    encoding: isBase64 ? 'base64' : 'utf8',
  });
  return filePath;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ══════════════════════════════════════
// EXCEL - PAYLAŞ
// ══════════════════════════════════════
export async function shareExcel(project) {
  const wb = buildWorkbook(project);
  const fileName = makeFileName(project.name, 'xlsx');

  if (Platform.OS === 'web') {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    downloadBlobWeb(new Blob([wbout], { type: XLSX_MIME }), fileName);
    return true;
  }
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
  const filePath = await writeFileToDisk(wbout, fileName, true);
  await Sharing.shareAsync(filePath, { mimeType: XLSX_MIME, dialogTitle: 'Excel Dosyasını Paylaş' });
  return true;
}

// ══════════════════════════════════════
// EXCEL - KAYDET (istenilen konuma)
// ══════════════════════════════════════
export async function saveExcel(project) {
  const wb = buildWorkbook(project);
  const fileName = makeFileName(project.name, 'xlsx');

  if (Platform.OS === 'web') {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    downloadBlobWeb(new Blob([wbout], { type: XLSX_MIME }), fileName);
    return true;
  }

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

  // Android: SAF ile kullanıcıya konum seçtir
  if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
    const SAF = FileSystem.StorageAccessFramework;
    const perms = await SAF.requestDirectoryPermissionsAsync();
    if (!perms.granted) return false;
    const uri = await SAF.createFileAsync(perms.directoryUri, fileName, XLSX_MIME);
    await FileSystem.writeAsStringAsync(uri, wbout, { encoding: 'base64' });
    return true;
  }

  // iOS: Paylaş menüsünden "Dosyalara Kaydet" seçilebilir
  const filePath = await writeFileToDisk(wbout, fileName, true);
  await Sharing.shareAsync(filePath, { mimeType: XLSX_MIME, dialogTitle: 'Excel Dosyasını Kaydet' });
  return true;
}

// ══════════════════════════════════════
// CSV - PAYLAŞ
// ══════════════════════════════════════
export async function shareCSV(project) {
  const csv = buildCSV(project);
  const fileName = makeFileName(project.name, 'csv');

  if (Platform.OS === 'web') {
    downloadBlobWeb(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), fileName);
    return true;
  }
  const filePath = await writeFileToDisk(csv, fileName, false);
  await Sharing.shareAsync(filePath, { mimeType: 'text/csv', dialogTitle: 'CSV Dosyasını Paylaş' });
  return true;
}

// ══════════════════════════════════════
// CSV - KAYDET (istenilen konuma)
// ══════════════════════════════════════
export async function saveCSV(project) {
  const csv = buildCSV(project);
  const fileName = makeFileName(project.name, 'csv');

  if (Platform.OS === 'web') {
    downloadBlobWeb(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), fileName);
    return true;
  }

  if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
    const SAF = FileSystem.StorageAccessFramework;
    const perms = await SAF.requestDirectoryPermissionsAsync();
    if (!perms.granted) return false;
    const uri = await SAF.createFileAsync(perms.directoryUri, fileName, 'text/csv');
    await FileSystem.writeAsStringAsync(uri, csv, { encoding: 'utf8' });
    return true;
  }

  const filePath = await writeFileToDisk(csv, fileName, false);
  await Sharing.shareAsync(filePath, { mimeType: 'text/csv', dialogTitle: 'CSV Dosyasını Kaydet' });
  return true;
}

// ── Eski API uyumluluğu (ExportScreen'de kullanılıyordu) ──
export const exportProjectToExcel = shareExcel;
export const exportProjectToCSV = shareCSV;
