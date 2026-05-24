/**
 * HomeScreen - Ana Menü (Proje Yönetimi)
 * Daha önce oluşturulmuş projeleri listeler.
 * Her projede tarih ve ilerleme (aranan/toplam) gösterilir.
 * "Yeni Proje Oluştur" butonu ile proje oluşturma ekranına geçiş yapılır.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Animated,
  StatusBar,
  Platform,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '../theme/colors';
import { getAllProjects, deleteProject } from '../utils/storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeScreen({ navigation }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();

  // Ekrana her dönüldüğünde projeleri yeniden yükle
  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [])
  );

  const loadProjects = async () => {
    setLoading(true);
    const data = await getAllProjects();
    setProjects(data);
    setLoading(false);
  };

  const handleDeleteProject = (projectId, projectName) => {
    if (Platform.OS === 'web') {
      const ok = window.confirm(
        `"${projectName}" projesini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`
      );
      if (ok) {
        deleteProject(projectId).then(loadProjects);
      }
    } else {
      Alert.alert(
        'Projeyi Sil',
        `"${projectName}" projesini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
        [
          { text: 'İptal', style: 'cancel' },
          {
            text: 'Sil',
            style: 'destructive',
            onPress: async () => {
              await deleteProject(projectId);
              loadProjects();
            },
          },
        ]
      );
    }
  };

  const getCalledCount = (contacts) => {
    return contacts.filter((c) => c.completed).length;
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
    const calledCount = getCalledCount(item.contacts);
    const totalCount = item.contacts.length;
    const progressRatio = totalCount > 0 ? calledCount / totalCount : 0;
    const progressColor = getProgressColor(calledCount, totalCount);

    return (
      <TouchableOpacity
        style={styles.projectCard}
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate('Survey', {
            projectId: item.id,
            projectName: item.name,
          })
        }
        onLongPress={() => handleDeleteProject(item.id, item.name)}
      >
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

        <View style={styles.cardContent}>
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
        </View>

        {/* Sil butonu */}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDeleteProject(item.id, item.name)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={styles.emptyTitle}>Henüz proje yok</Text>
      <Text style={styles.emptySubtitle}>
        İlk projenizi oluşturarak başlayın
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
          <Image source={require('../../logo.png')} style={styles.headerLogo} />
          <View>
            <Text style={styles.headerTitle}>ARAMA YÖNETİMİ</Text>
            <Text style={styles.headerSubtitle}>SİSTEM PANELİ</Text>
          </View>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{projects.length}</Text>
          <Text style={styles.headerBadgeLabel}>proje</Text>
        </View>
      </View>

      {/* Proje Listesi */}
      <FlatList
        data={projects}
        renderItem={renderProjectCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          projects.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={!loading && renderEmptyState}
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
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
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
});
