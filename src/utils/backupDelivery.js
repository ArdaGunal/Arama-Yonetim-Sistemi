const MIME = 'application/json';
const SAVE_MIME = 'application/x-arama-yonetim-backup';

/** Dosya seçimini başlatır; yalnız Android klasör yazımı doğrulanmış sonuç sayılır. */
export async function deliverBackupFile(content, name, mode, {
  platform, fileSystem, sharing, downloadWebFile, shareOrDownloadWebFile,
}) {
  if (platform === 'web') {
    if (mode === 'share') {
      const result = await shareOrDownloadWebFile(content, name);
      return result === 'cancelled' ? 'cancelled' : 'confirm-file';
    }
    downloadWebFile(content, name);
    return 'confirm-file';
  }
  if (mode === 'save' && platform === 'android' && fileSystem.StorageAccessFramework) {
    const saf = fileSystem.StorageAccessFramework;
    const permission = await saf.requestDirectoryPermissionsAsync();
    if (!permission.granted) return 'cancelled';
    const uri = await saf.createFileAsync(permission.directoryUri, name, SAVE_MIME);
    await fileSystem.writeAsStringAsync(uri, content, { encoding: fileSystem.EncodingType.UTF8 });
    return 'saved';
  }
  if (!await sharing.isAvailableAsync()) throw new Error('Bu cihazda dosya paylaşımı kullanılamıyor.');
  const uri = `${fileSystem.cacheDirectory || fileSystem.documentDirectory}${name}`;
  await fileSystem.writeAsStringAsync(uri, content, { encoding: fileSystem.EncodingType.UTF8 });
  await sharing.shareAsync(uri, { mimeType: MIME, dialogTitle: 'Etkinlik yedeğini paylaş' });
  return 'confirm-file';
}
