import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { readAssignmentFile } from '../utils/assignmentFormat';
import { readResultFile } from '../utils/resultFormat';
import { getProjectSummaries, importVolunteerAssignment } from '../utils/storage';
import { reportError } from '../utils/diagnostics';
import { Colors } from '../theme/colors';

export default function IncomingFileScreen({ route, navigation }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    const open = async () => {
      let copy = null;
      try {
        const uri = route.params?.uri;
        if (Platform.OS !== 'android' || !/^(content|file):\/\//.test(uri || '')) {
          throw new Error('Gelen dosya açılamadı.');
        }
        if (uri.startsWith('content://')) {
          copy = `${FileSystem.cacheDirectory}gelen-${Date.now()}.ays`;
          await FileSystem.copyAsync({ from: uri, to: copy });
        }
        const content = await FileSystem.readAsStringAsync(copy || uri, { encoding: FileSystem.EncodingType.UTF8 });
        if (content.length > 30 * 1024 * 1024) throw new Error('Gelen dosya çok büyük.');
        let kind;
        try { kind = JSON.parse(content).kind; } catch { throw new Error('Gelen dosya geçerli bir görev veya sonuç paketi değil.'); }
        if (kind === 'assignment') {
          const parsed = await readAssignmentFile(content);
          const result = await importVolunteerAssignment(parsed.assignment, parsed.sha256);
          if (active) setState({ loading: false, kind, assignment: parsed.assignment, result });
        } else if (kind === 'result') {
          const packet = await readResultFile(content);
          const projects = await getProjectSummaries();
          const project = projects.find((item) => item.role !== 'volunteer' && item.eventId === packet.result.eventId);
          if (!project) throw new Error('Bu sonucun ait olduğu ana etkinlik cihazda bulunamadı.');
          if (active) setState({ loading: false, kind, packet, project });
        } else throw new Error('Bu dosya görev veya sonuç paketi değil.');
      } catch (error) {
        reportError(error, 'Gelen dosya açılırken');
        if (active) setState({ loading: false, error: error.message || 'Dosya açılamadı.' });
      } finally { if (copy) FileSystem.deleteAsync(copy, { idempotent: true }).catch(() => {}); }
    };
    open();
    return () => { active = false; };
  }, [route.params?.uri, route.params?.requestId]);
  return <View style={s.root}>
    {state.loading ? <ActivityIndicator color={Colors.accentLight} size="large" /> : state.error ? <>
      <Text style={s.title}>Dosya açılamadı</Text><Text style={s.help}>{state.error}</Text>
      <TouchableOpacity style={s.button} onPress={() => navigation.navigate('Home')}><Text style={s.buttonText}>Ana ekrana dön</Text></TouchableOpacity>
    </> : state.kind === 'assignment' ? <>
      <Text style={s.title}>Göreviniz hazır</Text>
      <Text style={s.help}>{state.assignment.eventName} · {state.assignment.contacts.length} kişi</Text>
      <Text style={s.note}>{state.result === 'already-present' ? 'Bu görev zaten kayıtlı; cevaplarınız korundu.' : 'Sorular ve kişiler otomatik kaydedildi.'}</Text>
      <TouchableOpacity style={s.button} onPress={() => navigation.replace('Survey', {
        projectId: state.assignment.assignmentId, projectName: state.assignment.eventName,
      })}><Text style={s.buttonText}>Aramaya başla →</Text></TouchableOpacity>
    </> : <>
      <Text style={s.title}>Sonuç dosyası geldi</Text>
      <Text style={s.help}>{state.project.name} · Sürüm {state.packet.result.revision}</Text>
      <TouchableOpacity style={s.button} onPress={() => navigation.replace('ResultsImport', {
        projectId: state.project.id, initialPacket: state.packet,
      })}><Text style={s.buttonText}>Sonucu incele →</Text></TouchableOpacity>
    </>}
  </View>;
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:Colors.bg,padding:24,justifyContent:'center'},
  title:{color:Colors.textPrimary,fontSize:26,fontWeight:'800',textAlign:'center'},
  help:{color:Colors.textSecondary,fontSize:15,lineHeight:22,textAlign:'center',marginTop:12},
  note:{color:Colors.success,fontSize:14,textAlign:'center',marginTop:14},
  button:{backgroundColor:Colors.accent,borderRadius:12,minHeight:52,alignItems:'center',justifyContent:'center',marginTop:30},
  buttonText:{color:'#fff',fontWeight:'800',fontSize:15},
});
