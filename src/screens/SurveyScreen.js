/**
 * SurveyScreen.js — Navigasyon Kapsayıcısı (Shell)
 *
 * Bu dosya artık sadece:
 *  1. SurveyProvider (Context) ile tüm alt bileşenleri sarar
 *  2. Tab bar'ı render eder
 *  3. Aktif sekmeye göre doğru Tab bileşenini gösterir
 *  4. EditContactModal'ı her sekme için erişilebilir olarak yerleştirir
 *
 * Tüm iş mantığı → src/context/SurveyContext.js
 * Sekme UI'ları   → src/features/active-survey/
 * Modal          → src/components/shared/EditContactModal.js
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { Colors } from '../theme/colors';
import { SurveyProvider, useSurvey } from '../context/SurveyContext';
import SurveyTab from '../features/active-survey/SurveyTab';
import StatsTab from '../features/active-survey/StatsTab';
import SearchTab from '../features/active-survey/SearchTab';
import EditContactModal from '../components/shared/EditContactModal';

// ── İç bileşen (Context'e erişebilmek için Provider içinde olmalı) ──
function SurveyScreenInner() {
  const { loading, loadError, reloadProject, project, activeTab, setActiveTab, navigation } = useSurvey();

  if (loading) {
    return (
      <View style={st.loadC}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={st.loadT}>Yükleniyor...</Text>
      </View>
    );
  }

  if (!project) {
    return (
      <View style={st.errorContainer}>
        <Text style={st.errorTitle}>Proje açılamadı</Text>
        <Text style={st.errorMessage}>{loadError || 'Proje verileri yüklenemedi.'}</Text>
        <TouchableOpacity style={st.retryBtn} onPress={reloadProject}>
          <Text style={st.retryText}>Tekrar Dene</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.backBtn} onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')}>
          <Text style={st.backText}>Ana Ekrana Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={st.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* ── Üst Sekme Menüsü ── */}
      <View style={st.tabBar}>
        <TouchableOpacity
          style={[st.tabItem, activeTab === 'survey' && st.tabItemActive]}
          onPress={() => setActiveTab('survey')}
          activeOpacity={0.7}
        >
          <Text style={[st.tabIcon, activeTab === 'survey' && st.tabIconActive]}>📞</Text>
          <Text style={[st.tabText, activeTab === 'survey' && st.tabTextActive]}>Arama Yap</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[st.tabItem, activeTab === 'stats' && st.tabItemActive]}
          onPress={() => setActiveTab('stats')}
          activeOpacity={0.7}
        >
          <Text style={[st.tabIcon, activeTab === 'stats' && st.tabIconActive]}>📊</Text>
          <Text style={[st.tabText, activeTab === 'stats' && st.tabTextActive]}>İstatistikler</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[st.tabItem, activeTab === 'search' && st.tabItemActive]}
          onPress={() => setActiveTab('search')}
          activeOpacity={0.7}
        >
          <Text style={[st.tabIcon, activeTab === 'search' && st.tabIconActive]}>🔍</Text>
          <Text style={[st.tabText, activeTab === 'search' && st.tabTextActive]}>Kişiler</Text>
        </TouchableOpacity>
      </View>

      {/* ── Aktif Sekme İçeriği ── */}
      {activeTab === 'survey' && <SurveyTab />}
      {activeTab === 'stats' && <StatsTab />}
      {activeTab === 'search' && <SearchTab />}

      {/* ── Kişi Düzenleme Modalı (her sekme için erişilebilir) ── */}
      <EditContactModal />
    </KeyboardAvoidingView>
  );
}

// ── Dışa aktarılan ekran: Context Provider ile sarar ──
export default function SurveyScreen({ route, navigation }) {
  const { projectId, projectName } = route.params;
  return (
    <SurveyProvider projectId={projectId} projectName={projectName} navigation={navigation}>
      <SurveyScreenInner />
    </SurveyProvider>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  loadC: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  loadT: { color: Colors.textSecondary, marginTop: 12, fontSize: 15 },
  // Tab Bar
  tabBar: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4, minHeight: 62 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabIcon: { fontSize: 18, marginBottom: 3 },
  tabIconActive: {},
  tabText: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, textAlign: 'center' },
  tabTextActive: { color: Colors.accentLight, fontWeight: '700' },
  errorContainer: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 10 },
  errorMessage: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 24 },
  retryBtn: { width: '100%', maxWidth: 300, backgroundColor: Colors.accent, borderRadius: 24, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  retryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  backBtn: { width: '100%', maxWidth: 300, paddingVertical: 14, alignItems: 'center' },
  backText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
});
