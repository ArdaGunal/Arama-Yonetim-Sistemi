/**
 * SurveyContext.js
 * Tüm SurveyScreen sekmelerinin (SurveyTab, StatsTab, SearchTab) ortak
 * state ve fonksiyonlarını merkezi olarak yönetir.
 * Prop Drilling tamamen ortadan kalkar.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import { getProject, updateProject, saveDraft, loadDraft, clearDraft } from '../utils/storage';
import { parsePastedText } from '../utils/phoneUtils';

const SurveyContext = createContext(null);

const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);

export function SurveyProvider({ projectId, projectName, navigation, children }) {
  // ── Core state ──
  const [project, setProject] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState('survey');

  // ── Stats / Filter state ──
  const [expandedFilter, setExpandedFilter] = useState(null);
  const [filterField, setFilterField] = useState(null);
  const [filterValue, setFilterValue] = useState(null);

  // ── Add contacts state ──
  const [showAddContacts, setShowAddContacts] = useState(false);
  const [newPhoneText, setNewPhoneText] = useState('');

  // ── Search & Edit state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [editingContact, setEditingContact] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  // ── Refs (auto-save closure'ları için) ──
  const autoSaveRef = useRef(null);
  const changedRef = useRef(false);
  const projectRef = useRef(null);
  const formDataRef = useRef({});
  const indexRef = useRef(0);

  // Ref'leri state ile senkron tut
  useEffect(() => { formDataRef.current = formData; }, [formData]);
  useEffect(() => { indexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { projectRef.current = project; }, [project]);

  // İlk yükleme ve cleanup
  useEffect(() => {
    loadProjectData();
    return () => clearInterval(autoSaveRef.current);
  }, []);

  // 5 saniyelik otomatik kayıt
  useEffect(() => {
    if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    autoSaveRef.current = setInterval(() => {
      if (changedRef.current) { persistCurrentContact(); changedRef.current = false; }
    }, 5000);
    return () => clearInterval(autoSaveRef.current);
  }, [projectId]);

  // ── Derived values (hesaplanan değerler) ──
  const fields = project?.fields || [];
  const selectFields = fields.filter(f => f.type === 'select');
  const nameField = fields.find(f => f.isSystemField === 'name') || fields.find(f => f.type === 'text');
  const total = project?.contacts.length || 0;
  const done = project?.contacts.filter(c => c.completed).length || 0;
  const cc = project?.contacts[currentIndex];

  // ── Veri yükleme ──
  const loadProjectData = async () => {
    setLoading(true);
    const proj = await getProject(projectId);
    if (!proj) { setLoading(false); return; }
    setProject(proj);
    projectRef.current = proj;
    const idx = proj.currentIndex || 0;
    setCurrentIndex(idx);
    indexRef.current = idx;
    const draft = await loadDraft(projectId);
    if (draft && draft.contactIndex === idx) {
      setFormData(draft.formData || {});
      formDataRef.current = draft.formData || {};
    } else {
      const d = proj.contacts[idx]?.data || {};
      setFormData(d);
      formDataRef.current = d;
    }
    setLoading(false);
  };

  // ── Anlık kayıt (contact datasını AsyncStorage'a yazar) ──
  const persistCurrentContact = useCallback(async () => {
    const proj = projectRef.current;
    if (!proj) return;
    const idx = indexRef.current;
    const fd = formDataRef.current;
    const contacts = [...proj.contacts];
    contacts[idx] = { ...contacts[idx], data: { ...fd } };
    await updateProject(projectId, { contacts, currentIndex: idx });
    await saveDraft(projectId, { contactIndex: idx, formData: fd });
    proj.contacts = contacts;
    projectRef.current = proj;
  }, [projectId]);

  // ── Form alanı güncelleme ──
  const setField = (fieldId, value) => {
    const newData = { ...formDataRef.current, [fieldId]: value };
    setFormData(newData);
    formDataRef.current = newData;
    changedRef.current = true;
    setTimeout(() => persistCurrentContact(), 300);
  };

  // ── Kaydet ve Sonraki ──
  const handleSaveAndNext = async () => {
    if (!project) return;
    setSaving(true);
    const contacts = [...project.contacts];
    contacts[currentIndex] = {
      ...contacts[currentIndex],
      data: { ...formData },
      completed: true,
      completedAt: new Date().toISOString(),
    };
    const next = currentIndex + 1;
    const isLast = next >= contacts.length;
    await updateProject(projectId, { contacts, currentIndex: isLast ? currentIndex : next });
    await clearDraft(projectId);
    if (isLast) {
      const m = 'Tüm kişiler tamamlandı! Verileri dışa aktarmak ister misiniz?';
      if (Platform.OS === 'web') {
        if (window.confirm(m)) navigation.navigate('Export', { projectId, projectName });
      } else {
        Alert.alert('Tamamlandı! 🎉', m, [
          { text: 'Kapat' },
          { text: 'Dışa Aktar', onPress: () => navigation.navigate('Export', { projectId, projectName }) },
        ]);
      }
      setSaving(false);
      return;
    }
    const updatedProj = { ...project, contacts, currentIndex: next };
    setProject(updatedProj);
    projectRef.current = updatedProj;
    setCurrentIndex(next);
    indexRef.current = next;
    const nd = contacts[next]?.data || {};
    setFormData(nd);
    formDataRef.current = nd;
    changedRef.current = false;
    setSaving(false);
  };

  // ── Kişiyi Düzenle (Modal) ──
  const handleSaveEditContact = async () => {
    if (!editingContact || !project) return;
    setSaving(true);
    const updatedContacts = [...project.contacts];
    const index = updatedContacts.findIndex(c => c.id === editingContact.id);
    if (index > -1) {
      updatedContacts[index] = { ...updatedContacts[index], data: { ...editFormData } };
      await updateProject(projectId, { contacts: updatedContacts });
      const updatedProj = { ...project, contacts: updatedContacts };
      setProject(updatedProj);
      projectRef.current = updatedProj;
      if (index === currentIndex) {
        setFormData(updatedContacts[index].data);
        formDataRef.current = updatedContacts[index].data;
      }
    }
    setEditingContact(null);
    setSaving(false);
  };

  // ── Önceki / Sonraki kişiye git ──
  const handleNav = (dir) => {
    if (!project) return;
    const ni = currentIndex + dir;
    if (ni < 0 || ni >= project.contacts.length) return;
    const contacts = [...project.contacts];
    contacts[currentIndex] = { ...contacts[currentIndex], data: { ...formData } };
    const updatedProj = { ...project, contacts, currentIndex: ni };
    updateProject(projectId, { contacts, currentIndex: ni });
    setProject(updatedProj);
    projectRef.current = updatedProj;
    setCurrentIndex(ni);
    indexRef.current = ni;
    const nd = contacts[ni]?.data || {};
    setFormData(nd);
    formDataRef.current = nd;
  };

  // ── Belirli bir kişiye zıpla ──
  const jumpToContact = (contactIdx) => {
    if (!project) return;
    const contacts = [...project.contacts];
    contacts[currentIndex] = { ...contacts[currentIndex], data: { ...formData } };
    updateProject(projectId, { contacts, currentIndex: contactIdx });
    const updatedProj = { ...project, contacts, currentIndex: contactIdx };
    setProject(updatedProj);
    projectRef.current = updatedProj;
    setCurrentIndex(contactIdx);
    indexRef.current = contactIdx;
    const nd = contacts[contactIdx]?.data || {};
    setFormData(nd);
    formDataRef.current = nd;
    setActiveTab('survey');
  };

  // ── Filtrelenmiş kişiler ──
  const getFilteredContacts = () => {
    if (!filterField || !filterValue) return [];
    return (project?.contacts || [])
      .map((c, idx) => ({ ...c, _idx: idx }))
      .filter(c => c.data && c.data[filterField] === filterValue);
  };

  // ── Yeni kişi ekle (istatistik sekmesinden) ──
  const handleAddContacts = async () => {
    if (!project) return;
    const existingPhones = new Set(project.contacts.map(c => c.phone));
    const results = parsePastedText(newPhoneText);
    const newResults = results.filter(r => !existingPhones.has(r.phone));
    if (newResults.length === 0) {
      const m = 'Geçerli yeni numara bulunamadı (zaten mevcut veya hatalı).';
      Platform.OS === 'web' ? window.alert(m) : Alert.alert('Uyarı', m);
      return;
    }
    const newContacts = newResults.map(r => {
      const contactData = {};
      if (r.name && nameField) contactData[nameField.id] = r.name;
      return { id: uid(), phone: r.phone, data: contactData, completed: false, completedAt: null };
    });
    const updatedContacts = [...project.contacts, ...newContacts];
    await updateProject(projectId, { contacts: updatedContacts });
    const updatedProj = { ...project, contacts: updatedContacts };
    setProject(updatedProj);
    projectRef.current = updatedProj;
    setNewPhoneText('');
    setShowAddContacts(false);
    const m = `${newResults.length} yeni kişi eklendi! Toplam: ${updatedContacts.length}`;
    Platform.OS === 'web' ? window.alert(m) : Alert.alert('Başarılı ✅', m);
  };

  const value = {
    // State
    project, currentIndex, loading, saving, formData,
    activeTab, setActiveTab,
    expandedFilter, setExpandedFilter,
    filterField, setFilterField,
    filterValue, setFilterValue,
    showAddContacts, setShowAddContacts,
    newPhoneText, setNewPhoneText,
    searchQuery, setSearchQuery,
    editingContact, setEditingContact,
    editFormData, setEditFormData,
    // Derived
    fields, selectFields, nameField, total, done, cc,
    // Actions
    setField,
    handleSaveAndNext,
    handleSaveEditContact,
    handleNav,
    jumpToContact,
    getFilteredContacts,
    handleAddContacts,
    // Navigation
    navigation, projectId, projectName,
  };

  return (
    <SurveyContext.Provider value={value}>
      {children}
    </SurveyContext.Provider>
  );
}

export function useSurvey() {
  const ctx = useContext(SurveyContext);
  if (!ctx) throw new Error('useSurvey must be used within SurveyProvider');
  return ctx;
}
