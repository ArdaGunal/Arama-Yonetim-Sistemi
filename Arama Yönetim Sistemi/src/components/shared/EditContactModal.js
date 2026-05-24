/**
 * EditContactModal.js — Kişi Düzenleme Modalı
 * SearchTab'dan açılır, seçilen kişinin tüm form alanlarını düzenleyebilir.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Modal, Platform, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { useSurvey } from '../../context/SurveyContext';

const SEL_COLORS = [
  { active: '#00D2A0', bg: 'rgba(0,210,160,0.15)' },
  { active: '#FF6B6B', bg: 'rgba(255,107,107,0.15)' },
  { active: '#FECA57', bg: 'rgba(254,202,87,0.15)' },
  { active: '#54A0FF', bg: 'rgba(84,160,255,0.15)' },
  { active: '#A29BFE', bg: 'rgba(162,155,254,0.15)' },
  { active: '#FD79A8', bg: 'rgba(253,121,168,0.15)' },
];

export default function EditContactModal() {
  const {
    fields, saving,
    editingContact, setEditingContact,
    editFormData, setEditFormData,
    handleSaveEditContact,
  } = useSurvey();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={!!editingContact}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setEditingContact(null)}
    >
      <KeyboardAvoidingView
        style={st.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={st.modalContent}>
          <View style={st.modalHeader}>
            <Text style={st.modalTitle}>Kişiyi Düzenle</Text>
            <TouchableOpacity
              onPress={() => setEditingContact(null)}
              style={st.modalClose}
            >
              <Text style={st.modalCloseT}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={st.modalBody}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {fields.map((field) => (
              <View key={field.id} style={st.dynField}>
                <Text style={st.dynLabel}>{field.label}</Text>
                {field.type === 'text' ? (
                  <TextInput
                    style={st.dynInput}
                    placeholder={field.label}
                    placeholderTextColor={Colors.textPlaceholder}
                    value={editFormData[field.id] || ''}
                    onChangeText={(v) => setEditFormData(prev => ({ ...prev, [field.id]: v }))}
                  />
                ) : (
                  <View style={st.selRow}>
                    {field.options.map((opt, oi) => {
                      const clr = SEL_COLORS[oi % SEL_COLORS.length];
                      const sel = editFormData[field.id] === opt;
                      return (
                        <TouchableOpacity
                          key={oi}
                          style={[st.selBtn, sel && { borderColor: clr.active, backgroundColor: clr.bg }]}
                          onPress={() => setEditFormData(prev => ({
                            ...prev, [field.id]: sel ? '' : opt,
                          }))}
                          activeOpacity={0.7}
                        >
                          <Text style={[st.selBtnT, sel && { color: clr.active, fontWeight: '700' }]}>
                            {opt}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[st.modalSaveBtn, { marginBottom: Math.max(20, insets.bottom + 10) }]}
            onPress={handleSaveEditContact}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={st.modalSaveBtnT}>💾 Kaydet</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.bg, borderTopLeftRadius: 40, borderTopRightRadius: 40, maxHeight: '85%', flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 2, borderBottomColor: Colors.bgCardHover },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, textTransform: 'uppercase', letterSpacing: 2 },
  modalClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center' },
  modalCloseT: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  modalBody: { padding: 20 },
  modalSaveBtn: { margin: 20, marginTop: 10, backgroundColor: Colors.success, borderRadius: 40, paddingVertical: 18, alignItems: 'center' },
  modalSaveBtnT: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 1 },
  dynField: { marginBottom: 16 },
  dynLabel: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  dynInput: { backgroundColor: '#111', borderRadius: 20, padding: 14, fontSize: 15, color: Colors.textPrimary, borderLeftWidth: 10, borderLeftColor: Colors.warning },
  selRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  selBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 20, backgroundColor: '#111', minWidth: 90, alignItems: 'center', marginBottom: 2 },
  selBtnT: { fontSize: 14, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase' },
});
