/**
 * Step2Builder.js — Yeni Proje: Adım 2 (Form Yapılandırma)
 * Akordiyon alan kartları, tip seçimi, seçenek yönetimi.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Platform, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';

const colLetter = (idx) => String.fromCharCode(65 + idx);

export default function Step2Builder({
  fields, expandedField, setExpandedField,
  parsedNumbers, loading,
  updateField, removeField, addField,
  addOption, updateOption, removeOption,
  setStep,
  handleSave,
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
          <View style={[st.stepDot, st.stepDone]}><Text style={st.stepDotT}>✓</Text></View>
          <View style={[st.stepLine, { backgroundColor: Colors.accent }]} />
          <View style={[st.stepDot, st.stepActive]}><Text style={st.stepDotT}>2</Text></View>
        </View>
        <Text style={st.stepLabel}>Form Yapılandırma</Text>
        <Text style={st.stepSub}>Anket sırasında hangi bilgileri toplayacağınızı belirleyin.</Text>

        {/* Sütun Eşleştirme Bilgisi */}
        <View style={st.colInfoBox}>
          <Text style={st.colInfoT}>📊 Her alan sırasıyla bir Excel sütununa karşılık gelir (1→A, 2→B, 3→C ...)</Text>
        </View>

        {/* Alan Listesi — Akordiyon */}
        {fields.map((field, idx) => {
          const isOpen = expandedField === field.id;
          const isPhone = field.isSystemField === 'phone';
          const isName = field.isSystemField === 'name';
          const isSys = !!field.isSystemField;
          const typeLabel = isPhone
            ? '📱 Numara'
            : (isName ? '👤 İsim' : (field.type === 'text' ? 'Metin' : 'Seçim'));
          const typeBadgeStyle = isPhone
            ? { backgroundColor: Colors.successBg, borderColor: 'rgba(0,210,160,0.3)' }
            : (isName
              ? { backgroundColor: 'rgba(162,155,254,0.15)', borderColor: 'rgba(162,155,254,0.3)' }
              : (field.type === 'select'
                ? { backgroundColor: Colors.warningBg, borderColor: 'rgba(254,202,87,0.3)' }
                : {}));
          const typeBadgeTStyle = isPhone
            ? { color: Colors.success }
            : (isName
              ? { color: '#A29BFE' }
              : (field.type === 'select' ? { color: Colors.warning } : {}));

          return (
            <View
              key={field.id}
              style={[st.fieldCard, isSys && { borderColor: isPhone ? Colors.success + '50' : '#A29BFE50' }]}
            >
              <TouchableOpacity
                style={st.fieldHeader}
                onPress={() => !isPhone && setExpandedField(isOpen ? null : field.id)}
                activeOpacity={isPhone ? 1 : 0.7}
              >
                <View style={st.fieldHeaderLeft}>
                  <Text style={st.fieldIdx}>{idx + 1}</Text>
                  <View style={st.colBadge}><Text style={st.colBadgeT}>Sütun {colLetter(idx)}</Text></View>
                  <Text style={st.fieldName} numberOfLines={1}>
                    {isPhone ? '📱 Numara' : (field.label || 'Yeni Alan')}
                  </Text>
                  {isSys && <View style={st.lockBadge}><Text style={st.lockBadgeT}>🔒</Text></View>}
                  <View style={[st.typeBadge, typeBadgeStyle]}>
                    <Text style={[st.typeBadgeT, typeBadgeTStyle]}>{typeLabel}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {!isSys && (
                    <TouchableOpacity
                      onPress={() => removeField(field.id)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={{ color: Colors.danger, fontSize: 18 }}>🗑</Text>
                    </TouchableOpacity>
                  )}
                  {!isPhone && (
                    <Text style={{ color: Colors.textMuted, fontSize: 16 }}>{isOpen ? '▲' : '▼'}</Text>
                  )}
                </View>
              </TouchableOpacity>

              {/* Numara alanı özel body */}
              {isPhone && (
                <View style={st.phoneBody}>
                  <Text style={st.phoneHint}>Excel'deki Sütun {colLetter(idx)} telefon numaralarını içerecek.</Text>
                  <Text style={st.phoneHint2}>🔒 Sistem alanı — silinemez. Konum sabittir.</Text>
                </View>
              )}

              {/* Normal alan body */}
              {!isPhone && isOpen && (
                <View style={st.fieldBody}>
                  <Text style={st.fLabel}>Alan Adı / Soru</Text>
                  <TextInput
                    style={st.fInp}
                    placeholder="Örn: İsim, Okul, Katılım Durumu..."
                    placeholderTextColor={Colors.textPlaceholder}
                    value={field.label}
                    onChangeText={v => updateField(field.id, 'label', v)}
                  />
                  {isName && (
                    <Text style={st.sysHint}>🔒 Sistem alanı — başlığı değiştirilebilir ama tipi kilitlidir.</Text>
                  )}

                  {!isSys && (
                    <>
                      <Text style={[st.fLabel, { marginTop: 14 }]}>Cevap Tipi</Text>
                      <View style={st.typeRow}>
                        <TouchableOpacity
                          style={[st.typeBtn, field.type === 'text' && st.typeBtnAct]}
                          onPress={() => updateField(field.id, 'type', 'text')}
                        >
                          <Text style={{ fontSize: 18, marginBottom: 4 }}>⌨️</Text>
                          <Text style={[st.typeBtnT, field.type === 'text' && st.typeBtnTAct]}>Serbest Metin</Text>
                          <Text style={st.typeBtnDesc}>Klavyeyle giriş</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[st.typeBtn, field.type === 'select' && st.typeBtnAct]}
                          onPress={() => updateField(field.id, 'type', 'select')}
                        >
                          <Text style={{ fontSize: 18, marginBottom: 4 }}>🔘</Text>
                          <Text style={[st.typeBtnT, field.type === 'select' && st.typeBtnTAct]}>Hızlı Seçim</Text>
                          <Text style={st.typeBtnDesc}>Buton şıkları</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  {field.type === 'select' && (
                    <View style={st.optsSection}>
                      <Text style={[st.fLabel, { marginTop: 14 }]}>Seçenekler</Text>
                      {field.options.map((opt, oi) => (
                        <View key={oi} style={st.optRow}>
                          <View style={st.optDot} />
                          <TextInput
                            style={st.optInp}
                            placeholder={`Seçenek ${oi + 1}`}
                            placeholderTextColor={Colors.textPlaceholder}
                            value={opt}
                            onChangeText={v => updateOption(field.id, oi, v)}
                          />
                          <TouchableOpacity onPress={() => removeOption(field.id, oi)} style={st.optRm}>
                            <Text style={st.optRmT}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity
                        style={st.addOptBtn}
                        onPress={() => addOption(field.id)}
                      >
                        <Text style={st.addOptBtnT}>+ Seçenek Ekle</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* Yeni Alan Ekle */}
        <TouchableOpacity style={st.addFieldBtn} onPress={addField} activeOpacity={0.7}>
          <Text style={{ fontSize: 22 }}>＋</Text>
          <Text style={st.addFieldBtnT}>Yeni Soru / Alan Ekle</Text>
        </TouchableOpacity>

        {fields.length === 0 && (
          <View style={st.emptyHint}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>📝</Text>
            <Text style={st.emptyHintT}>Henüz alan eklenmedi</Text>
            <Text style={st.emptyHintSub}>
              Yukarıdaki butona tıklayarak yeni alanlar ekleyin veya varsayılan şablonla devam edin.
            </Text>
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Alt Butonlar */}
      <View style={[st.bottomBar, { paddingBottom: Math.max(24, insets.bottom + 10) }]}>
        <TouchableOpacity style={st.backBtn} onPress={() => setStep(1)}>
          <Text style={st.backBtnT}>← Geri</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            st.saveBtn,
            fields.filter(f => f.label.trim() && f.isSystemField !== 'phone').length === 0 && { backgroundColor: Colors.textMuted },
          ]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={st.saveBtnT}>💾 Projeyi Oluştur ({parsedNumbers.length} kişi)</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  sv: { flex: 1 }, svc: { padding: 20 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgCard, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  stepActive: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  stepDone: { borderColor: Colors.success, backgroundColor: Colors.success },
  stepDotT: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  stepLine: { height: 4, width: 40, backgroundColor: Colors.border },
  stepLabel: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 2 },
  stepSub: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1 },
  colInfoBox: { backgroundColor: Colors.bgCardHover, borderRadius: 20, padding: 12, marginBottom: 14, borderLeftWidth: 10, borderLeftColor: Colors.info },
  colInfoT: { fontSize: 12, color: Colors.info, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 },
  fieldCard: { backgroundColor: Colors.bgCardHover, borderRadius: 20, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, marginBottom: 10, borderLeftWidth: 10, borderLeftColor: Colors.accentLight, overflow: 'hidden' },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  fieldHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  fieldIdx: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.accent, color: '#FFFFFF', textAlign: 'center', lineHeight: 24, fontSize: 12, fontWeight: '800', overflow: 'hidden' },
  colBadge: { backgroundColor: Colors.info, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  colBadgeT: { fontSize: 9, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1, textTransform: 'uppercase' },
  fieldName: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, flex: 1, textTransform: 'uppercase', letterSpacing: 1 },
  phoneBody: { paddingHorizontal: 14, paddingBottom: 12 },
  phoneHint: { fontSize: 12, color: Colors.success, fontWeight: '500', marginBottom: 2 },
  phoneHint2: { fontSize: 11, color: Colors.textMuted },
  lockBadge: { marginRight: 2 }, lockBadgeT: { fontSize: 12 },
  sysHint: { fontSize: 11, color: Colors.info, marginTop: 6, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: 0.5 },
  typeBadge: { backgroundColor: Colors.info, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeBadgeT: { fontSize: 11, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase' },
  fieldBody: { padding: 14, paddingTop: 0, borderTopWidth: 2, borderTopColor: Colors.bgCardHover },
  fLabel: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, marginBottom: 6, marginTop: 10, textTransform: 'uppercase', letterSpacing: 1 },
  fInp: { backgroundColor: '#111', borderRadius: 20, padding: 12, fontSize: 15, color: Colors.textPrimary, borderLeftWidth: 5, borderLeftColor: Colors.accent },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeBtn: { flex: 1, paddingVertical: 14, borderRadius: 20, alignItems: 'center', backgroundColor: '#111' },
  typeBtnAct: { backgroundColor: Colors.accent },
  typeBtnT: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  typeBtnTAct: { color: '#FFFFFF' },
  typeBtnDesc: { fontSize: 10, color: Colors.textMuted, marginTop: 2, textTransform: 'uppercase' },
  optsSection: {},
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  optDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  optInp: { flex: 1, backgroundColor: '#111', borderRadius: 20, padding: 10, fontSize: 14, color: Colors.textPrimary, borderLeftWidth: 5, borderLeftColor: Colors.info },
  optRm: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center' },
  optRmT: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  addOptBtn: { backgroundColor: '#111', borderRadius: 20, paddingVertical: 12, alignItems: 'center', borderLeftWidth: 5, borderLeftColor: Colors.success },
  addOptBtnT: { color: Colors.success, fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  addFieldBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.bgCardHover, borderRadius: 30, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, paddingVertical: 16, borderLeftWidth: 10, borderLeftColor: Colors.accent, marginBottom: 16 },
  addFieldBtnT: { fontSize: 15, fontWeight: '800', color: Colors.accent, textTransform: 'uppercase', letterSpacing: 1 },
  emptyHint: { alignItems: 'center', padding: 30 },
  emptyHintT: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  emptyHintSub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, textTransform: 'uppercase', letterSpacing: 0.5 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, padding: 20, paddingBottom: 24, backgroundColor: Colors.bg, borderTopWidth: 2, borderTopColor: Colors.bgCardHover },
  backBtn: { backgroundColor: Colors.bgCardHover, borderRadius: 30, paddingVertical: 14, paddingHorizontal: 20, justifyContent: 'center', borderLeftWidth: 5, borderLeftColor: Colors.textSecondary },
  backBtnT: { color: Colors.textSecondary, fontWeight: '800', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  saveBtn: { flex: 1, backgroundColor: Colors.success, borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  saveBtnT: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 1 },
});
