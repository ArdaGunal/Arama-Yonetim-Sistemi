import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getProject, createSurveyResponsePacket, markSurveyResponsesShared,
  hasUnsharedSurveyResponses, previewIncomingSurveyResponses,
  applyIncomingSurveyResponses } from '../utils/storage';
import { createSurveyFormFile } from '../features/survey-transfer/surveyFormFormat';
import { readSurveyResultFile } from '../features/survey-transfer/surveyResultFormat';
import { sharePacket } from '../utils/sharePacket';
import { saveIncomingSurveyResponse, markIncomingSurveyResponsesProcessed } from '../utils/incomingResultStore';
import { reportError } from '../utils/diagnostics';
import { Colors } from '../theme/colors';

const safeName = (name) => name.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ _-]/g, '')
  .trim().replace(/\s+/g, '_').slice(0, 35) || 'Anket';
const answerText = (response, fields) => response.deletedAt ? 'Silinmiş yanıt' :
  Object.entries(response.data || {}).slice(0, 3).map(([key, value]) =>
    `${fields.find((field) => field.id === key)?.label || 'Soru'}: ${value}`).join(' · ');

export default function SurveyTransferScreen({ route, navigation }) {
  const { projectId, initialPacket } = route.params;
  const [project, setProject] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [sentFile, setSentFile] = useState(null);
  const refresh = useCallback(async () => {
    const item = await getProject(projectId);
    if (!item || item.mode !== 'survey') throw new Error('Anket bulunamadı.');
    setProject(item);
    return item;
  }, [projectId]);
  useFocusEffect(useCallback(() => {
    refresh().catch((reason) => { reportError(reason, 'Anket aktarımı açılırken'); setError(reason.message); });
  }, [refresh]));
  useEffect(() => {
    if (!initialPacket) return;
    previewIncomingSurveyResponses(projectId, initialPacket.result, initialPacket.sha256)
      .then((value) => { setPreview(value); setDecisions({}); })
      .catch((reason) => { reportError(reason, 'Gelen anket dosyası incelenirken'); setError(reason.message); });
  }, [projectId, initialPacket]);

  const shareForm = async () => {
    if (!project || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const content = await createSurveyFormFile({ eventId: project.eventId, eventName: project.name,
        createdAt: project.createdAt, formVersion: project.formVersion,
        fields: project.fields, formHistory: project.formHistory });
      const result = await sharePacket(content, `${safeName(project.name)}-Form${project.formVersion}.ays`);
      setMessage(result === 'cancelled' ? 'Paylaşım iptal edildi. Tekrar deneyebilirsiniz.' :
        'Form dosyası hazır. Karşı kişi dosyaya dokunup anketi açabilir.');
    } catch (reason) {
      reportError(reason, 'Anket formu paylaşılırken'); setError(reason.message || 'Anket dosyası hazırlanamadı.');
    } finally { setBusy(false); }
  };

  const shareResponses = async () => {
    if (!project || busy) return;
    setBusy(true); setError(''); setMessage(''); setSentFile(null);
    try {
      const packet = await createSurveyResponsePacket(projectId);
      const result = await sharePacket(packet.content, `${safeName(project.name)}-Cevaplar${packet.revision}.ays`);
      if (result === 'cancelled') setMessage('Paylaşım iptal edildi. Cevaplar cihazda kaldı.');
      else setSentFile(packet);
    } catch (reason) {
      reportError(reason, 'Anket cevapları paylaşılırken'); setError(reason.message || 'Cevap dosyası hazırlanamadı.');
    } finally { setBusy(false); }
  };

  const confirmSentFile = async () => {
    if (!sentFile || busy) return;
    setBusy(true); setError('');
    try {
      const current = await markSurveyResponsesShared(projectId, sentFile.revision, sentFile.epoch);
      setSentFile(null); await refresh();
      setMessage(current ? 'Gönderimi kontrol ettiniz. Cevaplar bu cihazda da saklanıyor.' :
        'Dosya hazırlanırken yeni cevap geldi. Güncel cevapları yeniden paylaşın.');
    } catch (reason) {
      reportError(reason, 'Anket cevap dosyası onaylanırken'); setError(reason.message);
    } finally { setBusy(false); }
  };

  const chooseResponses = async () => {
    if (busy) return;
    setBusy(true); setError(''); setMessage(''); setPreview(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (picked.canceled) return;
      const file = picked.assets?.[0];
      if (!file || !/\.ays(?:\.json)?$/i.test(file.name || '') || file.size > 30 * 1024 * 1024) {
        throw new Error('30 MB altında bir .ays cevap dosyası seçin.');
      }
      const content = Platform.OS === 'web'
        ? file.file ? await file.file.text() : await (await fetch(file.uri)).text()
        : await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const packet = await readSurveyResultFile(content);
      await saveIncomingSurveyResponse(packet, content, project);
      setPreview(await previewIncomingSurveyResponses(projectId, packet.result, packet.sha256));
      setDecisions({});
    } catch (reason) {
      reportError(reason, 'Gelen anket cevapları okunurken'); setError(reason.message || 'Dosya açılamadı.');
    } finally { setBusy(false); }
  };

  const merge = async () => {
    if (!preview || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await applyIncomingSurveyResponses(projectId, preview.result,
        preview.digest, decisions, preview.snapshot);
      try { await markIncomingSurveyResponsesProcessed([preview.digest]); }
      catch (reason) { reportError(reason, 'Gelen anket kutusu güncellenirken'); }
      await refresh(); setPreview(null); setDecisions({});
      setMessage(result.status === 'already-processed' ? 'Bu dosya daha önce işlendi; ikinci kayıt oluşmadı.' :
        `${result.added} yeni cevap eklendi. ${result.conflicts} farklı cevap için kararınız kaydedildi.`);
    } catch (reason) {
      reportError(reason, 'Anket cevapları birleştirilirken'); setError(reason.message || 'Birleştirme yapılamadı.');
    } finally { setBusy(false); }
  };

  const volunteer = project?.role === 'volunteer';
  const backupReady = project?.backupSavedEpoch != null &&
    project.backupSavedEpoch === (project.backupEpoch || 0);
  const allDecided = preview?.conflicts.every((item) => ['keep', 'incoming'].includes(decisions[item.id]));

  return <ScrollView style={s.root} contentContainerStyle={s.content}>
    <Text style={s.title}>{volunteer ? 'Cevapları gönder' : 'Anketi paylaş ve topla'}</Text>
    <Text style={s.help}>{volunteer
      ? 'Kaydettiğiniz cevapları tek dosya yapıp ana kişiye gönderin.'
      : 'Önce soruları gönderin. Gelen cevap dosyasını burada inceleyip ana ankete ekleyin.'}</Text>
    {project && <View style={s.card}>
      <Text style={s.name}>{project.name}</Text>
      <Text style={s.detail}>Form {project.formVersion} · {project.fields.length} soru · {project.totalContacts || 0} cevap</Text>
      {volunteer ? <>
        {hasUnsharedSurveyResponses(project) && <Text style={s.warning}>Gönderilmeyen cevaplar var.</Text>}
        <TouchableOpacity accessibilityRole="button" style={s.primary} disabled={busy} onPress={shareResponses}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Cevap dosyasını paylaş</Text>}
        </TouchableOpacity>
      </> : <>
        <TouchableOpacity accessibilityRole="button" style={s.primary} disabled={busy} onPress={shareForm}>
          <Text style={s.primaryText}>Soruları paylaş</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={s.secondary} disabled={busy} onPress={chooseResponses}>
          <Text style={s.secondaryText}>Gelen cevap dosyasını aç</Text>
        </TouchableOpacity>
      </>}
    </View>}
    {sentFile && <View style={s.card}>
      <Text style={s.name}>Dosyayı kontrol edin</Text>
      <Text style={s.help}>Dosyanın ana kişiye gönderildiğini WhatsApp veya kullandığınız yerde kontrol edin. İndirdiniz ama henüz göndermediyseniz bu düğmeye basmayın.</Text>
      <TouchableOpacity accessibilityRole="button" style={s.primary} disabled={busy} onPress={confirmSentFile}>
        <Text style={s.primaryText}>Gönderimi kontrol ettim</Text>
      </TouchableOpacity>
    </View>}
    {preview && <View style={s.card}>
      <Text style={s.name}>Gelen dosya önizlemesi</Text>
      <Text style={s.detail}>Yeni: {preview.added.length} · Aynı: {preview.duplicates.length} · Farklı: {preview.conflicts.length}</Text>
      {preview.alreadyProcessed && <Text style={s.message}>Bu dosya daha önce işlendi.</Text>}
      {preview.conflicts.map((item) => <View key={item.id} style={s.conflict}>
        <Text style={s.warning}>Aynı kimlikte farklı cevap</Text>
        <Text style={s.detail}>Cihazdaki: {answerText(item.current, preview.result.fields)}</Text>
        <Text style={s.detail}>Gelen: {answerText(item.incoming, preview.result.fields)}</Text>
        {['keep', 'incoming'].map((choice) => <TouchableOpacity key={choice}
          accessibilityRole="radio" accessibilityState={{ selected: decisions[item.id] === choice }}
          style={s.choice} onPress={() => setDecisions((old) => ({ ...old, [item.id]: choice }))}>
          <Text style={s.secondaryText}>{decisions[item.id] === choice ? '●' : '○'} {choice === 'keep' ? 'Cihazdaki kalsın' : 'Gelen cevabı kullan'}</Text>
        </TouchableOpacity>)}
      </View>)}
      {!preview.alreadyProcessed && !backupReady && <View style={s.conflict}>
        <Text style={s.warning}>Birleştirmeden önce güncel yedek alın.</Text>
        <TouchableOpacity accessibilityRole="button" style={s.secondary}
          onPress={() => navigation.navigate('Backup')}><Text style={s.secondaryText}>Yedek ekranına git</Text></TouchableOpacity>
      </View>}
      {!preview.alreadyProcessed && <TouchableOpacity accessibilityRole="button" style={s.primary}
        disabled={busy || !backupReady || !allDecided} onPress={merge}>
        <Text style={s.primaryText}>Cevapları ana ankete ekle</Text>
      </TouchableOpacity>}
    </View>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!message && <Text style={s.message}>{message}</Text>}
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg }, content: { padding: 20, paddingBottom: 70 },
  title: { color: Colors.textPrimary, fontSize: 25, fontWeight: '800', marginBottom: 8 },
  help: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
  card: { marginTop: 20, borderRadius: 15, backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border, padding: 18 },
  name: { color: Colors.textPrimary, fontSize: 19, fontWeight: '800' },
  detail: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 7 },
  warning: { color: Colors.warning, fontSize: 14, fontWeight: '700', marginTop: 12 },
  primary: { backgroundColor: Colors.accent, borderRadius: 12, minHeight: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: 17, paddingHorizontal: 12 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center' },
  secondary: { borderWidth: 1, borderColor: Colors.borderAccent, borderRadius: 12,
    minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingHorizontal: 12 },
  secondaryText: { color: Colors.accentLight, fontSize: 14, fontWeight: '700' },
  conflict: { marginTop: 14, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  choice: { borderWidth: 1, borderColor: Colors.borderAccent, borderRadius: 10,
    minHeight: 46, marginTop: 8, justifyContent: 'center', paddingHorizontal: 12 },
  error: { color: Colors.warning, fontSize: 14, marginTop: 18 },
  message: { color: Colors.success, fontSize: 14, marginTop: 18 },
});
