import * as Crypto from 'expo-crypto';

export const BACKUP_EXTENSION = '.ays';
export const BACKUP_SCHEMA_VERSION = 1;
const FORMAT = 'arama-yonetim-sistemi';
const MAX_BACKUP_CHARS = 30 * 1024 * 1024;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} geçerli bir nesne değil.`);
  }
  return value;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw new Error(`${label} geçersiz.`);
  }
  return value;
}

function isoDate(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} geçersiz.`);
  }
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(',')}}`;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  throw new Error('Yedek desteklenmeyen bir veri türü içeriyor.');
}

export function normalizeBackupProject(input) {
  const project = object(input, 'Proje');
  const id = identifier(project.id, 'Proje kimliği');
  const eventId = identifier(project.eventId || id, 'Etkinlik kimliği');
  if (eventId !== id) throw new Error('Etkinlik ve proje kimliği uyuşmuyor.');
  if (typeof project.name !== 'string' || !project.name.trim()) throw new Error('Proje adı boş.');
  if (!Array.isArray(project.fields) || !Array.isArray(project.contacts)) {
    throw new Error('Yedekte alanlar veya kişiler eksik.');
  }
  const fieldIds = new Set();
  const fields = project.fields.map((raw, index) => {
    const field = object(raw, `Alan ${index + 1}`);
    const fieldId = identifier(field.id, 'Alan kimliği');
    if (fieldIds.has(fieldId) || ['__proto__', 'constructor', 'prototype'].includes(fieldId)) {
      throw new Error('Yedekte yinelenen veya geçersiz alan kimliği var.');
    }
    fieldIds.add(fieldId);
    if (typeof field.label !== 'string' || !field.label.trim() ||
        !['text', 'select'].includes(field.type) || !Array.isArray(field.options) ||
        field.options.some((option) => typeof option !== 'string')) {
      throw new Error(`Alan ${index + 1} geçersiz.`);
    }
    const normalized = {
      id: fieldId, label: field.label, type: field.type,
      options: [...field.options], order: Number.isInteger(field.order) ? field.order : index,
    };
    if (field.isSystemField !== undefined) {
      if (field.isSystemField !== 'name') throw new Error('Desteklenmeyen sistem alanı.');
      normalized.isSystemField = field.isSystemField;
    }
    return normalized;
  });
  const recordIds = new Set();
  const contacts = project.contacts.map((raw, index) => {
    const contact = object(raw, `Kişi ${index + 1}`);
    const contactId = identifier(contact.id, 'Kişi kimliği');
    const recordId = identifier(contact.recordId || contactId, 'Kayıt kimliği');
    if (recordId !== contactId || recordIds.has(recordId)) {
      throw new Error('Yedekte yinelenen veya uyuşmayan kayıt kimliği var.');
    }
    recordIds.add(recordId);
    if (typeof contact.phone !== 'string' || !contact.phone.trim()) {
      throw new Error(`Kişi ${index + 1} için telefon geçersiz.`);
    }
    const rawData = object(contact.data || {}, `Kişi ${index + 1} cevapları`);
    const data = {};
    for (const [key, value] of Object.entries(rawData)) {
      if (!fieldIds.has(key) || typeof value !== 'string') {
        throw new Error(`Kişi ${index + 1} cevapları form ile uyuşmuyor.`);
      }
      data[key] = value;
    }
    if (typeof contact.completed !== 'boolean') throw new Error('Kişi durumu geçersiz.');
    if (contact.completedAt !== null && contact.completedAt !== undefined) {
      isoDate(contact.completedAt, 'Tamamlanma tarihi');
    }
    return {
      id: contactId, recordId, phone: contact.phone, data,
      completed: contact.completed, completedAt: contact.completedAt || null,
    };
  });
  const currentIndex = project.currentIndex ?? 0;
  if (!Number.isInteger(currentIndex) || currentIndex < 0 ||
      (contacts.length > 0 && currentIndex >= contacts.length) ||
      (contacts.length === 0 && currentIndex !== 0)) {
    throw new Error('Projenin son kişi konumu geçersiz.');
  }
  return {
    id, eventId, name: project.name, createdAt: isoDate(project.createdAt, 'Proje tarihi'),
    currentIndex, fields, contacts,
  };
}

export function sameBackupProject(left, right) {
  return canonicalJson(normalizeBackupProject(left)) === canonicalJson(normalizeBackupProject(right));
}

export async function createBackupFile(project) {
  const normalized = normalizeBackupProject(project);
  const body = {
    format: FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, kind: 'backup',
    createdAt: new Date().toISOString(), eventId: normalized.eventId,
    payload: { project: normalized },
  };
  const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(body));
  return JSON.stringify({ ...body, integrity: { algorithm: 'SHA-256', sha256 } });
}

export async function readBackupFile(text) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_CHARS) {
    throw new Error('Yedek dosyası çok büyük veya okunamadı.');
  }
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('Yedek dosyası geçerli JSON değil.'); }
  object(file, 'Yedek');
  if (file.format !== FORMAT || file.kind !== 'backup') throw new Error('Bu dosya desteklenen bir etkinlik yedeği değil.');
  if (file.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error('Yedek sürümü desteklenmiyor. Uygulamayı güncelleyin.');
  const body = {
    format: file.format, schemaVersion: file.schemaVersion, kind: file.kind,
    createdAt: file.createdAt, eventId: file.eventId, payload: file.payload,
  };
  isoDate(body.createdAt, 'Yedek tarihi');
  identifier(body.eventId, 'Etkinlik kimliği');
  object(body.payload, 'Yedek içeriği');
  if (file.integrity?.algorithm !== 'SHA-256' ||
      typeof file.integrity.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.integrity.sha256)) {
    throw new Error('Yedek bütünlük bilgisi eksik.');
  }
  const actual = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(body));
  if (actual !== file.integrity.sha256) throw new Error('Yedek dosyası değişmiş veya bozulmuş.');
  const project = normalizeBackupProject(body.payload.project);
  if (project.eventId !== body.eventId) throw new Error('Yedek etkinlik kimliği uyuşmuyor.');
  return { project, createdAt: body.createdAt, sha256: actual };
}
