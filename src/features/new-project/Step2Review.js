import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import CallSourceReview from '../calls/CallSourceReview';
import QuestionEditor from '../forms/QuestionEditor';
import SurveyPreview from './SurveyPreview';

export default function Step2Review({ source, analysis, selections, setSelections,
  changeRole, changeHeader, goBack, handleSave, loading, fields, saveError,
  updateField, removeField, addField, addOption, updateOption, removeOption,
  saveTemplate, shareTemplate, surveyOnly = false }) {
  const insets = useSafeAreaInsets();
  const [previewOpen, setPreviewOpen] = useState(false);

  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.step}>2 / 2 · {surveyOnly ? 'Sorular' : 'Son kontrol'}</Text>
      <Text style={s.title}>{surveyOnly ? 'Anketi oluştur' : 'Etkinliği oluştur'}</Text>
      <TouchableOpacity accessibilityRole="button" style={s.previewButton}
        onPress={() => setPreviewOpen(true)}>
        <Text style={s.previewButtonText}>Anketi önizle →</Text>
      </TouchableOpacity>

      {!surveyOnly && <CallSourceReview source={source} analysis={analysis} selections={selections}
        setSelections={setSelections} changeRole={changeRole} changeHeader={changeHeader} />}

      <QuestionEditor fields={fields} surveyOnly={surveyOnly} updateField={updateField}
        removeField={removeField} addField={addField} addOption={addOption}
        updateOption={updateOption} removeOption={removeOption}
        saveTemplate={saveTemplate} shareTemplate={shareTemplate} />
    </ScrollView>

    <View style={[s.bottom, { paddingBottom: Math.max(14, insets.bottom + 8) }]}>
      {!!saveError && <Text accessibilityRole="alert" style={s.bottomError}>{saveError}</Text>}
      <View style={s.bottomRow}>
        <TouchableOpacity accessibilityRole="button" style={s.back} onPress={goBack}>
          <Text style={s.backText}>← Geri</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={s.next} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.nextText}>{surveyOnly ? 'Anketi oluştur' : 'Etkinliği oluştur'}</Text>}
        </TouchableOpacity>
      </View>
    </View>

    {previewOpen && <SurveyPreview fields={fields} surveyOnly={surveyOnly} onClose={() => setPreviewOpen(false)} />}
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 18, paddingTop: 24, paddingBottom: 40 },
  step: { color: Colors.accentLight, fontSize: 13, fontWeight: '800', marginBottom: 7 },
  title: { color: Colors.textPrimary, fontSize: 27, fontWeight: '800', marginBottom: 18 },
  previewButton: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.borderAccent,
    borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  previewButtonText: { color: Colors.accentLight, fontSize: 15, fontWeight: '800' },
  bottom: { padding: 12, borderTopWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  bottomError: { color: Colors.warning, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  bottomRow: { flexDirection: 'row', gap: 9 },
  back: { minHeight: 50, paddingHorizontal: 17, justifyContent: 'center',
    backgroundColor: Colors.bgCard, borderRadius: 11 },
  backText: { color: Colors.textPrimary, fontWeight: '700' },
  next: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.accent, borderRadius: 11 },
  nextText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
