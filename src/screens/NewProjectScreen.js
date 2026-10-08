import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';
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
import Step1Info from '../features/new-project/Step1Info';
import Step2Review from '../features/new-project/Step2Review';
import Step2Builder from '../features/new-project/Step2Builder';

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
  const [rawRows, setRawRows] = useState([]);
  const [source, setSource] = useState(null);
  const [selections, setSelections] = useState({});
  const [fields, setFields] = useState(systemFields);
  const [sourceFieldIds, setSourceFieldIds] = useState({});
  const [templateSourceColumns, setTemplateSourceColumns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  const [expandedField, setExpandedField] = useState(null);
  const [loading, setLoading] = useState(false);
  const analysis = useMemo(() => source ? analyzeSource(source) : null, [source]);

  useEffect(() => { getTemplates().then(setTemplates).catch((error) => reportError(error, 'Şablonlar yüklenirken')); }, []);

  const useRows = (rows, name) => {
    let prepared = prepareSource(rows, name);
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
          prepared.columns.filter((column) => column.role === 'name').length > 1) prepared = prepareSource(rows, name);
    }
    setRawRows(rows);
    setSource(prepared);
    setSelections({});
    setStep(2);
  };

  const parseText = () => {
    try {
      if (!projectName.trim()) throw new Error('Önce etkinliğe bir ad verin.');
      const rows = textToRows(phoneText);
      const prepared = prepareSource(rows, 'Yapıştırılan liste', false);
      setRawRows(rows);
      setSource(prepared);
      setSelections({});
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
      useRows(rows, file.name);
    } catch (error) {
      reportError(error, 'Kişi dosyası okunurken');
      notify(error.message || 'Dosya açılamadı.');
    } finally { setLoading(false); }
  };

  const changeHeader = () => {
    try {
      setSource(prepareSource(rawRows, source.sourceName, !source.hasHeader));
      setSelections({});
    } catch (error) { notify(error.message); }
  };

  const changeRole = (index, role) => {
    setSource((current) => ({ ...current, columns: setColumnRole(current.columns, index, role) }));
    setSelections({});
  };

  const goToForm = () => {
    try {
      const { selected } = selectSourceRows(analysis, selections);
      if (!selected.length) throw new Error('Geçerli telefonlu en az bir kişi gerekli.');
      const nextFields = fields.filter((field) => field.importColumn === undefined ||
        source.columns.some((column) => column.index === field.importColumn && column.role === 'field'));
      const mapping = {};
      source.columns.filter((column) => column.role === 'field').forEach((column) => {
        const mappedId = templateSourceColumns.find((item) => normalizeString(item.label) === normalizeString(column.label))?.fieldId;
        const matching = nextFields.find((field) => field.importColumn === column.index) ||
          nextFields.find((field) => !field.isSystemField && field.id === mappedId) ||
          nextFields.find((field) => !field.isSystemField && field.type === 'text' &&
          normalizeString(field.label) === normalizeString(column.label));
        if (matching) {
          mapping[column.index] = matching.id;
        } else {
          const id = Crypto.randomUUID();
          mapping[column.index] = id;
          nextFields.push({ id, label: column.label, type: 'text', options: [], importColumn: column.index });
        }
      });
      setFields(nextFields);
      setSourceFieldIds(mapping);
      setStep(3);
    } catch (error) { notify(error.message); }
  };

  const addField = () => {
    const id = Crypto.randomUUID();
    setFields((previous) => [...previous, { id, label: '', type: 'text', options: [], required: false }]);
    setExpandedField(id);
  };
  const updateField = (id, key, value) => setFields((previous) => previous.map((field) =>
    field.id === id && !(field.isSystemField && key === 'type') ? { ...field, [key]: value } : field));
  const removeField = (id) => setFields((previous) => previous.filter((field) => field.id !== id || field.isSystemField));
  const addOption = (id) => setFields((previous) => previous.map((field) =>
    field.id === id ? { ...field, options: [...field.options, ''] } : field));
  const updateOption = (id, index, value) => setFields((previous) => previous.map((field) =>
    field.id === id ? { ...field, options: field.options.map((option, i) => i === index ? value : option) } : field));
  const removeOption = (id, index) => setFields((previous) => previous.map((field) =>
    field.id === id ? { ...field, options: field.options.filter((_, i) => i !== index) } : field));

  const applyTemplate = (template) => {
    setFields(template.fields.map((field) => ({ ...field, options: [...field.options] })));
    setTemplateId(template.id);
    setTemplateSourceColumns(template.sourceColumns || []);
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
      applyTemplate(saved);
      notify('Şablon kaydedildi ve sorulara uygulandı.');
    } catch (error) { reportError(error, 'Şablon içe aktarılırken'); notify(error.message); }
  };

  const makeTemplate = async (share) => {
    try {
      const content = await createTemplateFile(projectName.trim() || 'Etkinlik şablonu', fields,
        source?.columns.map(({ label, role, index }) => ({ label, role, fieldId: sourceFieldIds[index] || null })) || []);
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
    setLoading(true);
    try {
      const { selected, excluded } = selectSourceRows(analysis, selections);
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
          if (unknown) throw new Error(`"${column.label}" sütunundaki "${unknown}" değeri şıklarda yok.`);
        }
      }
      const eventId = Crypto.randomUUID();
      const contacts = selected.map((row) => {
        const data = {};
        if (row.name) data[nameField.id] = row.name;
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
      notify(error.message || 'Etkinlik kaydedilemedi.');
    } finally { setLoading(false); }
  };

  if (step === 1) return <Step1Info projectName={projectName} setProjectName={setProjectName}
    activeTab={activeTab} setActiveTab={setActiveTab} phoneText={phoneText} setPhoneText={setPhoneText}
    loading={loading} handleParseText={parseText} handleImportExcel={importFile}
    templates={templates} templateId={templateId} applyTemplate={applyTemplate} importTemplate={importTemplate} />;
  if (step === 2) return <Step2Review source={source} analysis={analysis} selections={selections}
    setSelections={setSelections} changeRole={changeRole} changeHeader={changeHeader}
    goBack={() => setStep(1)} goNext={goToForm} />;
  return <Step2Builder fields={fields} expandedField={expandedField} setExpandedField={setExpandedField}
    selectedCount={analysis?.valid.length - (analysis?.duplicates.reduce((sum, group) => sum + group.rows.length - 1, 0) || 0)}
    loading={loading} updateField={updateField}
    removeField={removeField} addField={addField} addOption={addOption} updateOption={updateOption}
    removeOption={removeOption} setStep={setStep} handleSave={saveProject}
    saveTemplate={() => makeTemplate(false)} shareTemplate={() => makeTemplate(true)} />;
}
