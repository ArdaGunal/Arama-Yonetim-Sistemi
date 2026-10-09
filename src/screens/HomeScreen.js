/**
 * HomeScreen - Ana Menü (Proje Yönetimi)
 * Daha önce oluşturulmuş projeleri listeler.
 * Her projede tarih ve ilerleme (aranan/toplam) gösterilir.
 * "Yeni Proje Oluştur" butonu ile proje oluşturma ekranına geçiş yapılır.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Animated,
  Platform,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '../theme/colors';
import { getProjectSummaries, deleteProject, hasUnexportedVolunteerResult } from '../utils/storage';
import { saveEventBackup } from '../utils/automaticBackup';
import { reportError } from '../utils/diagnostics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const confirmAction = (title, message, confirmText) => new Promise((resolve) => {
  if (Platform.OS === 'web') {
    resolve(window.confirm(message));
  } else {
    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: false });
  }
});

const inform = (title, message) => Platform.OS === 'web'
  ? window.alert(`${title}\n${message}`) : Alert.alert(title, message);

export default function HomeScreen({ navigation, onDeveloperPanel }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const deletingRef = useRef(false);
  const [offline, setOffline] = useState(Platform.OS === 'web' && !navigator.onLine);
  const [updateReady, setUpdateReady] = useState(Platform.OS === 'web' && !!window.__aysUpdateReady);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const syncConnection = () => setOffline(!navigator.onLine);
    const showUpdate = () => setUpdateReady(true);
    window.addEventListener('online', syncConnection);
    window.addEventListener('offline', syncConnection);
    window.addEventListener('ays-update-ready', showUpdate);
    return () => {
      window.removeEventListener('online', syncConnection);
      window.removeEventListener('offline', syncConnection);
      window.removeEventListener('ays-update-ready', showUpdate);
    };
  }, []);

  // Ekrana her dönüldüğünde projeleri yeniden yükle
  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [])
  );

  const loadProjects = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setProjects(await getProjectSummaries());
    } catch (error) {
      reportError(error, 'Proje listesi yüklenirken');
      setLoadError(error.message || 'Projeler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId, projectName) => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeletingId(projectId);
    try {
      const proceed = await confirmAction('Projeyi sil',
        `"${projectName}" silinmeden önce .ays yedeği kaydedilecek. Devam edilsin mi?`, 'Yedek al');
      if (!proceed) return;
      const backup = await saveEventBackup(projectId, 'Silmeden-once');
      if (!backup.saved) {
        inform('Silme durduruldu', 'Yedek kaydedilemedi. Proje ve cevaplar cihazda duruyor.');
        return;
      }
      const confirmed = await confirmAction('Yedeği kontrol edin',
        `${backup.name} dosyasını Dosyalar/İndirilenler içinde gördünüz mü? Dosya yoksa silmeyin. Bu işlem geri alınamaz.`,
        'Yedeği kontrol ettim, sil');
      if (!confirmed) return;
      await deleteProject(projectId, backup.snapshot);
      await loadProjects();
      inform('Proje silindi', 'Yedek dosyasını saklayın; gerektiğinde Yedekler ekranından geri yükleyebilirsiniz.');
    } catch (error) {
      reportError(error, 'Proje silinmeden önce yedek alınırken');
      inform('Silme durduruldu', error.message || 'Proje silinemedi; mevcut veriler korunuyor.');
    } finally {
      deletingRef.current = false;
      setDeletingId(null);
    }
  };

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getProgressColor = (called, total) => {
    if (total === 0) return Colors.textMuted;
    const ratio = called / total;
    if (ratio >= 0.8) return Colors.success;
    if (ratio >= 0.4) return Colors.warning;
    return Colors.accent;
  };

  const renderProjectCard = ({ item }) => {
    const calledCount = item.completedContacts || 0;
    const totalCount = item.totalContacts || 0;
    const progressRatio = totalCount > 0 ? calledCount / totalCount : 0;
    const progressColor = getProgressColor(calledCount, totalCount);

    return (
      <View style={styles.projectCard}>
        {/* İlerleme çubuğu - Kartın üstünde */}
        <View style={styles.progressBarBg}>
          <Animated.View
            style={[
              styles.progressBarFill,
              {
                width: `${progressRatio * 100}%`,
                backgroundColor: progressColor,
              },
            ]}
          />
        </View>

        <TouchableOpacity style={styles.cardContent} activeOpacity={0.7}
          onPress={() => item.role !== 'volunteer' && item.assignments?.length
            ? navigation.navigate('Assignments', { projectId: item.id })
            : navigation.navigate('Survey', { projectId: item.id, projectName: item.name })}>
          <View style={styles.cardLeft}>
            <Text style={styles.projectName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.projectDate}>
              📅 {formatDate(item.createdAt)}
            </Text>
          </View>

          <View style={styles.cardRight}>
            <View style={styles.statBadge}>
              <Text style={[styles.statNumber, { color: progressColor }]}>
                {calledCount}
              </Text>
              <Text style={styles.statDivider}>/</Text>
              <Text style={styles.statTotal}>{totalCount}</Text>
            </View>
            <Text style={styles.statLabel}>kişi arandı</Text>
          </View>
        </TouchableOpacity>

        {item.role === 'volunteer' ? <>
          <Text style={styles.assignmentLabel}>Bana gelen görev · {totalCount} kişi</Text>
          {hasUnexportedVolunteerResult(item) &&
            <TouchableOpacity accessibilityRole="button" style={styles.resultReminder}
              onPress={() => navigation.navigate('Export', { projectId: item.id, projectName: item.name })}>
              <Text style={styles.resultReminderText}>Yeni cevaplar bekliyor · Sonuç dosyasını paylaş →</Text>
            </TouchableOpacity>}
        </> : <>
          <TouchableOpacity accessibilityRole="button" style={styles.formLink}
            onPress={() => navigation.navigate('Assignments', { projectId: item.id })}>
            <Text style={styles.formLinkText}>Görevleri dağıt →</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={styles.formLink}
            onPress={() => navigation.navigate('EditForm', { projectId: item.id })}>
            <Text style={styles.formLinkText}>{item.formLocked || calledCount > 0 ? 'Soruları düzenle / Yeni sürüm' : 'Soruları düzenle / Şablon'}</Text>
          </TouchableOpacity>
        </>}

        {/* Sil butonu */}
        <TouchableOpacity
          style={styles.deleteBtn}
          accessibilityRole="button"
          accessibilityLabel={`${item.name} projesini yedekleyip sil`}
          disabled={deletingId !== null}
          onPress={() => handleDeleteProject(item.id, item.name)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.deleteBtnText}>{deletingId === item.id ? '…' : '✕'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      {loadError ? (
        <>
          <Text style={styles.emptyTitle}>Projeler yüklenemedi</Text>
          <Text style={styles.emptySubtitle}>{loadError}</Text>
          <TouchableOpacity onPress={loadProjects} style={styles.retryBtn}>
            <Text style={styles.retryText}>Tekrar dene</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>Henüz proje yok</Text>
          <Text style={styles.emptySubtitle}>Görev dosyanız varsa yukarıdaki açma düğmesine basın.</Text>
        </>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" backgroundColor={Colors.bg} />

      {/* Header */}
      <View style={[styles.header, width < 380 && { paddingHorizontal: 16 }]}>
        <View style={styles.headerMain}>
          <View>
            <Text style={[styles.headerTitle, width < 420 && styles.headerTitleSmall]} numberOfLines={1}>{width < 420 ? 'ARAMA SİSTEMİ' : 'ARAMA YÖNETİMİ'}</Text>
            <Text style={styles.headerSubtitle}>SİSTEM PANELİ</Text>
          </View>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{projects.length}</Text>
          <Text style={styles.headerBadgeLabel}>proje</Text>
        </View>
      </View>

      <TouchableOpacity accessibilityRole="button" style={styles.diagnosticLink} onPress={onDeveloperPanel}>
        <Text style={styles.diagnosticText}>Tanılama ve hata raporu  ↗</Text>
      </TouchableOpacity>

      <TouchableOpacity accessibilityRole="button" style={styles.backupLink} onPress={() => navigation.navigate('Backup')}>
        <Text style={styles.backupText}>Yedek al veya geri yükle  ↗</Text>
      </TouchableOpacity>

      <TouchableOpacity accessibilityRole="button" style={styles.importLink} onPress={() => navigation.navigate('AssignmentImport')}>
        <Text style={styles.importText}>Bana gelen görev dosyasını aç →</Text>
      </TouchableOpacity>

      {Platform.OS === 'web' && <View style={styles.webNotice}>
        {offline && <Text style={styles.webNoticeText}>Çevrimdışısınız. Kayıtlı görevle devam edebilirsiniz.</Text>}
        {updateReady && <Text style={styles.webNoticeText}>Yeni sürüm hazır. Sonuç dosyanızı ve yedeğinizi kaydedip uygulamayı kapatın; yeniden açınca güncellenir.</Text>}
        <Text style={styles.webNoticeText}>iPhone: Safari'de Paylaş → Ana Ekrana Ekle. Cevaplar bu cihazda tutulur; çalışmayı bitirince sonuç dosyasını paylaşın ve yedek alın.</Text>
      </View>}

      {/* Proje Listesi */}
      <FlatList
        data={projects}
        renderItem={renderProjectCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          projects.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={loading
          ? <ActivityIndicator color={Colors.accent} size="large" />
          : renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

      {/* Yeni Proje Butonu */}
      <TouchableOpacity
        style={[styles.fab, { bottom: Math.max(24, insets.bottom + 16) }]}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('NewProject')}
      >
        <Text style={styles.fabIcon}>＋</Text>
        <Text style={styles.fabText}>Yeni Proje Oluştur</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  webNotice: { marginHorizontal: 20, marginBottom: 8, padding: 11, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.borderAccent, backgroundColor: Colors.bgCard },
  webNoticeText: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? 32 : 56,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerMain: { flex: 1, minWidth: 0, marginRight: 8 },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerTitleSmall: { fontSize: 19, letterSpacing: 0.5 },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.info,
    marginTop: 2,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  headerBadge: {
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  headerBadgeText: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.accent,
  },
  headerBadgeLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  projectCard: {
    backgroundColor: Colors.bgCardHover,
    borderRadius: 30,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    marginBottom: 12,
    borderLeftWidth: 16,
    borderLeftColor: Colors.accent,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarBg: {
    height: 3,
    backgroundColor: Colors.border,
  },
  progressBarFill: {
    height: 3,
    borderRadius: 2,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingRight: 44,
  },
  formLink: { borderTopWidth: 1, borderTopColor: Colors.border, paddingVertical: 11, paddingHorizontal: 16 },
  formLinkText: { color: Colors.accentLight, fontSize: 13, fontWeight: '700' },
  assignmentLabel: { color: Colors.success, borderTopWidth: 1, borderTopColor: Colors.border, paddingVertical: 11, paddingHorizontal: 16, fontSize: 13, fontWeight: '700' },
  resultReminder: { borderTopWidth: 1, borderTopColor: Colors.border, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: Colors.bgElevated },
  resultReminderText: { color: Colors.warning, fontSize: 13, fontWeight: '800' },
  cardLeft: {
    flex: 1,
    marginRight: 12,
  },
  projectName: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  projectDate: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  cardRight: {
    alignItems: 'center',
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
  },
  statDivider: {
    fontSize: 16,
    color: Colors.textMuted,
    marginHorizontal: 2,
  },
  statTotal: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  deleteBtn: {
    position: 'absolute',
    top: 14,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emptySubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  retryBtn: { marginTop: 16, backgroundColor: Colors.accent, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  fab: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: Colors.accent,
    borderRadius: 40,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: {
    fontSize: 20,
    color: '#FFFFFF',
    marginRight: 8,
    fontWeight: '800',
  },
  fabText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  diagnosticLink: { alignSelf: 'flex-end', paddingHorizontal: 22, paddingVertical: 12 },
  diagnosticText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  backupLink: { alignSelf: 'flex-end', paddingHorizontal: 22, paddingVertical: 10 },
  backupText: { color: Colors.accentLight, fontSize: 13, fontWeight: '800' },
  importLink: { marginHorizontal: 16, marginVertical: 10, backgroundColor: Colors.bgCard, borderColor: Colors.borderAccent, borderWidth: 1, borderRadius: 12, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  importText: { color: Colors.accentLight, fontSize: 14, fontWeight: '800' },
});
