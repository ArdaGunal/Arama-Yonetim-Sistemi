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
  return `${(name || 'anket').replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]/g, '').replace(/ /g, '_')}_${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function buildWorkbook(project) {
  const fields = project.fields || [];
  // isSystemField:'name' alanını bul — label'a bağlı değil, kimlik bazlı
  const nameField = fields.find(f => f.isSystemField === 'name') || fields.find(f => f.type === 'text');
  const otherFields = fields.filter(f => f !== nameField);

  // Sütun sıralaması: İsim Soyisim | Tel No | diğer alanlar...
  const headers = [];
  if (nameField) headers.push(nameField.label);
  headers.push('Tel No');
  otherFields.forEach(f => headers.push(f.label));

  const rows = project.contacts.map((c) => {
    const row = {};
    if (nameField) row[nameField.label] = (c.data && c.data[nameField.id]) || '';
    row['Tel No'] = `'${c.phone}`;
    otherFields.forEach((f) => { row[f.label] = (c.data && c.data[f.id]) || ''; });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws['!cols'] = headers.map(() => ({ wch: 18 }));

  // Tel No sütununu metin formatına zorla
  const phoneColIdx = nameField ? 1 : 0;
  const ref = ws['!ref'];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: phoneColIdx })];
      if (cell) { cell.t = 's'; cell.z = '@'; }
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (project.name || 'Anket').substring(0, 31));
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
  const header = headerParts.map(esc).join(',');

  const rows = project.contacts.map((c) => {
    const parts = [];
    if (nameField) parts.push((c.data && c.data[nameField.id]) || '');
    parts.push(c.phone);
    otherFields.forEach((f) => parts.push((c.data && c.data[f.id]) || ''));
    return parts.map(esc).join(',');
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
  const b64 = btoa(unescape(encodeURIComponent(csv)));
  const filePath = await writeFileToDisk(b64, fileName, true);
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

  const b64 = btoa(unescape(encodeURIComponent(csv)));

  if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
    const SAF = FileSystem.StorageAccessFramework;
    const perms = await SAF.requestDirectoryPermissionsAsync();
    if (!perms.granted) return false;
    const uri = await SAF.createFileAsync(perms.directoryUri, fileName, 'text/csv');
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: 'base64' });
    return true;
  }

  const filePath = await writeFileToDisk(b64, fileName, true);
  await Sharing.shareAsync(filePath, { mimeType: 'text/csv', dialogTitle: 'CSV Dosyasını Kaydet' });
  return true;
}

// ── Eski API uyumluluğu (ExportScreen'de kullanılıyordu) ──
export const exportProjectToExcel = shareExcel;
export const exportProjectToCSV = shareCSV;
