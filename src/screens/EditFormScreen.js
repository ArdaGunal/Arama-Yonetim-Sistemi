import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getProject, saveTemplate, updateProjectForm } from '../utils/storage';
import { createTemplateFile, readTemplateFile, TEMPLATE_EXTENSION } from '../utils/templateFormat';
import { reportError } from '../utils/diagnostics';
import Step2Builder from '../features/new-project/Step2Builder';
import { Colors } from '../theme/colors';

const notify = (message) => Platform.OS === 'web' ? window.alert(message) : Alert.alert('Bilgi', message);

export default function EditFormScreen({ navigation, route }) {
  const [project, setProject] = useState(null);
  const [fields, setFields] = useState([]);
  const [expandedField, setExpandedField] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    getProject(route.params.projectId).then((item) => {
      if (!item) throw new Error('Etkinlik bulunamadı.');
      setProject(item);
      setFields([...item.fields.map((field) => ({ ...field, options: [...field.options] })),
        { id: 'form_editor_phone', label: 'Telefon', type: 'phone', options: [], isSystemField: 'phone' }]);
    }).catch((reason) => { reportError(reason, 'Form açılırken'); setError(reason.message); });
  }, [route.params.projectId]);

  const updateField = (id, key, value) => setFields((items) => items.map((field) =>
    field.id === id && !(field.isSystemField && key === 'type') ? { ...field, [key]: value } : field));
  const addField = () => {
    const id = Crypto.randomUUID();
    setFields((items) => [...items.slice(0, -1), { id, label: '', type: 'text', options: [] }, items[items.length - 1]]);
    setExpandedField(id);
  };
  const removeField = (id) => setFields((items) => items.filter((field) => field.id !== id || field.isSystemField));
  const addOption = (id) => setFields((items) => items.map((field) =>
    field.id === id ? { ...field, options: [...field.options, ''] } : field));
  const updateOption = (id, index, value) => setFields((items) => items.map((field) =>
    field.id === id ? { ...field, options: field.options.map((option, i) => i === index ? value : option) } : field));
  const removeOption = (id, index) => setFields((items) => items.map((field) =>
    field.id === id ? { ...field, options: field.options.filter((_, i) => i !== index) } : field));

  const currentFields = () => fields.filter((field) => field.isSystemField !== 'phone').map((field, index) => ({
    id: field.id, label: field.label.trim(), type: field.type,
    options: field.type === 'select' ? field.options.map((option) => option.trim()) : [], order: index,
    ...(field.isSystemField ? { isSystemField: field.isSystemField } : {}),
  }));
  const save = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await updateProjectForm(project.id, currentFields());
      navigation.goBack();
    } catch (reason) { reportError(reason, 'Form kaydedilirken'); notify(reason.message); }
    finally { setLoading(false); }
  };
  const template = async (share) => {
    try {
      const content = await createTemplateFile(project.name, fields,
        project.sourceReview?.columns.map(({ label, role, fieldId }) => ({ label, role, fieldId })) || []);
      await saveTemplate(await readTemplateFile(content));
      if (!share) { notify('Şablon bu cihazda kaydedildi.'); return; }
      const name = `Etkinlik-Sablonu${TEMPLATE_EXTENSION}`;
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = name;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${name}`;
        await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Form şablonunu paylaş' });
      }
    } catch (reason) { reportError(reason, 'Şablon paylaşılırken'); notify(reason.message); }
  };

  if (error) return <View style={s.center}><Text style={s.text}>{error}</Text></View>;
  if (!project) return <View style={s.center}><ActivityIndicator color={Colors.accentLight} /></View>;
  if (project.formLocked || project.contacts.some((contact) => contact.completed)) return <View style={s.center}>
    <Text style={s.title}>Form kilitli</Text>
    <Text style={s.text}>Arama başladı. Eski cevapların doğru kalması için sorular artık değiştirilemez.</Text>
    <TouchableOpacity style={s.button} onPress={() => template(false)}><Text style={s.buttonText}>Şablonu kaydet</Text></TouchableOpacity>
    <TouchableOpacity style={s.button} onPress={() => template(true)}><Text style={s.buttonText}>Şablonu paylaş</Text></TouchableOpacity>
  </View>;
  return <Step2Builder fields={fields} expandedField={expandedField} setExpandedField={setExpandedField}
    selectedCount={project.contacts.length} loading={loading} updateField={updateField}
    removeField={removeField} addField={addField} addOption={addOption} updateOption={updateOption}
    removeOption={removeOption} handleSave={save} saveTemplate={() => template(false)} shareTemplate={() => template(true)}
    editing onBack={() => navigation.goBack()} />;
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: Colors.bg, padding: 24, justifyContent: 'center' },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '800', marginBottom: 10 },
  text: { color: Colors.textSecondary, fontSize: 15, lineHeight: 23, marginBottom: 18 },
  button: { backgroundColor: Colors.accent, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: '800' },
});
