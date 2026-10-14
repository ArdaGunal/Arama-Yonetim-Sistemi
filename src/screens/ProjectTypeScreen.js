import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import DetailedSurveyLink from '../features/surveys/DetailedSurveyLink';

const choices = [
  { mode: 'calls', title: 'Arama', detail: 'Kişi listesini ekle, aramaları ve görevleri yönet.' },
  { mode: 'survey', title: 'Anket', detail: 'Kişi listesi olmadan soruları hazırla ve yanıt topla.' },
];

export default function ProjectTypeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  return <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}>
    <Text style={s.title}>Ne oluşturmak istiyorsun?</Text>
    <Text style={s.help}>Bir seçenek seç. Sonraki ekranda adını ve sorularını hazırlayacaksın.</Text>
    {choices.map(({ mode, title, detail }) =>
      <TouchableOpacity key={mode} accessibilityRole="button" accessibilityLabel={`${title} projesi oluştur`}
        style={s.choice} onPress={() => navigation.navigate('NewProject', { mode })}>
        <View style={s.copy}>
          <Text style={s.choiceTitle}>{title}</Text>
          <Text style={s.choiceDetail}>{detail}</Text>
        </View>
        <Text style={s.arrow}>→</Text>
      </TouchableOpacity>)}
    <DetailedSurveyLink />
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 20, paddingTop: 32 },
  title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 8 },
  help: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 24 },
  choice: { minHeight: 110, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.borderAccent, borderRadius: 16, padding: 18, marginBottom: 14 },
  copy: { flex: 1 },
  choiceTitle: { color: Colors.textPrimary, fontSize: 21, fontWeight: '800', marginBottom: 6 },
  choiceDetail: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  arrow: { color: Colors.accentLight, fontSize: 28, fontWeight: '700', marginLeft: 10 },
});
