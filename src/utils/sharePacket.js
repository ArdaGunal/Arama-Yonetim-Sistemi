import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { shareOrDownloadWebFile } from './webFileTransfer';

/** Paylaşımın kapanması karşı tarafa teslimi doğrulamaz. */
export async function sharePacket(content, name) {
  if (Platform.OS === 'web') return shareOrDownloadWebFile(content, name);
  if (!await Sharing.isAvailableAsync()) throw new Error('Bu cihazda dosya paylaşımı kullanılamıyor.');
  const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Anket dosyasını paylaş' });
  return 'shared';
}
