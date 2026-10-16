import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { clearDraft, getProject, loadDraft, saveCoordinatorTaskContact, saveDraft } from '../utils/storage';
import { saveEventBackup } from '../utils/automaticBackup';
import { reportError } from '../utils/diagnostics';
import { openPhoneDialer } from '../utils/phoneActions';
import { Colors } from '../theme/colors';

const outcomes = [
  { id: 'contacted', label: 'Görüşüldü' },
  { id: 'unreached', label: 'Ulaşılamadı' },
  { id: 'later', label: 'Sonra ara' },
  { id: 'wrong_number', label: 'Yanlış numara' },
];
const inform = (title, message) => Platform.OS === 'web' ? window.alert(`${title}\n${message}`) : Alert.alert(title, message);

export default function MyAssignmentScreen({ route, navigation }) {
  const { projectId, assignmentId } = route.params;
  const [project, setProject] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [index, setIndex] = useState(0);
  const [data, setData] = useState({});
  const [callStatus, setCallStatus] = useState(null);
  const [callbackNote, setCallbackNote] = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [dirty, setDirty] = useState(false);

  const openRow = (loaded, task, nextIndex) => {
    const ids = task.contacts.filter((row) => !(task.releasedRecordIds || []).includes(row.recordId));
    const selected = ids[nextIndex];
    const contact = loaded.contacts.find((row) => (row.recordId || row.id) === selected?.recordId);
    setIndex(nextIndex);
    setData(contact?.data || {});
    setCallStatus(contact?.callStatus || null);
    setCallbackNote(contact?.callbackNote || '');
    setCallbackDate(contact?.callbackAt?.slice(0, 10) || '');
    setDirty(false);
  };
  const refresh = useCallback(async () => {
    try {
      setDraftError('');
      const loaded = await getProject(projectId);
      const task = loaded?.assignments?.find((item) => item.assignmentId === assignmentId && item.ownerType === 'coordinator');
      if (!loaded || !task) throw new Error('Kendi göreviniz bulunamadı.');
      const rows = task.contacts.filter((row) => !(task.releasedRecordIds || []).includes(row.recordId));
      const firstPending = rows.findIndex((row) => !task.lastApplied?.[row.recordId]?.completed);
      setProject(loaded); setAssignment(task); setError('');
      openRow(loaded, task, firstPending < 0 ? 0 : firstPending);
      const draft = await loadDraft(assignmentId);
      const draftedContact = loaded.contacts.find((row) => (row.recordId || row.id) === draft?.recordId);
      if (draft?.recordId && rows.some((row) => row.recordId === draft.recordId) &&
          (draftedContact?.attempts?.length || 0) === draft.baseAttemptCount) {
        const draftIndex = rows.findIndex((row) => row.recordId === draft.recordId);
        openRow(loaded, task, draftIndex);
        setData(draft.data || {}); setCallStatus(draft.callStatus || null);
        setCallbackNote(draft.callbackNote || ''); setCallbackDate(draft.callbackDate || ''); setDirty(true);
      }
    } catch (reason) { reportError(reason, 'Kendi görevim açılırken'); setError(reason.message); }
  }, [projectId, assignmentId]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (error) return <View style={s.center}><Text style={s.warning}>{error}</Text>
    <TouchableOpacity onPress={refresh}><Text style={s.link}>Tekrar dene</Text></TouchableOpacity></View>;
  if (!project || !assignment) return <View style={s.center}><ActivityIndicator color={Colors.accentLight} /></View>;
  const rows = assignment.contacts.filter((row) => !(assignment.releasedRecordIds || []).includes(row.recordId));
  const row = rows[index];
  const contact = project.contacts.find((item) => (item.recordId || item.id) === row?.recordId);
  const nameField = assignment.fields.find((field) => field.isSystemField === 'name');
  const done = rows.filter((item) => assignment.lastApplied?.[item.recordId]?.completed).length;
  const closed = ['cancelled', 'transferred'].includes(assignment.status);
  const change = (updates) => {
    const next = { recordId: row.recordId, baseAttemptCount: contact?.attempts?.length || 0,
      data, callStatus, callbackNote, callbackDate, ...updates };
    if (updates.data !== undefined) setData(updates.data);
    if (updates.callStatus !== undefined) setCallStatus(updates.callStatus);
    if (updates.callbackNote !== undefined) setCallbackNote(updates.callbackNote);
    if (updates.callbackDate !== undefined) setCallbackDate(updates.callbackDate);
    setDirty(true);
    saveDraft(assignmentId, next).then(() => setDraftError('')).catch((reason) => {
      reportError(reason, 'Kendi görevim taslağı');
      setDraftError('Taslak kaydedilemedi. Cevabı kaydedin veya tekrar deneyin.');
    });
  };
  const retryDraft = async () => {
    if (!row) return;
    try {
      if (draftError.startsWith('Cevap kaydedildi')) await clearDraft(assignmentId);
      else await saveDraft(assignmentId, { recordId: row.recordId, baseAttemptCount: contact?.attempts?.length || 0,
        data, callStatus, callbackNote, callbackDate });
      setDraftError('');
    } catch (reason) {
      reportError(reason, 'Kendi görevim taslağı tekrar denenirken');
      setDraftError('Taslak kaydedilemedi. Cevabı kaydedin veya tekrar deneyin.');
    }
  };
  const move = (nextIndex) => {
    if (dirty) { inform('Kaydedilmemiş cevap var', 'Başka kişiye geçmeden önce Kaydet ve devam et düğmesine basın.'); return; }
    openRow(project, assignment, nextIndex);
  };

  const save = async () => {
    if (busy || !row || closed) return;
    if (!callStatus) { inform('Arama sonucu eksik', 'Önce arama sonucunu seçin.'); return; }
    let callbackAt = null;
    if (callStatus === 'later' && callbackDate.trim()) {
      const value = callbackDate.trim();
      const parsed = new Date(`${value}T12:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== value) {
        inform('Tarih geçersiz', 'Tarihi YYYY-AA-GG biçiminde yazın.'); return;
      }
      callbackAt = parsed.toISOString();
    }
    setBusy(true);
    try {
      const result = await saveCoordinatorTaskContact(projectId, assignmentId, row.recordId, {
        data, callStatus, callbackNote, callbackAt,
      });
      try { await clearDraft(assignmentId); setDraftError(''); }
      catch (reason) {
        reportError(reason, 'Kendi görevim taslağı temizlenirken');
        setDraftError('Cevap kaydedildi, ancak eski taslak silinemedi. Tekrar deneyin.');
      }
      const loaded = await getProject(projectId);
      const task = loaded.assignments.find((item) => item.assignmentId === assignmentId);
      setProject(loaded); setAssignment(task);
      const next = rows.findIndex((item, itemIndex) => itemIndex > index && !task.lastApplied?.[item.recordId]?.completed);
      if (next >= 0) openRow(loaded, task, next);
      else if (result.assignmentStatus === 'completed') {
        let backedUp = false;
        try { backedUp = (await saveEventBackup(projectId, 'Kendi-gorevim-tamamlandi')).saved; }
        catch (reason) { reportError(reason, 'Kendi görevim yedeklenirken'); }
        inform('Görev tamamlandı', backedUp
          ? 'Cevaplar ana listeye kaydedildi ve etkinlik yedeği oluşturuldu.'
          : 'Cevaplar ana listeye kaydedildi. Etkinlik yedeğini ayrıca kaydedin.');
        navigation.goBack();
      } else inform('Kaydedildi', 'Cevap ana listeye kaydedildi. Diğer kişilere üstteki düğmelerle geçebilirsiniz.');
    } catch (reason) { reportError(reason, 'Kendi görevim kaydedilirken'); inform('Kaydedilemedi', reason.message); }
    finally { setBusy(false); }
  };

  return <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>Kendi görevim</Text>
    <Text style={s.summary}>{done}/{rows.length} kişi tamamlandı</Text>
    {closed && <Text style={s.warning}>Bu görev kapandı. Cevapları görmek için ana listeye dönün.</Text>}
    {!!draftError && <View><Text style={s.warning}>{draftError}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={retryDraft}><Text style={s.link}>Tekrar dene</Text></TouchableOpacity></View>}
    {row && contact && <View style={s.card}>
      <Text style={s.counter}>{index + 1}. kişi / {rows.length}</Text>
      <Text style={s.name}>{nameField ? contact.data?.[nameField.id] || 'İsim yok' : 'İsim yok'}</Text>
      <TouchableOpacity accessibilityRole="button" style={s.call} onPress={() => openPhoneDialer(contact.phone)}>
        <Text style={s.callText}>📞 {contact.phone} · Ara</Text>
      </TouchableOpacity>
      <Text style={s.section}>Arama sonucu</Text>
      {outcomes.map((outcome) => <TouchableOpacity key={outcome.id} accessibilityRole="button"
        style={[s.option, callStatus === outcome.id && s.optionSelected]} onPress={() => change({ callStatus: outcome.id })}>
        <Text style={s.optionText}>{outcome.label}</Text>
      </TouchableOpacity>)}
      {callStatus === 'later' && <>
        <Text style={s.label}>Kısa not (isteğe bağlı)</Text>
        <TextInput style={s.input} value={callbackNote} onChangeText={(value) => change({ callbackNote: value })} multiline
          placeholder="Ne zaman tekrar arayalım?" placeholderTextColor={Colors.textPlaceholder} />
        <Text style={s.label}>Tarih (isteğe bağlı)</Text>
        <TextInput style={s.input} value={callbackDate} onChangeText={(value) => change({ callbackDate: value })}
          placeholder="YYYY-AA-GG" placeholderTextColor={Colors.textPlaceholder} />
      </>}
      <Text style={s.section}>Sorular</Text>
      {assignment.fields.filter((field) => !field.isSystemField).map((field) => <View key={field.id}>
        <Text style={s.label}>{field.label}{field.required && callStatus === 'contacted' ? ' *' : ''}</Text>
        {field.type === 'select' ? field.options.map((option) => <TouchableOpacity key={option} accessibilityRole="button"
          style={[s.option, data[field.id] === option && s.optionSelected]}
          onPress={() => change({ data: { ...data, [field.id]: option } })}><Text style={s.optionText}>{option}</Text></TouchableOpacity>)
          : <TextInput style={s.input} value={data[field.id] || ''} onChangeText={(value) => change({ data: { ...data, [field.id]: value } })}
            placeholder="Cevap yazın" placeholderTextColor={Colors.textPlaceholder} />}
      </View>)}
      <TouchableOpacity accessibilityRole="button" style={[s.primary, (busy || closed) && s.disabled]} disabled={busy || closed} onPress={save}>
        <Text style={s.primaryText}>{busy ? 'Kaydediliyor…' : 'Kaydet ve devam et'}</Text>
      </TouchableOpacity>
    </View>}
    <View style={s.nav}>
      <TouchableOpacity accessibilityRole="button" style={s.navButton} disabled={index === 0 || busy}
        onPress={() => move(index - 1)}><Text style={s.link}>← Önceki</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={s.navButton} disabled={index >= rows.length - 1 || busy}
        onPress={() => move(index + 1)}><Text style={s.link}>Sonraki →</Text></TouchableOpacity>
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg }, content: { padding: 18, paddingBottom: 55 },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center', padding: 22 },
  title: { color: Colors.textPrimary, fontSize: 25, fontWeight: '800' },
  summary: { color: Colors.textSecondary, fontSize: 14, marginTop: 6, marginBottom: 18 },
  warning: { color: Colors.warning, fontSize: 14, lineHeight: 21, marginBottom: 14 },
  card: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  counter: { color: Colors.accentLight, fontSize: 13, fontWeight: '700' },
  name: { color: Colors.textPrimary, fontSize: 20, fontWeight: '800', marginTop: 7, marginBottom: 12 },
  call: { backgroundColor: Colors.success, borderRadius: 11, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  callText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  section: { color: Colors.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 22, marginBottom: 9 },
  label: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700', marginTop: 13, marginBottom: 7 },
  option: { borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 10, padding: 13, marginBottom: 7 },
  optionSelected: { backgroundColor: Colors.accentDark, borderColor: Colors.accentLight },
  optionText: { color: Colors.textPrimary, fontSize: 15 },
  input: { borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.bgInput,
    color: Colors.textPrimary, borderRadius: 10, padding: 13, fontSize: 15 },
  primary: { backgroundColor: Colors.accent, borderRadius: 11, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 25 },
  disabled: { backgroundColor: Colors.textMuted }, primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  nav: { flexDirection: 'row', gap: 10, marginTop: 14 },
  navButton: { flex: 1, borderWidth: 1, borderColor: Colors.borderAccent, borderRadius: 10,
    minHeight: 45, alignItems: 'center', justifyContent: 'center' },
  link: { color: Colors.accentLight, fontWeight: '800', fontSize: 14 },
});
