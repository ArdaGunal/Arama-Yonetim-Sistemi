import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appendSurveyResponse, getProject } from '../utils/storage';
import { reportError } from '../utils/diagnostics';
import { Colors } from '../theme/colors';

const inform = (title, message) => Platform.OS === 'web' ? window.alert(message) : Alert.alert(title, message);

export default function FreeSurveyScreen({ route, navigation }) {
  const { projectId } = route.params;
  const insets = useSafeAreaInsets();
  const [project, setProject] = useState(null);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    getProject(projectId).then((item) => {
      if (!active) return;
      if (!item || item.mode !== 'survey') throw new Error('Anket bulunamadı.');
      setProject((previous) => {
        if (previous && previous.formVersion !== item.formVersion) setAnswers({});
        return item;
      });
      setError('');
    }).catch((reason) => {
      if (active) { reportError(reason, 'Anket açılırken'); setError(reason.message); }
    });
    return () => { active = false; };
  }, [projectId]));

  const save = async () => {
    if (busy || !project) return;
    setBusy(true); setError('');
    try {
      await appendSurveyResponse(projectId, answers);
      const latest = await getProject(projectId);
      setProject(latest);
      setAnswers({});
      inform('Kaydedildi', 'Cevap kaydedildi. Yeni bir cevap doldurabilirsiniz.');
    } catch (reason) {
      reportError(reason, 'Anket cevabı kaydedilirken');
      setError(reason.message || 'Cevap kaydedilemedi.');
    } finally { setBusy(false); }
  };

  if (!project) return <View style={s.center}>{error
    ? <Text style={s.error}>{error}</Text>
    : <ActivityIndicator color={Colors.accentLight} />}</View>;

  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 110 }]} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>{project.name}</Text>
      <Text style={s.help}>{project.contacts.length} cevap kaydedildi. Her doldurma ayrı bir cevap olur.</Text>
      {project.fields.map((field, index) => <View key={field.id} style={s.card}>
        <Text style={s.label}>{index + 1}. {field.label}{field.required ? ' *' : ''}</Text>
        {field.type === 'select' ? field.options.map((option) =>
          <TouchableOpacity key={option} accessibilityRole="radio"
            accessibilityState={{ selected: answers[field.id] === option }}
            style={[s.choice, answers[field.id] === option && s.selected]}
            onPress={() => setAnswers((prev) => ({ ...prev, [field.id]: prev[field.id] === option ? '' : option }))}>
            <Text style={s.choiceText}>{answers[field.id] === option ? '●' : '○'}  {option}</Text>
          </TouchableOpacity>)
          : <TextInput accessibilityLabel={field.label} style={s.input} value={answers[field.id] || ''}
            onChangeText={(value) => setAnswers((prev) => ({ ...prev, [field.id]: value }))}
            multiline placeholder="Cevap yazın" placeholderTextColor={Colors.textPlaceholder} />}
      </View>)}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <TouchableOpacity accessibilityRole="button" style={s.save} onPress={save} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>Cevabı kaydet</Text>}
      </TouchableOpacity>
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
  export: { alignItems: 'center', padding: 16 }, exportText: { color: Colors.accentLight, fontWeight: '700' },
});
