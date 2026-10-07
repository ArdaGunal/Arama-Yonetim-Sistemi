import * as Crypto from 'expo-crypto';
import { canonicalJson } from './canonicalJson';
import { cleanPhoneNumber } from './phoneUtils';

export const RESULT_SCHEMA_VERSION = 1;
export const CALL_STATUSES = ['contacted', 'unreached', 'later', 'wrong_number'];
const FORMAT = 'arama-yonetim-sistemi';
const MAX_CHARS = 30 * 1024 * 1024;

function identifier(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 ||
      ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error(`${label} geçersiz.`);
  return value;
}

function date(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`${label} geçersiz.`);
  return value;
}

export function normalizeAttempts(value, fieldIds) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 1000) throw new Error('Arama geçmişi geçersiz.');
  const ids = new Set();
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Arama kaydı geçersiz.');
    const id = identifier(raw.id, 'Arama kimliği');
    if (ids.has(id) || !CALL_STATUSES.includes(raw.status) || typeof raw.note !== 'string' || raw.note.length > 2000) {
      throw new Error('Arama kaydı geçersiz.');
    }
    ids.add(id);
    const data = {};
    for (const [key, answer] of Object.entries(raw.data || {})) {
      if (!fieldIds.has(key) || typeof answer !== 'string') throw new Error('Arama cevabı forma uymuyor.');
      data[key] = answer;
    }
    return { id, at: date(raw.at, 'Arama tarihi'), status: raw.status, note: raw.note, data };
  });
}

export function normalizeResult(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Sonuç içeriği geçersiz.');
  const eventId = identifier(input.eventId, 'Etkinlik kimliği');
  const assignmentId = identifier(input.assignmentId, 'Görev kimliği');
  if (!Number.isInteger(input.formVersion) || input.formVersion < 1 ||
      !Number.isInteger(input.round) || input.round < 1 ||
      !Number.isInteger(input.revision) || input.revision < 1 ||
      !/^[a-f0-9]{64}$/.test(input.assignmentDigest || '') ||
      !Array.isArray(input.fields) || !input.fields.length) throw new Error('Sonuç bilgileri geçersiz.');
  const fieldIds = new Set(input.fields.map((raw) => identifier(raw.id, 'Alan kimliği')));
  if (fieldIds.size !== input.fields.length) throw new Error('Sonuçta yinelenen form alanı var.');
  if (!Array.isArray(input.contacts) || !input.contacts.length || input.contacts.length > 100000) {
    throw new Error('Sonuç kişi listesi geçersiz.');
  }
  const recordIds = new Set();
  const phones = new Set();
  const contacts = input.contacts.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Sonuç kişisi geçersiz.');
    const recordId = identifier(raw.recordId, 'Kayıt kimliği');
    const phone = cleanPhoneNumber(raw.phone);
    if (!phone || recordIds.has(recordId) || phones.has(phone) || typeof raw.completed !== 'boolean' ||
        (raw.callStatus != null && !CALL_STATUSES.includes(raw.callStatus)) ||
        (raw.callbackNote != null && (typeof raw.callbackNote !== 'string' || raw.callbackNote.length > 2000)) ||
        (raw.callbackAt != null && !Number.isFinite(Date.parse(raw.callbackAt)))) {
      throw new Error('Sonuçta yinelenen veya geçersiz kişi var.');
    }
    recordIds.add(recordId); phones.add(phone);
    const data = {};
    for (const [key, answer] of Object.entries(raw.data || {})) {
      if (!fieldIds.has(key) || typeof answer !== 'string') throw new Error('Sonuç cevabı forma uymuyor.');
      data[key] = answer;
    }
    return { recordId, phone, data, completed: raw.completed,
      completedAt: raw.completedAt ? date(raw.completedAt, 'Tamamlanma tarihi') : null,
      callStatus: raw.callStatus || null, callbackNote: raw.callbackNote || '',
      callbackAt: raw.callbackAt || null, attempts: normalizeAttempts(raw.attempts, fieldIds) };
  });
  return { eventId, assignmentId, formVersion: input.formVersion, round: input.round,
    revision: input.revision, assignmentDigest: input.assignmentDigest,
    exportedAt: date(input.exportedAt, 'Sonuç tarihi'), fields: input.fields, contacts };
}

export async function createResultFile(input) {
  const result = normalizeResult(input);
  const body = { format: FORMAT, schemaVersion: RESULT_SCHEMA_VERSION, kind: 'result',
    eventId: result.eventId, assignmentId: result.assignmentId, exportedAt: result.exportedAt,
    payload: { result } };
  const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(body));
  return JSON.stringify({ ...body, integrity: { algorithm: 'SHA-256', sha256 } });
}

export async function readResultFile(text) {
  if (typeof text !== 'string' || text.length > MAX_CHARS) throw new Error('Sonuç dosyası çok büyük veya okunamadı.');
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('Sonuç dosyası geçerli JSON değil.'); }
  if (file?.format !== FORMAT || file.kind !== 'result' || file.schemaVersion !== RESULT_SCHEMA_VERSION) {
    throw new Error('Bu dosya desteklenen bir sonuç paketi değil.');
  }
  const body = { format: file.format, schemaVersion: file.schemaVersion, kind: file.kind,
    eventId: file.eventId, assignmentId: file.assignmentId, exportedAt: file.exportedAt, payload: file.payload };
  if (file.integrity?.algorithm !== 'SHA-256' || !/^[a-f0-9]{64}$/.test(file.integrity.sha256 || '')) {
    throw new Error('Sonuç bütünlük bilgisi eksik.');
  }
  const actual = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(body));
  if (actual !== file.integrity.sha256) throw new Error('Sonuç dosyası değişmiş veya bozulmuş.');
  const result = normalizeResult(body.payload?.result);
  if (result.eventId !== body.eventId || result.assignmentId !== body.assignmentId || result.exportedAt !== body.exportedAt) {
    throw new Error('Sonuç kimlikleri uyuşmuyor.');
  }
  return { result, sha256: actual };
}
