import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getProjectSummaries } from '../utils/storage';
import { listIncomingSurveyResponses, readIncomingSurveyResponse } from '../utils/incomingResultStore';
import { reportError } from '../utils/diagnostics';
import { Colors } from '../theme/colors';

export default function SurveyInboxScreen({ navigation }) {
  const [entries, setEntries] = useState(null);
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([listIncomingSurveyResponses(), getProjectSummaries()])
      .then(([files, items]) => {
        if (active) { setEntries(files); setProjects(items); setError(''); }
      }).catch((reason) => {
        reportError(reason, 'Gelen anket cevapları açılırken');
        if (active) setError(reason.message || 'Gelen dosyalar açılamadı.');
      });
    return () => { active = false; };
  }, []));

  const open = async (entry) => {
    if (busy) return;
    setBusy(entry.digest); setError('');
    try {
      const { packet } = await readIncomingSurveyResponse(entry.digest);
      const project = projects.find((item) => item.mode === 'survey' && item.role !== 'volunteer' &&
        item.eventId === packet.result.eventId);
      if (!project) throw new Error('Ana anket bu cihazda yok. Önce anket yedeğini geri yükleyin. Gelen cevap dosyası burada saklanıyor.');
      navigation.navigate('SurveyTransfer', { projectId: project.id, initialPacket: packet });
    } catch (reason) {
      reportError(reason, 'Gelen anket cevabı açılırken');
      setError(reason.message || 'Dosya açılamadı.');
    } finally { setBusy(''); }
  };

  return <ScrollView style={s.root} contentContainerStyle={s.content}>
    <Text style={s.title}>Gelen anket cevapları</Text>
    <Text style={s.help}>WhatsApp'tan veya dosyadan açılan cevaplar burada saklanır. Ana anketi seçip cevapları inceleyin.</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!entries && !error && <ActivityIndicator color={Colors.accent} />}
    {entries?.length === 0 && <Text style={s.help}>Henüz gelen anket cevabı yok.</Text>}
    {entries?.map((entry) => <View key={entry.digest} style={s.card}>
      <Text style={s.name}>{entry.eventName}</Text>
      <Text style={s.detail}>{entry.count} cevap · Dosya {entry.revision} · {entry.processed ? 'Birleştirildi' : 'İncelenmeyi bekliyor'}</Text>
      <Text style={s.detail}>{new Date(entry.receivedAt).toLocaleString('tr-TR')}</Text>
      <TouchableOpacity accessibilityRole="button" style={s.button} disabled={!!busy} onPress={() => open(entry)}>
        <Text style={s.buttonText}>{busy === entry.digest ? 'Açılıyor…' : 'Cevapları incele →'}</Text>
      </TouchableOpacity>
    </View>)}
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg }, content: { padding: 20, paddingBottom: 60 },
  title: { color: Colors.textPrimary, fontSize: 25, fontWeight: '800' },
  help: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 16 },
  error: { color: Colors.warning, fontSize: 14, marginBottom: 14 },
  card: { backgroundColor: Colors.bgCard, borderColor: Colors.border, borderWidth: 1,
    borderRadius: 14, padding: 17, marginBottom: 12 },
  name: { color: Colors.textPrimary, fontSize: 17, fontWeight: '800' },
  detail: { color: Colors.textSecondary, fontSize: 13, marginTop: 5 },
  button: { minHeight: 46, justifyContent: 'center', marginTop: 9 },
  buttonText: { color: Colors.accentLight, fontSize: 14, fontWeight: '800' },
});
