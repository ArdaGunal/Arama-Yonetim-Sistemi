import React from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../theme/colors';

const SURVEY_SITE = 'https://anketplatformu.com/';

export default function DetailedSurveyLink() {
  const openSite = () => Linking.openURL(SURVEY_SITE).catch(() => {
    const message = 'Site açılamadı. Tarayıcınızda anketplatformu.com adresini açabilirsiniz.';
    if (Platform.OS === 'web') window.alert(message);
    else Alert.alert('Bağlantı açılamadı', message);
  });

  return <View style={s.card}>
    <Text style={s.eyebrow}>GELİŞTİRİCİNİN SİTESİ</Text>
    <Text style={s.title}>Detaylı anket mi lazım?</Text>
    <Text style={s.description}>Anket Platformu'nda hazırlayın. Buradaki anket ve cevaplar ayrı kalır.</Text>
    <TouchableOpacity accessibilityRole="link" accessibilityLabel="Anket Platformu sitesini aç"
      style={s.button} onPress={openSite}>
      <Text style={s.buttonText}>Anket Platformu'nu aç ↗</Text>
    </TouchableOpacity>
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderColor: Colors.border, borderWidth: 1,
    borderRadius: 16, padding: 18, marginTop: 6 },
  eyebrow: { color: Colors.accentLight, fontSize: 11, fontWeight: '800', marginBottom: 8 },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  description: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  button: { backgroundColor: Colors.accent, minHeight: 48, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
