import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import SurveyPreview from '../new-project/SurveyPreview';
import QuestionEditor from './QuestionEditor';

export default function EditFormBuilder({ fields, projectName, selectedCount, loading, locked, surveyOnly, onBack,
  updateField, removeField, addField, addOption, updateOption, removeOption,
  handleSave, saveTemplate, shareTemplate }) {
  const insets = useSafeAreaInsets();
  const [previewOpen, setPreviewOpen] = useState(false);
  const nameField = fields.find((field) => field.isSystemField === 'name');

  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.step}>Soruları düzenle</Text>
      <Text style={s.title}>{projectName}</Text>
      <TouchableOpacity accessibilityRole="button" style={s.previewButton} onPress={() => setPreviewOpen(true)}>
        <Text style={s.previewButtonText}>Anketi önizle →</Text>
      </TouchableOpacity>
      <Text style={s.notice}>{surveyOnly ? `${selectedCount} yanıt kaydedildi.` : `${selectedCount} kişi bu formu kullanıyor.`}</Text>
      {locked && <Text style={s.versionNotice}>{surveyOnly
        ? 'Eski cevaplar korunur. Değişen soru yeni bir alan olur; eski cevap yeni alana taşınmaz.'
        : 'Yeni görevler yeni formu kullanır. Eski görevler ve cevaplar eski sürümde kalır.'}</Text>}
      {!surveyOnly && nameField && <View style={s.identityCard}>
        <Text style={s.identityTitle}>Kişi bilgileri</Text>
        <Text style={s.identityHelp}>İsim zorunludur. Telefon kişi listesinden gelir.</Text>
        <TextInput accessibilityLabel="İsim alanının adı" style={s.input} value={nameField.label}
          onChangeText={(value) => updateField(nameField.id, 'label', value)}
          placeholder="İsim Soyisim" placeholderTextColor={Colors.textPlaceholder} />
      </View>}
      <QuestionEditor fields={fields} surveyOnly={surveyOnly} editing updateField={updateField}
        removeField={removeField} addField={addField} addOption={addOption}
        updateOption={updateOption} removeOption={removeOption}
        saveTemplate={saveTemplate} shareTemplate={shareTemplate} />
    </ScrollView>
    <View style={[s.bottom, { paddingBottom: Math.max(14, insets.bottom + 8) }]}>
      <TouchableOpacity accessibilityRole="button" style={s.back} onPress={onBack}>
        <Text style={s.backText}>← Geri</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={s.save} disabled={loading} onPress={handleSave}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>Değişiklikleri kaydet</Text>}
      </TouchableOpacity>
    </View>
    {previewOpen && <SurveyPreview fields={fields} surveyOnly={surveyOnly} onClose={() => setPreviewOpen(false)} />}
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 18, paddingTop: 24, paddingBottom: 40 },
  step: { color: Colors.accentLight, fontSize: 13, fontWeight: '800', marginBottom: 8 },
  title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 8 },
  previewButton: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.borderAccent,
    borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  previewButtonText: { color: Colors.accentLight, fontSize: 15, fontWeight: '800' },
  notice: { color: Colors.textPrimary, backgroundColor: Colors.infoBg, padding: 13,
    borderRadius: 12, marginBottom: 17, fontSize: 13 },
  versionNotice: { color: Colors.warning, backgroundColor: Colors.warningBg, padding: 13,
    borderRadius: 12, marginBottom: 17, fontSize: 13, lineHeight: 19 },
  identityCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, padding: 16, marginBottom: 14 },
  identityTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  identityHelp: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  input: { color: Colors.textPrimary, backgroundColor: Colors.bgInput, borderWidth: 1,
    borderColor: Colors.borderLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  bottom: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.bg },
  back: { paddingHorizontal: 16, minHeight: 50, justifyContent: 'center',
    borderRadius: 12, backgroundColor: Colors.bgCard },
  backText: { color: Colors.textPrimary, fontWeight: '700' },
  save: { flex: 1, minHeight: 50, justifyContent: 'center', alignItems: 'center',
    borderRadius: 12, backgroundColor: Colors.success },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
