import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { getProject } from '../utils/storage';
import { shareExcel, saveExcel, shareCSV, saveCSV } from '../utils/exportUtils';

const msg = (title, m) => Platform.OS === 'web' ? window.alert(m) : Alert.alert(title, m);

export default function ExportScreen({ route }) {
  const { projectId, projectName } = route.params;
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // 'shareXlsx' | 'saveXlsx' | 'shareCsv' | 'saveCsv'
  const insets = useSafeAreaInsets();

  useEffect(() => { loadProject(); }, []);
  const loadProject = async () => { setProject(await getProject(projectId)); setLoading(false); };

  const doAction = async (fn, label, key) => {
    if (!project) return;
    setBusy(key);
    try {
      const result = await fn(project);
      if (result) msg('Başarılı ✅', `${label} işlemi tamamlandı!`);
    } catch (e) {
      msg('Hata', e.message);
    }
    setBusy(null);
  };

  if (loading || !project) return <View style={s.loadC}><ActivityIndicator size="large" color={Colors.accent}/></View>;

  const total = project.contacts.length;
  const completed = project.contacts.filter(c => c.completed).length;
  const fields = project.fields || [];

  const selectStats = fields.filter(f => f.type === 'select').map(field => {
    const counts = {};
    field.options.forEach(opt => { counts[opt] = 0; });
    project.contacts.forEach(c => { const v = c.data?.[field.id]; if (v && counts[v] !== undefined) counts[v]++; });
    return { field, counts };
  });

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: Math.max(40, insets.bottom + 20) }]} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={{fontSize:48,marginBottom:12}}>📊</Text>
          <Text style={s.headerTitle}>{projectName}</Text>
          <Text style={s.headerSub}>Dışa Aktarma & İstatistikler</Text>
        </View>

        {/* Genel İlerleme */}
        <View style={s.overviewRow}>
          <View style={s.overviewCard}><Text style={s.ovNum}>{total}</Text><Text style={s.ovLbl}>Toplam</Text></View>
          <View style={[s.overviewCard,{borderColor:Colors.success}]}><Text style={[s.ovNum,{color:Colors.success}]}>{completed}</Text><Text style={s.ovLbl}>Tamamlanan</Text></View>
          <View style={[s.overviewCard,{borderColor:Colors.warning}]}><Text style={[s.ovNum,{color:Colors.warning}]}>{total-completed}</Text><Text style={s.ovLbl}>Kalan</Text></View>
        </View>

        {/* Select İstatistikleri */}
        {selectStats.map(({ field, counts }) => (
          <View key={field.id} style={s.statSection}>
            <Text style={s.statSectionTitle}>{field.label}</Text>
            <View style={s.statGrid}>
              {Object.entries(counts).map(([opt, cnt]) => (
                <View key={opt} style={s.statChip}><Text style={s.statChipVal}>{cnt}</Text><Text style={s.statChipLbl}>{opt}</Text></View>
              ))}
            </View>
          </View>
        ))}

        {(total - completed) > 0 && (
          <View style={s.warningBox}><Text style={s.warningText}>⚠️ {total-completed} kişi henüz tamamlanmamış</Text></View>
        )}

        {/* ── EXCEL BÖLÜMÜ ── */}
        <Text style={s.secTitle}>📗 Excel (.xlsx)</Text>
        <View style={s.actionRow}>
          <TouchableOpacity style={[s.actionBtn, {backgroundColor:Colors.success}]} onPress={() => doAction(shareExcel, 'Excel paylaşma', 'shareXlsx')} disabled={!!busy} activeOpacity={0.8}>
            {busy==='shareXlsx' ? <ActivityIndicator color="#fff" size="small"/> : <><Text style={{fontSize:20}}>📤</Text><Text style={s.actionBtnT}>Paylaş</Text><Text style={s.actionBtnD}>WhatsApp, Mail vb.</Text></>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, {backgroundColor:'#2D6A4F'}]} onPress={() => doAction(saveExcel, 'Excel kaydetme', 'saveXlsx')} disabled={!!busy} activeOpacity={0.8}>
            {busy==='saveXlsx' ? <ActivityIndicator color="#fff" size="small"/> : <><Text style={{fontSize:20}}>💾</Text><Text style={s.actionBtnT}>Kaydet</Text><Text style={s.actionBtnD}>Dosya olarak kaydet</Text></>}
          </TouchableOpacity>
        </View>

        {/* ── CSV BÖLÜMÜ ── */}
        <Text style={[s.secTitle,{marginTop:20}]}>📄 CSV</Text>
        <View style={s.actionRow}>
          <TouchableOpacity style={[s.actionBtn, {backgroundColor:Colors.info}]} onPress={() => doAction(shareCSV, 'CSV paylaşma', 'shareCsv')} disabled={!!busy} activeOpacity={0.8}>
            {busy==='shareCsv' ? <ActivityIndicator color="#fff" size="small"/> : <><Text style={{fontSize:20}}>📤</Text><Text style={s.actionBtnT}>Paylaş</Text><Text style={s.actionBtnD}>WhatsApp, Mail vb.</Text></>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, {backgroundColor:'#1B4965'}]} onPress={() => doAction(saveCSV, 'CSV kaydetme', 'saveCsv')} disabled={!!busy} activeOpacity={0.8}>
            {busy==='saveCsv' ? <ActivityIndicator color="#fff" size="small"/> : <><Text style={{fontSize:20}}>💾</Text><Text style={s.actionBtnT}>Kaydet</Text><Text style={s.actionBtnD}>Dosya olarak kaydet</Text></>}
          </TouchableOpacity>
        </View>

        {/* Çıktı Formatı */}
        <View style={s.infoBox}>
          <Text style={s.infoTitle}>📋 Çıktı Formatı</Text>
          <Text style={s.infoText}>{(() => {
            const nameF = fields.find(f => f.isSystemField === 'name') || fields.find(f => f.type === 'text');
            const otherF = fields.filter(f => f !== nameF);
            const parts = [];
            if (nameF) parts.push(nameF.label);
            parts.push('Tel No');
            otherF.forEach(f => parts.push(f.label));
            return parts.join(' | ');
          })()}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:Colors.bg},
  loadC:{flex:1,backgroundColor:Colors.bg,alignItems:'center',justifyContent:'center'},
  content:{padding:20,paddingBottom:40},
  header:{alignItems:'center',marginBottom:28},
  headerTitle:{fontSize:22,fontWeight:'800',color:Colors.textPrimary,marginBottom:4,textTransform:'uppercase',letterSpacing:2},
  headerSub:{fontSize:12,color:Colors.textSecondary,textTransform:'uppercase',letterSpacing:1},
  overviewRow:{flexDirection:'row',gap:10,marginBottom:20},
  overviewCard:{flex:1,backgroundColor:Colors.bgCardHover,borderRadius:30,borderTopLeftRadius:10,borderBottomLeftRadius:10,padding:16,alignItems:'center',borderLeftWidth:10,borderLeftColor:Colors.accent},
  ovNum:{fontSize:28,fontWeight:'800',color:Colors.textPrimary,marginBottom:4},
  ovLbl:{fontSize:11,color:Colors.textSecondary,fontWeight:'800',textTransform:'uppercase',letterSpacing:1},
  statSection:{marginBottom:16},
  statSectionTitle:{fontSize:14,fontWeight:'800',color:Colors.textPrimary,marginBottom:8,textTransform:'uppercase',letterSpacing:1},
  statGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},
  statChip:{backgroundColor:'#111',borderRadius:20,paddingVertical:10,paddingHorizontal:14,borderLeftWidth:5,borderLeftColor:Colors.info,alignItems:'center',minWidth:70},
  statChipVal:{fontSize:20,fontWeight:'800',color:Colors.accentLight},
  statChipLbl:{fontSize:10,color:Colors.textSecondary,marginTop:2,textTransform:'uppercase',letterSpacing:0.5},
  warningBox:{backgroundColor:Colors.warningBg,borderRadius:20,borderTopLeftRadius:10,borderBottomLeftRadius:10,padding:14,marginBottom:24,borderLeftWidth:10,borderLeftColor:Colors.warning},
  warningText:{color:Colors.warning,fontSize:13,fontWeight:'800',textAlign:'center',textTransform:'uppercase',letterSpacing:1},
  secTitle:{fontSize:16,fontWeight:'800',color:Colors.textPrimary,marginBottom:10,textTransform:'uppercase',letterSpacing:1},
  // Action buttons
  actionRow:{flexDirection:'row',gap:10,marginBottom:8},
  actionBtn:{flex:1,borderRadius:30,borderTopLeftRadius:10,borderBottomLeftRadius:10,padding:16,alignItems:'center',justifyContent:'center',minHeight:90,borderLeftWidth:10,borderLeftColor:'rgba(0,0,0,0.3)'},
  actionBtnT:{fontSize:14,fontWeight:'800',color:'#FFFFFF',marginTop:6,textTransform:'uppercase',letterSpacing:1},
  actionBtnD:{fontSize:10,color:'rgba(255,255,255,0.6)',marginTop:2,textTransform:'uppercase'},
  infoBox:{backgroundColor:'#111',borderRadius:20,borderTopLeftRadius:10,borderBottomLeftRadius:10,padding:16,marginTop:20,borderLeftWidth:10,borderLeftColor:Colors.success},
  infoTitle:{fontSize:14,fontWeight:'800',color:Colors.textPrimary,marginBottom:8,textTransform:'uppercase',letterSpacing:1},
  infoText:{fontSize:12,color:Colors.textSecondary,textTransform:'uppercase',letterSpacing:0.5},
});
