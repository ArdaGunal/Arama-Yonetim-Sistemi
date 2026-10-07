import { NativeModules, Platform } from 'react-native';
import { deleteLastDiagnostic, getLastDiagnostic, saveLastDiagnostic } from './storage';
import appInfo from '../../package.json';

const recent = [];
const listeners = new Set();
let lastReport = null;

export function addBreadcrumb(event) {
  recent.push({ time: new Date().toISOString(), event: String(event).slice(0, 240) });
  if (recent.length > 30) recent.shift();
}

export function subscribeToDiagnostics(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(report) {
  lastReport = report;
  for (const listener of listeners) listener(report);
}

export function getCurrentDiagnostic() {
  return lastReport;
}

export async function clearDiagnostic() {
  await deleteLastDiagnostic();
  publish(null);
}

export function reportError(error, source = 'Uygulama', fatal = false, componentStack = '') {
  const message = error?.message || String(error || 'Bilinmeyen hata');
  const report = {
    time: new Date().toISOString(), source, fatal,
    message, stack: error?.stack || '', componentStack,
    appVersion: appInfo.version,
    platform: Platform.OS, osVersion: String(Platform.Version),
    breadcrumbs: [...recent],
  };
  publish(report);
  saveLastDiagnostic(report).catch(() => {});
  return report;
}

export async function loadLastDiagnostic() {
  try {
    const nativeCrash = Platform.OS === 'android'
      ? await NativeModules.CrashInfo?.consumeNativeCrash?.()
      : null;
    if (nativeCrash) {
      const error = new Error(nativeCrash.split('\n')[0]);
      error.stack = nativeCrash;
      return { report: reportError(error, 'Android yerel çökme (önceki açılış)', true), autoShow: true };
    }
    const stored = await getLastDiagnostic();
    if (stored) lastReport = stored;
    return { report: stored, autoShow: false };
  } catch (error) {
    return { report: reportError(error, 'Hata kaydı okunamadı'), autoShow: true };
  }
}

export function formatDiagnostic(report) {
  if (!report) return 'Henüz kayıtlı hata yok.';
  const trail = (report.breadcrumbs || [])
    .map((item) => `${item.time}  ${item.event}`).join('\n');
  return [
    'ARAMA YÖNETİM SİSTEMİ — HATA RAPORU',
    `Tarih: ${report.time}`,
    `Kaynak: ${report.source}`,
    `Önem: ${report.fatal ? 'Kritik' : 'Hata'}`,
    `Uygulama sürümü: ${report.appVersion || 'Bilinmiyor'}`,
    `Platform: ${report.platform} ${report.osVersion}`,
    `Neden: ${report.message}`,
    '', 'Yığın izi:', report.stack || 'Yok',
    report.componentStack ? `\nBileşen izi:\n${report.componentStack}` : '',
    '', 'Son işlemler:', trail || 'Yok',
  ].join('\n').slice(0, 60000);
}

export function installGlobalErrorHandler() {
  if (!global.__AYS_DIAGNOSTICS_CONSOLE_INSTALLED__) {
    global.__AYS_DIAGNOSTICS_CONSOLE_INSTALLED__ = true;
    for (const level of ['error', 'warn']) {
      const original = console[level];
      console[level] = (...args) => {
        addBreadcrumb(`${level.toUpperCase()}: ${args.map((value) =>
          value instanceof Error ? (value.stack || value.message) : String(value)
        ).join(' ')}`.slice(0, 1200));
        original(...args);
      };
    }
  }
  const errorUtils = global.ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    errorUtils.setGlobalHandler((error, isFatal) => {
      reportError(error, 'Yakalanmamış JavaScript hatası', !!isFatal);
    });
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      reportError(event.reason, 'Yakalanmamış Promise hatası', true);
    });
  }
}
