import * as Crypto from 'expo-crypto';
import { fromByteArray, toByteArray } from 'base64-js';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const SHEET_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
const REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';

export function normalizeSourceWorkbook(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.name !== 'string' || !value.name.trim() || value.name.length > 255 ||
      !['xlsx', 'xlsm', 'xls'].includes(value.format) ||
      !value.name.toLowerCase().endsWith(`.${value.format}`) ||
      typeof value.base64 !== 'string' || !value.base64.length ||
      value.base64.length > Math.ceil(MAX_SOURCE_BYTES / 3) * 4 + 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value.base64) || value.base64.length % 4 !== 0 ||
      typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) {
    throw new Error('Orijinal Excel eki geçersiz veya çok büyük.');
  }
  const byteLength = value.base64.length * 3 / 4 - (value.base64.endsWith('==') ? 2 : value.base64.endsWith('=') ? 1 : 0);
  if (byteLength > MAX_SOURCE_BYTES || value.byteLength !== byteLength) {
    throw new Error('Orijinal Excel eki boyutu geçersiz.');
  }
  return { name: value.name, format: value.format, base64: value.base64,
    byteLength, sha256: value.sha256 };
}

export async function captureSourceWorkbook(name, data, type) {
  const format = String(name || '').split('.').pop().toLowerCase();
  if (!['xlsx', 'xlsm', 'xls'].includes(format)) return null;
  const base64 = type === 'base64' ? data : fromByteArray(data);
  const byteLength = type === 'base64' ? toByteArray(base64).length : data.length;
  if (byteLength > MAX_SOURCE_BYTES) {
    throw new Error('Excel dosyası 8 MB sınırını aşıyor. Orijinali ayrıca saklayıp daha küçük bir dosya seçin.');
  }
  const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
  return normalizeSourceWorkbook({ name, format, base64, byteLength, sha256 });
}

export async function verifySourceWorkbook(source) {
  const normalized = normalizeSourceWorkbook(source);
  if (!normalized) return null;
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalized.base64);
  if (digest !== normalized.sha256) throw new Error('Orijinal Excel eki değişmiş veya bozulmuş.');
  return normalized;
}

export function sourceWorkbookBytes(source) {
  return toByteArray(normalizeSourceWorkbook(source).base64);
}

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function addBeforeClosing(xml, tag, addition) {
  const closing = `</${tag}>`;
  const index = xml.lastIndexOf(closing);
  if (index < 0) throw new Error(`Excel yapısında ${tag} bulunamadı.`);
  return xml.slice(0, index) + addition + xml.slice(index);
}

function uniqueSheetName(base, used) {
  let name = base.slice(0, 31);
  for (let suffix = 2; used.has(name.toLocaleLowerCase('tr-TR')); suffix += 1) {
    const tail = ` (${suffix})`;
    name = `${base.slice(0, 31 - tail.length)}${tail}`;
  }
  used.add(name.toLocaleLowerCase('tr-TR'));
  return name;
}

/** Kaynak OOXML parçalarını aynen tutar; yalnızca yeni sonuç sayfaları ekler. */
export function appendResultSheetsToSource(source, resultWorkbookBytes, resultSheetNames, sourceSheetNames) {
  const original = unzipSync(sourceWorkbookBytes(source));
  const generated = unzipSync(resultWorkbookBytes);
  const required = ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml'];
  if (required.some((path) => !original[path])) throw new Error('Orijinal Excel yapısı okunamadı.');
  let workbookXml = strFromU8(original['xl/workbook.xml']);
  let relationshipsXml = strFromU8(original['xl/_rels/workbook.xml.rels']);
  let typesXml = strFromU8(original['[Content_Types].xml']);
  if (!/<sheets(?:\s[^>]*)?>[\s\S]*?<\/sheets>/.test(workbookXml) ||
      !/<Relationships(?:\s[^>]*)?>/.test(relationshipsXml) ||
      !/<Types(?:\s[^>]*)?>/.test(typesXml)) {
    throw new Error('Orijinal Excel sayfa yapısı desteklenmiyor.');
  }
  const relationshipNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const namespace = workbookXml.match(/\bxmlns:r\s*=\s*(["'])(.*?)\1/);
  if (namespace && namespace[2] !== relationshipNamespace) {
    throw new Error('Orijinal Excel ilişki ad alanı desteklenmiyor.');
  }
  if (!namespace) workbookXml = workbookXml.replace(/<workbook\b/,
    `<workbook xmlns:r="${relationshipNamespace}"`);
  let sheetId = Math.max(0, ...[...workbookXml.matchAll(/\bsheetId\s*=\s*["'](\d+)["']/g)].map((m) => Number(m[1])));
  let relationshipId = Math.max(0, ...[...relationshipsXml.matchAll(/\bId\s*=\s*["']rId(\d+)["']/g)].map((m) => Number(m[1])));
  const usedNames = new Set(sourceSheetNames.map((name) => name.toLocaleLowerCase('tr-TR')));
  const addedNames = [];
  resultSheetNames.forEach((baseName, index) => {
    const generatedPath = `xl/worksheets/sheet${index + 1}.xml`;
    if (!generated[generatedPath]) throw new Error('Sonuç Excel sayfası bulunamadı.');
    let sheetXml = strFromU8(generated[generatedPath]);
    if (/<c\b[^>]*\bt="s"/.test(sheetXml)) throw new Error('Sonuç Excel metinleri aktarılamadı.');
    // Yeni sayfaların üretilen stil numaraları kaynak stilleriyle karışmamalı.
    sheetXml = sheetXml.replace(/(<c\b[^>]*?)\s+s="\d+"/g, '$1');
    let number = 1;
    while (original[`xl/worksheets/sheet${number}.xml`]) number += 1;
    const destination = `xl/worksheets/sheet${number}.xml`;
    original[destination] = strToU8(sheetXml);
    sheetId += 1;
    relationshipId += 1;
    const name = uniqueSheetName(baseName, usedNames);
    addedNames.push(name);
    workbookXml = addBeforeClosing(workbookXml, 'sheets',
      `<sheet name="${xmlEscape(name)}" sheetId="${sheetId}" r:id="rId${relationshipId}"/>`);
    relationshipsXml = addBeforeClosing(relationshipsXml, 'Relationships',
      `<Relationship Id="rId${relationshipId}" Type="${REL_TYPE}" Target="worksheets/sheet${number}.xml"/>`);
    typesXml = addBeforeClosing(typesXml, 'Types',
      `<Override PartName="/${destination}" ContentType="${SHEET_TYPE}"/>`);
  });
  original['xl/workbook.xml'] = strToU8(workbookXml);
  original['xl/_rels/workbook.xml.rels'] = strToU8(relationshipsXml);
  original['[Content_Types].xml'] = strToU8(typesXml);
  return { bytes: zipSync(original, { level: 6 }), addedNames };
}
