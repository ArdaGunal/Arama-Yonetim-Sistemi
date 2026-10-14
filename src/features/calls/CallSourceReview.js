import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { formatPhoneDisplay } from '../../utils/phoneUtils';
import { resolveDuplicateSelections } from '../../utils/newProjectFields';

const roles = [['phone', 'Telefon'], ['name', 'İsim'], ['field', 'Diğer bilgi'], ['ignore', 'Kullanma']];

export default function CallSourceReview({ source, analysis, selections, setSelections, changeRole, changeHeader }) {
  const insets = useSafeAreaInsets();
  const [visibleGroups, setVisibleGroups] = useState(10);
  const [showColumns, setShowColumns] = useState(false);
  const resolved = resolveDuplicateSelections(analysis, selections);
  const selectedCount = analysis.valid.length - analysis.duplicates.reduce((count, group) =>
    count + group.rows.length - 1, 0);
  const example = analysis.valid.find((row) =>
    !analysis.duplicates.some((group) => group.phone === row.phone) || resolved[row.phone] === row.sourceRow);
  const sourceName = source.columns.find((column) => column.role === 'name')?.label;
  const sourcePhone = source.columns.find((column) => column.role === 'phone')?.label;

  return <>
    <View style={s.card}>
      <Text style={s.sectionTitle}>Kişiler</Text>
      <Text style={s.count}>{selectedCount} kişi eklenecek</Text>
      {example && <Text style={s.help}>Örnek: {example.name || 'İsim yok'} · {formatPhoneDisplay(example.phone)}</Text>}
      {analysis.invalid.length > 0 && <Text style={s.warning}>
        {analysis.invalid.length} satırda telefon okunamadı. Bu satırlar eklenmeyecek.
      </Text>}
      {analysis.error && <Text style={s.warning}>{analysis.error}</Text>}
      {!selectedCount && !analysis.error && <Text style={s.warning}>Eklenebilecek kişi yok. Geri dönüp listeyi düzeltin.</Text>}
    </View>
    <TouchableOpacity accessibilityRole="button" style={s.simpleLink} onPress={() => setShowColumns(true)}>
      <Text style={s.linkText}>İsim veya telefon yanlış mı? Listeyi düzelt</Text>
      <Text style={s.smallMuted}>İsim: {sourceName || 'yok'} · Telefon: {sourcePhone || 'yok'}</Text>
    </TouchableOpacity>

    {analysis.duplicates.length > 0 && <View style={s.card}>
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

    <Modal visible={showColumns} animationType="slide" onRequestClose={() => setShowColumns(false)}>
      <View style={[s.modalRoot, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <Text style={s.title}>Listeyi düzelt</Text>
        <Text style={s.help}>Telefon ve isim için doğru sütuna dokunun.</Text>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
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
    </Modal>
  </>;
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, padding: 16, marginBottom: 14 },
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
  simpleLink: { padding: 12, marginBottom: 12 },
  linkButton: { alignSelf: 'flex-start', paddingVertical: 10 },
  linkText: { color: Colors.accentLight, fontSize: 13, fontWeight: '800' },
  smallMuted: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3 },
  modalRoot: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: 18, gap: 10 },
  title: { color: Colors.textPrimary, fontSize: 27, fontWeight: '800', marginBottom: 18 },
  columnCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 13, marginBottom: 10 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  role: { backgroundColor: Colors.bgInput, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  typeActive: { backgroundColor: Colors.accent },
  typeText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  typeTextActive: { color: '#fff' },
  next: { minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent, borderRadius: 11 },
  nextText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
