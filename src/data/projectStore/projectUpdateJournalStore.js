import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const DB_NAME = 'ays-project-update-journal';
const STORE_NAME = 'journal';
const WEB_KEY = 'contact-update';
const NATIVE_NAME = 'ays-project-update-journal.json';

function nativeUri() {
  if (!FileSystem.documentDirectory) throw new Error('Kurtarma dosyası alanı kullanılamıyor.');
  return `${FileSystem.documentDirectory}${NATIVE_NAME}`;
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') throw new Error('Tarayıcı kurtarma depolaması kullanılamıyor.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Tarayıcı kurtarma depolaması açılamadı.'));
  });
}

async function webOperation(mode, operation) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = operation(tx.objectStore(STORE_NAME));
      let value;
      request.onsuccess = () => { value = request.result; };
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error || new Error('Tarayıcı kurtarma kaydı yazılamadı.'));
      tx.onabort = () => reject(tx.error || new Error('Tarayıcı kurtarma kaydı iptal edildi.'));
    });
  } finally { db.close(); }
}

export async function readProjectUpdateJournal(storage) {
  if (Platform.OS === 'web') return (await webOperation('readonly', (store) => store.get(WEB_KEY))) ?? null;
  const uri = nativeUri();
  if (!(await FileSystem.getInfoAsync(uri)).exists) {
    await FileSystem.deleteAsync(`${uri}.tmp`, { idempotent: true });
    return null;
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
}

export async function writeProjectUpdateJournal(storage, raw) {
  if (Platform.OS === 'web') await webOperation('readwrite', (store) => store.put(raw, WEB_KEY));
  else {
    const uri = nativeUri();
    const temporary = `${uri}.tmp`;
    await FileSystem.deleteAsync(temporary, { idempotent: true });
    await FileSystem.writeAsStringAsync(temporary, raw, { encoding: FileSystem.EncodingType.UTF8 });
    await FileSystem.moveAsync({ from: temporary, to: uri });
  }
}

export async function removeProjectUpdateJournal(storage) {
  if (Platform.OS === 'web') await webOperation('readwrite', (store) => store.delete(WEB_KEY));
  else await FileSystem.deleteAsync(nativeUri(), { idempotent: true });
}
