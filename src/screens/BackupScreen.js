import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { BACKUP_EXTENSION, createBackupFile, readBackupFile, sameBackupProject } from '../utils/backupFormat';
import { getProjectForBackup, getProjectSummaries, restoreProjectBackup } from '../utils/storage';
import { reportError } from '../utils/diagnostics';
import { Colors } from '../theme/colors';

const MIME = 'application/json';
const SAVE_MIME = 'application/x-arama-yonetim-backup';
const inform = (title, message) => Platform.OS === 'web' ? window.alert(`${title}\n${message}`) : Alert.alert(title, message);

function fileName(project) {
  const safeName = project.name.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ _-]/g, '').trim().replace(/\s+/g, '_').slice(0, 45) || 'Etkinlik';
  const date = new Date().toISOString().slice(0, 10);
  return `${safeName}-${date}${BACKUP_EXTENSION}`;
}

function downloadWeb(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: MIME }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BackupScreen() {
  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setProjects(await getProjectSummaries());
      setLoadError('');
    } catch (error) {
      reportError(error, 'Yedek ekranı açılırken');
      setLoadError(error.message || 'Projeler okunamadı.');
    }
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const exportBackup = async (projectId, mode) => {
    if (busy) return;
    setBusy(`${projectId}-${mode}`);
    try {
      const project = await getProjectForBackup(projectId);
      const content = await createBackupFile(project);
      const name = fileName(project);
      if (Platform.OS === 'web') {
        downloadWeb(content, name);
      } else if (mode === 'save' && Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
        const saf = FileSystem.StorageAccessFramework;
        const permission = await saf.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;
        const uri = await saf.createFileAsync(permission.directoryUri, name, SAVE_MIME);
        await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
        inform('Yedek kaydedildi', 'Dosyayı seçtiğiniz klasörde saklayın.');
      } else {
        if (!await Sharing.isAvailableAsync()) throw new Error('Bu cihazda dosya paylaşımı kullanılamıyor.');
        const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${name}`;
        await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(uri, { mimeType: MIME, dialogTitle: 'Etkinlik yedeğini paylaş' });
      }
    } catch (error) {
      reportError(error, 'Etkinlik yedeği dışa aktarılırken');
      inform('Yedek oluşturulamadı', error.message || 'Lütfen yeniden deneyin.');
    } finally {
      setBusy('');
    }
  };

  const chooseBackup = async () => {
    if (busy) return;
    setBusy('choose');
    setPreview(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file || !/\.ays(?:\.json)?$/i.test(file.name || '')) {
        throw new Error('Lütfen .ays uzantılı etkinlik yedeği seçin.');
      }
      if (file.size > 30 * 1024 * 1024) throw new Error('Yedek dosyası çok büyük.');
      let content;
      if (Platform.OS === 'web') {
        content = file.file ? await file.file.text() : await (await fetch(file.uri)).text();
      } else {
        content = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      }
      const parsed = await readBackupFile(content);
      const existingSummary = projects.find((item) =>
        item.id === parsed.project.id || item.eventId === parsed.project.eventId);
      const existing = existingSummary?.id === parsed.project.id
        ? await getProjectForBackup(parsed.project.id) : null;
      const state = existingSummary
        ? (existing && sameBackupProject(existing, parsed.project) ? 'same' : 'conflict') : 'new';
      setPreview({ ...parsed, state, fileName: file.name });
    } catch (error) {
      reportError(error, 'Etkinlik yedeği okunurken');
      inform('Yedek açılamadı', error.message || 'Dosyayı kontrol edin.');
    } finally {
      setBusy('');
    }
  };

  const restore = async () => {
    if (!preview || busy || preview.state === 'conflict') return;
    setBusy('restore');
    try {
      const result = await restoreProjectBackup(preview.project);
      await refresh();
      setPreview(null);
      inform(result === 'already-present' ? 'Zaten kayıtlı' : 'Geri yüklendi',
        result === 'already-present' ? 'Aynı etkinlik zaten cihazda var; ikinci kopya oluşturulmadı.' : 'Etkinlik ve cevapları projelere eklendi.');
    } catch (error) {
      reportError(error, 'Etkinlik yedeği geri yüklenirken');
      inform('Geri yükleme yapılamadı', error.message || 'Mevcut veriler korunuyor.');
    } finally {
      setBusy('');
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 30, 44) }]}>
      <Text style={styles.title}>Etkinlik yedekleri</Text>
      <Text style={styles.description}>Yedek, soruları ve kişi cevaplarını içerir. Uygulamayı silmeden veya cihaz değiştirmeden önce dosyayı cihaz dışına kaydedin.</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Yedeği geri yükle</Text>
        <Text style={styles.helper}>.ays dosyası önce doğrulanır ve içeriği gösterilir. Aynı etkinliğin farklı verileri otomatik olarak mevcut projenin üzerine yazılmaz.</Text>
        <TouchableOpacity accessibilityRole="button" disabled={!!busy} style={styles.primaryButton} onPress={chooseBackup}>
          <Text style={styles.primaryText}>{busy === 'choose' ? 'Dosya okunuyor…' : 'Yedek dosyası seç'}</Text>
        </TouchableOpacity>
      </View>

      {preview && (
        <View style={styles.preview}>
          <Text style={styles.sectionTitle}>Geri yükleme önizlemesi</Text>
          <Text style={styles.detail}>Dosya: {preview.fileName}</Text>
          <Text style={styles.detail}>Etkinlik: {preview.project.name}</Text>
          <Text style={styles.detail}>Kişi: {preview.project.contacts.length} · Alan: {preview.project.fields.length}</Text>
          <Text style={styles.detail}>Yedek tarihi: {new Date(preview.createdAt).toLocaleString('tr-TR')}</Text>
          <Text selectable style={styles.identity}>Etkinlik kimliği: {preview.project.eventId}</Text>
          {preview.state === 'conflict' ? (
            <Text style={styles.warning}>Bu etkinlik cihazda farklı içerikle var. Önce mevcut projeyi yedekleyin; bu dosya otomatik olarak üzerine yazılamaz.</Text>
          ) : (
            <TouchableOpacity accessibilityRole="button" disabled={!!busy} style={styles.primaryButton} onPress={restore}>
              <Text style={styles.primaryText}>{busy === 'restore' ? 'Geri yükleniyor…' : preview.state === 'same' ? 'Aynı yedeği kontrol et' : 'Etkinliği geri yükle'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity accessibilityRole="button" style={styles.dismissButton} onPress={() => setPreview(null)}>
            <Text style={styles.dismissText}>Önizlemeyi kapat</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.listTitle}>Projelerimi yedekle</Text>
      {loadError ? <Text style={styles.warning}>{loadError}</Text> : null}
      {!projects.length && !loadError ? <Text style={styles.helper}>Henüz yedeklenecek proje yok.</Text> : null}
      {projects.map((project) => (
        <View key={project.id} style={styles.card}>
          <Text style={styles.projectName}>{project.name}</Text>
          <Text style={styles.helper}>{project.totalContacts ?? 0} kişi · {project.completedContacts ?? 0} tamamlandı</Text>
          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" disabled={!!busy} style={styles.secondaryButton} onPress={() => exportBackup(project.id, 'save')}>
              <Text style={styles.secondaryText}>Kaydet</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={!!busy} style={styles.secondaryButton} onPress={() => exportBackup(project.id, 'share')}>
              <Text style={styles.secondaryText}>Paylaş</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {!!busy && <ActivityIndicator style={styles.spinner} color={Colors.accentLight} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 18, paddingTop: 28 },
  title: { color: Colors.textPrimary, fontWeight: '800', fontSize: 26, marginBottom: 10 },
  description: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 22 },
  card: { backgroundColor: Colors.bgCard, borderColor: Colors.border, borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 14 },
  preview: { backgroundColor: Colors.bgElevated, borderColor: Colors.accentLight, borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 20 },
  sectionTitle: { color: Colors.textPrimary, fontWeight: '800', fontSize: 17, marginBottom: 10 },
  helper: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  detail: { color: Colors.textPrimary, fontSize: 14, marginTop: 7 },
  identity: { color: Colors.textMuted, fontSize: 11, marginTop: 12 },
  warning: { color: Colors.warning, fontSize: 13, lineHeight: 20, marginVertical: 12 },
  primaryButton: { backgroundColor: Colors.accent, borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 16, paddingHorizontal: 12 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  dismissButton: { alignSelf: 'center', padding: 12, marginTop: 6 },
  dismissText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  listTitle: { color: Colors.textPrimary, fontWeight: '800', fontSize: 18, marginTop: 10, marginBottom: 12 },
  projectName: { color: Colors.textPrimary, fontWeight: '700', fontSize: 16, marginBottom: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondaryButton: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: Colors.borderAccent, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: Colors.accentLight, fontWeight: '700', fontSize: 14 },
  spinner: { marginTop: 8 },
});
