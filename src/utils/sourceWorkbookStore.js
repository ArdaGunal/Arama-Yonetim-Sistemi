import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const DB_NAME = 'ays-source-workbooks';
const STORE_NAME = 'files';

function validRef(ref) {
  if (typeof ref !== 'string' || !/^[a-zA-Z0-9_-]{1,220}$/.test(ref)) {
    throw new Error('Orijinal Excel depolama kimliği geçersiz.');
  }
  return ref;
}

function nativeUri(ref) {
  if (!FileSystem.documentDirectory) throw new Error('Dosya depolaması kullanılamıyor.');
  return `${FileSystem.documentDirectory}ays-source-${validRef(ref)}.bin`;
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') throw new Error('Tarayıcı dosya depolaması kullanılamıyor.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Tarayıcı dosya depolaması açılamadı.'));
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
      tx.onerror = () => reject(tx.error || new Error('Tarayıcı dosya depolaması başarısız.'));
      tx.onabort = () => reject(tx.error || new Error('Tarayıcı dosya depolaması iptal edildi.'));
    });
  } finally { db.close(); }
}

export async function writeSourceWorkbook(ref, base64) {
  validRef(ref);
  if (Platform.OS === 'web') {
    await webOperation('readwrite', (store) => store.put(base64, ref));
  } else {
    await FileSystem.writeAsStringAsync(nativeUri(ref), base64, { encoding: FileSystem.EncodingType.Base64 });
  }
}

export async function readSourceWorkbook(ref) {
  validRef(ref);
  if (Platform.OS === 'web') {
    return (await webOperation('readonly', (store) => store.get(ref))) || null;
  }
  const uri = nativeUri(ref);
  if (!(await FileSystem.getInfoAsync(uri)).exists) return null;
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

export async function removeSourceWorkbook(ref) {
  validRef(ref);
  if (Platform.OS === 'web') {
    await webOperation('readwrite', (store) => store.delete(ref));
  } else {
    await FileSystem.deleteAsync(nativeUri(ref), { idempotent: true });
  }
}
