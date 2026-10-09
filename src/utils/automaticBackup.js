import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { createBackupFile } from './backupFormat';
import { getProjectForBackup, markProjectBackupSaved } from './storage';
import { downloadWebFile } from './webFileTransfer';

const DIRECTORY_KEY = '@ays_backup_directory';
const MIME = 'application/x-arama-yonetim-backup';

function backupName(project, reason) {
  const name = project.name.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ _-]/g, '').trim()
    .replace(/\s+/g, '_').slice(0, 35) || 'Etkinlik';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${name}-${reason}-${stamp}.ays`;
}

/** Önemli değişiklikten sonra dış dosya oluşturur. Android'de seçilen klasörü hatırlar. */
export async function saveEventBackup(projectId, reason = 'Yedek') {
  const project = await getProjectForBackup(projectId);
  const content = await createBackupFile(project);
  const name = backupName(project, reason);
  if (Platform.OS === 'web') {
    downloadWebFile(content, name, MIME);
    const current = await markProjectBackupSaved(projectId, project.backupEpoch || 0);
    return { saved: current, name, destination: 'downloads', snapshot: project };
  }
  if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
    const saf = FileSystem.StorageAccessFramework;
    let directory = await AsyncStorage.getItem(DIRECTORY_KEY);
    if (!directory) {
      const permission = await saf.requestDirectoryPermissionsAsync();
      if (!permission.granted) return { saved: false, name };
      directory = permission.directoryUri;
      await AsyncStorage.setItem(DIRECTORY_KEY, directory);
    }
    try {
      const uri = await saf.createFileAsync(directory, name, MIME);
      await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
    } catch (error) {
      await AsyncStorage.removeItem(DIRECTORY_KEY);
      throw new Error(`Yedek klasörüne yazılamadı: ${error.message}`);
    }
    const current = await markProjectBackupSaved(projectId, project.backupEpoch || 0);
    return { saved: current, name, destination: 'folder', snapshot: project };
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('Bu cihazda yedek paylaşımı kullanılamıyor.');
  const uri = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: MIME, dialogTitle: 'Etkinlik yedeğini Dosyalar’a kaydet' });
  const current = await markProjectBackupSaved(projectId, project.backupEpoch || 0);
  return { saved: current, name, destination: 'share', snapshot: project };
}
