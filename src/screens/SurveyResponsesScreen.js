import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { changeSurveyResponse, getProject, waitForPendingWrites } from '../utils/storage';
import { surveyResponseFields } from '../features/surveys/surveyResponses';
import { reportError } from '../utils/diagnostics';
import { Colors } from '../theme/colors';

const dateLabel = (value) => new Date(value).toLocaleString('tr-TR');
const firstAnswer = (response) => Object.values(response.data).find((value) => value.trim()) || 'Cevap';

export default function SurveyResponsesScreen({ route }) {
  const { projectId } = route.params;
  const insets = useSafeAreaInsets();
  const [project, setProject] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      await waitForPendingWrites();
      const loaded = await getProject(projectId);
      if (!loaded || loaded.mode !== 'survey') throw new Error('Anket bulunamadı.');
      setProject(loaded);
      setError('');
    } catch (reason) {
      reportError(reason, 'Anket yanıt listesi açılırken');
      setError(reason.message || 'Yanıtlar okunamadı.');
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const selected = project?.responses.find((response) => response.id === selectedId);
  const fields = selected && project ? surveyResponseFields(project, selected) : [];
  const labels = new Map((project?.formHistory || []).flatMap((snapshot) => snapshot.fields)
    .map((field) => [field.id, field.label]));
  const rows = (project?.responses || []).filter((response) => !!response.deletedAt === showDeleted &&
    (!query.trim() || `${dateLabel(response.submittedAt)} ${response.id} ${Object.values(response.data).join(' ')}`
      .toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR'))))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const activeCount = project?.responses.filter((response) => !response.deletedAt).length || 0;
  const deletedCount = (project?.responses.length || 0) - activeCount;

  const applyChange = async (action) => {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      await changeSurveyResponse(projectId, selected.id, selected, action,
        action === 'edit' ? editData : null);
      setEditing(false);
      await refresh();
    } catch (reason) {
      reportError(reason, `Anket yanıtı ${action} işlemi`);
      setError(reason.message || 'Yanıt değiştirilemedi.');
    } finally { setBusy(false); }
  };

  const confirmDelete = () => {
    const message = 'Yanıt listeden kaldırılacak. "Silinenler" bölümünden geri getirebilirsiniz.';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) applyChange('delete');
    } else Alert.alert('Yanıtı sil?', message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => applyChange('delete') },
    ]);
  };

  if (!project) return <View style={s.center}>{error
    ? <><Text style={s.error}>{error}</Text><TouchableOpacity onPress={refresh} style={s.button}>
        <Text style={s.buttonText}>Tekrar dene</Text></TouchableOpacity></>
    : <ActivityIndicator color={Colors.accentLight} />}</View>;

  return <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
    keyboardShouldPersistTaps="handled">
    {selected ? <>
      <TouchableOpacity accessibilityRole="button" style={s.back} onPress={() => {
        setSelectedId(null); setEditing(false); setError(''); }}>
        <Text style={s.backText}>← Yanıt listesi</Text>
      </TouchableOpacity>
      <Text style={s.title}>{selected.deletedAt ? 'Silinmiş yanıt' : 'Yanıt ayrıntısı'}</Text>
      <Text style={s.subtle}>{dateLabel(selected.submittedAt)}</Text>
      <Text selectable style={s.identity}>Kimlik: {selected.id}</Text>
      {fields.map((field) => <View key={field.id} style={s.card}>
        <Text style={s.label}>{field.label}{field.required ? ' *' : ''}</Text>
        {editing ? field.type === 'select'
          ? field.options.map((option) => <TouchableOpacity key={option} accessibilityRole="radio"
              accessibilityState={{ selected: editData[field.id] === option }} style={s.choice}
              onPress={() => setEditData((data) => ({ ...data,
                [field.id]: data[field.id] === option ? '' : option }))}>
              <Text style={s.value}>{editData[field.id] === option ? '●' : '○'}  {option}</Text>
            </TouchableOpacity>)
          : <TextInput accessibilityLabel={field.label} style={s.input} multiline value={editData[field.id] || ''}
              placeholder="Cevap yazın" placeholderTextColor={Colors.textPlaceholder}
              onChangeText={(value) => setEditData((data) => ({ ...data, [field.id]: value }))} />
          : <Text selectable style={s.value}>{selected.data[field.id] || '—'}</Text>}
      </View>)}
      {!!error && <><Text accessibilityRole="alert" style={s.error}>{error}</Text>
        <TouchableOpacity accessibilityRole="button" style={s.secondary} onPress={refresh}>
          <Text style={s.secondaryText}>Yanıtı yenile</Text>
        </TouchableOpacity></>}
      {editing ? <>
        <TouchableOpacity accessibilityRole="button" style={s.button} disabled={busy} onPress={() => applyChange('edit')}>
          <Text style={s.buttonText}>{busy ? 'Kaydediliyor…' : 'Düzeltmeyi kaydet'}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={s.secondary} disabled={busy} onPress={() => setEditing(false)}>
          <Text style={s.secondaryText}>Vazgeç</Text>
        </TouchableOpacity>
      </> : selected.deletedAt ?
        <TouchableOpacity accessibilityRole="button" style={s.button} disabled={busy} onPress={() => applyChange('restore')}>
          <Text style={s.buttonText}>{busy ? 'Geri getiriliyor…' : 'Yanıtı geri getir'}</Text>
        </TouchableOpacity> : <>
        <TouchableOpacity accessibilityRole="button" style={s.button} onPress={() => {
          setEditData({ ...selected.data }); setEditing(true); setError(''); }}>
          <Text style={s.buttonText}>Yanıtı düzelt</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={s.secondary} disabled={busy} onPress={confirmDelete}>
          <Text style={s.dangerText}>Yanıtı sil</Text>
        </TouchableOpacity>
      </>}
      <Text style={s.section}>İşlem geçmişi</Text>
      {selected.history?.length ? [...selected.history].reverse().map((entry, index) => <View key={`${entry.at}-${index}`} style={s.history}>
        <Text style={s.label}>{entry.action === 'edit' ? 'Düzeltildi' : entry.action === 'delete' ? 'Silindi' : 'Geri getirildi'} · {dateLabel(entry.at)}</Text>
        {entry.action === 'edit' && Object.entries(entry.data).map(([key, value]) =>
          <Text key={key} style={s.subtle}>{labels.get(key) || key}: {value}</Text>)}
      </View>) : <Text style={s.subtle}>Henüz düzeltme yapılmadı.</Text>}
    </> : <>
      <Text style={s.title}>Kaydedilen yanıtlar</Text>
      <Text style={s.subtle}>{activeCount} yanıt · {deletedCount} silinen</Text>
      <TextInput accessibilityLabel="Yanıtlarda ara" style={s.search} value={query} onChangeText={setQuery}
        placeholder="Cevap veya tarih ara" placeholderTextColor={Colors.textPlaceholder} />
      <View style={s.tabs}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: !showDeleted }}
          style={[s.tab, !showDeleted && s.activeTab]}
          onPress={() => setShowDeleted(false)}><Text style={s.tabText}>Yanıtlar ({activeCount})</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: showDeleted }}
          style={[s.tab, showDeleted && s.activeTab]}
          onPress={() => setShowDeleted(true)}><Text style={s.tabText}>Silinenler ({deletedCount})</Text></TouchableOpacity>
      </View>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {rows.length ? rows.map((response) => <TouchableOpacity key={response.id} accessibilityRole="button"
        style={s.row} onPress={() => { setSelectedId(response.id); setEditing(false); setError(''); }}>
        <Text style={s.rowTitle} numberOfLines={1}>{firstAnswer(response)}</Text>
        <Text style={s.subtle}>{dateLabel(response.submittedAt)} · Ayrıntıyı aç →</Text>
      </TouchableOpacity>) : <Text style={s.empty}>{query ? 'Aramaya uygun yanıt bulunamadı.' :
        showDeleted ? 'Silinmiş yanıt yok.' : 'Henüz kayıtlı yanıt yok.'}</Text>}
    </>}
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg }, center: { flex: 1, backgroundColor: Colors.bg,
    justifyContent: 'center', alignItems: 'center', padding: 24 }, content: { padding: 18, paddingTop: 24 },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  subtle: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  identity: { color: Colors.textMuted, fontSize: 11, marginTop: 6, marginBottom: 18 },
  search: { minHeight: 52, color: Colors.textPrimary, backgroundColor: Colors.bgInput,
    borderColor: Colors.borderLight, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 18 },
  tabs: { flexDirection: 'row', gap: 10, marginVertical: 16 }, tab: { flex: 1, minHeight: 48,
    borderRadius: 10, borderColor: Colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  activeTab: { borderColor: Colors.accentLight, backgroundColor: Colors.infoBg },
  tabText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  row: { backgroundColor: Colors.bgCard, borderRadius: 14, borderWidth: 1,
    borderColor: Colors.border, padding: 16, marginBottom: 10, minHeight: 76 },
  rowTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  empty: { color: Colors.textSecondary, textAlign: 'center', marginTop: 32 },
  back: { minHeight: 44, justifyContent: 'center', marginBottom: 10 },
  backText: { color: Colors.accentLight, fontWeight: '700' },
  card: { backgroundColor: Colors.bgCard, borderRadius: 14, borderColor: Colors.border,
    borderWidth: 1, padding: 16, marginBottom: 10 },
  label: { color: Colors.textPrimary, fontWeight: '700', marginBottom: 8 },
  value: { color: Colors.textPrimary, fontSize: 15, lineHeight: 22 },
  input: { color: Colors.textPrimary, backgroundColor: Colors.bgInput, borderColor: Colors.borderLight,
    borderWidth: 1, borderRadius: 10, minHeight: 48, padding: 10 },
  choice: { minHeight: 44, justifyContent: 'center', borderColor: Colors.borderLight,
    borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 6 },
  button: { minHeight: 52, backgroundColor: Colors.accent, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingHorizontal: 12 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondary: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  secondaryText: { color: Colors.textSecondary, fontWeight: '700' },
  dangerText: { color: Colors.danger, fontWeight: '700' },
  section: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700', marginTop: 26, marginBottom: 10 },
  history: { backgroundColor: Colors.bgElevated, borderRadius: 12, padding: 14, marginBottom: 8 },
  error: { color: Colors.warning, fontSize: 14, marginTop: 12, marginBottom: 12, textAlign: 'center' },
});
