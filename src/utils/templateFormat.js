import * as Crypto from 'expo-crypto';
import { canonicalJson } from './backupFormat';

export const TEMPLATE_EXTENSION = '.ayst';
const FORMAT = 'arama-yonetim-template';

export function normalizeTemplateFields(input) {
  if (!Array.isArray(input) || input.length < 2 || input.length > 100) {
    throw new Error('Şablonda 2 ile 100 arasında alan olmalı.');
  }
  const seen = new Set();
  const fields = input.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
        typeof raw.id !== 'string' || !raw.id.trim() || seen.has(raw.id) ||
        typeof raw.label !== 'string' || !raw.label.trim() ||
        !['text', 'select', 'phone'].includes(raw.type) || !Array.isArray(raw.options) ||
        raw.options.some((option) => typeof option !== 'string')) {
      throw new Error(`Şablondaki ${index + 1}. alan geçersiz.`);
    }
    seen.add(raw.id);
    if (raw.isSystemField && !['name', 'phone'].includes(raw.isSystemField)) {
      throw new Error('Bilinmeyen sistem alanı.');
    }
    if ((raw.type === 'phone') !== (raw.isSystemField === 'phone') ||
        (raw.isSystemField === 'name' && raw.type !== 'text')) {
      throw new Error('Şablondaki sistem alanı tipi geçersiz.');
    }
    return {
      id: raw.id, label: raw.label, type: raw.type, options: [...raw.options], order: index,
      ...(raw.isSystemField ? { isSystemField: raw.isSystemField } : {}),
    };
  });
  if (fields.filter((field) => field.isSystemField === 'name').length !== 1 ||
      fields.filter((field) => field.isSystemField === 'phone').length !== 1) {
    throw new Error('Şablonda bir isim ve bir telefon alanı olmalı.');
  }
  return fields;
}

function normalizeSourceColumns(value, fields) {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Şablon kaynak sütunları geçersiz.');
  const columns = value.map((column) => {
    if (!column || typeof column.label !== 'string' || !column.label.trim() ||
        !['phone', 'name', 'field', 'ignore'].includes(column.role) ||
        (column.fieldId != null && !fields.some((field) => field.id === column.fieldId))) {
      throw new Error('Şablon kaynak sütunu geçersiz.');
    }
    return { label: column.label, role: column.role, fieldId: column.fieldId || null };
  });
  if (columns.length && columns.filter((column) => column.role === 'phone').length !== 1) {
    throw new Error('Şablonda bir telefon sütunu olmalı.');
  }
  return columns;
}

export async function createTemplateFile(name, fields, sourceColumns = []) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Şablon adı boş.');
  const normalizedFields = normalizeTemplateFields(fields);
  const body = {
    format: FORMAT, schemaVersion: 1, kind: 'template',
    templateId: Crypto.randomUUID(), createdAt: new Date().toISOString(),
    name: name.trim(), fields: normalizedFields, sourceColumns: normalizeSourceColumns(sourceColumns, normalizedFields),
  };
  const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(body));
  return JSON.stringify({ ...body, integrity: { algorithm: 'SHA-256', sha256 } });
}

export async function readTemplateFile(text) {
  if (typeof text !== 'string' || text.length > 100000) throw new Error('Şablon dosyası çok büyük.');
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('Şablon dosyası okunamadı.'); }
  if (file?.format !== FORMAT || file?.kind !== 'template' || file?.schemaVersion !== 1) {
    throw new Error('Bu dosya desteklenen bir şablon değil.');
  }
  const body = {
    format: file.format, schemaVersion: file.schemaVersion, kind: file.kind,
    templateId: file.templateId, createdAt: file.createdAt,
    name: file.name, fields: file.fields,
    ...(file.sourceColumns === undefined ? {} : { sourceColumns: file.sourceColumns }),
  };
  if (typeof body.templateId !== 'string' || !body.templateId.trim() ||
      typeof body.name !== 'string' || !body.name.trim() ||
      !Number.isFinite(Date.parse(body.createdAt)) ||
      file.integrity?.algorithm !== 'SHA-256' ||
      !/^[a-f0-9]{64}$/.test(file.integrity?.sha256 || '')) {
    throw new Error('Şablon bilgileri eksik.');
  }
  const actual = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(body));
  if (actual !== file.integrity.sha256) throw new Error('Şablon dosyası değişmiş veya bozulmuş.');
  const fields = normalizeTemplateFields(body.fields);
  return { id: body.templateId, name: body.name, fields,
    sourceColumns: normalizeSourceColumns(body.sourceColumns || [], fields), createdAt: body.createdAt };
}
