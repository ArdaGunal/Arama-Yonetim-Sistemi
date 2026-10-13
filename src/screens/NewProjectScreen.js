import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { createProject, getTemplates, saveTemplate } from '../utils/storage';
import { reportError } from '../utils/diagnostics';
import { analyzeSource, prepareSource, selectSourceRows, setColumnRole, textToRows } from '../utils/sourcePreview';
import { normalizeString } from '../utils/phoneUtils';
import { createTemplateFile, readTemplateFile, TEMPLATE_EXTENSION } from '../utils/templateFormat';
import { captureSourceWorkbook, MAX_SOURCE_BYTES } from '../utils/sourceWorkbookArchive';
import { alignSourceFields, importedContactName, resolveDuplicateSelections, withAnswerType } from '../utils/newProjectFields';
import { getAppSettings, saveAppSettings } from '../utils/appSettings';
import Step1Info from '../features/new-project/Step1Info';
import Step2Review from '../features/new-project/Step2Review';
import { Colors } from '../theme/colors';

const systemFields = [
  { id: 'default_isim', label: 'İsim Soyisim', type: 'text', options: [], required: true, isSystemField: 'name' },
  { id: 'default_numara', label: 'Telefon', type: 'phone', options: [], isSystemField: 'phone' },
];
const notify = (message) => Platform.OS === 'web' ? window.alert(message) : Alert.alert('Bilgi', message);

