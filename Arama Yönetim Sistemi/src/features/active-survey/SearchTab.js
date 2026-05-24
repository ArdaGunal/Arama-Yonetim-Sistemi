/**
 * SearchTab.js — "Kişiler / Arama" Sekmesi
 * İsim veya numaraya göre anlık arama + düzenleme/gitme işlemleri.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Linking,
} from 'react-native';
import { Colors } from '../../theme/colors';
import { formatPhoneDisplay } from '../../utils/phoneUtils';
import { useSurvey } from '../../context/SurveyContext';

export default function SearchTab() {
  const {
    project, nameField,
    searchQuery, setSearchQuery,
    setEditingContact, setEditFormData,
    jumpToContact,
  } = useSurvey();

  return (
    <View style={st.searchTab}>
      <View style={st.searchHeader}>
        <TextInput
          style={st.searchInput}
          placeholder="İsim veya Numara ara..."
          placeholderTextColor={Colors.textPlaceholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      <ScrollView
        style={st.sv}
        contentContainerStyle={[st.svc, { paddingBottom: 150 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {project.contacts
          .map((c, idx) => ({ ...c, _idx: idx }))
          .filter(c => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            const nm = (nameField && c.data?.[nameField.id])
              ? String(c.data[nameField.id]).toLowerCase() : '';
            const ph = String(c.phone).toLowerCase();
            return nm.includes(q) || ph.includes(q);
          })
          .map((c) => {
            const displayName = nameField ? (c.data?.[nameField.id] || '') : '';
            return (
              <View key={c.id} style={st.filteredItem}>
                <View style={st.filteredLeft}>
                  <Text style={st.filteredName}>{displayName || '(İsimsiz)'}</Text>
                  <Text style={st.filteredPhone}>{formatPhoneDisplay(c.phone)}</Text>
                </View>
                <View style={st.filteredActions}>
                  <TouchableOpacity
                    style={st.miniCallBtn}
                    onPress={() => Linking.openURL(`tel:${c.phone}`).catch(() => {})}
                  >
                    <Text style={st.miniCallBtnT}>📞 Ara</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.miniGoBtn, { backgroundColor: Colors.warning }]}
                    onPress={() => { setEditFormData({ ...c.data }); setEditingContact(c); }}
                  >
                    <Text style={[st.miniGoBtnT, { color: '#FFFFFF' }]}>✏️ Düzenle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={st.miniGoBtn}
                    onPress={() => { jumpToContact(c._idx); }}
                  >
                    <Text style={st.miniGoBtnT}>→ Git</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        }
        {project.contacts.length === 0 && (
          <Text style={st.noResult}>Projede kayıtlı kişi yok.</Text>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  searchTab: { flex: 1 },
  searchHeader: { padding: 16, backgroundColor: Colors.bg, borderBottomWidth: 2, borderBottomColor: Colors.bgCardHover },
  searchInput: { backgroundColor: Colors.bgCardHover, borderRadius: 30, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, padding: 16, fontSize: 16, color: Colors.textPrimary, borderLeftWidth: 10, borderLeftColor: Colors.accent },
  sv: { flex: 1 },
  svc: { padding: 20 },
  filteredItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.bgCardHover, borderRadius: 20, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 10, borderLeftColor: Colors.info },
  filteredLeft: { flex: 1, marginRight: 8 },
  filteredName: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 },
  filteredPhone: { fontSize: 13, color: Colors.textSecondary, letterSpacing: 0.3 },
  filteredActions: { flexDirection: 'row', gap: 6 },
  miniCallBtn: { backgroundColor: Colors.success, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12 },
  miniCallBtnT: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase' },
  miniGoBtn: { backgroundColor: '#111', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12 },
  miniGoBtnT: { fontSize: 12, fontWeight: '800', color: Colors.accentLight, textTransform: 'uppercase' },
  noResult: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 16, textTransform: 'uppercase', letterSpacing: 1 },
});
