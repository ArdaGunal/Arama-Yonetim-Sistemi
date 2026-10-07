import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { readAssignmentFile } from '../utils/assignmentFormat';
import { importVolunteerAssignment } from '../utils/storage';
import { reportError } from '../utils/diagnostics';
import { Colors } from '../theme/colors';

const inform = (message) => Platform.OS === 'web' ? window.alert(message) : Alert.alert('Görev açılamadı', message);

export default function AssignmentImportScreen({ navigation }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const choose = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (picked.canceled) return;
      const file = picked.assets?.[0];
      if (!file || !/\.ays(?:\.json)?$/i.test(file.name || '')) throw new Error('Lütfen .ays görev dosyasını seçin.');
      if (file.size > 30 * 1024 * 1024) throw new Error('Görev dosyası çok büyük.');
      const content = Platform.OS === 'web'
        ? file.file ? await file.file.text() : await (await fetch(file.uri)).text()
        : await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed = await readAssignmentFile(content);
      const state = await importVolunteerAssignment(parsed.assignment, parsed.sha256);
      setResult({ assignment: parsed.assignment, state });
    } catch (reason) { reportError(reason, 'Görev dosyası açılırken'); inform(reason.message || 'Dosya okunamadı.'); }
    finally { setBusy(false); }
  };
  return <View style={s.root}>
    <Text style={s.title}>Görev dosyasını aç</Text>
    <Text style={s.intro}>Size gönderilen .ays dosyasını seçin. Sorular ve yalnızca sizin arayacağınız kişiler otomatik gelir.</Text>
    <TouchableOpacity accessibilityRole="button" style={s.primary} disabled={busy} onPress={choose}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Dosya seç</Text>}
    </TouchableOpacity>
    {result && <View style={s.card}>
      <Text style={s.good}>{result.state === 'already-present' ? 'Görev zaten kayıtlı; cevaplarınız korundu.' : 'Görev kaydedildi.'}</Text>
      <Text style={s.detail}>Etkinlik: {result.assignment.eventName}</Text>
      <Text style={s.detail}>Gönüllü: {result.assignment.volunteerName}</Text>
      <Text style={s.detail}>Aranacak kişi: {result.assignment.contacts.length}</Text>
      <Text style={s.detail}>Form sürümü: {result.assignment.formVersion}</Text>
      <TouchableOpacity accessibilityRole="button" style={s.start}
        onPress={() => navigation.replace('Survey', { projectId: result.assignment.assignmentId,
          projectName: result.assignment.eventName })}>
        <Text style={s.startText}>Aramaya başla →</Text>
      </TouchableOpacity>
    </View>}
    <Text style={s.note}>Aynı dosyayı tekrar seçebilirsiniz; ikinci bir görev oluşmaz.</Text>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, padding: 20, paddingTop: 35 },
  title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 10 },
  intro: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 20 },
  primary: { backgroundColor: Colors.accent, minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  card: { backgroundColor: Colors.bgCard, borderColor: Colors.border, borderWidth: 1, borderRadius: 16, padding: 18, marginTop: 24 },
  good: { color: Colors.success, fontSize: 15, fontWeight: '800', marginBottom: 10 },
  detail: { color: Colors.textPrimary, fontSize: 14, marginTop: 7 },
  start: { backgroundColor: Colors.success, borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  startText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  note: { color: Colors.textMuted, fontSize: 12, marginTop: 20, lineHeight: 18 },
});
