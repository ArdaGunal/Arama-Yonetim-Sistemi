import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { readResultFile } from '../utils/resultFormat';
import { createBackupFile } from '../utils/backupFormat';
import { applyImportedResults, getProjectForBackup, previewImportedResults } from '../utils/storage';
import { reportError } from '../utils/diagnostics';
import { Colors } from '../theme/colors';

const inform = (title, message) => Platform.OS === 'web' ? window.alert(`${title}\n${message}`) : Alert.alert(title, message);

export default function ResultsImportScreen({ route, navigation }) {
  const projectId = route.params.projectId;
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [backupReady, setBackupReady] = useState(false);
  useEffect(() => {
    if (!route.params?.initialPacket) return;
    previewImportedResults(projectId, [route.params.initialPacket])
      .then((result) => setPreview({ ...result, fileCount: 1, inputPackets: [route.params.initialPacket] }))
      .catch((error) => { reportError(error, 'Gelen sonuç önizlemesi'); inform('Sonuç açılamadı', error.message); });
  }, [route.params?.initialPacket, projectId]);
  const choose = async () => {
    if (busy) return;
    setBusy('choose'); setPreview(null); setDecisions({}); setBackupReady(false);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
      if (picked.canceled) return;
      const assets = picked.assets || [];
      if (!assets.length) return;
      const packets = [];
      for (const asset of assets) {
        if (!/\.ays(?:\.json)?$/i.test(asset.name || '') || asset.size > 30 * 1024 * 1024) {
          throw new Error(`${asset.name || 'Dosya'} sonuç paketi değil veya çok büyük.`);
        }
        const content = Platform.OS === 'web'
          ? asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text()
          : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
        packets.push(await readResultFile(content));
      }
      const result = await previewImportedResults(projectId, packets);
      setPreview({ ...result, fileCount: assets.length, inputPackets: packets });
    } catch (error) { reportError(error, 'Sonuç dosyaları incelenirken'); inform('Dosyalar açılamadı', error.message); }
    finally { setBusy(''); }
  };
  const saveBackup = async () => {
    if (busy || !preview) return;
    setBusy('backup');
    try {
      const project = await getProjectForBackup(projectId);
      const content = await createBackupFile(project);
      const name = `Birlesme-oncesi-${projectId.slice(0, 8)}-${Date.now()}.ays`;
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = name;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
        const SAF = FileSystem.StorageAccessFramework;
        const permission = await SAF.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;
        const uri = await SAF.createFileAsync(permission.directoryUri, name, 'application/json');
        await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
      } else {
        const uri = `${FileSystem.documentDirectory}${name}`;
        await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri,
          { mimeType: 'application/json', dialogTitle: 'Birleştirme öncesi yedeği sakla' });
      }
      setBackupReady(true);
    } catch (error) { reportError(error, 'Birleştirme öncesi yedek'); inform('Yedek alınamadı', error.message); }
    finally { setBusy(''); }
  };
  const apply = async () => {
    if (!preview || !backupReady || busy) return;
    setBusy('apply');
    try {
      const stats = await applyImportedResults(projectId, preview.inputPackets, decisions, preview.snapshot);
      setPreview(null); setBackupReady(false);
      inform('Sonuçlar işlendi', `${stats.changed + stats.conflicts} kayıt incelendi. ${stats.skipped} eski/tekrar dosya atlandı.`);
      if (route.params?.initialPacket) navigation.navigate('Home');
      else navigation.goBack();
    } catch (error) { reportError(error, 'Sonuçlar birleştirilirken'); inform('Birleştirilemedi', error.message); }
    finally { setBusy(''); }
  };
  const undecided = preview?.conflicts.filter((item) => !decisions[`${item.assignmentId}:${item.recordId}`]).length || 0;
  return <ScrollView style={s.root} contentContainerStyle={s.content}>
    <Text style={s.title}>Sonuçları topla</Text>
    <Text style={s.help}>Gönüllülerden gelen .ays sonuç dosyalarını birlikte seçin. Uygulama kimin cevabının değiştiğini önce gösterir.</Text>
    <TouchableOpacity accessibilityRole="button" style={s.primary} disabled={!!busy} onPress={choose}>
      {busy === 'choose' ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Sonuç dosyalarını seç</Text>}
    </TouchableOpacity>
    {preview && <>
      <View style={s.card}>
        <Text style={s.cardTitle}>{preview.fileCount} dosya incelendi</Text>
        <Text style={s.detail}>{preview.changes.length} doğrudan işlenebilir · {preview.conflicts.length} karar bekliyor · {preview.skipped.length} eski/tekrar</Text>
      </View>
      {preview.conflicts.map((item) => {
        const key = `${item.assignmentId}:${item.recordId}`;
        return <View key={key} style={s.card}>
          <Text style={s.cardTitle}>{item.name} · …{item.old.phone.slice(-4)}</Text>
          {item.differences.length ? item.differences.map((difference, index) => <View key={`${key}-${index}`}>
            <Text style={s.detail}>{difference.label}</Text>
            <Text style={s.detail}>Mevcut: {difference.old}</Text>
            <Text style={s.detail}>Gelen: {difference.incoming}</Text>
          </View>) : <Text style={s.detail}>Bu kişinin önceki kaydı ana listede farklı görünüyor.</Text>}
          <View style={s.row}>
            <TouchableOpacity accessibilityRole="button" style={[s.choice, decisions[key] === 'keep' && s.chosen]}
              onPress={() => setDecisions({ ...decisions, [key]: 'keep' })}><Text style={s.choiceText}>Mevcut kalsın</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={[s.choice, decisions[key] === 'incoming' && s.chosen]}
              onPress={() => setDecisions({ ...decisions, [key]: 'incoming' })}><Text style={s.choiceText}>Geleni al</Text></TouchableOpacity>
          </View>
        </View>;
      })}
      <TouchableOpacity accessibilityRole="button" style={s.secondary} disabled={!!busy} onPress={saveBackup}>
        <Text style={s.secondaryText}>{backupReady ? 'Yedek kaydedildi; yeniden kaydet' : 'Önce etkinlik yedeğini kaydet'}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={[s.primary, (!backupReady || undecided || busy) && s.disabled]}
        disabled={!backupReady || !!undecided || !!busy} onPress={apply}>
        <Text style={s.primaryText}>{undecided ? `${undecided} çakışma için karar verin` : 'Sonuçları birleştir'}</Text>
      </TouchableOpacity>
    </>}
  </ScrollView>;
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:Colors.bg},content:{padding:20,paddingBottom:60},
  title:{color:Colors.textPrimary,fontSize:26,fontWeight:'800'},help:{color:Colors.textSecondary,fontSize:14,lineHeight:21,marginTop:8,marginBottom:18},
  primary:{backgroundColor:Colors.accent,borderRadius:12,minHeight:52,alignItems:'center',justifyContent:'center',marginBottom:14},
  primaryText:{color:'#fff',fontWeight:'800',fontSize:15},disabled:{backgroundColor:Colors.textMuted},
  card:{backgroundColor:Colors.bgCard,borderColor:Colors.border,borderWidth:1,borderRadius:14,padding:16,marginBottom:12},
  cardTitle:{color:Colors.textPrimary,fontSize:17,fontWeight:'800'},detail:{color:Colors.textSecondary,fontSize:13,lineHeight:20,marginTop:8},
  row:{flexDirection:'row',gap:8,marginTop:14},choice:{flex:1,borderColor:Colors.borderAccent,borderWidth:1,borderRadius:9,padding:10},
  chosen:{backgroundColor:Colors.accentDark},choiceText:{color:Colors.textPrimary,fontWeight:'700',textAlign:'center',fontSize:12},
  secondary:{borderColor:Colors.warning,borderWidth:1,borderRadius:12,minHeight:49,alignItems:'center',justifyContent:'center',marginTop:9,marginBottom:12},
  secondaryText:{color:Colors.warning,fontWeight:'800',fontSize:14},
});
