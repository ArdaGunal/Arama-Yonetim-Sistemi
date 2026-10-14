import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../theme/colors';

export default function DuplicateProjectPrompt({ name, loading, onRename, onCreate }) {
  return <Modal visible={!!name} transparent animationType="fade" onRequestClose={loading ? undefined : onRename}>
    <View style={s.overlay}>
      <View style={s.card}>
        <Text style={s.title}>Bu adda proje var</Text>
        <Text style={s.message}>
          “{name}” adında bir proje zaten var. Yeni proje ayrı kaydedilir; mevcut proje değişmez.
        </Text>
        <TouchableOpacity accessibilityRole="button" style={s.rename} onPress={onRename} disabled={loading}>
          <Text style={s.renameText}>Adı değiştir</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={s.create} onPress={onCreate} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.createText}>Yine de oluştur</Text>}
        </TouchableOpacity>
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.72)', alignItems: 'center',
    justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, backgroundColor: Colors.bgCard, borderColor: Colors.borderAccent,
    borderWidth: 1, borderRadius: 18, padding: 22 },
  title: { color: Colors.textPrimary, fontSize: 22, fontWeight: '800', marginBottom: 10 },
  message: { color: Colors.textSecondary, fontSize: 16, lineHeight: 24, marginBottom: 22 },
  rename: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 11,
    backgroundColor: Colors.bgElevated, marginBottom: 10 },
  renameText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },
  create: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 11,
    backgroundColor: Colors.accent },
  createText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
