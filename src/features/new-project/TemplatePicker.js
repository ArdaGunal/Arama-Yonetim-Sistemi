import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../theme/colors';

export default function TemplatePicker({ mode, templates, templateId, applyTemplate, importTemplate }) {
  const visible = templates.filter((item) => (item.mode || 'calls') === mode);
  return <View style={s.card}>
    <Text style={s.label}>Hazır sorular (isteğe bağlı)</Text>
    <TouchableOpacity accessibilityRole="button" style={s.template} onPress={() => applyTemplate(null)}>
      <Text style={s.templateText}>{mode === 'survey' ? 'Kendi sorularımı yazacağım' : 'Standart · ek soru yok'}</Text>
      <Text style={s.templateState}>{templateId === null ? 'Seçildi ✓' : 'Seç'}</Text>
    </TouchableOpacity>
    {visible.map((template) => <TouchableOpacity accessibilityRole="button" key={template.id}
      style={s.template} onPress={() => applyTemplate(template)}>
      <Text style={s.templateText}>{template.name}</Text>
      <Text style={s.templateState}>{templateId === template.id ? 'Seçildi ✓' : 'Seç'}</Text>
    </TouchableOpacity>)}
    <TouchableOpacity accessibilityRole="button" style={s.outline} onPress={importTemplate}>
      <Text style={s.outlineText}>Şablon dosyası aç</Text>
    </TouchableOpacity>
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 14 },
  label: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  template: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopColor: Colors.border, borderTopWidth: 1 },
  templateText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700', flex: 1 },
  templateState: { color: Colors.accentLight, fontSize: 13, fontWeight: '700' },
  outline: { borderColor: Colors.borderAccent, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 8 },
  outlineText: { color: Colors.accentLight, fontWeight: '800' },
});
