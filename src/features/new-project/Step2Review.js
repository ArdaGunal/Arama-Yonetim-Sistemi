import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { formatPhoneDisplay } from '../../utils/phoneUtils';
import { resolveDuplicateSelections } from '../../utils/newProjectFields';
import SurveyPreview from './SurveyPreview';

const roles = [['phone', 'Telefon'], ['name', 'İsim'], ['field', 'Diğer bilgi'], ['ignore', 'Kullanma']];

export default function Step2Review({ source, analysis, selections, setSelections,
  changeRole, changeHeader, goBack, handleSave, loading, fields, saveError,
  updateField, removeField, addField, addOption, updateOption, removeOption,
  saveTemplate, shareTemplate, surveyOnly = false }) {
  const insets = useSafeAreaInsets();
  const [visibleGroups, setVisibleGroups] = useState(10);
  const [showColumns, setShowColumns] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const resolved = surveyOnly ? {} : resolveDuplicateSelections(analysis, selections);
  const selectedCount = surveyOnly ? 0 : analysis.valid.length - analysis.duplicates.reduce((count, group) =>
    count + group.rows.length - 1, 0);
  const extraFields = fields.filter((field) => !field.isSystemField);
  const example = analysis?.valid.find((row) =>
    !analysis.duplicates.some((group) => group.phone === row.phone) || resolved[row.phone] === row.sourceRow);
  const sourceName = source?.columns.find((column) => column.role === 'name')?.label;
  const sourcePhone = source?.columns.find((column) => column.role === 'phone')?.label;

  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.step}>2 / 2 · {surveyOnly ? 'Sorular' : 'Son kontrol'}</Text>
      <Text style={s.title}>Etkinliği oluştur</Text>
      <TouchableOpacity accessibilityRole="button" style={s.previewButton}
        onPress={() => setPreviewOpen(true)}>
        <Text style={s.previewButtonText}>Anketi önizle →</Text>
      </TouchableOpacity>

      {!surveyOnly && <View style={s.card}>
        <Text style={s.sectionTitle}>Kişiler</Text>
        <Text style={s.count}>{selectedCount} kişi eklenecek</Text>
        {example && <Text style={s.help}>Örnek: {example.name || 'İsim yok'} · {formatPhoneDisplay(example.phone)}</Text>}
        {analysis.invalid.length > 0 && <Text style={s.warning}>
          {analysis.invalid.length} satırda telefon okunamadı. Bu satırlar eklenmeyecek.
        </Text>}
        {analysis.error && <Text style={s.warning}>{analysis.error}</Text>}
        {!selectedCount && !analysis.error && <Text style={s.warning}>Eklenebilecek kişi yok. Geri dönüp listeyi düzeltin.</Text>}
      </View>}
      {!surveyOnly && <TouchableOpacity accessibilityRole="button" style={s.simpleLink} onPress={() => setShowColumns(true)}>
        <Text style={s.linkText}>İsim veya telefon yanlış mı? Listeyi düzelt</Text>
        <Text style={s.smallMuted}>İsim: {sourceName || 'yok'} · Telefon: {sourcePhone || 'yok'}</Text>
      </TouchableOpacity>}

      {!surveyOnly && analysis.duplicates.length > 0 && <View style={s.card}>
        <Text style={s.sectionTitle}>Tekrarlanan numaralar</Text>
        <Text style={s.help}>İlk kayıt seçili. Başka birini kullanmak isterseniz satıra dokunun.</Text>
        {analysis.duplicates.slice(0, visibleGroups).map((group) => <View key={group.phone} style={s.duplicate}>
          <Text style={s.phone}>{formatPhoneDisplay(group.phone)}</Text>
          {group.rows.map((row) => <TouchableOpacity accessibilityRole="radio"
            accessibilityState={{ selected: resolved[group.phone] === row.sourceRow }} key={row.sourceRow}
            style={[s.choice, resolved[group.phone] === row.sourceRow && s.choiceSelected]}
            onPress={() => setSelections((previous) => ({ ...previous, [group.phone]: row.sourceRow }))}>
            <Text style={s.choiceMark}>{resolved[group.phone] === row.sourceRow ? '●' : '○'}</Text>
            <View style={s.choiceContent}>
              <Text style={s.choiceTitle}>Satır {row.sourceRow} · {row.name || 'İsim yok'}</Text>
              <Text style={s.choiceDetail} numberOfLines={2}>{row.cells.join(' | ')}</Text>
            </View>
          </TouchableOpacity>)}
        </View>)}
        {analysis.duplicates.length > visibleGroups && <TouchableOpacity accessibilityRole="button"
          style={s.linkButton} onPress={() => setVisibleGroups((count) => count + 10)}>
          <Text style={s.linkText}>Diğer tekrarları göster</Text>
        </TouchableOpacity>}
      </View>}

      <View style={s.card}>
        <Text style={s.sectionTitle}>{surveyOnly ? 'Anket soruları' : 'Aramada sorulacaklar'}</Text>
        <Text style={s.help}>{surveyOnly ? 'En az bir soru ekleyin. Cevaplar bu cihazda saklanır.' : 'İsim ve telefon hazır. İsterseniz ek soru yazın.'}</Text>
        {extraFields.map((field, index) => <View key={field.id} style={s.question}>
          <Text style={s.fieldLabel}>Soru {index + 1}</Text>
          <TextInput accessibilityLabel={`Soru ${index + 1}`} style={s.input} value={field.label}
            onChangeText={(value) => updateField(field.id, 'label', value)}
            placeholder="Örnek: Geliyor musun?" placeholderTextColor={Colors.textPlaceholder} />
          <View style={s.typeRow}>
            {[['text', 'Yazılı cevap'], ['select', 'Şık seçimi']].map(([type, label]) =>
              <TouchableOpacity accessibilityRole="button" key={type}
                onPress={() => updateField(field.id, 'type', type)}
                style={[s.type, field.type === type && s.typeActive]}>
                <Text style={[s.typeText, field.type === type && s.typeTextActive]}>{label}</Text>
              </TouchableOpacity>)}
          </View>
          {field.type === 'select' && <View>
            {field.options.map((option, optionIndex) => <View key={optionIndex} style={s.optionRow}>
              <TextInput accessibilityLabel={`Şık ${optionIndex + 1}`} style={[s.input, s.optionInput]}
                value={option} placeholder={`Şık ${optionIndex + 1}`}
                placeholderTextColor={Colors.textPlaceholder}
                onChangeText={(value) => updateOption(field.id, optionIndex, value)} />
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Şıkkı sil"
                style={s.deleteOption} onPress={() => removeOption(field.id, optionIndex)}>
                <Text style={s.deleteText}>×</Text>
              </TouchableOpacity>
            </View>)}
            <TouchableOpacity accessibilityRole="button" style={s.linkButton} onPress={() => addOption(field.id)}>
              <Text style={s.linkText}>+ Şık ekle</Text>
            </TouchableOpacity>
          </View>}
          <View style={s.questionActions}>
            <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: !!field.required }}
              onPress={() => updateField(field.id, 'required', !field.required)}>
              <Text style={s.smallAction}>{field.required ? '☑' : '□'} Cevap zorunlu</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => removeField(field.id)}>
              <Text style={s.removeQuestion}>Soruyu sil</Text>
            </TouchableOpacity>
          </View>
        </View>)}
        <TouchableOpacity accessibilityRole="button" style={s.addQuestion} onPress={addField}>
          <Text style={s.addQuestionText}>+ Soru ekle</Text>
        </TouchableOpacity>
      </View>

      <View style={s.templateActions}>
        <Text style={s.smallMuted}>Bu soruları başka etkinlikte kullan</Text>
        <TouchableOpacity accessibilityRole="button" onPress={saveTemplate} style={s.templateButton}>
          <Text style={s.linkText}>Şablonu kaydet</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={shareTemplate} style={s.templateButton}>
          <Text style={s.linkText}>Şablonu paylaş</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>

    <View style={[s.bottom, { paddingBottom: Math.max(14, insets.bottom + 8) }]}>
      {!!saveError && <Text accessibilityRole="alert" style={s.bottomError}>{saveError}</Text>}
      <View style={s.bottomRow}>
        <TouchableOpacity accessibilityRole="button" style={s.back} onPress={goBack}>
          <Text style={s.backText}>← Geri</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={s.next} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.nextText}>Etkinliği oluştur</Text>}
        </TouchableOpacity>
      </View>
    </View>

    {!surveyOnly && <Modal visible={showColumns} animationType="slide" onRequestClose={() => setShowColumns(false)}>
      <View style={[s.modalRoot, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <Text style={s.title}>Listeyi düzelt</Text>
        <Text style={s.help}>Telefon ve isim için doğru sütuna dokunun.</Text>
        <ScrollView keyboardShouldPersistTaps="handled">
          <TouchableOpacity accessibilityRole="button" onPress={changeHeader} style={s.columnCard}>
            <Text style={s.linkText}>İlk satır başlık mı? {source.hasHeader ? 'Evet' : 'Hayır'} · Değiştir</Text>
          </TouchableOpacity>
          {source.columns.map((column) => <View key={column.index} style={s.columnCard}>
            <Text style={s.sectionTitle}>{column.label}</Text>
            <Text style={s.help} numberOfLines={2}>
              Örnek: {source.rows.slice(0, 3).map((row) => row.cells[column.index] || '—').join(' · ')}
            </Text>
            <View style={s.roleRow}>
              {roles.map(([role, label]) => <TouchableOpacity accessibilityRole="button" key={role}
                onPress={() => changeRole(column.index, role)}
                style={[s.role, column.role === role && s.typeActive]}>
                <Text style={[s.typeText, column.role === role && s.typeTextActive]}>{label}</Text>
              </TouchableOpacity>)}
            </View>
          </View>)}
        </ScrollView>
        <TouchableOpacity accessibilityRole="button" style={s.next} onPress={() => setShowColumns(false)}>
          <Text style={s.nextText}>Tamam</Text>
        </TouchableOpacity>
      </View>
    </Modal>}
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
  card: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, padding: 16, marginBottom: 14 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  count: { color: Colors.accentLight, fontSize: 23, fontWeight: '800', marginBottom: 5 },
  help: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 6 },
  warning: { color: Colors.warning, fontSize: 13, lineHeight: 19, marginTop: 8 },
  duplicate: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, marginTop: 10 },
  phone: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  choice: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgInput,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 11, padding: 11, marginTop: 7 },
  choiceSelected: { borderColor: Colors.accentLight, backgroundColor: Colors.infoBg },
  choiceMark: { color: Colors.accentLight, fontSize: 20, marginRight: 12 },
  choiceContent: { flex: 1 },
  choiceTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  choiceDetail: { color: Colors.textSecondary, fontSize: 12, marginTop: 3 },
  question: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 14, marginTop: 14 },
  fieldLabel: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 7 },
  input: { color: Colors.textPrimary, backgroundColor: Colors.bgInput, borderWidth: 1,
    borderColor: Colors.borderLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  typeRow: { flexDirection: 'row', gap: 8, marginTop: 9 },
  type: { flex: 1, alignItems: 'center', backgroundColor: Colors.bgInput, borderRadius: 10, padding: 10 },
  typeActive: { backgroundColor: Colors.accent },
  typeText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  typeTextActive: { color: '#fff' },
  optionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  optionInput: { flex: 1 },
  deleteOption: { width: 42, borderRadius: 10, backgroundColor: Colors.danger,
    alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#fff', fontSize: 22 },
  questionActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  smallAction: { color: Colors.textSecondary, fontSize: 13 },
  removeQuestion: { color: Colors.danger, fontSize: 13, fontWeight: '700' },
  addQuestion: { backgroundColor: Colors.accent, borderRadius: 11, padding: 14,
    alignItems: 'center', marginTop: 15 },
  addQuestionText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  linkButton: { alignSelf: 'flex-start', paddingVertical: 10 },
  linkText: { color: Colors.accentLight, fontSize: 13, fontWeight: '800' },
  simpleLink: { padding: 12, marginBottom: 12 },
  smallMuted: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3 },
  templateActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    gap: 8, paddingHorizontal: 12, marginBottom: 12 },
  templateButton: { padding: 9, backgroundColor: Colors.bgCard, borderRadius: 8 },
  bottom: { padding: 12, borderTopWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  bottomError: { color: Colors.warning, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  bottomRow: { flexDirection: 'row', gap: 9 },
  back: { minHeight: 50, paddingHorizontal: 17, justifyContent: 'center',
    backgroundColor: Colors.bgCard, borderRadius: 11 },
  backText: { color: Colors.textPrimary, fontWeight: '700' },
  next: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.accent, borderRadius: 11 },
  nextText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalRoot: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: 18, gap: 10 },
  columnCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 13, marginBottom: 10 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  role: { backgroundColor: Colors.bgInput, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
});
