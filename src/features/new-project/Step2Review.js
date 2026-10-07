import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { formatPhoneDisplay } from '../../utils/phoneUtils';

const roles = [
  ['phone', 'Telefon'], ['name', 'İsim'], ['field', 'Diğer bilgi'], ['ignore', 'Kullanma'],
];

export default function Step2Review({ source, analysis, selections, setSelections,
  changeRole, changeHeader, goBack, goNext }) {
  const insets = useSafeAreaInsets();
  const [visibleGroups, setVisibleGroups] = useState(10);
  const unresolved = analysis.duplicates.filter((group) =>
    !group.rows.some((row) => row.sourceRow === selections[group.phone])).length;
  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.step}>2 / 3 · Listeyi kontrol et</Text>
        <Text style={s.title}>Sütunlar doğru mu?</Text>
        <Text style={s.intro}>Telefon ve isim sütunlarını kontrol edin. Emin değilseniz aşağıdaki örnek satırlara bakın.</Text>
        <View style={s.card}>
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
        </View>

        <View style={s.card}>
          <Text style={s.label}>Liste özeti</Text>
          {analysis.error ? <Text style={s.warning}>{analysis.error}</Text> : null}
          <Text style={s.summary}>{analysis.valid.length} telefon okunabildi · {analysis.invalid.length} satırda telefon okunamadı</Text>
          {analysis.duplicates.length ? <Text style={s.warning}>{analysis.duplicates.length} telefon tekrar ediyor. Her biri için tek satır seçin.</Text> :
            <Text style={s.good}>Tekrar eden telefon yok.</Text>}
          {analysis.invalid.slice(0, 8).map((row) => (
            <Text key={row.sourceRow} style={s.invalid}>Satır {row.sourceRow}: {row.reason} · {row.cells.join(' | ')}</Text>
          ))}
          {analysis.invalid.length > 8 ? <Text style={s.muted}>+ {analysis.invalid.length - 8} satır daha</Text> : null}
        </View>

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
        <Text style={s.footerNote}>Seçilmeyen tekrarlar ve okunamayan satırlar inceleme kaydında saklanır; arama listesine girmez.</Text>
      </ScrollView>
      <View style={[s.bottom, { paddingBottom: Math.max(14, insets.bottom + 8) }]}>
        <TouchableOpacity accessibilityRole="button" style={s.back} onPress={goBack}><Text style={s.backText}>← Geri</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={[s.next, (analysis.error || unresolved || !analysis.valid.length) && s.disabled]}
          onPress={goNext} disabled={!!analysis.error || !!unresolved || !analysis.valid.length}>
          <Text style={s.nextText}>{unresolved ? `${unresolved} tekrar seç` : 'Sorulara geç →'}</Text>
        </TouchableOpacity>
      </View>
    </View>
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
  summary: { color: Colors.textPrimary, fontSize: 13, lineHeight: 20 },
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
