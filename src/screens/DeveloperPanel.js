import React, { useState } from 'react';
import { Alert, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { clearDiagnostic, formatDiagnostic, getCurrentDiagnostic, reportError } from '../utils/diagnostics';

export default function DeveloperPanel({ report: initialReport, onBack }) {
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState(initialReport || getCurrentDiagnostic());
  const [sharing, setSharing] = useState(false);

  const shareReport = async () => {
    if (!report || sharing) return;
    setSharing(true);
    try {
      const body = formatDiagnostic(report);
      if (Platform.OS === 'web') {
        if (navigator.share) await navigator.share({ title: 'Arama Yönetimi hata raporu', text: body });
        else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(body);
          window.alert('Rapor panoya kopyalandı.');
        } else window.alert(body);
      } else if (await Sharing.isAvailableAsync()) {
        const uri = `${FileSystem.cacheDirectory}arama-yonetimi-hata-raporu.txt`;
        await FileSystem.writeAsStringAsync(uri, body, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(uri, { mimeType: 'text/plain', dialogTitle: 'Hata raporunu paylaş' });
      } else {
        await Share.share({ title: 'Arama Yönetimi hata raporu', message: body });
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        Alert.alert('Paylaşım başarısız', error?.message || 'Rapor paylaşılamadı.');
      }
    } finally {
      setSharing(false);
    }
  };

  const clearReport = async () => {
    try {
      await clearDiagnostic();
      setReport(null);
    } catch (error) {
      Alert.alert('Rapor temizlenemedi', error?.message || 'Lütfen yeniden deneyin.');
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topline} />
        <Text style={styles.eyebrow}>GELİŞTİRİCİ PANELİ</Text>
        <Text style={styles.title}>{report ? 'Bir sorun kaydedildi' : 'Tanılama merkezi'}</Text>
        <Text style={styles.intro}>
          {report
            ? 'Sorunun ayrıntıları aşağıda. Raporu paylaşarak çözmemize yardımcı olabilirsiniz.'
            : 'Henüz kayıtlı bir hata yok. Bir sorun yaşarsanız rapor burada görünür.'}
        </Text>
        {report ? (
          <>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: report.fatal ? Colors.danger : Colors.warning }]} />
              <Text style={styles.status}>{report.source}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>NEDEN</Text>
              <Text selectable style={styles.message}>{report.message}</Text>
              <Text style={styles.label}>ZAMAN</Text>
              <Text style={styles.value}>{report.time}</Text>
              <Text style={styles.label}>PLATFORM</Text>
              <Text style={styles.value}>{report.platform} {report.osVersion}</Text>
              <Text style={styles.label}>UYGULAMA SÜRÜMÜ</Text>
              <Text style={styles.value}>{report.appVersion || 'Bilinmiyor'}</Text>
            </View>
            <Text style={styles.privacy}>Rapor hata metni ve son işlem adımlarını içerir. Paylaşmadan önce içeriği gözden geçirin.</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={shareReport} disabled={sharing}>
              <Text style={styles.primaryText}>{sharing ? 'Paylaşım açılıyor…' : '↗  Raporu paylaş'}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.clearButton} onPress={clearReport}>
              <Text style={styles.clearText}>Bu raporu temizle</Text>
            </TouchableOpacity>
            <View style={[styles.card, { marginTop: 18 }]}>
              <Text style={styles.label}>TEKNİK AYRINTILAR VE SON İŞLEMLER</Text>
              <Text selectable style={styles.trace}>{formatDiagnostic(report)}</Text>
            </View>
          </>
        ) : null}
        <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={onBack}>
          <Text style={styles.secondaryText}>←  Uygulamaya dön</Text>
        </TouchableOpacity>
        {__DEV__ && !report ? (
          <TouchableOpacity style={styles.testButton} onPress={() => setReport(reportError(new Error('Tanılama testi'), 'Geliştirici testi'))}>
            <Text style={styles.testText}>Test raporu oluştur</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: 36 },
  topline: { width: 52, height: 5, borderRadius: 5, backgroundColor: Colors.accentLight, marginBottom: 25 },
  eyebrow: { color: Colors.accentLight, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: Colors.textPrimary, fontSize: 29, fontWeight: '800', marginTop: 8 },
  intro: { color: Colors.textSecondary, lineHeight: 23, fontSize: 15, marginTop: 12, marginBottom: 22 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 9 },
  status: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13, flex: 1 },
  card: { backgroundColor: Colors.bgCard, borderColor: Colors.border, borderWidth: 1, borderRadius: 19, padding: 18, marginBottom: 14 },
  label: { color: Colors.accentLight, fontSize: 10, letterSpacing: 1.5, fontWeight: '800', marginTop: 4, marginBottom: 9 },
  message: { color: Colors.textPrimary, fontSize: 17, lineHeight: 24, marginBottom: 18, fontWeight: '600' },
  value: { color: Colors.textSecondary, fontSize: 13, marginBottom: 13 },
  trace: { color: Colors.textSecondary, fontSize: 11, lineHeight: 17, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  privacy: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginVertical: 12 },
  primary: { backgroundColor: Colors.accent, minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  secondary: { borderColor: Colors.borderLight, borderWidth: 1, minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  secondaryText: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14 },
  testButton: { marginTop: 25, alignItems: 'center' },
  testText: { color: Colors.textMuted, fontSize: 12 },
  clearButton: { alignItems: 'center', paddingVertical: 15 },
  clearText: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
});
