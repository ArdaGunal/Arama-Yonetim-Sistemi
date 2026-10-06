/**
 * SearchTab.js — "Kişiler / Arama" Sekmesi
 * İsim veya numaraya göre anlık arama + düzenleme/gitme işlemleri.
 */
import React, { useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Linking,
} from 'react-native';
import { Colors } from '../../theme/colors';
import { formatPhoneDisplay } from '../../utils/phoneUtils';
import { useSurvey } from '../../context/SurveyContext';

export default function SearchTab() {
  const {
    project, nameField,
    searchQuery, setSearchQuery,
    openEditContact,
    jumpToContact,
  } = useSurvey();

  const filteredData = useMemo(() => {
    if (!project?.contacts) return [];
    let data = project.contacts.map((c, idx) => ({ ...c, _idx: idx }));
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLocaleLowerCase('tr-TR');
      // Sadece rakam olan bir arama ise +90 ve baştaki 0'ı yoksayabilmek için temizle
      const qNum = q.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
      
      data = data.filter(c => {
        const nm = (nameField && c.data?.[nameField.id])
          ? String(c.data[nameField.id]).toLocaleLowerCase('tr-TR') : '';
        const ph = String(c.phone);
        
        if (qNum.length > 0 && ph.includes(qNum)) return true;
        return nm.includes(q);
      });
    }
    return data;
  }, [project, searchQuery, nameField]);

  const renderItem = useCallback(({ item: c }) => {
    const displayName = nameField ? (c.data?.[nameField.id] || '') : '';
    return (
      <View style={st.filteredItem}>
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
            onPress={() => openEditContact(c)}
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
  }, [nameField, openEditContact, jumpToContact]);

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
      <FlatList
        style={st.sv}
        contentContainerStyle={[st.svc, { paddingBottom: 150 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        data={filteredData}
        keyExtractor={c => c.id}
        renderItem={renderItem}
        initialNumToRender={20}
        windowSize={11}
        ListEmptyComponent={
          <Text style={st.noResult}>Projede kayıtlı kişi yok veya eşleşme bulunamadı.</Text>
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  searchTab: { flex: 1 },
  searchHeader: { padding: 16, backgroundColor: Colors.bg, borderBottomWidth: 2, borderBottomColor: Colors.bgCardHover },
  searchInput: { backgroundColor: Colors.bgCardHover, borderRadius: 30, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, padding: 16, fontSize: 16, color: Colors.textPrimary, borderLeftWidth: 10, borderLeftColor: Colors.accent },
  sv: { flex: 1 },
  svc: { padding: 20 },
  filteredItem: { backgroundColor: Colors.bgCardHover, borderRadius: 20, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 10, borderLeftColor: Colors.info },
  filteredLeft: { marginBottom: 12, minWidth: 0 },
  filteredName: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 },
  filteredPhone: { fontSize: 13, color: Colors.textSecondary, letterSpacing: 0.3 },
  filteredActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  miniCallBtn: { flexGrow: 1, flexBasis: 88, minWidth: 88, backgroundColor: Colors.success, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  miniCallBtnT: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', textAlign: 'center' },
  miniGoBtn: { flexGrow: 1, flexBasis: 88, minWidth: 88, backgroundColor: '#111', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  miniGoBtnT: { fontSize: 12, fontWeight: '800', color: Colors.accentLight, textTransform: 'uppercase', textAlign: 'center' },
  noResult: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 16, textTransform: 'uppercase', letterSpacing: 1 },
});
