import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { createAssignmentFile } from '../utils/assignmentFormat';
import { createAssignment, createCallbackAssignment, getAvailableContacts, getCallbackCandidates, getProject, setAssignmentStatus } from '../utils/storage';
import { reportError } from '../utils/diagnostics';
import { Colors } from '../theme/colors';
import { shareOrDownloadWebFile } from '../utils/webFileTransfer';

const inform = (message) => Platform.OS === 'web' ? window.alert(message) : Alert.alert('Bilgi', message);
const statuses = { prepared: 'Hazırlandı', sent: 'Gönderildi', partial: 'Kısmi sonuç', completed: 'Sonuçlandı', cancelled: 'İptal edildi' };

function confirm(title, message, action) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n${message}`)) action(); }
  else Alert.alert(title, message, [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Devam et', onPress: action }]);
}

export default function AssignmentsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [project, setProject] = useState(null);
  const [volunteerName, setVolunteerName] = useState('');
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [backupHint, setBackupHint] = useState(false);
  const [mode, setMode] = useState('first');
  const [showFinished, setShowFinished] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const available = useMemo(() => project ? getAvailableContacts(project).length : 0, [project]);
  const callbacks = useMemo(() => project ? getCallbackCandidates(project).length : 0, [project]);
  const listedAssignments = useMemo(() => (project?.assignments || [])
    .filter((item) => showFinished || !['completed', 'cancelled'].includes(item.status))
    .slice().reverse(), [project, showFinished]);
  const refresh = useCallback(async () => {
    try {
      const loaded = await getProject(route.params.projectId);
      if (!loaded || loaded.role === 'volunteer') throw new Error('Koordinatör etkinliği bulunamadı.');
      setProject(loaded); setError('');
    } catch (reason) { reportError(reason, 'Görev ekranı açılırken'); setError(reason.message); }
  }, [route.params.projectId]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const run = async (key, task) => {
    if (busy) return;
    setBusy(key);
    try { await task(); await refresh(); }
    catch (reason) { reportError(reason, 'Görev işlemi'); inform(reason.message || 'İşlem tamamlanamadı.'); }
    finally { setBusy(''); }
  };
  const make = () => run('create', async () => {
    await (mode === 'callback' ? createCallbackAssignment : createAssignment)(project.id, { assignmentId: Crypto.randomUUID(),
      volunteerName: volunteerName.trim(), count: Number(count), createdAt: new Date().toISOString() });
    setVolunteerName(''); setCount(''); setBackupHint(true);
    inform('Görev ayrıldı. Şimdi görev paketini paylaşın ve etkinlik yedeğini kaydedin.');
  });
  const share = (assignment) => run(assignment.assignmentId, async () => {
    const content = await createAssignmentFile(assignment);
    const safeName = assignment.volunteerName.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ _-]/g, '').trim().replace(/\s+/g, '_').slice(0, 35) || 'Gonullu';
    const fileName = `${safeName}-${assignment.assignmentId.slice(0, 8)}.ays`;
    if (Platform.OS === 'web') {
      await shareOrDownloadWebFile(content, fileName);
    } else {
      if (!await Sharing.isAvailableAsync()) throw new Error('Dosya paylaşımı bu cihazda kullanılamıyor.');
      const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Görev paketini paylaş' });
    }
  });
  const markSent = (assignment) => run(`sent-${assignment.assignmentId}`, async () => {
    await setAssignmentStatus(project.id, assignment.assignmentId, 'sent'); setBackupHint(true);
  });
  const cancel = (assignment) => confirm('Görevi iptal et',
    assignment.status === 'sent'
      ? 'Dosya gönderildiyse eski kopya gönüllüde kalabilir. Bu kişiler yeniden atanırsa iki kişi aynı numarayı arayabilir.'
      : 'Bu görevdeki kişiler yeniden atanabilir havuza dönecek.',
    () => run(`cancel-${assignment.assignmentId}`, async () => {
      await setAssignmentStatus(project.id, assignment.assignmentId, 'cancelled', assignment.status === 'sent');
      setBackupHint(true);
    }));

  if (error) return <View style={s.center}><Text style={s.warning}>{error}</Text><TouchableOpacity onPress={refresh}><Text style={s.link}>Tekrar dene</Text></TouchableOpacity></View>;
  if (!project) return <View style={s.center}><ActivityIndicator color={Colors.accentLight} /></View>;
  const active = (project.assignments || []).filter((item) => item.status !== 'cancelled');
  const finishedCount = (project.assignments || []).length -
    (project.assignments || []).filter((item) => !['completed', 'cancelled'].includes(item.status)).length;
  return <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingBottom: Math.max(40, insets.bottom + 20) }]} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>Görevleri dağıt</Text>
    <Text style={s.intro}>Her kişi tek bir etkin göreve ayrılır. Görev sayısını yazın; kişiler sırayla atanır.</Text>
    <View style={s.summary}>
      <View style={s.stat}><Text style={s.statNumber}>{available}</Text><Text style={s.statLabel}>Atanabilir</Text></View>
      <View style={s.stat}><Text style={s.statNumber}>{active.filter((item) => item.round === 1).reduce((sum, item) => sum + item.contacts.length, 0)}</Text><Text style={s.statLabel}>Ayrılmış</Text></View>
      <View style={s.stat}><Text style={s.statNumber}>{project.contacts.length}</Text><Text style={s.statLabel}>Toplam</Text></View>
    </View>
    <TouchableOpacity accessibilityRole="button" style={s.collect} onPress={() => navigation.navigate('ResultsImport', { projectId: project.id })}>
      <Text style={s.collectText}>Gelen sonuçları topla →</Text>
    </TouchableOpacity>
    <View style={s.modeRow}>
      <TouchableOpacity accessibilityRole="button" style={[s.modeButton, mode === 'first' && s.modeActive]} onPress={() => setMode('first')}>
        <Text style={s.modeText}>İlk dağıtım</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={[s.modeButton, mode === 'callback' && s.modeActive]} onPress={() => setMode('callback')}>
        <Text style={s.modeText}>Sonra ara ({callbacks})</Text>
      </TouchableOpacity>
    </View>
    <View style={s.card}>
      <Text style={s.cardTitle}>{mode === 'callback' ? 'Yeni geri arama görevi' : 'Yeni görev'}</Text>
      <Text style={s.label}>Kime gönderilecek?</Text>
      <TextInput style={s.input} value={volunteerName} onChangeText={setVolunteerName}
        placeholder="Gönüllünün adı" placeholderTextColor={Colors.textPlaceholder} />
      <Text style={s.label}>Kaç kişi?</Text>
      <TextInput style={s.input} value={count} onChangeText={setCount} keyboardType="number-pad"
        placeholder="Örn. 10" placeholderTextColor={Colors.textPlaceholder} />
      <TouchableOpacity accessibilityRole="button" style={[s.primary, (!volunteerName.trim() || !count || busy) && s.disabled]}
        disabled={!volunteerName.trim() || !count || !!busy} onPress={make}>
        <Text style={s.primaryText}>Görevi hazırla</Text>
      </TouchableOpacity>
    </View>
    {backupHint && <TouchableOpacity accessibilityRole="button" style={s.backup} onPress={() => navigation.navigate('Backup')}>
      <Text style={s.backupText}>Yeni görev kaydedildi. Etkinlik yedeğini al →</Text>
    </TouchableOpacity>}
    <Text style={s.listTitle}>Hazırlanan görevler</Text>
    {finishedCount > 0 && <TouchableOpacity accessibilityRole="button" style={s.finishedToggle}
      onPress={() => { setShowFinished((current) => !current); setVisibleCount(20); }}>
      <Text style={s.finishedToggleText}>{showFinished ? 'Biten görevleri gizle' : `${finishedCount} biten/iptal edilen görevi göster`}</Text>
    </TouchableOpacity>}
    {!listedAssignments.length && <Text style={s.muted}>{project.assignments?.length ? 'Devam eden görev yok.' : 'Henüz görev hazırlanmadı.'}</Text>}
    {listedAssignments.slice(0, visibleCount).map((assignment) => <View key={assignment.assignmentId} style={s.card}>
      <View style={s.heading}><Text style={s.cardTitle}>{assignment.volunteerName}</Text><Text style={s.badge}>{statuses[assignment.status]}</Text></View>
      <Text style={s.detail}>{assignment.contacts.length} kişi · Tur {assignment.round} · Form {assignment.formVersion}</Text>
      <Text style={s.detail}>Görev kimliği: {assignment.assignmentId.slice(0, 8)}</Text>
      {assignment.status !== 'cancelled' && <View style={s.actions}>
        <TouchableOpacity accessibilityRole="button" style={[s.secondary, s.flex]} disabled={!!busy} onPress={() => share(assignment)}>
          <Text style={s.link}>{busy === assignment.assignmentId ? 'Hazırlanıyor…' : 'Paketi paylaş'}</Text>
        </TouchableOpacity>
        {assignment.status === 'prepared' && <TouchableOpacity accessibilityRole="button" style={[s.secondary, s.flex]} disabled={!!busy} onPress={() => markSent(assignment)}>
          <Text style={s.link}>Gönderildi işaretle</Text>
        </TouchableOpacity>}
      </View>}
      {['prepared', 'sent'].includes(assignment.status) && <TouchableOpacity accessibilityRole="button" style={s.cancel} disabled={!!busy} onPress={() => cancel(assignment)}>
        <Text style={s.cancelText}>Görevi iptal et</Text>
      </TouchableOpacity>}
    </View>)}
    {listedAssignments.length > visibleCount && <TouchableOpacity accessibilityRole="button" style={s.moreButton}
      onPress={() => setVisibleCount((current) => current + 20)}>
      <Text style={s.moreText}>20 görev daha göster ({listedAssignments.length - visibleCount} kaldı)</Text>
    </TouchableOpacity>}
  </ScrollView>;
}

const s = StyleSheet.create({
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 13 },
  modeButton: { flex: 1, borderColor: Colors.borderAccent, borderWidth: 1, borderRadius: 10, padding: 12 },
  modeActive: { backgroundColor: Colors.accentDark },
  modeText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  collect: { backgroundColor: Colors.success, borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  collectText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  root: { flex: 1, backgroundColor: Colors.bg }, content: { padding: 18, paddingTop: 26 }, center: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: Colors.bg },
  title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 8 }, intro: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 18 },
  summary: { flexDirection: 'row', gap: 8, marginBottom: 16 }, stat: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: 13, padding: 12, alignItems: 'center' },
  statNumber: { color: Colors.accentLight, fontSize: 24, fontWeight: '800' }, statLabel: { color: Colors.textSecondary, fontSize: 11, marginTop: 4 },
  card: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, padding: 16, marginBottom: 13 },
  cardTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '800' }, label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 7 },
  input: { backgroundColor: Colors.bgInput, color: Colors.textPrimary, borderColor: Colors.borderLight, borderWidth: 1, borderRadius: 11, padding: 12, fontSize: 16 },
  primary: { backgroundColor: Colors.accent, minHeight: 49, borderRadius: 12, marginTop: 18, alignItems: 'center', justifyContent: 'center' }, disabled: { backgroundColor: Colors.textMuted },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 }, backup: { backgroundColor: Colors.warningBg, padding: 14, borderRadius: 12, marginBottom: 16 },
  backupText: { color: Colors.warning, fontSize: 13, fontWeight: '800' }, listTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800', marginVertical: 12 },
  muted: { color: Colors.textMuted, fontSize: 13 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  badge: { color: Colors.accentLight, fontSize: 12, fontWeight: '800' }, detail: { color: Colors.textSecondary, fontSize: 13, marginTop: 7 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 }, secondary: { borderWidth: 1, borderColor: Colors.borderAccent, borderRadius: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 8 },
  flex: { flex: 1 }, link: { color: Colors.accentLight, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  cancel: { alignSelf: 'flex-start', paddingVertical: 10, marginTop: 6 }, cancelText: { color: Colors.danger, fontSize: 13, fontWeight: '700' },
  finishedToggle: { borderColor: Colors.borderAccent, borderWidth: 1, borderRadius: 12, padding: 13, marginBottom: 14 },
  finishedToggleText: { color: Colors.accentLight, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  moreButton: { borderColor: Colors.borderAccent, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14 },
  moreText: { color: Colors.accentLight, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  warning: { color: Colors.warning },
});
