import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appendSurveyResponse, clearSurveyDraft, getProject, loadSurveyDraft,
  saveSurveyDraft, waitForPendingWrites } from '../utils/storage';
import { reportError } from '../utils/diagnostics';
import { Colors } from '../theme/colors';
import { activeSurveyResponses } from '../features/surveys/surveyResponses';

const inform = (title, message) => Platform.OS === 'web' ? window.alert(message) : Alert.alert(title, message);

export default function FreeSurveyScreen({ route, navigation }) {
  const { projectId } = route.params;
  const insets = useSafeAreaInsets();
  const [project, setProject] = useState(null);
  const [answers, setAnswers] = useState({});
  const answersRef = useRef({});
  const savingRef = useRef(false);
  const draftWriteRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const [draftProblem, setDraftProblem] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setProject(null);
    answersRef.current = {};
    setAnswers({});
    setRestored(false);
    setDraftProblem(false);
    (async () => {
      await waitForPendingWrites();
      const item = await getProject(projectId);
      if (!active) return;
      if (!item || item.mode !== 'survey') throw new Error('Anket bulunamadı.');
      let draft;
      try { draft = await loadSurveyDraft(projectId, item); }
      catch (reason) {
        if (active) {
          setProject(item);
          setDraftProblem(true);
          setError(`Taslak açılamadı: ${reason.message}. İsterseniz taslağı silebilirsiniz.`);
          reportError(reason, 'Anket taslağı açılırken');
        }
        return;
      }
      if (!active) return;
      const data = draft?.data || {};
      answersRef.current = data;
      setAnswers(data);
      setRestored(!!draft);
      setDraftProblem(false);
      setProject(item);
      setError('');
    })().catch((reason) => {
      if (active) { reportError(reason, 'Anket açılırken'); setError(reason.message); }
    });
    return () => { active = false; };
  }, [projectId]));

  const changeAnswer = (fieldId, value) => {
    const next = { ...answersRef.current, [fieldId]: value };
    answersRef.current = next;
    setAnswers(next);
    setRestored(false);
    setDraftProblem(false);
    setError('');
    const write = ++draftWriteRef.current;
    saveSurveyDraft(projectId, next).catch((reason) => {
      reportError(reason, 'Anket taslağı kaydedilirken');
      if (write === draftWriteRef.current) setError(`Taslak saklanamadı: ${reason.message}`);
    });
  };

  const save = async () => {
    if (savingRef.current || !project) return;
    savingRef.current = true;
    setBusy(true); setError('');
    try {
      const response = await appendSurveyResponse(projectId, answersRef.current);
      draftWriteRef.current += 1;
      answersRef.current = {};
      setAnswers({});
      setRestored(false);
      setDraftProblem(false);
      try { setProject(await getProject(projectId)); }
      catch (reason) {
        reportError(reason, 'Kaydedilen anket yeniden okunurken');
        setProject((previous) => ({ ...previous, responses: [...previous.responses, response] }));
      }
      inform('Kaydedildi', 'Cevap kaydedildi. Yeni bir cevap doldurabilirsiniz.');
    } catch (reason) {
      reportError(reason, 'Anket cevabı kaydedilirken');
      setError(reason.message || 'Cevap kaydedilemedi.');
    } finally { savingRef.current = false; setBusy(false); }
  };

  const discard = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setBusy(true); setError('');
    try {
      await clearSurveyDraft(projectId);
      draftWriteRef.current += 1;
      answersRef.current = {};
      setAnswers({});
      setRestored(false);
      setDraftProblem(false);
    } catch (reason) {
      reportError(reason, 'Anket taslağı silinirken');
      setError(reason.message || 'Taslak silinemedi.');
    } finally { savingRef.current = false; setBusy(false); }
  };

  const confirmDiscard = () => {
    const message = 'Yazdığınız fakat henüz cevap olarak kaydetmediğiniz bilgiler silinecek.';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) discard();
    } else Alert.alert('Taslağı sil?', message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Taslağı sil', style: 'destructive', onPress: discard },
    ]);
  };

  if (!project) return <View style={s.center}>{error
    ? <Text style={s.error}>{error}</Text>
    : <ActivityIndicator color={Colors.accentLight} />}</View>;

  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 110 }]} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>{project.name}</Text>
      <Text style={s.help}>{activeSurveyResponses(project.responses).length} cevap kaydedildi. Her doldurma ayrı bir cevap olur.</Text>
      <TouchableOpacity accessibilityRole="button" style={s.listButton}
        onPress={() => navigation.navigate('SurveyResponses', { projectId, projectName: project.name })}>
        <Text style={s.listButtonText}>Kaydedilen cevapları gör →</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={s.listButton}
        onPress={() => navigation.navigate('SurveyTransfer', { projectId })}>
        <Text style={s.listButtonText}>{project.role === 'volunteer'
          ? 'Cevapları ana kişiye gönder →' : 'Anketi paylaş ve cevapları topla →'}</Text>
      </TouchableOpacity>
      {restored && <Text style={s.draftNote}>Yarım kalan cevabınız geri açıldı.</Text>}
      {project.fields.map((field, index) => <View key={field.id} style={s.card}>
        <Text style={s.label}>{index + 1}. {field.label}{field.required ? ' *' : ''}</Text>
        {field.type === 'select' ? field.options.map((option) =>
          <TouchableOpacity key={option} accessibilityRole="radio"
            accessibilityState={{ selected: answers[field.id] === option }}
            style={[s.choice, answers[field.id] === option && s.selected]}
            disabled={busy}
            onPress={() => changeAnswer(field.id, answersRef.current[field.id] === option ? '' : option)}>
            <Text style={s.choiceText}>{answers[field.id] === option ? '●' : '○'}  {option}</Text>
          </TouchableOpacity>)
          : <TextInput accessibilityLabel={field.label} style={s.input} value={answers[field.id] || ''}
            editable={!busy} onChangeText={(value) => changeAnswer(field.id, value)}
            multiline placeholder="Cevap yazın" placeholderTextColor={Colors.textPlaceholder} />}
      </View>)}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <TouchableOpacity accessibilityRole="button" style={s.save} onPress={save} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>Cevabı kaydet</Text>}
      </TouchableOpacity>
      {(draftProblem || Object.values(answers).some((value) => value.trim())) &&
        <TouchableOpacity accessibilityRole="button" style={s.discard} onPress={confirmDiscard} disabled={busy}>
          <Text style={s.discardText}>Taslağı sil</Text>
        </TouchableOpacity>}
      <Text style={s.draftHelp}>Yazdıklarınız bu cihazda taslak olarak saklanır. Cihaz değiştirirken .ays yedeği alın.</Text>
      <TouchableOpacity accessibilityRole="button" style={s.export} onPress={() => navigation.navigate('Export', {
        projectId, projectName: project.name })}>
        <Text style={s.exportText}>Cevapları Excel / CSV olarak al →</Text>
      </TouchableOpacity>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg }, center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center', padding: 24 },
  content: { padding: 18, paddingTop: 24 }, title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '800', marginBottom: 6 },
  help: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 18 },
  listButton: { minHeight: 48, backgroundColor: Colors.bgElevated, borderWidth: 1,
    borderColor: Colors.borderAccent, borderRadius: 12, justifyContent: 'center',
    alignItems: 'center', marginBottom: 16 },
  listButtonText: { color: Colors.accentLight, fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 15, padding: 16, marginBottom: 12 },
  label: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  input: { minHeight: 50, color: Colors.textPrimary, backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: 10, padding: 12, fontSize: 15 },
  choice: { padding: 13, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.bgInput, borderRadius: 10, marginTop: 6 },
  selected: { borderColor: Colors.accentLight, backgroundColor: Colors.infoBg },
  choiceText: { color: Colors.textPrimary, fontSize: 14 },
  error: { color: Colors.warning, fontSize: 14, marginBottom: 12, textAlign: 'center' },
  save: { minHeight: 52, backgroundColor: Colors.accent, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  draftNote: { color: Colors.success, fontSize: 14, fontWeight: '700', marginBottom: 12 },
  discard: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  discardText: { color: Colors.danger, fontWeight: '700' },
  draftHelp: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
  export: { alignItems: 'center', padding: 16 }, exportText: { color: Colors.accentLight, fontWeight: '700' },
});
