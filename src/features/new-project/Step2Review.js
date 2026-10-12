import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { formatPhoneDisplay } from '../../utils/phoneUtils';
import { FormFields } from './Step2Builder';

const roles = [
  ['phone', 'Telefon'], ['name', 'İsim'], ['field', 'Diğer bilgi'], ['ignore', 'Kullanma'],
];

export default function Step2Review({ source, analysis, selections, setSelections,
  changeRole, changeHeader, goBack, handleSave, loading, fields,
  expandedField, setExpandedField, questionsOpen, setQuestionsOpen,
  updateField, removeField, addField, addOption, updateOption, removeOption,
  saveTemplate, shareTemplate }) {
  const insets = useSafeAreaInsets();
  const [visibleGroups, setVisibleGroups] = useState(10);
  const [showColumns, setShowColumns] = useState(false);
  const unresolved = analysis.duplicates.filter((group) =>
    !group.rows.some((row) => row.sourceRow === selections[group.phone])).length;
  const selectedCount = analysis.valid.length - analysis.duplicates.reduce((count, group) =>
    count + group.rows.length - 1, 0);
  const extraFields = fields.filter((field) => !field.isSystemField);
  const duplicatePhones = new Set(analysis.duplicates.map((group) => group.phone));
  const example = analysis.valid.find((row) => !duplicatePhones.has(row.phone) ||
    selections[row.phone] === row.sourceRow);
  const extraPreview = extraFields.slice(0, 2).map((field) => field.label || 'Adsız soru').join(', ');
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.step}>2 / 2 · Kontrol et ve oluştur</Text>
        <Text style={s.title}>Her şey hazır mı?</Text>
        <Text style={s.intro}>Kişileri kontrol edin. İsterseniz soruları düzenleyin, sonra etkinliği oluşturun.</Text>

        <View style={s.card}>
          <Text style={s.label}>Kişiler</Text>
          <Text style={s.count}>{selectedCount} kişi eklenecek</Text>
          {example && <Text style={s.example}>Örnek: {example.name || 'İsim yok'} · {formatPhoneDisplay(example.phone)}</Text>}
          {analysis.error ? <Text style={s.warning}>{analysis.error}</Text> : null}
          {analysis.invalid.length ? <Text style={s.warning}>
            {analysis.invalid.length} satırda telefon okunamadı; bu satırlar eklenmeyecek.
          </Text> : !analysis.error && <Text style={s.good}>Telefonlar okunabildi.</Text>}
          {analysis.duplicates.length ? <Text style={s.warning}>
            {unresolved ? `${unresolved} tekrarlı telefon için kullanılacak satırı seçin.` : 'Tekrarlı telefonlar için satır seçildi.'}
          </Text> : <Text style={s.good}>Tekrarlı telefon yok.</Text>}
          {analysis.invalid.slice(0, 5).map((row) => (
            <Text key={row.sourceRow} style={s.invalid} numberOfLines={2}>
              Satır {row.sourceRow}: {row.reason} · {row.cells.join(' | ')}
            </Text>
          ))}
          {analysis.invalid.length > 5 ? <Text style={s.muted}>+ {analysis.invalid.length - 5} satır daha</Text> : null}
        </View>

        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showColumns || !!analysis.error }}
          onPress={() => setShowColumns(!showColumns)} style={s.sectionToggle}>
          <View style={s.sectionText}>
            <Text style={s.sectionTitle}>Liste sütunlarını düzelt</Text>
            <Text style={s.sectionHint}>İsim veya telefon yanlış seçildiyse açın.</Text>
          </View>
          <Text style={s.sectionArrow}>{showColumns || analysis.error ? '−' : '+'}</Text>
        </TouchableOpacity>
        {(showColumns || !!analysis.error) && <View style={s.card}>
          <Text style={s.label}>{source.sourceName}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={changeHeader} style={s.toggle}>
            <Text style={s.toggleText}>İlk satır başlık: {source.hasHeader ? 'Evet' : 'Hayır'} · Değiştir</Text>
          </TouchableOpacity>
          {source.columns.map((column) => (
            <View key={column.index} style={s.column}>
              <Text style={s.columnTitle}>{column.label}</Text>
              <Text style={s.sample} numberOfLines={2}>
                Örnek: {source.rows.slice(0, 3).map((row) => row.cells[column.index] || '—').join('  ·  ')}
              </Text>
              <View style={s.roles}>
                {roles.map(([role, label]) => (
                  <TouchableOpacity accessibilityRole="button" key={role} onPress={() => changeRole(column.index, role)}
                    style={[s.role, column.role === role && s.roleSelected]}>
                    <Text style={[s.roleText, column.role === role && s.roleTextSelected]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>}

        {analysis.duplicates.slice(0, visibleGroups).map((group) => (
          <View key={group.phone} style={s.card}>
            <Text style={s.label}>{formatPhoneDisplay(group.phone)}</Text>
            <Text style={s.help}>Bu numara birden çok satırda var. Kullanılacak satıra dokunun.</Text>
            {group.rows.map((row) => (
              <TouchableOpacity accessibilityRole="button" key={row.sourceRow}
                style={[s.choice, selections[group.phone] === row.sourceRow && s.choiceSelected]}
                onPress={() => setSelections((previous) => ({ ...previous, [group.phone]: row.sourceRow }))}>
                <Text style={s.choiceMark}>{selections[group.phone] === row.sourceRow ? '●' : '○'}</Text>
                <View style={s.choiceContent}>
                  <Text style={s.choiceTitle}>Satır {row.sourceRow}{row.name ? ` · ${row.name}` : ''}</Text>
                  <Text style={s.sample} numberOfLines={2}>{row.cells.join(' | ')}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}
        {analysis.duplicates.length > visibleGroups ? (
          <TouchableOpacity accessibilityRole="button" style={s.more} onPress={() => setVisibleGroups(visibleGroups + 10)}>
            <Text style={s.moreText}>Sonraki tekrarları göster</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: questionsOpen }}
          onPress={() => setQuestionsOpen(!questionsOpen)} style={s.sectionToggle}>
          <View style={s.sectionText}>
            <Text style={s.sectionTitle}>Aramada sorulacaklar</Text>
            <Text style={s.sectionHint}>{extraFields.length
              ? `İsim ve telefon hazır. Ek: ${extraPreview}${extraFields.length > 2 ? ` +${extraFields.length - 2}` : ''}.`
              : 'İsim ve telefon hazır. Ek soru isteğe bağlı.'}</Text>
          </View>
          <Text style={s.sectionArrow}>{questionsOpen ? '−' : '+'}</Text>
        </TouchableOpacity>
        {questionsOpen && <FormFields fields={fields} expandedField={expandedField}
          setExpandedField={setExpandedField} updateField={updateField} removeField={removeField}
          addField={addField} addOption={addOption} updateOption={updateOption}
          removeOption={removeOption} saveTemplate={saveTemplate} shareTemplate={shareTemplate} />}
        <Text style={s.footerNote}>Okunamayan satırlar ve seçilmeyen tekrarlar arama listesine girmez; inceleme kaydında kalır.</Text>
      </ScrollView>
      <View style={[s.bottom, { paddingBottom: Math.max(14, insets.bottom + 8) }]}>
        <TouchableOpacity accessibilityRole="button" style={s.back} onPress={goBack}><Text style={s.backText}>← Geri</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={[s.next, (analysis.error || unresolved || !selectedCount || loading) && s.disabled]}
          onPress={handleSave} disabled={!!analysis.error || !!unresolved || !selectedCount || loading}>
          {loading ? <ActivityIndicator color="#fff" /> :
            <Text style={s.nextText}>{unresolved ? `${unresolved} tekrar seç` : 'Etkinliği oluştur'}</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 18, paddingTop: 24, paddingBottom: 125 },
  step: { color: Colors.accentLight, fontSize: 13, fontWeight: '800', marginBottom: 8 },
  title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 8 },
  intro: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 17 },
  card: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 18, padding: 16, marginBottom: 14 },
  label: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 7 },
  toggle: { backgroundColor: Colors.bgInput, borderRadius: 11, padding: 11, marginBottom: 12 },
  toggleText: { color: Colors.accentLight, fontSize: 13, fontWeight: '700' },
  column: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 13, marginTop: 10 },
  columnTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' },
  sample: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  role: { borderRadius: 10, backgroundColor: Colors.bgInput, paddingVertical: 9, paddingHorizontal: 11 },
  roleSelected: { backgroundColor: Colors.accent },
  roleText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  roleTextSelected: { color: '#fff' },
  count: { color: Colors.textPrimary, fontSize: 19, fontWeight: '800', marginBottom: 5 },
  example: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 6 },
  sectionToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 15, padding: 16, marginBottom: 14, minHeight: 68 },
  sectionText: { flex: 1 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800' },
  sectionHint: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionArrow: { color: Colors.accentLight, fontSize: 24, fontWeight: '800', marginLeft: 10 },
  warning: { color: Colors.warning, fontSize: 13, lineHeight: 19, marginTop: 8 },
  good: { color: Colors.success, fontSize: 13, marginTop: 8, fontWeight: '700' },
  invalid: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  muted: { color: Colors.textMuted, fontSize: 12, marginTop: 8 },
  help: { color: Colors.textSecondary, fontSize: 13, marginBottom: 8 },
  choice: { flexDirection: 'row', alignItems: 'center', borderRadius: 11, padding: 10, backgroundColor: Colors.bgInput, marginTop: 8, borderWidth: 1, borderColor: Colors.border },
  choiceSelected: { borderColor: Colors.accentLight, backgroundColor: Colors.infoBg },
  choiceMark: { color: Colors.accentLight, fontSize: 20, marginRight: 10 },
  choiceContent: { flex: 1 },
  choiceTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  more: { alignItems: 'center', padding: 15 },
  moreText: { color: Colors.accentLight, fontWeight: '800' },
  footerNote: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  bottom: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  back: { paddingHorizontal: 16, minHeight: 48, justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.bgCard },
  backText: { color: Colors.textPrimary, fontWeight: '700' },
  next: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: Colors.accent },
  disabled: { backgroundColor: Colors.textMuted },
  nextText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
