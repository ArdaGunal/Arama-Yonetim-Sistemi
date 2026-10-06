/**
 * NewProjectScreen.js — Navigasyon Kapsayıcısı (Shell)
 *
 * Bu dosya artık sadece:
 *  1. Tüm state ve iş mantığını tutar (Step1 ve Step2 arasında paylaşılan)
 *  2. step değişkenine göre Step1Info veya Step2Builder'ı render eder
 *
 * UI detayları → src/features/new-project/Step1Info.js & Step2Builder.js
 */
import React, { useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { createProject } from '../utils/storage';
import { parsePastedText, parseExcelContacts } from '../utils/phoneUtils';
import Step1Info from '../features/new-project/Step1Info';
import Step2Builder from '../features/new-project/Step2Builder';

const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
const msg = (m) => Platform.OS === 'web' ? window.alert(m) : Alert.alert('Uyarı', m);

export default function NewProjectScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState('');
  const [activeTab, setActiveTab] = useState('text');
  const [phoneText, setPhoneText] = useState('');
  const [parsedNumbers, setParsedNumbers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importedFileName, setImportedFileName] = useState('');
  const [importedNames, setImportedNames] = useState({});
  const [rawExcelRows, setRawExcelRows] = useState([]);
  const [importedData, setImportedData] = useState({});
  const [expandedField, setExpandedField] = useState(null);

  // ── Varsayılan Şablon (isSystemField kilitli alanlar) ──
  const [fields, setFields] = useState([
    { id: 'default_isim', label: 'İsim Soyisim', type: 'text', options: [], isSystemField: 'name' },
    { id: 'default_numara', label: 'Numara', type: 'phone', options: [], isSystemField: 'phone' },
    { id: 'default_okul', label: 'Okul', type: 'select', options: ['Osmangazi', 'Eskişehir Teknik', 'Anadolu'] },
    { id: 'default_fakulte', label: 'Fakülte', type: 'text', options: [] },
    { id: 'default_bolum', label: 'Bölüm', type: 'text', options: [] },
    { id: 'default_rapor', label: 'Rapor', type: 'select', options: ['Katılıyor', 'Katılmıyor', 'Belki', 'Açmadı', 'Yanlış numara'] },
  ]);

  // ── Metin Ayrıştırma ──
  const handleParseText = () => {
    const results = parsePastedText(phoneText);
    if (results.length === 0) return;
    const nums = results.map(r => r.phone);
    const namesMap = {};
    const dataMap = {};
    const nameField = fields.find(f => f.isSystemField === 'name');
    for (const r of results) {
      if (r.name && nameField) {
        namesMap[r.phone] = r.name;
        dataMap[r.phone] = { [nameField.id]: r.name };
      }
    }
    setParsedNumbers(nums);
    setImportedNames(namesMap);
    setImportedData(dataMap);
    
    // O1: Metin eklendiğinde Excel verilerini temizle ki üzerine yazmasın
    setRawExcelRows([]);
    setImportedFileName('');
  };

  // ── Excel Import ──
  const handleImportExcel = async () => {
    try {
      if (!fields.some(f => f.isSystemField === 'phone')) {
        msg('Sistem alanı "Numara" bulunamadı.'); return;
      }
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file || !/\.(xlsx|xls|xlsm|csv|tsv)$/i.test(file.name || '')) {
        msg('Lütfen Excel (.xlsx, .xls, .xlsm) veya CSV/TSV dosyası seçin.');
        return;
      }
      setLoading(true);
      const isTextFile = /\.(csv|tsv)$/i.test(file.name || '');
      let data;
      let dataType = isTextFile ? 'string' : 'array';
      if (Platform.OS === 'web') {
        if (file.file) {
          data = isTextFile ? await file.file.text() : new Uint8Array(await file.file.arrayBuffer());
        } else {
          const resp = await fetch(file.uri);
          data = isTextFile ? await resp.text() : new Uint8Array(await resp.arrayBuffer());
        }
      } else {
        data = await FileSystem.readAsStringAsync(file.uri, {
          encoding: isTextFile ? FileSystem.EncodingType.UTF8 : FileSystem.EncodingType.Base64,
        });
        if (!isTextFile) dataType = 'base64';
      }
      const wb = XLSX.read(data, { type: dataType });
      const firstSheet = wb.Sheets[wb.SheetNames?.[0]];
      if (!firstSheet) throw new Error('Dosyada okunabilir bir sayfa bulunamadı.');
      const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
      
      if (!json || json.length === 0) {
        msg('Excel dosyası boş veya okunamadı.');
        setLoading(false);
        return;
      }
      
      setRawExcelRows(json);

      const imported = parseExcelContacts(json, fields);
      if (imported.phones.length === 0) {
        msg('Excel dosyasında geçerli bir telefon numarası bulunamadı. Sütunların doğruluğunu kontrol edin.');
      }

      setParsedNumbers(imported.phones);
      setImportedNames(imported.names);
      setImportedData(imported.data);
      setImportedFileName(file.name);
      setLoading(false);
    } catch (e) { setLoading(false); msg('Dosya okunamadı: ' + e.message); }
  };

  // ── Alan İşlemleri ──
  const addField = () => {
    const id = uid();
    setFields(prev => [...prev, { id, label: '', type: 'text', options: [] }]);
    setExpandedField(id);
  };
  const updateField = (id, key, val) => {
    setFields(prev => prev.map(f => {
      if (f.id !== id) return f;
      if (f.isSystemField && key === 'type') return f;
      return { ...f, [key]: val };
    }));
  };
  const removeField = (id) => {
    const field = fields.find(f => f.id === id);
    if (field?.isSystemField) { msg('Sistem alanları (İsim Soyisim ve Numara) silinemez.'); return; }
    setFields(prev => prev.filter(f => f.id !== id));
  };
  const addOption = (fieldId) => {
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, options: [...f.options, ''] } : f));
  };
  const updateOption = (fieldId, idx, val) => {
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, options: f.options.map((o, i) => i === idx ? val : o) } : f));
  };
  const removeOption = (fieldId, idx) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    const optionToRemove = field.options[idx];
    
    // Check if this option is already used in importedData
    const isUsed = Object.values(importedData).some(data => data[fieldId] === optionToRemove);
    if (isUsed) {
      if (Platform.OS === 'web') {
        if (!window.confirm(`"${optionToRemove}" seçeneği Excel'den aktarılan bazı kişilerde kullanılıyor! Yinede silmek istiyor musunuz? (Mevcut veriler korunacaktır)`)) return;
      } else {
        Alert.alert(
          'Uyarı',
          `"${optionToRemove}" seçeneği Excel'den aktarılan bazı kişilerde kullanılıyor! Yinede silmek istiyor musunuz? (Mevcut veriler korunacaktır)`,
          [
            { text: 'İptal', style: 'cancel' },
            { text: 'Sil', style: 'destructive', onPress: () => {
                setFields(prev => prev.map(f => f.id === fieldId ? { ...f, options: f.options.filter((_, i) => i !== idx) } : f));
              }
            }
          ]
        );
        return;
      }
    }
    
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, options: f.options.filter((_, i) => i !== idx) } : f));
  };

  // ── Adım Geçişi ──
  const goToStep2 = () => {
    if (!projectName.trim()) { msg('Lütfen projeye bir isim verin.'); return; }
    if (parsedNumbers.length === 0) { msg('Lütfen en az bir telefon numarası ekleyin.'); return; }
    setStep(2);
  };

  // ── Projeyi Kaydet ──
  const handleSave = async () => {
    const saveFields = fields.filter(f => f.label.trim() && f.isSystemField !== 'phone');
    if (saveFields.length === 0) { msg('Lütfen en az bir soru/alan ekleyin.'); return; }
    for (const f of saveFields) {
      if (f.type === 'select' && f.options.filter(o => o.trim()).length < 2) {
        msg(`"${f.label}" alanı için en az 2 seçenek gerekli.`); return;
      }
    }
    setLoading(true);

    // Excel ile son eşleştirmeyi final alanlara göre yap
    try {
      let finalImportedData = { ...importedData };
      if (rawExcelRows.length > 0) {
        finalImportedData = parseExcelContacts(rawExcelRows, fields).data;
      }

      const project = {
        id: uid(), name: projectName.trim(), createdAt: new Date().toISOString(), currentIndex: 0,
        fields: saveFields.map((f, i) => ({
          id: f.id, label: f.label.trim(), type: f.type,
          options: f.type === 'select' ? f.options.filter(o => o.trim()) : [],
          order: i,
          ...(f.isSystemField ? { isSystemField: f.isSystemField } : {}),
        })),
        contacts: parsedNumbers.map(phone => {
          const contactData = finalImportedData[phone] ? { ...finalImportedData[phone] } : {};
          return { id: uid(), phone, data: contactData, completed: false, completedAt: null };
        }),
      };
      await createProject(project);
      navigation.goBack();
    } catch (error) {
      msg('Proje kaydedilirken bir hata oluştu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 1 veya Step 2 Render ──
  if (step === 1) {
    return (
      <Step1Info
        projectName={projectName}
        setProjectName={setProjectName}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        phoneText={phoneText}
        setPhoneText={setPhoneText}
        parsedNumbers={parsedNumbers}
        setParsedNumbers={setParsedNumbers}
        importedNames={importedNames}
        setImportedNames={setImportedNames}
        importedFileName={importedFileName}
        loading={loading}
        handleParseText={handleParseText}
        handleImportExcel={handleImportExcel}
        goToStep2={goToStep2}
      />
    );
  }

  return (
    <Step2Builder
      fields={fields}
      expandedField={expandedField}
      setExpandedField={setExpandedField}
      parsedNumbers={parsedNumbers}
      loading={loading}
      updateField={updateField}
      removeField={removeField}
      addField={addField}
      addOption={addOption}
      updateOption={updateOption}
      removeOption={removeOption}
      setStep={setStep}
      handleSave={handleSave}
    />
  );
}
