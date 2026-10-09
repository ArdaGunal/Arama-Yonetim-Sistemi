/** Tarayıcı depolamasının silinmeye karşı ek koruma durumunu okur. */
export async function getWebStoragePersistence(storage = typeof navigator === 'undefined' ? null : navigator.storage) {
  if (typeof storage?.persisted !== 'function') return 'unsupported';
  try {
    return await storage.persisted() ? 'granted' : 'temporary';
  } catch (_) {
    return 'unsupported';
  }
}

/** Kullanıcı yedek ekranındaki düğmeye bastığında çağrılır. */
export async function requestWebStoragePersistence(storage = typeof navigator === 'undefined' ? null : navigator.storage) {
  if (typeof storage?.persist !== 'function') return 'unsupported';
  try {
    return await storage.persist() ? 'granted' : 'temporary';
  } catch (_) {
    return 'unsupported';
  }
}
