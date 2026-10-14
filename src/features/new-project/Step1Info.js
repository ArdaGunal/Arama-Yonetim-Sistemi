import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import TemplatePicker from './TemplatePicker';

export default function Step1Info({ projectName, setProjectName, activeTab, setActiveTab,
  phoneText, setPhoneText, loading, handleParseText, handleImportExcel,
  templates, templateId, applyTemplate, importTemplate, pasteMode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: Math.max(40, insets.bottom + 24) }]} keyboardShouldPersistTaps="handled">
        <Text style={s.step}>1 / 2 · Listeyi ekle</Text>
        <Text style={s.title}>Yeni arama projesi</Text>
        <Text style={s.intro}>Önce adını yazın, sonra kişi listesini ekleyin. Kaydetmeden önce her şeyi kontrol edeceksiniz.</Text>

        <View style={s.card}>
          <Text style={s.label}>Etkinliğin adı</Text>
          <TextInput accessibilityLabel="Etkinliğin adı" style={s.input} value={projectName} onChangeText={setProjectName}
            placeholder="Örnek: Bahar buluşması" placeholderTextColor={Colors.textPlaceholder} />
        </View>

        <View style={s.card}>
          <Text style={s.label}>Kişi listesi</Text>
          <Text style={s.help}>{pasteMode === 'phone-name' ? 'Her satır: telefon, sonra isim.' :
            pasteMode === 'phone-only' ? 'Her satır: bir telefon numarası.' :
              pasteMode === 'header-table' ? 'İlk satır başlık; sütunları Tab veya noktalı virgülle ayırın.' :
                'Her satır: isim, sonra telefon. Arada Tab veya boşluk olabilir.'}</Text>
          <View style={s.tabs}>
            <TouchableOpacity accessibilityRole="button" onPress={() => setActiveTab('text')}
              style={[s.tab, activeTab === 'text' && s.tabActive]}>
              <Text style={[s.tabText, activeTab === 'text' && s.tabTextActive]}>Metin yapıştır</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => setActiveTab('excel')}
              style={[s.tab, activeTab === 'excel' && s.tabActive]}>
              <Text style={[s.tabText, activeTab === 'excel' && s.tabTextActive]}>Excel / CSV</Text>
            </TouchableOpacity>
          </View>
          {activeTab === 'text' ? (
            <>
              <TextInput style={s.textArea} value={phoneText} onChangeText={setPhoneText} multiline
                textAlignVertical="top" placeholder={pasteMode === 'phone-name' ? '05xx xxx xx xx\tAyşe Örnek' :
                  pasteMode === 'phone-only' ? '05xx xxx xx xx\n05xx xxx xx xx' :
                    pasteMode === 'header-table' ? 'İsim Soyisim\tTelefon\tOkul numarası\nAyşe Örnek\t05xx xxx xx xx\t1234' :
                      'Ayşe Örnek\t05xx xxx xx xx\nMehmet Örnek\t05xx xxx xx xx'}
                placeholderTextColor={Colors.textPlaceholder} accessibilityLabel="Kişi listesini yapıştır" />
              <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={handleParseText} disabled={loading}>
                <Text style={s.primaryText}>Listeyi kontrol et →</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={handleImportExcel} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Dosya seç ve kontrol et →</Text>}
            </TouchableOpacity>
          )}
        </View>
        <TemplatePicker mode="calls" templates={templates} templateId={templateId}
          applyTemplate={applyTemplate} importTemplate={importTemplate} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 20, paddingTop: 26 },
  step: { color: Colors.accentLight, fontSize: 13, fontWeight: '800', marginBottom: 8 },
  title: { color: Colors.textPrimary, fontSize: 27, fontWeight: '800', marginBottom: 8 },
  intro: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 20 },
  card: { backgroundColor: Colors.bgCard, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 14 },
  label: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  help: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  input: { color: Colors.textPrimary, backgroundColor: Colors.bgInput, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderLight, padding: 13, fontSize: 16 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: { flex: 1, backgroundColor: Colors.bgInput, borderRadius: 11, paddingVertical: 12, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: '#fff' },
  textArea: { color: Colors.textPrimary, backgroundColor: Colors.bgInput, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderLight, padding: 13, fontSize: 15, minHeight: 146, marginBottom: 12 },
  primary: { backgroundColor: Colors.accent, minHeight: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
