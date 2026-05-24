/**
 * Step1Info.js — Yeni Proje: Adım 1 (Proje Adı + Numara Ekleme)
 * Metin yapıştırma ve Excel/CSV import özelliklerini içerir.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Platform, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { formatPhoneDisplay } from '../../utils/phoneUtils';

export default function Step1Info({
  projectName, setProjectName,
  activeTab, setActiveTab,
  phoneText, setPhoneText,
  parsedNumbers, setParsedNumbers,
  importedNames, setImportedNames,
  importedFileName,
  loading,
  handleParseText,
  handleImportExcel,
  goToStep2,
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={st.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        style={st.sv}
        contentContainerStyle={[st.svc, { paddingBottom: 150 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Adım Göstergesi */}
        <View style={st.stepRow}>
          <View style={[st.stepDot, st.stepActive]}><Text style={st.stepDotT}>1</Text></View>
          <View style={st.stepLine} />
          <View style={st.stepDot}><Text style={st.stepDotT}>2</Text></View>
        </View>
        <Text style={st.stepLabel}>Proje Bilgileri & Numaralar</Text>

        {/* Proje İsmi */}
        <View style={st.sec}>
          <Text style={st.secTitle}>Proje İsmi</Text>
          <TextInput
            style={st.inp}
            placeholder="Örn: Tanışma Etkinliği"
            placeholderTextColor={Colors.textPlaceholder}
            value={projectName}
            onChangeText={setProjectName}
          />
        </View>

        {/* Numara Ekleme Seçimi */}
        <View style={st.sec}>
          <Text style={st.secTitle}>Telefon Numaraları</Text>
          <View style={st.tabRow}>
            <TouchableOpacity
              style={[st.tab, activeTab === 'text' && st.tabAct]}
              onPress={() => setActiveTab('text')}
            >
              <Text style={[st.tabT, activeTab === 'text' && st.tabTAct]}>📝 Metin Yapıştır</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.tab, activeTab === 'excel' && st.tabAct]}
              onPress={() => setActiveTab('excel')}
            >
              <Text style={[st.tabT, activeTab === 'excel' && st.tabTAct]}>📄 Excel/CSV</Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'text' ? (
            <View>
              <TextInput
                style={st.textArea}
                placeholder={'Numaraları alt alta yapıştırın:\n05321234567\n532 123 45 67'}
                placeholderTextColor={Colors.textPlaceholder}
                multiline
                numberOfLines={6}
                value={phoneText}
                onChangeText={setPhoneText}
                textAlignVertical="top"
              />
              <TouchableOpacity style={st.parseBtn} onPress={handleParseText}>
                <Text style={st.parseBtnT}>Numaraları Ayrıştır ve Temizle</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={st.importArea}>
              <TouchableOpacity style={st.importBtn} onPress={handleImportExcel}>
                <Text style={{ fontSize: 36, marginBottom: 12 }}>📁</Text>
                <Text style={st.importBtnT}>Dosya Seç (Excel / CSV)</Text>
              </TouchableOpacity>
              {importedFileName
                ? <Text style={{ color: Colors.success, marginTop: 12, fontSize: 14 }}>✅ {importedFileName}</Text>
                : null}
            </View>
          )}
        </View>

        {/* Önizleme Listesi */}
        {parsedNumbers.length > 0 && (
          <View style={st.sec}>
            <View style={st.prevHead}>
              <Text style={st.secTitle}>Önizleme</Text>
              <View style={st.cntBadge}><Text style={st.cntBadgeT}>{parsedNumbers.length} numara</Text></View>
            </View>
            <View style={st.prevList}>
              {parsedNumbers.slice(0, 30).map((n, i) => (
                <View key={i} style={st.prevItem}>
                  <View style={{ flex: 1 }}>
                    {importedNames[n] ? <Text style={st.prevName}>{importedNames[n]}</Text> : null}
                    <Text style={st.prevNum}>{formatPhoneDisplay(n)}</Text>
                  </View>
                  <TouchableOpacity
                    style={st.prevRm}
                    onPress={() => {
                      const a = [...parsedNumbers]; a.splice(i, 1); setParsedNumbers(a);
                      const nm = { ...importedNames }; delete nm[n]; setImportedNames(nm);
                    }}
                  >
                    <Text style={st.prevRmT}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {parsedNumbers.length > 30 && (
                <Text style={st.moreT}>... ve {parsedNumbers.length - 30} numara daha</Text>
              )}
            </View>
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* İleri Butonu */}
      <TouchableOpacity
        style={[
          st.nextBtn, 
          { bottom: Math.max(24, insets.bottom + 16) },
          (!projectName.trim() || parsedNumbers.length === 0) && { backgroundColor: Colors.textMuted }
        ]}
        onPress={goToStep2}
        activeOpacity={0.8}
      >
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={st.nextBtnT}>İleri: Form Yapılandırma →</Text>
        }
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  sv: { flex: 1 }, svc: { padding: 20 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgCard, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  stepActive: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  stepDotT: { color: Colors.bg, fontWeight: '800', fontSize: 13 },
  stepLine: { height: 4, width: 40, backgroundColor: Colors.accent },
  stepLabel: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2 },
  sec: { marginBottom: 24 },
  secTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  inp: { backgroundColor: Colors.bgCardHover, borderRadius: 20, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, padding: 16, fontSize: 16, color: Colors.textPrimary, borderLeftWidth: 10, borderLeftColor: Colors.accent },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 30, backgroundColor: Colors.bgCardHover, alignItems: 'center' },
  tabAct: { backgroundColor: Colors.accent },
  tabT: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  tabTAct: { color: '#FFFFFF', fontWeight: '800' },
  textArea: { backgroundColor: Colors.bgCardHover, borderRadius: 20, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, padding: 16, fontSize: 15, color: Colors.textPrimary, borderLeftWidth: 10, borderLeftColor: Colors.accentLight, minHeight: 130, textAlignVertical: 'top' },
  parseBtn: { marginTop: 12, backgroundColor: Colors.accentLight, borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  parseBtnT: { color: '#FFFFFF', fontWeight: '800', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  importArea: { alignItems: 'center', padding: 20 },
  importBtn: { backgroundColor: Colors.bgCardHover, borderRadius: 30, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, paddingVertical: 32, paddingHorizontal: 40, alignItems: 'center', borderLeftWidth: 10, borderLeftColor: Colors.info, width: '100%' },
  importBtnT: { color: Colors.info, fontWeight: '800', fontSize: 15, textTransform: 'uppercase', letterSpacing: 1 },
  prevHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cntBadge: { backgroundColor: Colors.success, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  cntBadgeT: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  prevList: { backgroundColor: Colors.bgCardHover, borderRadius: 20, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, borderLeftWidth: 10, borderLeftColor: Colors.success, overflow: 'hidden' },
  prevItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#222' },
  prevName: { fontSize: 14, fontWeight: '600', color: Colors.accentLight, marginBottom: 2 },
  prevNum: { fontSize: 15, color: Colors.textPrimary, letterSpacing: 0.5 },
  prevRm: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center' },
  prevRmT: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  moreT: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 10, textTransform: 'uppercase' },
  nextBtn: { position: 'absolute', left: 20, right: 20, backgroundColor: Colors.accent, borderRadius: 40, paddingVertical: 18, alignItems: 'center' },
  nextBtnT: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 2 },
});
