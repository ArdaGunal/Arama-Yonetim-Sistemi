import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { readResultFile } from './resultFormat';
import { readSurveyResultFile } from '../features/survey-transfer/surveyResultFormat';

const MANIFEST_KEY = '@ays_incoming_results_v1';
const SURVEY_MANIFEST_KEY = '@ays_incoming_surveys_v1';
const DB_NAME = 'ays-incoming-results';
const STORE_NAME = 'files';
let pending = Promise.resolve();

function serialize(task) {
  const next = pending.then(task);
  pending = next.catch(() => {});
  return next;
}

function validDigest(digest) {
  if (!/^[a-f0-9]{64}$/.test(digest || '')) throw new Error('Gelen dosya kimliği geçersiz.');
  return digest;
}

function nativeUri(digest) {
  if (!FileSystem.documentDirectory) throw new Error('Kalıcı dosya alanı kullanılamıyor.');
  return `${FileSystem.documentDirectory}ays-inbox-${validDigest(digest)}.ays`;
}

function openDb() {
  if (typeof indexedDB === 'undefined') throw new Error('Tarayıcı dosya alanı kullanılamıyor.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Gelen kutusu açılamadı.'));
  });
}

async function webFile(mode, operation) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = operation(tx.objectStore(STORE_NAME));
      let value;
      request.onsuccess = () => { value = request.result; };
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error || new Error('Gelen dosya saklanamadı.'));
      tx.onabort = () => reject(tx.error || new Error('Gelen dosya saklanamadı.'));
    });
  } finally { db.close(); }
}

async function writeFile(digest, content) {
  if (Platform.OS === 'web') return webFile('readwrite', (store) => store.put(content, digest));
  return FileSystem.writeAsStringAsync(nativeUri(digest), content, { encoding: FileSystem.EncodingType.UTF8 });
}

async function readFile(digest) {
  if (Platform.OS === 'web') return webFile('readonly', (store) => store.get(digest));
  const uri = nativeUri(digest);
  if (!(await FileSystem.getInfoAsync(uri)).exists) return null;
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}

async function deleteFile(digest) {
  if (Platform.OS === 'web') return webFile('readwrite', (store) => store.delete(digest));
  return FileSystem.deleteAsync(nativeUri(digest), { idempotent: true });
}

async function manifest(key = MANIFEST_KEY) {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) throw new Error('Gelen kutusu kaydı bozulmuş.');
  return entries;
}

/** Gelen anket cevabını önizlemeden önce kalıcı gelen kutusuna alır. */
export async function saveIncomingSurveyResponse(packet, content, project = null) {
  const verified = await readSurveyResultFile(content);
  if (verified.sha256 !== packet.sha256 ||
      (project && (project.mode !== 'survey' || project.role === 'volunteer' ||
        project.eventId !== packet.result.eventId))) {
    throw new Error('Gelen anket cevabı ana etkinlikle uyuşmuyor.');
  }
  return serialize(async () => {
    const entries = await manifest(SURVEY_MANIFEST_KEY);
    const existing = entries.find((item) => item.digest === packet.sha256);
    if (existing) {
      if (!await readFile(existing.digest)) throw new Error('Gelen cevap dosyası bulunamadı. Yeniden açın.');
      return { ...existing, duplicate: true };
    }
    await writeFile(packet.sha256, content);
    const entry = { digest: packet.sha256, projectId: project?.id || null,
      eventId: packet.result.eventId, eventName: project?.name || packet.result.eventName,
      sourceId: packet.result.sourceId, revision: packet.result.revision,
      count: packet.result.responses.length, receivedAt: new Date().toISOString(), processed: false };
    await AsyncStorage.setItem(SURVEY_MANIFEST_KEY, JSON.stringify([entry, ...entries]));
    return entry;
  });
}

export async function listIncomingSurveyResponses() {
  await pending;
  return manifest(SURVEY_MANIFEST_KEY);
}

export async function readIncomingSurveyResponse(digest) {
  validDigest(digest);
  const entry = (await listIncomingSurveyResponses()).find((item) => item.digest === digest);
  if (!entry) throw new Error('Gelen anket cevabı bulunamadı.');
  const content = await readFile(digest);
  if (!content) throw new Error('Gelen anket cevap dosyası bulunamadı.');
  const packet = await readSurveyResultFile(content);
  if (packet.sha256 !== digest) throw new Error('Gelen anket cevap dosyası bozulmuş.');
  return { entry, packet };
}

export async function markIncomingSurveyResponsesProcessed(digests) {
  const selected = new Set(digests.map(validDigest));
  return serialize(async () => {
    const entries = await manifest(SURVEY_MANIFEST_KEY);
    await AsyncStorage.setItem(SURVEY_MANIFEST_KEY, JSON.stringify(entries.map((item) =>
      selected.has(item.digest) ? { ...item, processed: true, processedAt: new Date().toISOString() } : item)));
  });
}

export async function saveIncomingResult(packet, content, project) {
  if (project && (project.role === 'volunteer' || project.eventId !== packet.result.eventId)) {
    throw new Error('Sonuç bu cihazdaki ana etkinlikle eşleşmiyor.');
  }
  const verified = await readResultFile(content);
  if (verified.sha256 !== packet.sha256) throw new Error('Sonuç dosyası değişmiş.');
  return serialize(async () => {
    const entries = await manifest();
    const existing = entries.find((item) => item.digest === packet.sha256);
    if (existing) {
      if (!await readFile(existing.digest)) throw new Error('Gelen kutusundaki dosya bulunamadı. Yeniden açın.');
      return { ...existing, duplicate: true };
    }
    await writeFile(packet.sha256, content);
    const entry = { digest: packet.sha256, projectId: project?.id || null,
      eventId: packet.result.eventId, eventName: project?.name || 'Etkinlik yedeği gerekli',
      assignmentId: packet.result.assignmentId, revision: packet.result.revision,
      receivedAt: new Date().toISOString(), processed: false };
    await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify([entry, ...entries]));
    return entry;
  });
}

export async function listIncomingResults(projectId = null) {
  await pending;
  return (await manifest()).filter((item) => !projectId || item.projectId === projectId);
}

export async function readIncomingResult(digest) {
  validDigest(digest);
  const entries = await listIncomingResults();
  const entry = entries.find((item) => item.digest === digest);
  if (!entry) throw new Error('Gelen sonuç bulunamadı.');
  const content = await readFile(digest);
  if (!content) throw new Error('Gelen sonuç dosyası bulunamadı.');
  const packet = await readResultFile(content);
  if (packet.sha256 !== digest) throw new Error('Gelen sonuç dosyası bozulmuş.');
  return { entry, packet };
}

export async function markIncomingResultsProcessed(digests) {
  const selected = new Set(digests.map(validDigest));
  return serialize(async () => {
    const entries = await manifest();
    await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(entries.map((item) =>
      selected.has(item.digest) ? { ...item, processed: true, processedAt: new Date().toISOString() } : item)));
  });
}

export async function removeIncomingResult(digest) {
  validDigest(digest);
  return serialize(async () => {
    const entries = await manifest();
    if (!entries.some((item) => item.digest === digest)) return;
    await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(entries.filter((item) => item.digest !== digest)));
    await deleteFile(digest);
  });
}
