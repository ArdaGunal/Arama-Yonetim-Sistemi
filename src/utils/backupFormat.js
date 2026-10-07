import * as Crypto from 'expo-crypto';
import { canonicalJson } from './canonicalJson';
import { normalizeAssignment } from './assignmentFormat';

export { canonicalJson } from './canonicalJson';

export const BACKUP_EXTENSION = '.ays';
export const BACKUP_SCHEMA_VERSION = 3;
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

function sourceReview(value, fieldIds) {
  if (value === null || value === undefined) return null;
  const review = object(value, 'Kaynak incelemesi');
  if (typeof review.sourceName !== 'string' || typeof review.hasHeader !== 'boolean' ||
      !Number.isInteger(review.totalRows) || review.totalRows < 0 ||
      !Array.isArray(review.columns) || !Array.isArray(review.excludedRows)) {
    throw new Error('Kaynak incelemesi geçersiz.');
  }
  return {
    sourceName: review.sourceName, hasHeader: review.hasHeader, totalRows: review.totalRows,
    columns: review.columns.map((raw) => {
      const col = object(raw, 'Kaynak sütunu');
      if (!Number.isInteger(col.index) || col.index < 0 || typeof col.label !== 'string' ||
          !['phone', 'name', 'field', 'ignore'].includes(col.role) ||
          (col.fieldId != null && !fieldIds.has(col.fieldId))) throw new Error('Kaynak sütunu geçersiz.');
      return { index: col.index, label: col.label, role: col.role, fieldId: col.fieldId || null };
    }),
    excludedRows: review.excludedRows.map((raw) => {
      const row = object(raw, 'İnceleme satırı');
      if (!Number.isInteger(row.sourceRow) || row.sourceRow < 1 ||
          !Array.isArray(row.cells) || row.cells.some((cell) => typeof cell !== 'string') ||
          typeof row.reason !== 'string') throw new Error('İnceleme satırı geçersiz.');
      return { sourceRow: row.sourceRow, cells: [...row.cells], reason: row.reason };
    }),
  };
}

function normalizeAssignments(value, eventId, recordIds, formVersion) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10000) throw new Error('Görev listesi geçersiz.');
  const seen = new Set();
  const activeRecords = new Set();
  const activePhones = new Set();
  return value.map((raw) => {
    const assignment = normalizeAssignment(raw);
    if (assignment.eventId !== eventId || seen.has(assignment.assignmentId) ||
        assignment.formVersion > formVersion || assignment.round !== 1 ||
        !['prepared', 'sent', 'partial', 'completed', 'cancelled'].includes(raw.status)) {
      throw new Error('Yedekte görev kimliği veya durumu geçersiz.');
    }
    seen.add(assignment.assignmentId);
    if (raw.sentAt != null) isoDate(raw.sentAt, 'Gönderim tarihi');
    if (raw.cancelledAt != null) isoDate(raw.cancelledAt, 'İptal tarihi');
    for (const contact of assignment.contacts) {
      if (!recordIds.has(contact.recordId)) throw new Error('Görevde ana listede olmayan kayıt var.');
      if (raw.status !== 'cancelled') {
        if (activeRecords.has(contact.recordId) || activePhones.has(contact.phone)) {
          throw new Error('Yedekte çakışan etkin görev var.');
        }
        activeRecords.add(contact.recordId);
        activePhones.add(contact.phone);
      }
    }
    return { ...assignment, status: raw.status, sentAt: raw.sentAt || null,
      cancelledAt: raw.cancelledAt || null };
  });
}

export function normalizeBackupProject(input) {
  const project = object(input, 'Proje');
  const id = identifier(project.id, 'Proje kimliği');
  const eventId = identifier(project.eventId || id, 'Etkinlik kimliği');
  const role = project.role || 'coordinator';
  if (!['coordinator', 'volunteer'].includes(role) ||
      (role === 'coordinator' && eventId !== id) ||
      (role === 'volunteer' && project.assignmentId !== id)) {
    throw new Error('Etkinlik ve proje kimliği uyuşmuyor.');
  }
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
    if (contact.sourceRow !== undefined && contact.sourceRow !== null &&
        (!Number.isInteger(contact.sourceRow) || contact.sourceRow < 1)) {
      throw new Error('Kaynak satır numarası geçersiz.');
    }
    return {
      id: contactId, recordId, phone: contact.phone, data,
      completed: contact.completed, completedAt: contact.completedAt || null,
      sourceRow: contact.sourceRow || null,
    };
  });
  const currentIndex = project.currentIndex ?? 0;
  if (!Number.isInteger(currentIndex) || currentIndex < 0 ||
      (contacts.length > 0 && currentIndex >= contacts.length) ||
      (contacts.length === 0 && currentIndex !== 0)) {
    throw new Error('Projenin son kişi konumu geçersiz.');
  }
  if (project.formVersion !== undefined && (!Number.isInteger(project.formVersion) || project.formVersion < 1)) {
    throw new Error('Form sürümü geçersiz.');
  }
  if (project.formLocked !== undefined && typeof project.formLocked !== 'boolean') {
    throw new Error('Form kilidi geçersiz.');
  }
  if (project.templateId != null) identifier(project.templateId, 'Şablon kimliği');
  if (role === 'volunteer' && !/^[a-f0-9]{64}$/.test(project.importDigest || '')) {
    throw new Error('Gönüllü görevi özeti geçersiz.');
  }
  const formVersion = project.formVersion || 1;
  const assignments = role === 'coordinator'
    ? normalizeAssignments(project.assignments, eventId, recordIds, formVersion) : [];
  if (role === 'volunteer' && project.assignments?.length) throw new Error('Gönüllü projesinde görev listesi olamaz.');
  return {
    id, eventId, name: project.name, createdAt: isoDate(project.createdAt, 'Proje tarihi'),
    currentIndex, fields, contacts, formVersion,
    formLocked: project.formLocked || false, templateId: project.templateId || null,
    sourceReview: sourceReview(project.sourceReview, fieldIds),
    role, assignmentId: role === 'volunteer' ? id : null,
    importDigest: role === 'volunteer' ? project.importDigest : null, assignments,
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
  if (![1, 2, BACKUP_SCHEMA_VERSION].includes(file.schemaVersion)) throw new Error('Yedek sürümü desteklenmiyor. Uygulamayı güncelleyin.');
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
