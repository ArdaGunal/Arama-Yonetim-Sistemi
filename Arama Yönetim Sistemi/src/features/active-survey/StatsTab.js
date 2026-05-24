/**
 * StatsTab.js — "İstatistikler / Filtreler" Sekmesi
 * Genel istatistikler, akordiyon filtreler ve yeni kişi ekleme.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Linking, Platform, Alert,
} from 'react-native';
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

export default function StatsTab() {
  const {
    project, total, done, selectFields, nameField,
    expandedFilter, setExpandedFilter,
    filterField, setFilterField,
    filterValue, setFilterValue,
    showAddContacts, setShowAddContacts,
    newPhoneText, setNewPhoneText,
    getFilteredContacts, handleAddContacts,
    jumpToContact,
  } = useSurvey();

  return (
    <ScrollView
      style={st.sv}
      contentContainerStyle={[st.svc, { paddingBottom: 150 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Genel İstatistik Kartları */}
      <View style={st.statsOverview}>
        <View style={st.statsCard}>
          <Text style={st.statsNum}>{total}</Text>
          <Text style={st.statsLbl}>Toplam</Text>
        </View>
        <View style={[st.statsCard, { borderColor: Colors.success }]}>
          <Text style={[st.statsNum, { color: Colors.success }]}>{done}</Text>
          <Text style={st.statsLbl}>Tamamlanan</Text>
        </View>
        <View style={[st.statsCard, { borderColor: Colors.warning }]}>
          <Text style={[st.statsNum, { color: Colors.warning }]}>{total - done}</Text>
          <Text style={st.statsLbl}>Kalan</Text>
        </View>
      </View>

      {/* Filtreleme Akordiyon */}
      {selectFields.length === 0 ? (
        <View style={st.emptyFilter}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🔍</Text>
          <Text style={st.emptyFilterT}>Hızlı Seçim alanı bulunamadı</Text>
          <Text style={st.emptyFilterS}>
            Filtreleme yapabilmek için projede "Hızlı Seçim" tipinde soru olmalıdır.
          </Text>
        </View>
      ) : (
        <>
          <Text style={st.filterTitle}>Filtrele</Text>
          {selectFields.map((field) => {
            const isOpen = expandedFilter === field.id;
            const counts = {};
            field.options.forEach(o => { counts[o] = 0; });
            project.contacts.forEach(c => {
              const v = c.data?.[field.id];
              if (v && counts[v] !== undefined) counts[v]++;
            });
            return (
              <View key={field.id} style={st.accCard}>
                <TouchableOpacity
                  style={st.accHeader}
                  onPress={() => {
                    setExpandedFilter(isOpen ? null : field.id);
                    if (!isOpen) { setFilterField(null); setFilterValue(null); }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={st.accTitle}>{field.label}</Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 14 }}>{isOpen ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {isOpen && (
                  <View style={st.accBody}>
                    <View style={st.filterOptRow}>
                      {field.options.map((opt, oi) => {
                        const clr = SEL_COLORS[oi % SEL_COLORS.length];
                        const isActive = filterField === field.id && filterValue === opt;
                        return (
                          <TouchableOpacity
                            key={oi}
                            style={[st.filterOptBtn, isActive && { backgroundColor: clr.active }]}
                            onPress={() => {
                              setFilterField(field.id);
                              setFilterValue(isActive ? null : opt);
                              if (isActive) setFilterField(null);
                            }}
                          >
                            <Text style={[st.filterOptCount, isActive && { color: '#FFFFFF' }]}>{counts[opt]}</Text>
                            <Text style={[st.filterOptText, isActive && { color: '#FFFFFF', fontWeight: '800' }]}>{opt}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Filtrelenmiş Kişi Listesi */}
                    {filterField === field.id && filterValue && (
                      <View style={st.filteredList}>
                        <Text style={st.filteredTitle}>"{filterValue}" — {getFilteredContacts().length} kişi</Text>
                        {getFilteredContacts().map((c) => {
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
                                  style={st.miniGoBtn}
                                  onPress={() => jumpToContact(c._idx)}
                                >
                                  <Text style={st.miniGoBtnT}>→ Git</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                        {getFilteredContacts().length === 0 && (
                          <Text style={st.noResult}>Bu filtreye uygun kişi yok.</Text>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      {/* ── Yeni Kişi Ekle ── */}
      <View style={st.addSection}>
        <TouchableOpacity
          style={st.addToggleBtn}
          onPress={() => setShowAddContacts(!showAddContacts)}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 18 }}>{showAddContacts ? '▲' : '＋'}</Text>
          <Text style={st.addToggleBtnT}>Projeye Yeni Kişi Ekle</Text>
        </TouchableOpacity>

        {showAddContacts && (
          <View style={st.addBody}>
            <TextInput
              style={st.addTextArea}
              placeholder={'İsim ve numaraları alt alta yapıştırın:\nEmre Bilir 5455175015\nAyşe Yılmaz 05321234567'}
              placeholderTextColor={Colors.textPlaceholder}
              multiline
              numberOfLines={5}
              value={newPhoneText}
              onChangeText={setNewPhoneText}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[st.addConfirmBtn, !newPhoneText.trim() && { backgroundColor: Colors.textMuted }]}
              activeOpacity={0.8}
              onPress={handleAddContacts}
            >
              <Text style={st.addConfirmBtnT}>Kişileri Ekle</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  sv: { flex: 1 },
  svc: { padding: 20 },
  statsOverview: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statsCard: { flex: 1, backgroundColor: Colors.bgCardHover, borderRadius: 20, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, padding: 16, alignItems: 'center', borderLeftWidth: 10, borderLeftColor: Colors.accent },
  statsNum: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  statsLbl: { fontSize: 11, color: Colors.textSecondary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  filterTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 2 },
  accCard: { backgroundColor: Colors.bgCardHover, borderRadius: 20, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, marginBottom: 10, borderLeftWidth: 10, borderLeftColor: Colors.info, overflow: 'hidden' },
  accHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  accTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, textTransform: 'uppercase', letterSpacing: 1 },
  accBody: { paddingHorizontal: 16, paddingBottom: 16 },
  filterOptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  filterOptBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#111', alignItems: 'center', minWidth: 80, marginBottom: 2 },
  filterOptCount: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  filterOptText: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, marginTop: 2, textTransform: 'uppercase' },
  filteredList: { marginTop: 4 },
  filteredTitle: { fontSize: 13, fontWeight: '800', color: Colors.accentLight, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  filteredItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.bgCardHover, borderRadius: 20, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 10, borderLeftColor: Colors.success },
  filteredLeft: { flex: 1, marginRight: 8 },
  filteredName: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 },
  filteredPhone: { fontSize: 13, color: Colors.textSecondary, letterSpacing: 0.3 },
  filteredActions: { flexDirection: 'row', gap: 6 },
  miniCallBtn: { backgroundColor: Colors.success, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12 },
  miniCallBtnT: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase' },
  miniGoBtn: { backgroundColor: '#111', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12 },
  miniGoBtnT: { fontSize: 12, fontWeight: '800', color: Colors.accentLight, textTransform: 'uppercase' },
  noResult: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 16, textTransform: 'uppercase' },
  emptyFilter: { alignItems: 'center', padding: 30 },
  emptyFilterT: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  emptyFilterS: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, textTransform: 'uppercase' },
  addSection: { marginTop: 24, borderTopWidth: 2, borderTopColor: Colors.bgCardHover, paddingTop: 20 },
  addToggleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.bgCardHover, borderRadius: 30, paddingVertical: 14, borderLeftWidth: 10, borderLeftColor: Colors.warning },
  addToggleBtnT: { fontSize: 15, fontWeight: '800', color: Colors.warning, textTransform: 'uppercase', letterSpacing: 1 },
  addBody: { marginTop: 12 },
  addTextArea: { backgroundColor: '#111', borderRadius: 20, padding: 14, fontSize: 14, color: Colors.textPrimary, borderLeftWidth: 10, borderLeftColor: Colors.accent, minHeight: 100, textAlignVertical: 'top' },
  addConfirmBtn: { marginTop: 10, backgroundColor: Colors.success, borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  addConfirmBtnT: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 1 },
});
