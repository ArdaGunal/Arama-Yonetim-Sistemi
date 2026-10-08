import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';

export default function Step2Builder({ fields, expandedField, setExpandedField, selectedCount, loading,
  updateField, removeField, addField, addOption, updateOption, removeOption,
  setStep, handleSave, saveTemplate, shareTemplate, editing = false, locked = false, onBack }) {
  const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.step}>{editing ? 'Form düzenleme' : '3 / 3 · Soruları hazırla'}</Text>
      <Text style={s.title}>Hangi bilgileri soracağız?</Text>
      <Text style={s.intro}>{editing ? 'Soruları düzenleyin. Görev dağıtıldıysa kaydettiğiniz değişiklikler yeni form sürümüne uygulanır.' : 'İsim ve telefon hazır. Gerekli soruları ekleyin, sonra etkinliği oluşturun.'}</Text>
      <View style={s.notice}><Text style={s.noticeText}>{selectedCount} kişi {editing ? 'bu formu kullanıyor.' : 'eklenecek. Soruları aramaya başlamadan önce kontrol edin.'}</Text></View>
      {locked && <View style={s.versionNotice}><Text style={s.versionNoticeText}>Yeni görevler yeni formu kullanır. Eski görevler ve cevapları eski sürümde kalır. Değişen soruların önceki cevapları yeni soruya otomatik taşınmaz.</Text></View>}
      {fields.map((field, index) => {
        const phone = field.isSystemField === 'phone';
        const open = expandedField === field.id;
        return <View key={field.id} style={s.card}>
          <TouchableOpacity accessibilityRole="button" disabled={phone} style={s.head}
            onPress={() => setExpandedField(open ? null : field.id)}>
            <View style={s.number}><Text style={s.numberText}>{index + 1}</Text></View>
            <View style={s.headText}>
              <Text style={s.fieldTitle}>{field.label || 'Yeni soru'}</Text>
              <Text style={s.caption}>{phone ? 'Telefon · otomatik' : `${field.type === 'select' ? 'Şıklı soru' : 'Yazılı cevap'} · ${field.isSystemField === 'name' || field.required ? 'zorunlu' : 'isteğe bağlı'}`}</Text>
            </View>
            {!phone && <Text style={s.chevron}>{open ? '▲' : '▼'}</Text>}
          </TouchableOpacity>
          {open && !phone && <View style={s.body}>
            <Text style={s.label}>Soru veya sütun adı</Text>
            <TextInput style={s.input} value={field.label} onChangeText={(value) => updateField(field.id, 'label', value)}
              placeholder="Örn. Geliyor musun?" placeholderTextColor={Colors.textPlaceholder} />
            {!field.isSystemField && <>
              <Text style={s.label}>Cevap şekli</Text>
              <View style={s.row}>
                {[['text', 'Yazılı cevap'], ['select', 'Şık seçimi']].map(([type, label]) =>
                  <TouchableOpacity accessibilityRole="button" key={type} onPress={() => updateField(field.id, 'type', type)}
                    style={[s.type, field.type === type && s.typeActive]}>
                    <Text style={[s.typeText, field.type === type && s.typeTextActive]}>{label}</Text>
                  </TouchableOpacity>)}
              </View>
              <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: !!field.required }}
                style={s.requiredRow} onPress={() => updateField(field.id, 'required', !field.required)}>
                <Text style={s.requiredMark}>{field.required ? '☑' : '□'}</Text>
                <View style={s.requiredText}><Text style={s.requiredTitle}>Cevap zorunlu</Text>
                  <Text style={s.requiredHelp}>Görüşüldü seçilirse boş bırakılamaz.</Text></View>
              </TouchableOpacity>
            </>}
            {field.type === 'select' && <>
              <Text style={s.label}>Şıklar</Text>
              {field.options.map((option, optionIndex) => <View key={optionIndex} style={s.optionRow}>
                <TextInput style={[s.input, s.optionInput]} value={option} placeholder={`Şık ${optionIndex + 1}`}
                  placeholderTextColor={Colors.textPlaceholder} onChangeText={(value) => updateOption(field.id, optionIndex, value)} />
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Şıkkı sil" style={s.removeOption}
                  onPress={() => removeOption(field.id, optionIndex)}><Text style={s.removeText}>×</Text></TouchableOpacity>
              </View>)}
              <TouchableOpacity accessibilityRole="button" style={s.secondary} onPress={() => addOption(field.id)}>
                <Text style={s.secondaryText}>+ Şık ekle</Text>
              </TouchableOpacity>
            </>}
            {!field.isSystemField && <TouchableOpacity accessibilityRole="button" style={s.delete} onPress={() => removeField(field.id)}>
              <Text style={s.deleteText}>Bu soruyu sil</Text>
            </TouchableOpacity>}
          </View>}
        </View>;
      })}
      <TouchableOpacity accessibilityRole="button" style={s.add} onPress={addField}><Text style={s.addText}>+ Soru ekle</Text></TouchableOpacity>
      <View style={s.template}>
        <Text style={s.templateTitle}>Aynı soruları başkaları da mı kullanacak?</Text>
        <Text style={s.templateHelp}>Şablonu kaydedin veya WhatsApp gibi bir uygulamayla paylaşın. Kişi ve cevaplar şablona eklenmez.</Text>
        <View style={s.row}>
          <TouchableOpacity accessibilityRole="button" style={[s.secondary, s.flex]} onPress={saveTemplate}><Text style={s.secondaryText}>Şablonu kaydet</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={[s.secondary, s.flex]} onPress={shareTemplate}><Text style={s.secondaryText}>Paylaş</Text></TouchableOpacity>
        </View>
      </View>
    </ScrollView>
    <View style={[s.bottom, { paddingBottom: Math.max(14, insets.bottom + 8) }]}>
      <TouchableOpacity accessibilityRole="button" style={s.back} onPress={onBack || (() => setStep(2))}><Text style={s.backText}>← Geri</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={s.save} disabled={loading} onPress={handleSave}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>{editing ? 'Değişiklikleri kaydet' : 'Etkinliği oluştur'}</Text>}
      </TouchableOpacity>
    </View>
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg }, content: { padding: 18, paddingTop: 24, paddingBottom: 120 },
  step: { color: Colors.accentLight, fontSize: 13, fontWeight: '800', marginBottom: 8 },
  title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 8 },
  intro: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 17 },
  notice: { backgroundColor: Colors.infoBg, padding: 13, borderRadius: 12, marginBottom: 17 },
  noticeText: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19 },
  versionNotice: { backgroundColor: Colors.warningBg, padding: 13, borderRadius: 12, marginBottom: 17 },
  versionNoticeText: { color: Colors.warning, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 15, marginBottom: 10, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', padding: 15, minHeight: 66 },
  number: { width: 29, height: 29, borderRadius: 15, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center', marginRight: 11 },
  numberText: { color: '#fff', fontWeight: '800', fontSize: 13 }, headText: { flex: 1 },
  fieldTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800' },
  caption: { color: Colors.textSecondary, fontSize: 12, marginTop: 3 }, chevron: { color: Colors.textSecondary },
  body: { padding: 15, borderTopWidth: 1, borderTopColor: Colors.border },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 7, marginTop: 8 },
  input: { color: Colors.textPrimary, backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  row: { flexDirection: 'row', gap: 8 }, type: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: Colors.bgInput, alignItems: 'center' },
  typeActive: { backgroundColor: Colors.accent }, typeText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  typeTextActive: { color: '#fff' }, optionRow: { flexDirection: 'row', gap: 8, marginBottom: 8 }, optionInput: { flex: 1 },
  requiredRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, marginTop: 10 },
  requiredMark: { color: Colors.accentLight, fontSize: 26, marginRight: 10 }, requiredText: { flex: 1 },
  requiredTitle: { color: Colors.textPrimary, fontWeight: '800', fontSize: 14 },
  requiredHelp: { color: Colors.textSecondary, fontSize: 12, marginTop: 3 },
  removeOption: { width: 42, borderRadius: 10, backgroundColor: Colors.danger, justifyContent: 'center', alignItems: 'center' },
  removeText: { color: '#fff', fontSize: 23 }, secondary: { backgroundColor: Colors.bgInput, borderRadius: 10, padding: 12, alignItems: 'center' },
  secondaryText: { color: Colors.accentLight, fontSize: 13, fontWeight: '800' }, delete: { alignSelf: 'flex-start', marginTop: 18, padding: 5 },
  deleteText: { color: Colors.danger, fontSize: 13, fontWeight: '700' }, add: { backgroundColor: Colors.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginVertical: 8 },
  addText: { color: '#fff', fontSize: 15, fontWeight: '800' }, template: { backgroundColor: Colors.bgCard, borderRadius: 15, padding: 16, marginTop: 13 },
  templateTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800' }, templateHelp: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, marginVertical: 8 }, flex: { flex: 1 },
  bottom: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  back: { paddingHorizontal: 16, minHeight: 48, justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.bgCard },
  backText: { color: Colors.textPrimary, fontWeight: '700' }, save: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: Colors.success },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
