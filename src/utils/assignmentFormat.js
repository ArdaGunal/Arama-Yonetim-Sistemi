import * as Crypto from 'expo-crypto';
import { canonicalJson } from './canonicalJson';
import { cleanPhoneNumber } from './phoneUtils';

export const ASSIGNMENT_EXTENSION = '.ays';
export const ASSIGNMENT_SCHEMA_VERSION = 2;
const FORMAT = 'arama-yonetim-sistemi';
const MAX_CHARS = 30 * 1024 * 1024;

function id(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 ||
      ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error(`${label} geçersiz.`);
  return value;
}

function date(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`${label} geçersiz.`);
  return value;
}

function normalizeFields(input) {
  if (!Array.isArray(input) || !input.length || input.length > 100) throw new Error('Görev formu geçersiz.');
  const seen = new Set();
  const fields = input.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Görev alanı geçersiz.');
    const fieldId = id(raw.id, 'Alan kimliği');
    if (seen.has(fieldId) || typeof raw.label !== 'string' || !raw.label.trim() ||
        !['text', 'select'].includes(raw.type) || !Array.isArray(raw.options) ||
        raw.options.some((option) => typeof option !== 'string') ||
        (raw.required !== undefined && typeof raw.required !== 'boolean')) throw new Error('Görev alanı geçersiz.');
    seen.add(fieldId);
    if (raw.isSystemField != null && raw.isSystemField !== 'name') throw new Error('Görev sistem alanı geçersiz.');
    return { id: fieldId, label: raw.label, type: raw.type, options: [...raw.options],
      order: Number.isInteger(raw.order) ? raw.order : index,
      ...(raw.required !== undefined ? { required: raw.required } : {}),
      ...(raw.isSystemField ? { isSystemField: 'name' } : {}) };
  });
  if (fields.filter((field) => field.isSystemField === 'name' && field.type === 'text').length !== 1) {
    throw new Error('Görevde isim alanı eksik.');
  }
  return fields;
}

export function normalizeAssignment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Görev içeriği geçersiz.');
  const eventId = id(input.eventId, 'Etkinlik kimliği');
  const assignmentId = id(input.assignmentId, 'Görev kimliği');
  if (typeof input.eventName !== 'string' || !input.eventName.trim() ||
      typeof input.volunteerName !== 'string' || !input.volunteerName.trim() ||
      !Number.isInteger(input.formVersion) || input.formVersion < 1 ||
      !Number.isInteger(input.round) || input.round < 1) throw new Error('Görev bilgileri geçersiz.');
  const fields = normalizeFields(input.fields);
  const fieldIds = new Set(fields.map((field) => field.id));
  if (!Array.isArray(input.contacts) || !input.contacts.length || input.contacts.length > 100000) {
    throw new Error('Görev kişi listesi geçersiz.');
  }
  const seenIds = new Set();
  const seenPhones = new Set();
  const contacts = input.contacts.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Görev kişisi geçersiz.');
    const recordId = id(raw.recordId, 'Kayıt kimliği');
    const phone = cleanPhoneNumber(raw.phone);
    if (!phone || seenIds.has(recordId) || seenPhones.has(phone) ||
        !raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data)) {
      throw new Error('Görevde yinelenen veya geçersiz kişi var.');
    }
    seenIds.add(recordId); seenPhones.add(phone);
    const data = {};
    for (const [key, value] of Object.entries(raw.data)) {
      if (!fieldIds.has(key) || typeof value !== 'string') throw new Error('Görevde form dışı cevap var.');
      data[key] = value;
    }
    if (raw.previousCallbackNote != null &&
        (typeof raw.previousCallbackNote !== 'string' || raw.previousCallbackNote.length > 2000)) {
      throw new Error('Önceki geri arama notu geçersiz.');
    }
    if (raw.baseline != null && (!raw.baseline || typeof raw.baseline !== 'object' ||
        Array.isArray(raw.baseline) || typeof raw.baseline.completed !== 'boolean' ||
        (raw.baseline.callStatus != null && typeof raw.baseline.callStatus !== 'string') ||
        (raw.baseline.callbackNote != null && typeof raw.baseline.callbackNote !== 'string') ||
        (raw.baseline.callbackAt != null && !Number.isFinite(Date.parse(raw.baseline.callbackAt))))) {
      throw new Error('Görev başlangıç görüntüsü geçersiz.');
    }
    return { recordId, phone, data,
      ...(raw.previousCallbackNote != null ? { previousCallbackNote: raw.previousCallbackNote } : {}),
      ...(raw.baseline != null ? { baseline: { data: { ...data }, completed: raw.baseline.completed,
        callStatus: raw.baseline.callStatus || null, callbackNote: raw.baseline.callbackNote || '',
        callbackAt: raw.baseline.callbackAt || null } } : {}) };
  });
  return { eventId, assignmentId, eventName: input.eventName, volunteerName: input.volunteerName,
    formVersion: input.formVersion, round: input.round, createdAt: date(input.createdAt, 'Görev tarihi'),
    fields, contacts };
}

export async function createAssignmentFile(input) {
  const assignment = normalizeAssignment(input);
  const schemaVersion = assignment.fields.some((field) => field.required !== undefined) ? 2 : 1;
  const body = { format: FORMAT, schemaVersion, kind: 'assignment',
    eventId: assignment.eventId, assignmentId: assignment.assignmentId,
    createdAt: assignment.createdAt, payload: { assignment } };
  const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(body));
  return JSON.stringify({ ...body, integrity: { algorithm: 'SHA-256', sha256 } });
}

export async function readAssignmentFile(text) {
  if (typeof text !== 'string' || text.length > MAX_CHARS) throw new Error('Görev dosyası çok büyük veya okunamadı.');
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('Görev dosyası geçerli JSON değil.'); }
  if (file?.format !== FORMAT || file.kind !== 'assignment' || ![1, ASSIGNMENT_SCHEMA_VERSION].includes(file.schemaVersion)) {
    throw new Error('Bu dosya desteklenen bir görev paketi değil.');
  }
  const body = { format: file.format, schemaVersion: file.schemaVersion, kind: file.kind,
    eventId: file.eventId, assignmentId: file.assignmentId, createdAt: file.createdAt, payload: file.payload };
  if (file.integrity?.algorithm !== 'SHA-256' || !/^[a-f0-9]{64}$/.test(file.integrity.sha256 || '')) {
    throw new Error('Görev bütünlük bilgisi eksik.');
  }
  const actual = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(body));
  if (actual !== file.integrity.sha256) throw new Error('Görev dosyası değişmiş veya bozulmuş.');
  const assignment = normalizeAssignment(body.payload?.assignment);
  if (assignment.eventId !== body.eventId || assignment.assignmentId !== body.assignmentId ||
      assignment.createdAt !== body.createdAt) throw new Error('Görev kimlikleri uyuşmuyor.');
  return { assignment, sha256: actual };
}