function downloadWeb(content, name) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function NewProjectScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState('');
  const [activeTab, setActiveTab] = useState('text');
  const [phoneText, setPhoneText] = useState('');
  const [surveyOnly, setSurveyOnly] = useState(false);
  const [rawRows, setRawRows] = useState([]);
  const [originalWorkbook, setOriginalWorkbook] = useState(null);
  const [source, setSource] = useState(null);
  const [selections, setSelections] = useState({});
  const [fields, setFields] = useState(systemFields);
  const [sourceFieldIds, setSourceFieldIds] = useState({});
  const [templateSourceColumns, setTemplateSourceColumns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  const [pasteMode, setPasteMode] = useState('name-phone');
  const [presetReady, setPresetReady] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(false);
  const analysis = useMemo(() => source ? analyzeSource(source) : null, [source]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getTemplates(), getAppSettings()]).then(([templatesResult, settingsResult]) => {
      if (!active) return;
      if (templatesResult.status === 'rejected') reportError(templatesResult.reason, 'Şablonlar yüklenirken');
      if (settingsResult.status === 'rejected') reportError(settingsResult.reason, 'Varsayılan ayarlar yüklenirken');
      const savedTemplates = templatesResult.status === 'fulfilled' ? templatesResult.value : [];
      const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null;
      setTemplates(savedTemplates);
      if (settings) setPasteMode(settings.pasteMode);
      const selected = savedTemplates.find((item) => item.id === settings?.defaultTemplateId);
      if (selected) {
        setFields(selected.fields.map((field) => ({ ...field, options: [...field.options] })));
        if (selected.mode === 'survey') setSurveyOnly(true);
        setTemplateId(selected.id);
        setTemplateSourceColumns(selected.sourceColumns || []);
      }
      setPresetReady(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => { setSaveError(''); }, [source, selections, fields]);

  const prepareWithTemplate = (rows, name, headerOverride) => {
    let prepared = prepareSource(rows, name, headerOverride);
    const activeTemplate = templates.find((item) => item.id === templateId);
    if (activeTemplate?.sourceColumns?.length) {
      const used = new Set();
      prepared = { ...prepared, columns: prepared.columns.map((column) => {
        const match = activeTemplate.sourceColumns.find((item, index) => !used.has(index) &&
          normalizeString(item.label) === normalizeString(column.label));
        if (!match) return column;
        const index = activeTemplate.sourceColumns.indexOf(match);
        used.add(index);
        return { ...column, role: match.role };
      }) };
      // Farklı başlıklı dosyalarda yanlışlıkla iki telefon/isim seçilmesin.
      if (prepared.columns.filter((column) => column.role === 'phone').length !== 1 ||
          prepared.columns.filter((column) => column.role === 'name').length > 1) {
        prepared = prepareSource(rows, name, headerOverride);
      }
    }
    return prepared;
  };

  const useRows = (rows, name, workbookArchive = null) => {
    const prepared = prepareWithTemplate(rows, name);
    setRawRows(rows);
    setOriginalWorkbook(workbookArchive);
    setSource(prepared);
    setSelections({});
    const aligned = alignSourceFields(prepared, fields.filter((field) =>
      field.importColumn === undefined), templateSourceColumns, Crypto.randomUUID);
    setFields(aligned.fields);
    setSourceFieldIds(aligned.mapping);
    setStep(2);
  };

  const parseText = () => {
    try {
      if (!projectName.trim()) throw new Error('Önce etkinliğe bir ad verin.');
      const rows = textToRows(phoneText, pasteMode);
      const prepared = prepareWithTemplate(rows, 'Yapıştırılan liste', pasteMode === 'header-table');
      setRawRows(rows);
      setOriginalWorkbook(null);
      setSource(prepared);
      setSelections({});
      const aligned = alignSourceFields(prepared, fields.filter((field) =>
        field.importColumn === undefined), templateSourceColumns, Crypto.randomUUID);
      setFields(aligned.fields);
      setSourceFieldIds(aligned.mapping);
      setStep(2);
    } catch (error) { notify(error.message); }
  };

  const importFile = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (!projectName.trim()) throw new Error('Önce etkinliğe bir ad verin.');
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file || !/\.(xlsx|xls|xlsm|csv|tsv)$/i.test(file.name || '')) {
        throw new Error('Excel, CSV veya TSV dosyası seçin.');
      }
      const isText = /\.(csv|tsv)$/i.test(file.name);
      if (!isText && file.size > MAX_SOURCE_BYTES) {
        throw new Error('Excel dosyası 8 MB sınırını aşıyor. Orijinali ayrıca saklayıp daha küçük bir dosya seçin.');
      }
      let data;
      let type = isText ? 'string' : 'array';
      if (Platform.OS === 'web') {
        data = file.file ? (isText ? await file.file.text() : new Uint8Array(await file.file.arrayBuffer()))
          : isText ? await (await fetch(file.uri)).text() : new Uint8Array(await (await fetch(file.uri)).arrayBuffer());
      } else {
        data = await FileSystem.readAsStringAsync(file.uri, { encoding: isText ? FileSystem.EncodingType.UTF8 : FileSystem.EncodingType.Base64 });
        if (!isText) type = 'base64';
      }
      const workbook = XLSX.read(data, { type });
      const firstSheet = workbook.Sheets[workbook.SheetNames?.[0]];
      if (!firstSheet) throw new Error('Dosyada okunabilir sayfa yok.');
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false });
      const archive = isText ? null : await captureSourceWorkbook(file.name, data, type);
      useRows(rows, file.name, archive);
    } catch (error) {
      reportError(error, 'Kişi dosyası okunurken');
      notify(error.message || 'Dosya açılamadı.');
    } finally { setLoading(false); }
  };

  const changeHeader = () => {
    try {
      const prepared = prepareSource(rawRows, source.sourceName, !source.hasHeader);
      const aligned = alignSourceFields(prepared, fields.filter((field) =>
        field.importColumn === undefined), templateSourceColumns, Crypto.randomUUID);
      setSource(prepared);
      setFields(aligned.fields);
      setSourceFieldIds(aligned.mapping);
      setSelections({});
    } catch (error) { notify(error.message); }
  };

  const changeRole = (index, role) => {
    const next = { ...source, columns: setColumnRole(source.columns, index, role) };
    const aligned = alignSourceFields(next, fields, templateSourceColumns, Crypto.randomUUID);
    setSource(next);
    setFields(aligned.fields);
    setSourceFieldIds(aligned.mapping);
    setSelections({});
  };

  const addField = () => {
    const id = Crypto.randomUUID();
    setFields((previous) => [...previous, { id, label: '', type: 'text', options: [], required: false }]);
  };
  const updateField = (id, key, value) => setFields((previous) => previous.map((field) =>
    field.id === id && !(field.isSystemField && key === 'type')
      ? key === 'type' ? withAnswerType(field, value) : { ...field, [key]: value } : field));
  const removeField = (id) => setFields((previous) => previous.filter((field) => field.id !== id || field.isSystemField));
  const addOption = (id) => setFields((previous) => previous.map((field) =>
    field.id === id ? { ...field, options: [...field.options, ''] } : field));
  const updateOption = (id, index, value) => setFields((previous) => previous.map((field) =>
    field.id === id ? { ...field, options: field.options.map((option, i) => i === index ? value : option) } : field));
  const removeOption = (id, index) => setFields((previous) => previous.map((field) =>
    field.id === id ? { ...field, options: field.options.filter((_, i) => i !== index) } : field));

  const applyTemplate = (template) => {
    const nextSurveyOnly = template?.mode === 'survey' || (surveyOnly && !template);
    if (nextSurveyOnly && !surveyOnly && (phoneText.trim() || source)) {
      notify('Önce kişi listesi kartındaki × işaretine basıp listeyi kaldırın.');
      return false;
    }
    if (nextSurveyOnly && !surveyOnly) {
      setPhoneText(''); setRawRows([]); setOriginalWorkbook(null); setSource(null);
      setSelections({}); setSourceFieldIds({});
    }
    if (!nextSurveyOnly && surveyOnly) setSurveyOnly(false);
    if (nextSurveyOnly) setSurveyOnly(true);
    setFields((template?.fields || (nextSurveyOnly ? [{ id: Crypto.randomUUID(), label: '', type: 'text', options: [], required: false }] : systemFields))
      .filter((field) => !nextSurveyOnly || !field.isSystemField)
      .map((field) => ({ ...field, options: [...field.options] })));
    setTemplateId(template?.id || null);
    setTemplateSourceColumns(template?.sourceColumns || []);
    if (template) setPasteMode(template.pasteMode || 'name-phone');
    return true;
  };

  const removeList = () => {
    const apply = () => {
      setPhoneText(''); setRawRows([]); setOriginalWorkbook(null);
      setSource(null); setSelections({}); setSourceFieldIds({});
      setTemplateId(null);
      setFields((items) => {
        const questions = items.filter((field) => !field.isSystemField)
          .map(({ importColumn, ...field }) => field);
        return questions.length ? questions : [{ id: Crypto.randomUUID(), label: '', type: 'text', options: [], required: false }];
      });
      setSurveyOnly(true);
    };
    if (!phoneText.trim() && !source) { apply(); return; }
    const message = 'Girilen kişi listesi silinecek. Anket soruları korunacak. Devam edilsin mi?';
    if (Platform.OS === 'web') { if (window.confirm(message)) apply(); }
    else Alert.alert('Kişi listesini kaldır', message, [
      { text: 'Vazgeç', style: 'cancel' }, { text: 'Listeyi kaldır', style: 'destructive', onPress: apply },
    ]);
  };
  const restoreList = () => {
    setSurveyOnly(false);
    setTemplateId(null);
    setTemplateSourceColumns([]);
    setFields((items) => [...systemFields, ...items.filter((field) => !field.isSystemField)]);
  };

  const importTemplate = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file?.name?.toLowerCase().endsWith(TEMPLATE_EXTENSION)) throw new Error('Lütfen .ayst şablon dosyası seçin.');
      const content = Platform.OS === 'web'
        ? file.file ? await file.file.text() : await (await fetch(file.uri)).text()
        : await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const template = await readTemplateFile(content);
      const saved = await saveTemplate(template);
      setTemplates(await getTemplates());
      if (!applyTemplate(saved)) {
        notify('Şablon kaydedildi. Uygulamak için önce kişi listesini kaldırın.');
        return;
      }
      setPasteMode(saved.pasteMode || 'name-phone');
      const settings = await getAppSettings();
      await saveAppSettings({ ...settings, defaultTemplateId: saved.id, pasteMode: saved.pasteMode || 'name-phone' });
      notify('Şablon kaydedildi ve sorulara uygulandı.');
    } catch (error) { reportError(error, 'Şablon içe aktarılırken'); notify(error.message); }
  };

  const makeTemplate = async (share) => {
    try {
      const content = await createTemplateFile(projectName.trim() || 'Etkinlik şablonu', fields,
        source?.columns.map(({ label, role, index }) => ({ label, role, fieldId: sourceFieldIds[index] || null })) || [], pasteMode,
        surveyOnly ? 'survey' : 'calls');
      const parsed = await readTemplateFile(content);
      const saved = await saveTemplate(parsed);
      setTemplates(await getTemplates());
      setTemplateId(saved.id);
      if (share) {
        const name = `Etkinlik-Sablonu${TEMPLATE_EXTENSION}`;
        if (Platform.OS === 'web') downloadWeb(content, name);
        else {
          const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${name}`;
          await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
          await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Form şablonunu paylaş' });
        }
      } else notify('Şablon bu cihazda kaydedildi.');
    } catch (error) { reportError(error, 'Şablon kaydedilirken'); notify(error.message); }
  };

  const saveProject = async () => {
    if (loading) return;
    setSaveError('');
    setLoading(true);
    try {
      if (surveyOnly) {
        if (!projectName.trim()) throw new Error('Önce ankete bir ad verin.');
        if (!fields.length || fields.length > 100 || new Set(fields.map((field) => field.id)).size !== fields.length ||
            fields.some((field) => !field.label.trim() || field.isSystemField)) {
          throw new Error('En az bir sorunun adını yazın veya boş soruyu silin.');
        }
        const saveFields = fields.map((field, index) => ({ id: field.id, label: field.label.trim(),
          type: field.type, options: field.type === 'select' ? field.options.map((option) => option.trim()) : [],
          order: index, required: !!field.required }));
        for (const field of saveFields) if (field.type === 'select' &&
          (field.options.length < 2 || field.options.some((option) => !option) ||
            new Set(field.options).size !== field.options.length)) {
          throw new Error(`"${field.label}" için en az iki farklı seçenek girin.`);
        }
        const id = Crypto.randomUUID();
        await createProject({ id, eventId: id, mode: 'survey', name: projectName.trim(),
          createdAt: new Date().toISOString(), currentIndex: 0, formVersion: 1, formLocked: false,
          templateId, fields: saveFields, formHistory: [{ version: 1, fields: saveFields }],
          contacts: [], sourceWorkbook: null, sourceReview: null });
        navigation.goBack();
        return;
      }
      if (analysis.error) throw new Error(analysis.error);
      const { selected, excluded } = selectSourceRows(analysis, resolveDuplicateSelections(analysis, selections));
      if (!selected.length) throw new Error('Geçerli telefonlu en az bir kişi gerekli.');
      const unnamedField = fields.find((field) => field.isSystemField !== 'phone' && !field.label.trim());
      if (unnamedField) {
        throw new Error('Eklenen sorunun adını yazın veya soruyu silin.');
      }
      const saveFields = fields.filter((field) => field.isSystemField !== 'phone' && field.label.trim())
        .map((field, index) => ({
          id: field.id, label: field.label.trim(), type: field.type,
          options: field.type === 'select' ? field.options.map((option) => option.trim()).filter(Boolean) : [],
          order: index, required: field.isSystemField === 'name' || !!field.required,
          ...(field.isSystemField ? { isSystemField: field.isSystemField } : {}),
        }));
      if (!saveFields.some((field) => field.isSystemField === 'name')) throw new Error('İsim alanı gerekli.');
      for (const field of saveFields) {
        if (field.type === 'select' && (field.options.length < 2 || new Set(field.options).size !== field.options.length)) {
          throw new Error(`"${field.label}" için en az iki farklı seçenek girin.`);
        }
      }
      const nameField = saveFields.find((field) => field.isSystemField === 'name');
      const usableIds = new Set(saveFields.map((field) => field.id));
      for (const column of source.columns.filter((item) => item.role === 'field')) {
        const field = saveFields.find((item) => item.id === sourceFieldIds[column.index]);
        if (field?.type === 'select') {
          const unknown = selected.map((row) => String(row.cells[column.index] ?? '').trim())
            .find((value) => value && !field.options.includes(value));
          if (unknown) {
            throw new Error(`"${column.label}" sütunundaki "${unknown}" değeri şıklarda yok.`);
          }
        }
      }
      const eventId = Crypto.randomUUID();
      const contacts = selected.map((row) => {
        const data = {};
        data[nameField.id] = importedContactName(row.name);
        source.columns.filter((column) => column.role === 'field').forEach((column) => {
          const fieldId = sourceFieldIds[column.index];
          const value = String(row.cells[column.index] ?? '').trim();
          if (fieldId && usableIds.has(fieldId) && value) data[fieldId] = value;
        });
        const recordId = Crypto.randomUUID();
        return { id: recordId, recordId, phone: row.phone, data, completed: false, completedAt: null,
          sourceRow: row.sourceRow, sourceCells: [...row.cells] };
      });
      const project = {
        id: eventId, eventId, name: projectName.trim(), createdAt: new Date().toISOString(),
        currentIndex: 0, formVersion: 1, formLocked: false, templateId,
        fields: saveFields, formHistory: [{ version: 1, fields: saveFields }], contacts,
        sourceWorkbook: originalWorkbook,
        sourceReview: {
          sourceName: source.sourceName, hasHeader: source.hasHeader, totalRows: source.rows.length,
          columns: source.columns.map((column) => ({ index: column.index, label: column.label,
            role: column.role, fieldId: column.role === 'field' && usableIds.has(sourceFieldIds[column.index])
              ? sourceFieldIds[column.index] : null })),
          excludedRows: excluded,
        },
      };
      await createProject(project);
      navigation.goBack();
    } catch (error) {
      reportError(error, 'Etkinlik oluşturulurken');
      setSaveError(error.message || 'Etkinlik kaydedilemedi.');
    } finally { setLoading(false); }
  };

  if (!presetReady) return <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: 'center' }}>
    <ActivityIndicator color={Colors.accentLight} /></View>;
  if (step === 1) return <Step1Info projectName={projectName} setProjectName={setProjectName}
    activeTab={activeTab} setActiveTab={setActiveTab} phoneText={phoneText} setPhoneText={setPhoneText}
    loading={loading} handleParseText={parseText} handleImportExcel={importFile}
    templates={templates} templateId={templateId} applyTemplate={applyTemplate} importTemplate={importTemplate}
    pasteMode={pasteMode} surveyOnly={surveyOnly} removeList={removeList} restoreList={restoreList}
    continueSurvey={() => projectName.trim() ? setStep(2) : notify('Önce ankete bir ad verin.')} />;
  return <Step2Review source={source} analysis={analysis} selections={selections}
    setSelections={setSelections} changeRole={changeRole} changeHeader={changeHeader}
    goBack={() => setStep(1)} handleSave={saveProject} loading={loading}
    fields={fields} saveError={saveError}
    updateField={updateField} removeField={removeField} addField={addField}
    addOption={addOption} updateOption={updateOption} removeOption={removeOption}
    saveTemplate={() => makeTemplate(false)} shareTemplate={() => makeTemplate(true)} surveyOnly={surveyOnly} />;
}
