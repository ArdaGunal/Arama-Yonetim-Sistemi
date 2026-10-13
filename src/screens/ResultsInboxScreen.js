import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getProjectSummaries } from '../utils/storage';
import { listIncomingResults, readIncomingResult, removeIncomingResult } from '../utils/incomingResultStore';
import { reportError } from '../utils/diagnostics';
import { Colors } from '../theme/colors';

const inform = (message) => Platform.OS === 'web' ? window.alert(message) : Alert.alert('Gelen sonuç', message);

export default function ResultsInboxScreen({ navigation }) {
  const [entries, setEntries] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    listIncomingResults().then((items) => { if (active) { setEntries(items); setError(''); } })
      .catch((reason) => { reportError(reason, 'Gelen kutusu açılırken'); if (active) setError(reason.message); });
    return () => { active = false; };
  }, []));
  const open = async (entry) => {
    if (busy) return;
    setBusy(entry.digest);
    try {
      const { packet } = await readIncomingResult(entry.digest);
      const projects = await getProjectSummaries();
      const project = projects.find((item) => item.role !== 'volunteer' && item.eventId === packet.result.eventId);
      if (!project) throw new Error('Ana etkinlik bu cihazda yok. Önce etkinlik yedeğini geri yükleyin. Dosya gelen kutusunda saklanıyor.');
      navigation.navigate('ResultsImport', { projectId: project.id, initialPacket: packet,
        inboxDigests: [entry.digest] });
    } catch (reason) { reportError(reason, 'Gelen sonuç açılırken'); inform(reason.message); }
    finally { setBusy(''); }
  };
  const remove = (entry) => {
    const proceed = async () => {
      setBusy(entry.digest);
      try {
        await removeIncomingResult(entry.digest);
        setEntries(await listIncomingResults());
      } catch (reason) { reportError(reason, 'Gelen sonuç silinirken'); inform(reason.message); }
      finally { setBusy(''); }
    };
    const message = 'Bu dosya gelen kutusundan silinecek. Dışarıdaki .ays kopyası varsa korunur.';
    if (Platform.OS === 'web') { if (window.confirm(message)) proceed(); }
    else Alert.alert('Gelen sonucu sil', message, [{ text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: proceed }]);
  };
  return <ScrollView style={s.root} contentContainerStyle={s.content}>
    <Text style={s.title}>Gelen sonuçlar</Text>
    <Text style={s.help}>WhatsApp'tan açılan sonuçlar burada saklanır. Birleştirilmemiş dosyayı seçin.</Text>
    {!!error && <Text style={s.error}>{error}</Text>}
    {!entries && !error && <ActivityIndicator color={Colors.accent} />}
    {entries?.length === 0 && <Text style={s.help}>Henüz gelen sonuç yok.</Text>}
    {entries?.map((entry) => <View key={entry.digest} style={s.card}>
      <Text style={s.cardTitle}>{entry.eventName}</Text>
      <Text style={s.cardText}>{entry.processed ? 'İşlendi' : 'İncelenmeyi bekliyor'} · Sürüm {entry.revision}</Text>
      <Text style={s.cardText}>{new Date(entry.receivedAt).toLocaleString('tr-TR')}</Text>
      <View style={s.actions}>
        <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={() => open(entry)}>
          <Text style={s.link}>{busy === entry.digest ? 'İşleniyor…' : 'Sonucu incele →'}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={() => remove(entry)}>
          <Text style={s.delete}>Sil</Text>
        </TouchableOpacity>
      </View>
    </View>)}
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg }, content: { padding: 20, paddingBottom: 60 },
  title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '800' },
  help: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  error: { color: Colors.warning, fontSize: 14 },
  card: { backgroundColor: Colors.bgCard, borderColor: Colors.border, borderWidth: 1,
    borderRadius: 14, padding: 17, marginBottom: 12 },
  cardTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '800' },
  cardText: { color: Colors.textSecondary, fontSize: 13, marginTop: 5 },
  link: { color: Colors.accentLight, fontSize: 14, fontWeight: '800', marginTop: 13 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  delete: { color: Colors.textSecondary, fontSize: 13, marginTop: 13, paddingHorizontal: 10 },
});
