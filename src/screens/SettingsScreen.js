import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getAppSettings, saveAppSettings } from '../utils/appSettings';
import { getTemplates, saveTemplate } from '../utils/storage';
import { createTemplateFile, readTemplateFile, TEMPLATE_EXTENSION } from '../utils/templateFormat';
import { shareOrDownloadWebFile } from '../utils/webFileTransfer';
import { reportError } from '../utils/diagnostics';
import { Colors } from '../theme/colors';

const formats = [
  { id: 'name-phone', title: 'İsim → telefon', help: 'Her satırda isim ve ardından telefon.' },
  { id: 'phone-name', title: 'Telefon → isim', help: 'Her satırda telefon ve ardından isim.' },
  { id: 'phone-only', title: 'Yalnız telefon', help: 'İsim yoksa kişi “İsimsiz kişi” olarak açılır.' },
  { id: 'header-table', title: 'Başlıklı tablo', help: 'İlk satır sütun adları; Tab veya noktalı virgül.' },
];
const inform = (message) => Platform.OS === 'web' ? window.alert(message) : Alert.alert('Ayarlar', message);

export default function SettingsScreen({ navigation, onDeveloperPanel }) {
  const [settings, setSettings] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const [nextSettings, nextTemplates] = await Promise.all([getAppSettings(), getTemplates()]);
      setSettings(nextSettings); setTemplates(nextTemplates); setError('');
    } catch (reason) { reportError(reason, 'Ayarlar açılırken'); setError(reason.message); }
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const update = async (patch) => {
    if (busy || !settings) return;
    setBusy('save');
    try { setSettings(await saveAppSettings({ ...settings, ...patch })); }
    catch (reason) { reportError(reason, 'Ayarlar kaydedilirken'); inform(reason.message); }
    finally { setBusy(''); }
  };
  const importTemplate = async () => {
    if (busy) return;
    setBusy('import');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file?.name?.toLowerCase().endsWith(TEMPLATE_EXTENSION)) throw new Error('.ayst şablon dosyası seçin.');
      const content = Platform.OS === 'web'
        ? file.file ? await file.file.text() : await (await fetch(file.uri)).text()
        : await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const saved = await saveTemplate(await readTemplateFile(content));
      setSettings(await saveAppSettings({ ...settings, defaultTemplateId: saved.id,
        pasteMode: saved.pasteMode || 'name-phone' }));
      setTemplates(await getTemplates());
      inform('Şablon kaydedildi ve yeni etkinlikler için varsayılan yapıldı.');
    } catch (reason) { reportError(reason, 'Ayarlar şablonu açılırken'); inform(reason.message); }
    finally { setBusy(''); }
  };
  const shareTemplate = async (template) => {
    if (busy) return;
    setBusy('share');
    try {
      const content = await createTemplateFile(template.name, template.fields, template.sourceColumns || [], settings.pasteMode,
        template.mode || 'calls');
      const fileName = `Arama-Sablonu${TEMPLATE_EXTENSION}`;
      if (Platform.OS === 'web') await shareOrDownloadWebFile(content, fileName);
      else {
        if (!await Sharing.isAvailableAsync()) throw new Error('Bu cihazda dosya paylaşımı kullanılamıyor.');
        const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Şablonu paylaş' });
      }
    } catch (reason) { reportError(reason, 'Ayarlar şablonu paylaşılırken'); inform(reason.message); }
    finally { setBusy(''); }
  };

  if (error) return <View style={s.root}><Text style={s.error}>{error}</Text>
    <TouchableOpacity onPress={refresh}><Text style={s.link}>Tekrar dene</Text></TouchableOpacity></View>;
  if (!settings) return <View style={[s.root, s.center]}><ActivityIndicator color={Colors.accentLight} /></View>;
  const selectedTemplate = templates.find((item) => item.id === settings.defaultTemplateId);
  return <ScrollView style={s.root} contentContainerStyle={s.content}>
    <Text style={s.help}>Bu seçimler yeni etkinliklerde kullanılır. Eski etkinlikler değişmez.</Text>

    <View style={s.card}>
      <Text style={s.heading}>Kişi listesi biçimi</Text>
      <Text style={s.help}>Yapıştırdığınız listenin düzenini seçin.</Text>
      {formats.map((format) => <TouchableOpacity key={format.id} accessibilityRole="radio"
        accessibilityState={{ selected: settings.pasteMode === format.id }} disabled={!!busy}
        style={[s.choice, settings.pasteMode === format.id && s.selected]}
        onPress={() => update({ pasteMode: format.id })}>
        <Text style={s.choiceTitle}>{settings.pasteMode === format.id ? '● ' : '○ '}{format.title}</Text>
        <Text style={s.choiceHelp}>{format.help}</Text>
      </TouchableOpacity>)}
    </View>

    <View style={s.card}>
      <Text style={s.heading}>Varsayılan sorular</Text>
      <Text style={s.help}>İsim ve telefon arama için hazır kalır. Burada ek soruları ve şıkları belirleyin.</Text>
      <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: !settings.defaultTemplateId }}
        disabled={!!busy} style={[s.choice, !settings.defaultTemplateId && s.selected]}
        onPress={() => update({ defaultTemplateId: null })}>
        <Text style={s.choiceTitle}>{!settings.defaultTemplateId ? '● ' : '○ '}Standart · ek soru yok</Text>
      </TouchableOpacity>
      {templates.map((template) => <View key={template.id} style={s.templateRow}>
        <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: settings.defaultTemplateId === template.id }}
          disabled={!!busy} style={[s.choice, s.templateChoice, settings.defaultTemplateId === template.id && s.selected]}
          onPress={() => update({ defaultTemplateId: template.id, pasteMode: template.pasteMode || 'name-phone' })}>
          <Text style={s.choiceTitle}>{settings.defaultTemplateId === template.id ? '● ' : '○ '}{template.name}</Text>
          <Text style={s.choiceHelp}>{template.fields.filter((field) => !field.isSystemField).length} ek soru</Text>
        </TouchableOpacity>
      </View>)}
      <TouchableOpacity accessibilityRole="button" style={s.primary}
        onPress={() => navigation.navigate('TemplateEditor', { templateId: selectedTemplate?.id || null })}>
        <Text style={s.primaryText}>{selectedTemplate ? 'Varsayılan soruları düzenle' : 'Kendi sorularımı oluştur'}</Text>
      </TouchableOpacity>
      <View style={s.actionRow}>
        <TouchableOpacity accessibilityRole="button" style={s.secondary} disabled={!!busy} onPress={importTemplate}>
          <Text style={s.link}>Şablon aç</Text>
        </TouchableOpacity>
        {selectedTemplate && <TouchableOpacity accessibilityRole="button" style={s.secondary} disabled={!!busy}
          onPress={() => shareTemplate(selectedTemplate)}><Text style={s.link}>Şablonu paylaş</Text></TouchableOpacity>}
      </View>
    </View>

    <View style={s.card}>
      <Text style={s.heading}>Veriler ve yardım</Text>
      <TouchableOpacity accessibilityRole="button" style={s.menu} onPress={() => navigation.navigate('Backup')}>
        <Text style={s.menuText}>Yedek al veya geri yükle →</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={s.menu} onPress={onDeveloperPanel}>
        <Text style={s.menuText}>Tanılama ve hata raporu →</Text>
      </TouchableOpacity>
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg }, center: { justifyContent: 'center' },
  content: { padding: 18, paddingBottom: 50 }, title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '800' },
  help: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 13 },
  card: { backgroundColor: Colors.bgCard, borderColor: Colors.border, borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 14 },
  heading: { color: Colors.textPrimary, fontSize: 17, fontWeight: '800' },
  choice: { borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.bgInput,
    borderRadius: 11, padding: 12, marginTop: 8, minHeight: 58 },
  selected: { borderColor: Colors.accentLight, backgroundColor: Colors.accentDark },
  choiceTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' },
  choiceHelp: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 },
  templateRow: { flexDirection: 'row' }, templateChoice: { flex: 1 },
  primary: { backgroundColor: Colors.accent, borderRadius: 11, minHeight: 50, justifyContent: 'center', alignItems: 'center', marginTop: 15, paddingHorizontal: 10 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 9 },
  secondary: { flex: 1, borderColor: Colors.borderAccent, borderWidth: 1, borderRadius: 11, minHeight: 47, justifyContent: 'center', alignItems: 'center' },
  link: { color: Colors.accentLight, fontSize: 13, fontWeight: '800' },
  menu: { borderTopColor: Colors.border, borderTopWidth: 1, paddingVertical: 15, marginTop: 8, minHeight: 48 },
  menuText: { color: Colors.accentLight, fontSize: 14, fontWeight: '800' },
  error: { color: Colors.warning, fontSize: 14, padding: 20 },
});
