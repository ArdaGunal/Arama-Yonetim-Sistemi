import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@ays_app_settings_v1';
export const PASTE_MODES = ['name-phone', 'phone-name', 'phone-only', 'header-table'];
export const DEFAULT_SETTINGS = Object.freeze({ pasteMode: 'name-phone', defaultTemplateId: null });
let pending = Promise.resolve();

function normalize(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !PASTE_MODES.includes(value.pasteMode) ||
      (value.defaultTemplateId !== null &&
        (typeof value.defaultTemplateId !== 'string' || !value.defaultTemplateId.trim()))) {
    throw new Error('Ayarlar okunamadı. Mevcut ayarlar değiştirilmedi.');
  }
  return { pasteMode: value.pasteMode, defaultTemplateId: value.defaultTemplateId };
}

export async function getAppSettings() {
  await pending;
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? normalize(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
}

export function saveAppSettings(value) {
  const settings = normalize(value);
  const next = pending.then(async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
    return settings;
  });
  pending = next.catch(() => {});
  return next;
}
