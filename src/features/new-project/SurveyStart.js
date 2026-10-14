import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import TemplatePicker from './TemplatePicker';

export default function SurveyStart({ projectName, setProjectName, templates, templateId,
  applyTemplate, importTemplate, continueSurvey }) {
  const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={[s.content, { paddingBottom: Math.max(40, insets.bottom + 24) }]}
      keyboardShouldPersistTaps="handled">
      <Text style={s.step}>1 / 2 · Anketi hazırla</Text>
      <Text style={s.title}>Yeni anket</Text>
      <Text style={s.help}>Kişi listesi gerekmez. Adını yaz, sonra soruları ekle.</Text>
      <View style={s.card}>
        <Text style={s.label}>Anketin adı</Text>
        <TextInput accessibilityLabel="Anketin adı" style={s.input} value={projectName} onChangeText={setProjectName}
          placeholder="Örnek: Etkinlik değerlendirmesi" placeholderTextColor={Colors.textPlaceholder} />
      </View>
      <TemplatePicker mode="survey" templates={templates} templateId={templateId}
        applyTemplate={applyTemplate} importTemplate={importTemplate} />
      <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={continueSurvey}>
        <Text style={s.primaryText}>Soruları düzenle →</Text>
      </TouchableOpacity>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 20, paddingTop: 26 },
  step: { color: Colors.accentLight, fontSize: 13, fontWeight: '800', marginBottom: 8 },
  title: { color: Colors.textPrimary, fontSize: 27, fontWeight: '800', marginBottom: 8 },
  help: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 20 },
  card: { backgroundColor: Colors.bgCard, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 14 },
  label: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  input: { color: Colors.textPrimary, backgroundColor: Colors.bgInput, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.borderLight, padding: 13, fontSize: 16 },
  primary: { backgroundColor: Colors.accent, minHeight: 52, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
