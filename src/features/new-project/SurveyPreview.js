import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';

const statuses = [
  ['contacted', 'Görüşüldü'], ['unreached', 'Ulaşılamadı'],
  ['later', 'Sonra ara'], ['wrong_number', 'Yanlış numara'],
];
const choiceColors = ['#00D2A0', '#FF6B6B', '#FECA57', '#54A0FF', '#A29BFE', '#FD79A8'];

/** Yalnızca yerel bileşen durumu kullanır; hiçbir cevap depoya gönderilmez. */
export default function SurveyPreview({ fields, onClose, surveyOnly = false }) {
  const insets = useSafeAreaInsets();
  const [answers, setAnswers] = useState({});
  const [selectedOptions, setSelectedOptions] = useState({});
  const [status, setStatus] = useState('');
  const visibleFields = fields.filter((field) => field.isSystemField !== 'phone');

  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <View style={[s.root, { paddingTop: insets.top + 12 }]}>
      <View style={s.header}>
        <Text style={s.title}>Anket önizlemesi</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Önizlemeyi kapat"
          onPress={onClose} style={s.closeTop}><Text style={s.closeTopText}>×</Text></TouchableOpacity>
      </View>
      <Text style={s.notice}>Deneme ekranı · Cevaplar kaydedilmez.</Text>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {!surveyOnly && <View style={s.callCard}>
          <Text style={s.callIcon}>📞</Text>
          <Text style={s.callName}>ÖRNEK KİŞİ</Text>
          <Text style={s.callNumber}>05xx xxx xx xx</Text>
          <Text style={s.callHelp}>Önizlemede arama yapılmaz</Text>
        </View>}

        {!surveyOnly && <View style={s.statusCard}>
          <Text style={s.label}>Arama sonucu</Text>
          <View style={s.choices}>
            {statuses.map(([value, label]) => <TouchableOpacity accessibilityRole="button" key={value}
              onPress={() => setStatus(value)} style={[s.statusChoice, status === value && s.statusSelected]}>
              <Text style={s.statusText}>{label}</Text>
            </TouchableOpacity>)}
          </View>
          {status === 'later' && <>
            <TextInput style={[s.input, s.callbackInput]} placeholder="Kısa not (isteğe bağlı)"
              placeholderTextColor={Colors.textPlaceholder} />
            <TextInput style={[s.input, s.callbackInput]} placeholder="Tekrar arama tarihi: YYYY-AA-GG"
              placeholderTextColor={Colors.textPlaceholder} />
          </>}
        </View>}

        {visibleFields.map((field, index) => <View key={field.id} style={s.field}>
          <Text style={s.label}>{field.label?.trim() || `Soru ${index + 1}`}{field.isSystemField === 'name' || field.required ? ' *' : ''}</Text>
          {field.type === 'select' ? <View style={s.choices}>
            {field.options.map((option, optionIndex) => {
              const selected = selectedOptions[field.id] === optionIndex;
              const color = choiceColors[optionIndex % choiceColors.length];
              return <TouchableOpacity accessibilityRole="button" key={optionIndex}
                style={[s.option, selected && { borderColor: color, backgroundColor: `${color}26` }]}
                onPress={() => setSelectedOptions((previous) => ({ ...previous,
                  [field.id]: selected ? null : optionIndex }))}>
                <Text style={[s.optionText, selected && { color }]}>{option?.trim() || `Şık ${optionIndex + 1}`}</Text>
              </TouchableOpacity>;
            })}
          </View> : <TextInput style={s.input} value={answers[field.id] ??
              (field.isSystemField === 'name' ? 'Örnek Kişi' : '')}
              onChangeText={(value) => setAnswers((previous) => ({ ...previous, [field.id]: value }))}
              placeholder={field.label?.trim() || 'Cevap yazın'}
              placeholderTextColor={Colors.textPlaceholder} />}
        </View>)}
      </ScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(14, insets.bottom + 8) }]}>
        <TouchableOpacity accessibilityRole="button" onPress={onClose} style={s.closeButton}>
          <Text style={s.closeText}>Önizlemeyi kapat</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 8 },
  title: { flex: 1, color: Colors.textPrimary, fontSize: 22, fontWeight: '800' },
  closeTop: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeTopText: { color: Colors.textPrimary, fontSize: 31 },
  notice: { color: Colors.warning, fontSize: 13, fontWeight: '700', paddingHorizontal: 20,
    paddingBottom: 12 },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  callCard: { backgroundColor: '#111', borderLeftWidth: 14, borderLeftColor: Colors.info,
    borderRadius: 25, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16, marginBottom: 16 },
  callIcon: { fontSize: 30 },
  callName: { color: Colors.info, fontSize: 17, fontWeight: '800', marginTop: 6 },
  callNumber: { color: Colors.textPrimary, fontSize: 21, fontWeight: '800', marginTop: 4 },
  callHelp: { color: Colors.textSecondary, fontSize: 12, marginTop: 7 },
  statusCard: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, padding: 15, marginBottom: 18 },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '800', marginBottom: 9,
    textTransform: 'uppercase', letterSpacing: 1 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChoice: { borderWidth: 1, borderColor: Colors.borderAccent, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12 },
  statusSelected: { backgroundColor: Colors.accentDark },
  statusText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  callbackInput: { marginTop: 8 },
  field: { marginBottom: 18 },
  input: { color: Colors.textPrimary, backgroundColor: '#111', borderRadius: 18,
    borderLeftWidth: 8, borderLeftColor: Colors.warning, padding: 14, fontSize: 15 },
  option: { backgroundColor: '#111', minWidth: 90, alignItems: 'center', borderWidth: 1,
    borderColor: '#111', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16 },
  optionText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '800', textTransform: 'uppercase' },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  closeButton: { minHeight: 50, backgroundColor: Colors.accent, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
