import * as Crypto from 'expo-crypto';
import { canonicalJson } from '../../utils/canonicalJson';
import { normalizeBackupProject } from '../../utils/backupFormat';

const FORMAT = 'arama-yonetim-sistemi';
const MAX_CHARS = 2 * 1024 * 1024;

/** Anket formu yalnız soruları taşır; ana cihazın cevapları dosyaya girmez. */
export function normalizeSurveyForm(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !Number.isInteger(input.formVersion) || input.formVersion < 1) {
    throw new Error('Anket formu geçersiz.');
  }
  const project = normalizeBackupProject({
    id: input.eventId, eventId: input.eventId, mode: 'survey', role: 'coordinator',
    name: input.eventName, createdAt: input.createdAt, currentIndex: 0,
    fields: input.fields, formVersion: input.formVersion,
    formHistory: input.formHistory, responses: [], assignments: [],
    sourceWorkbook: null, sourceReview: null,
  });
  return { eventId: project.eventId, eventName: project.name,
    createdAt: project.createdAt, formVersion: project.formVersion,
    fields: project.fields, formHistory: project.formHistory };
}

export async function createSurveyFormFile(input) {
  const form = normalizeSurveyForm(input);
  const body = { format: FORMAT, schemaVersion: 1, kind: 'survey-form',
    eventId: form.eventId, payload: { form } };
  const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(body));
  return JSON.stringify({ ...body, integrity: { algorithm: 'SHA-256', sha256 } });
}

export async function readSurveyFormFile(text) {
  if (typeof text !== 'string' || text.length > MAX_CHARS) throw new Error('Anket dosyası çok büyük veya okunamadı.');
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('Anket dosyası geçerli JSON değil.'); }
  if (file?.format !== FORMAT || file.schemaVersion !== 1 || file.kind !== 'survey-form') {
    throw new Error('Bu dosya desteklenen bir anket formu değil.');
  }
  const body = { format: file.format, schemaVersion: file.schemaVersion,
    kind: file.kind, eventId: file.eventId, payload: file.payload };
  if (file.integrity?.algorithm !== 'SHA-256' || !/^[a-f0-9]{64}$/.test(file.integrity.sha256 || '')) {
    throw new Error('Anket dosyasının bütünlük bilgisi eksik.');
  }
  const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(body));
  if (sha256 !== file.integrity.sha256) throw new Error('Anket dosyası değişmiş veya bozulmuş.');
  const form = normalizeSurveyForm(body.payload?.form);
  if (form.eventId !== body.eventId) throw new Error('Anket kimliği uyuşmuyor.');
  return { form, sha256 };
}
