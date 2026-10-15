import * as Crypto from 'expo-crypto';
import { canonicalJson } from '../../utils/canonicalJson';
import { normalizeSurveyResponse } from '../surveys/surveyResponses';
import { normalizeSurveyForm } from './surveyFormFormat';

const FORMAT = 'arama-yonetim-sistemi';
const MAX_CHARS = 30 * 1024 * 1024;

function id(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 ||
      ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error(`${label} geçersiz.`);
  return value;
}

export function normalizeSurveyResult(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !Number.isSafeInteger(input.revision) || input.revision < 1 ||
      !Array.isArray(input.responses) || input.responses.length > 100000 ||
      typeof input.exportedAt !== 'string' || !Number.isFinite(Date.parse(input.exportedAt))) {
    throw new Error('Anket cevap paketi geçersiz.');
  }
  const form = normalizeSurveyForm({ eventId: input.eventId,
    eventName: input.eventName, createdAt: input.exportedAt,
    formVersion: input.formVersion, fields: input.fields,
    formHistory: [{ version: input.formVersion, fields: input.fields }] });
  const fieldIds = new Set(form.fields.map((field) => field.id));
  const responses = input.responses.map((row) => {
    const response = normalizeSurveyResponse(row, fieldIds, form.formVersion);
    if (response.formVersion !== form.formVersion) throw new Error('Yanıtın form sürümü paketten farklı.');
    return response;
  });
  if (new Set(responses.map((row) => row.id)).size !== responses.length) {
    throw new Error('Pakette yinelenen yanıt kimliği var.');
  }
  return { eventId: form.eventId, eventName: form.eventName, formVersion: form.formVersion,
    fields: form.fields, sourceId: id(input.sourceId, 'Kaynak cihaz kimliği'),
    packetId: id(input.packetId, 'Paket kimliği'), revision: input.revision,
    exportedAt: input.exportedAt, responses };
}

export async function createSurveyResultFile(input) {
  const result = normalizeSurveyResult(input);
  const body = { format: FORMAT, schemaVersion: 1, kind: 'survey-response',
    eventId: result.eventId, packetId: result.packetId, payload: { result } };
  const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(body));
  return JSON.stringify({ ...body, integrity: { algorithm: 'SHA-256', sha256 } });
}

export async function readSurveyResultFile(text) {
  if (typeof text !== 'string' || text.length > MAX_CHARS) throw new Error('Anket cevap dosyası çok büyük veya okunamadı.');
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('Anket cevap dosyası geçerli JSON değil.'); }
  if (file?.format !== FORMAT || file.schemaVersion !== 1 || file.kind !== 'survey-response') {
    throw new Error('Bu dosya desteklenen bir anket cevap paketi değil.');
  }
  const body = { format: file.format, schemaVersion: file.schemaVersion,
    kind: file.kind, eventId: file.eventId, packetId: file.packetId, payload: file.payload };
  if (file.integrity?.algorithm !== 'SHA-256' || !/^[a-f0-9]{64}$/.test(file.integrity.sha256 || '')) {
    throw new Error('Anket cevap dosyasının bütünlük bilgisi eksik.');
  }
  const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(body));
  if (sha256 !== file.integrity.sha256) throw new Error('Anket cevap dosyası değişmiş veya bozulmuş.');
  const result = normalizeSurveyResult(body.payload?.result);
  if (result.eventId !== body.eventId || result.packetId !== body.packetId) {
    throw new Error('Anket cevap kimlikleri uyuşmuyor.');
  }
  return { result, sha256 };
}
