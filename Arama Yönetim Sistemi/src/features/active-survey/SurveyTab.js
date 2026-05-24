/**
 * SurveyTab.js — "Arama Yap" Sekmesi
 * Arama butonu, navigasyon ve dinamik form alanlarını içerir.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Linking, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { formatPhoneDisplay } from '../../utils/phoneUtils';
import { useSurvey } from '../../context/SurveyContext';

const SEL_COLORS = [
  { active: '#00D2A0', bg: 'rgba(0,210,160,0.15)' },
  { active: '#FF6B6B', bg: 'rgba(255,107,107,0.15)' },
  { active: '#FECA57', bg: 'rgba(254,202,87,0.15)' },
  { active: '#54A0FF', bg: 'rgba(84,160,255,0.15)' },
  { active: '#A29BFE', bg: 'rgba(162,155,254,0.15)' },
  { active: '#FD79A8', bg: 'rgba(253,121,168,0.15)' },
];

export default function SurveyTab() {
  const {
    cc, currentIndex, total, done, fields, nameField,
    formData, saving,
    setField, handleSaveAndNext, handleNav,
    navigation, projectId, projectName,
  } = useSurvey();
  const insets = useSafeAreaInsets();

  const handleCall = () => {
    if (!cc) return;
    
    // Telefon çeviricisi için numarayı yerel formata çevir (+90 -> 0)
    let dialNumber = cc.phone;
    if (dialNumber.startsWith('+90')) {
      dialNumber = '0' + dialNumber.substring(3);
    }
    
    Linking.openURL(`tel:${dialNumber}`).catch(() => {
      if (Platform.OS === 'web') window.alert(`Numara: ${dialNumber}`);
    });
  };

  return (
    <>
      <ScrollView
        style={st.sv}
        contentContainerStyle={[st.svc, { paddingBottom: 150 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress */}
        <View style={st.progRow}>
          <View style={st.progBox}>
            <Text style={st.progLbl}>İLERLEME</Text>
            <Text style={st.progVal}>
              <Text style={{ color: Colors.accent, fontWeight: '800' }}>{currentIndex + 1}</Text>
              <Text style={{ color: Colors.textMuted }}> / {total}</Text>
            </Text>
          </View>
          <View style={st.progBox}>
            <Text style={st.progLbl}>TAMAMLANAN</Text>
            <Text style={[st.progVal, { color: Colors.success }]}>{done}</Text>
          </View>
          <TouchableOpacity
            style={st.expBtn}
            onPress={() => navigation.navigate('Export', { projectId, projectName })}
          >
            <Text style={st.expBtnT}>📥 Dışa Aktar</Text>
          </TouchableOpacity>
        </View>
        <View style={st.pBarBg}>
          <View style={[st.pBarFill, { width: `${((currentIndex + 1) / total) * 100}%` }]} />
        </View>

        {/* Arama Butonu */}
        <TouchableOpacity style={st.callBtn} onPress={handleCall} activeOpacity={0.8}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>📞</Text>
          {nameField && formData[nameField.id]
            ? <Text style={st.callName}>{formData[nameField.id]}</Text>
            : null}
          <Text style={st.callNum}>{formatPhoneDisplay(cc?.phone)}</Text>
          <Text style={st.callLbl}>Aramak için dokunun</Text>
        </TouchableOpacity>

        {/* Önceki / Sonraki Nav */}
        <View style={st.navRow}>
          <TouchableOpacity
            style={[st.navB, currentIndex === 0 && st.navBD]}
            onPress={() => handleNav(-1)}
            disabled={currentIndex === 0}
          >
            <Text style={[st.navBT, currentIndex === 0 && { color: Colors.textMuted }]}>← Önceki</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.navB, currentIndex === total - 1 && st.navBD]}
            onPress={() => handleNav(1)}
            disabled={currentIndex === total - 1}
          >
            <Text style={[st.navBT, currentIndex === total - 1 && { color: Colors.textMuted }]}>Sonraki →</Text>
          </TouchableOpacity>
        </View>

        {/* Dinamik Form Alanları */}
        {fields.map((field) => (
          <View key={field.id} style={st.dynField}>
            <Text style={st.dynLabel}>{field.label}</Text>
            {field.type === 'text' ? (
              <TextInput
                style={st.dynInput}
                placeholder={field.label}
                placeholderTextColor={Colors.textPlaceholder}
                value={formData[field.id] || ''}
                onChangeText={(v) => setField(field.id, v)}
              />
            ) : (
              <View style={st.selRow}>
                {field.options.map((opt, oi) => {
                  const clr = SEL_COLORS[oi % SEL_COLORS.length];
                  const sel = formData[field.id] === opt;
                  return (
                    <TouchableOpacity
                      key={oi}
                      style={[st.selBtn, sel && { borderColor: clr.active, backgroundColor: clr.bg }]}
                      onPress={() => setField(field.id, sel ? '' : opt)}
                      activeOpacity={0.7}
                    >
                      <Text style={[st.selBtnT, sel && { color: clr.active, fontWeight: '700' }]}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        ))}
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Kaydet ve Sonraki */}
      <TouchableOpacity 
        style={[st.saveBtn, { bottom: Math.max(24, insets.bottom + 16) }]} 
        onPress={handleSaveAndNext} 
        activeOpacity={0.8} 
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" size="small" />
          : <>
              <Text style={{ fontSize: 18, marginRight: 8 }}>💾</Text>
              <Text style={st.saveBtnT}>KAYDET VE İLERLE</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginLeft: 8 }}>→</Text>
            </>
        }
      </TouchableOpacity>
    </>
  );
}

const st = StyleSheet.create({
  sv: { flex: 1 },
  svc: { padding: 20 },
  progRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  progBox: { alignItems: 'center' },
  progLbl: { fontSize: 11, color: Colors.textMuted, marginBottom: 2, letterSpacing: 2, textTransform: 'uppercase' },
  progVal: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  expBtn: { backgroundColor: Colors.bgCardHover, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderLeftWidth: 5, borderLeftColor: Colors.accentDark },
  expBtnT: { color: Colors.textSecondary, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  pBarBg: { height: 8, backgroundColor: Colors.bgCardHover, borderRadius: 4, marginBottom: 20, overflow: 'hidden' },
  pBarFill: { height: 8, backgroundColor: Colors.accent, borderRadius: 4 },
  callBtn: { backgroundColor: '#111', borderRadius: 40, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center', borderLeftWidth: 20, borderLeftColor: Colors.info, marginBottom: 16 },
  callNum: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 2, marginBottom: 6 },
  callLbl: { fontSize: 13, color: Colors.info, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  callName: { fontSize: 18, fontWeight: '800', color: Colors.info, marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' },
  navRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  navB: { flex: 1, backgroundColor: '#111', paddingVertical: 14, borderRadius: 30, alignItems: 'center' },
  navBD: { opacity: 0.4 },
  navBT: { color: Colors.textSecondary, fontWeight: '800', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  dynField: { marginBottom: 16 },
  dynLabel: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  dynInput: { backgroundColor: '#111', borderRadius: 20, padding: 14, fontSize: 15, color: Colors.textPrimary, borderLeftWidth: 10, borderLeftColor: Colors.warning },
  selRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  selBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 20, backgroundColor: '#111', minWidth: 90, alignItems: 'center', marginBottom: 2 },
  selBtnT: { fontSize: 14, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase' },
  saveBtn: { position: 'absolute', left: 20, right: 20, backgroundColor: Colors.accent, borderRadius: 40, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  saveBtnT: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1, textTransform: 'uppercase' },
});
