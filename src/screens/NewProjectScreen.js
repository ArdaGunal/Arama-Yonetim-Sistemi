import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { createProject, getProjectSummaries, getTemplates, saveTemplate } from '../utils/storage';
import { reportError } from '../utils/diagnostics';
import { analyzeSource, prepareSource, setColumnRole, textToRows } from '../utils/sourcePreview';
import { normalizeString } from '../utils/phoneUtils';
import { createTemplateFile, readTemplateFile, TEMPLATE_EXTENSION } from '../utils/templateFormat';
import { captureSourceWorkbook, MAX_SOURCE_BYTES } from '../utils/sourceWorkbookArchive';
import { alignSourceFields, withAnswerType } from '../utils/newProjectFields';
import { getAppSettings, saveAppSettings } from '../utils/appSettings';
import CallStart from '../features/calls/CallStart';
import SurveyStart from '../features/surveys/SurveyStart';
import { createCallProject } from '../features/calls/createCallProject';
import { createSurveyProject } from '../features/surveys/createSurveyProject';
import Step2Review from '../features/new-project/Step2Review';
import DuplicateProjectPrompt from '../features/new-project/DuplicateProjectPrompt';
import { comparableProjectName, findSameNameProject } from '../domain/projects/projectNames';
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

export default function NewProjectScreen({ navigation, route }) {
  // Eski doğrudan gezinme çağrıları arama akışına düşer; yeni giriş türü başta seçtirir.
  const surveyOnly = route?.params?.mode === 'survey';
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState('');
  const [activeTab, setActiveTab] = useState('text');
  const [phoneText, setPhoneText] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [originalWorkbook, setOriginalWorkbook] = useState(null);
  const [source, setSource] = useState(null);
  const [selections, setSelections] = useState({});
  const [fields, setFields] = useState(() => surveyOnly
    ? [{ id: Crypto.randomUUID(), label: '', type: 'text', options: [], required: false }]
    : systemFields);
  const [sourceFieldIds, setSourceFieldIds] = useState({});
  const [templateSourceColumns, setTemplateSourceColumns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  const [pasteMode, setPasteMode] = useState('name-phone');
  const [presetReady, setPresetReady] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [duplicateName, setDuplicateName] = useState(null);
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
      const selected = savedTemplates.find((item) => item.id === settings?.defaultTemplateId &&
        (item.mode || 'calls') === (surveyOnly ? 'survey' : 'calls'));
      if (selected) {
        setFields(selected.fields.map((field) => ({ ...field, options: [...field.options] })));
        setTemplateId(selected.id);
        setTemplateSourceColumns(selected.sourceColumns || []);
      }
      setPresetReady(true);
    });
    return () => { active = false; };
  }, [surveyOnly]);
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
    if (template && (template.mode || 'calls') !== (surveyOnly ? 'survey' : 'calls')) {
      notify('Bu şablon başka proje türüne ait. Geri dönüp o türü seçin.');
      return false;
    }
    setFields((template?.fields || (surveyOnly
      ? [{ id: Crypto.randomUUID(), label: '', type: 'text', options: [], required: false }]
      : systemFields))
      .map((field) => ({ ...field, options: [...field.options] })));
    setTemplateId(template?.id || null);
    setTemplateSourceColumns(template?.sourceColumns || []);
    if (template) setPasteMode(template.pasteMode || 'name-phone');
    return true;
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

  const saveProject = async (confirmedName = null) => {
    if (loading) return;
    setSaveError('');
    setLoading(true);
    try {
      const common = { projectName, fields, templateId, randomUUID: Crypto.randomUUID,
        createdAt: new Date().toISOString() };
      const project = surveyOnly
        ? createSurveyProject(common)
        : createCallProject({ ...common, analysis, selections, source, sourceFieldIds, originalWorkbook });
      const sameName = findSameNameProject(project.name, await getProjectSummaries());
      if (sameName && comparableProjectName(confirmedName) !== comparableProjectName(project.name)) {
        setDuplicateName(project.name);
        return;
      }
      setDuplicateName(null);
      await createProject(project);
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (error) {
      reportError(error, 'Etkinlik oluşturulurken');
      setSaveError(error.message || 'Etkinlik kaydedilemedi.');
    } finally { setLoading(false); }
  };

  if (!presetReady) return <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: 'center' }}>
    <ActivityIndicator color={Colors.accentLight} /></View>;
  if (step === 1 && surveyOnly) return <SurveyStart projectName={projectName} setProjectName={setProjectName}
    templates={templates} templateId={templateId} applyTemplate={applyTemplate} importTemplate={importTemplate}
    continueSurvey={() => projectName.trim() ? setStep(2) : notify('Önce ankete bir ad verin.')} />;
  if (step === 1) return <CallStart projectName={projectName} setProjectName={setProjectName}
    activeTab={activeTab} setActiveTab={setActiveTab} phoneText={phoneText} setPhoneText={setPhoneText}
    loading={loading} handleParseText={parseText} handleImportExcel={importFile}
    templates={templates} templateId={templateId} applyTemplate={applyTemplate} importTemplate={importTemplate}
    pasteMode={pasteMode} />;
  return <><Step2Review source={source} analysis={analysis} selections={selections}
    setSelections={setSelections} changeRole={changeRole} changeHeader={changeHeader}
    goBack={() => setStep(1)} handleSave={() => saveProject()} loading={loading}
    fields={fields} saveError={saveError}
    updateField={updateField} removeField={removeField} addField={addField}
    addOption={addOption} updateOption={updateOption} removeOption={removeOption}
    saveTemplate={() => makeTemplate(false)} shareTemplate={() => makeTemplate(true)} surveyOnly={surveyOnly} />
    <DuplicateProjectPrompt name={duplicateName} loading={loading}
      onRename={() => { setDuplicateName(null); setStep(1); }}
      onCreate={() => saveProject(duplicateName)} />
  </>;
}
