import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { getTemplates, saveTemplate } from '../utils/storage';
import { getAppSettings, saveAppSettings } from '../utils/appSettings';
import { createTemplateFile, readTemplateFile } from '../utils/templateFormat';
import { withAnswerType } from '../utils/newProjectFields';
import { reportError } from '../utils/diagnostics';
import { Colors } from '../theme/colors';

const identityFields = [
  { id: 'default_isim', label: 'İsim Soyisim', type: 'text', options: [], required: true, isSystemField: 'name' },
  { id: 'default_numara', label: 'Telefon', type: 'phone', options: [], isSystemField: 'phone' },
];
const inform = (message) => Platform.OS === 'web' ? window.alert(message) : Alert.alert('Sorular', message);

export default function TemplateEditorScreen({ navigation, route }) {
  const [name, setName] = useState('Benim sorularım');
  const [fields, setFields] = useState([]);
  const [sourceColumns, setSourceColumns] = useState([]);
  const [mode, setMode] = useState('calls');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    getTemplates().then((templates) => {
      const selected = templates.find((item) => item.id === route.params?.templateId);
      if (route.params?.templateId && !selected) throw new Error('Sorular bu cihazda bulunamadı.');
      if (selected) {
        setMode(selected.mode || 'calls');
        setName(selected.name);
        setFields(selected.fields.filter((field) => !field.isSystemField)
          .map((field) => ({ ...field, options: [...field.options] })));
        setSourceColumns(selected.sourceColumns || []);
      }
      setReady(true);
    }).catch((reason) => { reportError(reason, 'Varsayılan sorular açılırken'); setError(reason.message); });
  }, [route.params?.templateId]);
  const change = (id, key, value) => setFields((items) => items.map((field) =>
    field.id !== id ? field : key === 'type' ? withAnswerType(field, value) : { ...field, [key]: value }));
  const changeOption = (id, index, value) => setFields((items) => items.map((field) =>
    field.id === id ? { ...field, options: field.options.map((option, i) => i === index ? value : option) } : field));
  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (!name.trim()) throw new Error('Şablona bir ad verin.');
      const questions = fields.map((field) => ({ ...field, label: field.label.trim(),
        options: field.type === 'select' ? field.options.map((option) => option.trim()).filter(Boolean) : [] }));
      if (questions.some((field) => !field.label)) throw new Error('Boş soruyu doldurun veya silin.');
      for (const field of questions) {
        if (field.type === 'select' && (field.options.length < 2 ||
            new Set(field.options).size !== field.options.length)) {
          throw new Error(`“${field.label}” için iki farklı şık gerekli.`);
        }
      }
      if (mode === 'survey' && !questions.length) throw new Error('En az bir soru ekleyin.');
      const allFields = mode === 'survey' ? questions : [identityFields[0], ...questions, identityFields[1]];
      const ids = new Set(allFields.map((field) => field.id));
      const columns = sourceColumns.map((column) => ({ ...column,
        fieldId: ids.has(column.fieldId) ? column.fieldId : null }));
      const settings = await getAppSettings();
      const saved = await saveTemplate(await readTemplateFile(await createTemplateFile(
        name.trim(), allFields, columns, settings.pasteMode, mode)));
      await saveAppSettings({ ...settings, defaultTemplateId: saved.id });
      navigation.goBack();
    } catch (reason) { reportError(reason, 'Varsayılan sorular kaydedilirken'); setError(reason.message); inform(reason.message); }
    finally { setBusy(false); }
  };
  if (!ready) return <View style={[s.root, s.center]}>{error
    ? <Text style={s.error}>{error}</Text> : <ActivityIndicator color={Colors.accentLight} />}</View>;
  return <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text style={s.help}>{mode === 'survey' ? 'Bu şablonda kişi listesi yok. Sorular yeni anketlerde otomatik açılsın.' : 'İsim ve telefon hazırdır. Ek sorularınızı yazın; yeni etkinliklerde otomatik açılsın.'}</Text>
    <Text style={s.label}>Bu düzene bir ad verin</Text>
    <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Örn. Etkinlik katılımı"
      placeholderTextColor={Colors.textPlaceholder} accessibilityLabel="Şablon adı" />
    {fields.map((field, index) => <View key={field.id} style={s.card}>
      <Text style={s.label}>Soru {index + 1}</Text>
      <TextInput style={s.input} value={field.label} onChangeText={(value) => change(field.id, 'label', value)}
        placeholder="Örn. Geliyor musun?" placeholderTextColor={Colors.textPlaceholder}
        accessibilityLabel={`Soru ${index + 1}`} />
      <View style={s.typeRow}>
        {[['text', 'Yazılı cevap'], ['select', 'Şık seçimi']].map(([type, label]) =>
          <TouchableOpacity key={type} accessibilityRole="button" style={[s.type, field.type === type && s.typeActive]}
            onPress={() => change(field.id, 'type', type)}>
            <Text style={[s.typeText, field.type === type && s.typeTextActive]}>{label}</Text>
          </TouchableOpacity>)}
      </View>
      {field.type === 'select' && <>
        {field.options.map((option, optionIndex) => <View key={optionIndex} style={s.optionRow}>
          <TextInput style={[s.input, s.optionInput]} value={option}
            onChangeText={(value) => changeOption(field.id, optionIndex, value)}
            placeholder={`Şık ${optionIndex + 1}`} placeholderTextColor={Colors.textPlaceholder}
            accessibilityLabel={`Soru ${index + 1}, şık ${optionIndex + 1}`} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Şıkkı sil" style={s.removeOption}
            onPress={() => change(field.id, 'options', field.options.filter((_, i) => i !== optionIndex))}>
            <Text style={s.removeOptionText}>×</Text>
          </TouchableOpacity>
        </View>)}
        <TouchableOpacity accessibilityRole="button" style={s.smallButton}
          onPress={() => change(field.id, 'options', [...field.options, ''])}>
          <Text style={s.link}>+ Şık ekle</Text>
        </TouchableOpacity>
      </>}
      <View style={s.actions}>
        <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: !!field.required }}
          onPress={() => change(field.id, 'required', !field.required)}>
          <Text style={s.help}>{field.required ? '☑' : '□'} Cevap zorunlu</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => setFields((items) => items.filter((item) => item.id !== field.id))}>
          <Text style={s.delete}>Soruyu sil</Text>
        </TouchableOpacity>
      </View>
    </View>)}
    <TouchableOpacity accessibilityRole="button" style={s.add} onPress={() => setFields((items) =>
      [...items, { id: Crypto.randomUUID(), label: '', type: 'text', options: [], required: false }])}>
      <Text style={s.addText}>+ Soru ekle</Text>
    </TouchableOpacity>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <TouchableOpacity accessibilityRole="button" style={[s.save, busy && s.disabled]} disabled={busy} onPress={save}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>Kaydet ve varsayılan yap</Text>}
    </TouchableOpacity>
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg }, center: { justifyContent: 'center' },
  content: { padding: 18, paddingBottom: 60 }, title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '800' },
  help: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 7 },
  label: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800', marginTop: 16, marginBottom: 7 },
  input: { color: Colors.textPrimary, backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: 10, minHeight: 46, paddingHorizontal: 12, fontSize: 15 },
  card: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 14, marginTop: 15 },
  typeRow: { flexDirection: 'row', gap: 8, marginTop: 10 }, type: { flex: 1, alignItems: 'center', padding: 11,
    borderRadius: 9, backgroundColor: Colors.bgInput }, typeActive: { backgroundColor: Colors.accent },
  typeText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' }, typeTextActive: { color: '#fff' },
  optionRow: { flexDirection: 'row', gap: 8, marginTop: 8 }, optionInput: { flex: 1 },
  removeOption: { width: 44, borderRadius: 10, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center' },
  removeOptionText: { color: '#fff', fontSize: 22 }, smallButton: { paddingVertical: 11, alignSelf: 'flex-start' },
  link: { color: Colors.accentLight, fontWeight: '800' }, actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  delete: { color: Colors.danger, fontSize: 13, fontWeight: '800' }, add: { backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.borderAccent, borderRadius: 11, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  addText: { color: Colors.accentLight, fontWeight: '800' }, save: { backgroundColor: Colors.accent,
    borderRadius: 11, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  disabled: { opacity: 0.6 }, saveText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  error: { color: Colors.warning, fontSize: 13, marginTop: 12 },
});
