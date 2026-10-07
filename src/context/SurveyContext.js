/**
 * SurveyContext.js
 * Tüm SurveyScreen sekmelerinin (SurveyTab, StatsTab, SearchTab) ortak
 * state ve fonksiyonlarını merkezi olarak yönetir.
 * Prop Drilling tamamen ortadan kalkar.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import { getProject, updateProject, saveDraft, loadDraft, clearDraft, waitForPendingWrites } from '../utils/storage';
import { parsePastedText } from '../utils/phoneUtils';
import { reportError } from '../utils/diagnostics';

const SurveyContext = createContext(null);

const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);

export function SurveyProvider({ projectId, projectName, navigation, children }) {
  // ── Core state ──
  const [project, setProject] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
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

  // İlk yükleme ve cleanup
  useEffect(() => {
    loadProjectData();
    return () => {
      clearInterval(autoSaveRef.current);
      clearTimeout(saveTimerRef.current);
    };
  }, []);

  // 5 saniyelik otomatik kayıt
  useEffect(() => {
    if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    autoSaveRef.current = setInterval(() => {
      if (changedRef.current) persistCurrentContact().catch(console.error);
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
    setLoadError('');
    try {
      await waitForPendingWrites();
      const proj = await getProject(projectId);
      if (!proj) throw new Error('Proje bulunamadı.');
      setProject(proj);
      projectRef.current = proj;
      const idx = Math.max(0, Math.min(proj.currentIndex || 0, proj.contacts.length - 1));
      setCurrentIndex(idx);
      indexRef.current = idx;
      const draft = await loadDraft(projectId);
      const data = draft && draft.contactIndex === idx ? draft.formData || {} : proj.contacts[idx]?.data || {};
      setFormData(data);
      formDataRef.current = data;
    } catch (error) {
      reportError(error, 'Anket projesi yüklenirken');
      setProject(null);
      projectRef.current = null;
      setLoadError(error.message || 'Proje yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const saveTimerRef = useRef(null);

  // ── Anlık kayıt (contact datasını AsyncStorage'a yazar) ──
  const persistCurrentContact = useCallback(async () => {
    const proj = projectRef.current;
    if (!proj?.contacts.length) return;
    const idx = indexRef.current;
    const fd = formDataRef.current;
    
    // Varolan nesneyi mutate etmeden kopyala
    const updatedContacts = [...proj.contacts];
    updatedContacts[idx] = { ...updatedContacts[idx], data: { ...fd } };
    
    // Proje referansını güncelle
    const updatedProj = { ...proj, contacts: updatedContacts };
    projectRef.current = updatedProj;
    setProject(updatedProj);
    
    // Taslak, alan değiştiği anda kuyruğa yazılır. Burada tekrar yazmak,
    // sonraki kişiye geçerken silinmiş eski bir taslağı geri getirebilir.
    await updateProject(projectId, { contacts: updatedContacts, currentIndex: idx });
    if (indexRef.current === idx && formDataRef.current === fd) changedRef.current = false;
  }, [projectId]);

  // ── Form alanı güncelleme ──
  const setField = (fieldId, value) => {
    if (savingRef.current) return;
    const newData = { ...formDataRef.current, [fieldId]: value };
    setFormData(newData);
    formDataRef.current = newData;
    changedRef.current = true;
    saveDraft(projectId, { contactIndex: indexRef.current, formData: newData });
    
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persistCurrentContact().catch(console.error);
    }, 500); // 500ms debounce
  };

  // ── Kaydet ve Sonraki ──
  const handleSaveAndNext = async () => {
    if (!projectRef.current?.contacts[currentIndex] || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;

    const contacts = [...projectRef.current.contacts];
    contacts[currentIndex] = {
      ...contacts[currentIndex],
      data: { ...formDataRef.current },
      completed: true,
      completedAt: new Date().toISOString(),
    };
    
    const next = currentIndex + 1;
    const isLast = next >= contacts.length;
    
    const nextIdx = isLast ? currentIndex : next;
    
    // Projeyi güncelle
    const updatedProj = { ...projectRef.current, contacts, currentIndex: nextIdx };
    projectRef.current = updatedProj;
    changedRef.current = false;
    
    await updateProject(projectId, { contacts, currentIndex: nextIdx });
    await clearDraft(projectId);
    
    if (isLast) {
      setProject(updatedProj);
      const m = 'Tüm kişiler tamamlandı! Verileri dışa aktarmak ister misiniz?';
      if (Platform.OS === 'web') {
        if (window.confirm(m)) navigation.navigate('Export', { projectId, projectName });
      } else {
        Alert.alert('Tamamlandı! 🎉', m, [
          { text: 'Kapat' },
          { text: 'Dışa Aktar', onPress: () => navigation.navigate('Export', { projectId, projectName }) },
        ]);
      }
      return;
    }
    
    setProject(updatedProj);
    setCurrentIndex(next);
    indexRef.current = next;
    const nd = contacts[next]?.data || {};
    setFormData(nd);
    formDataRef.current = nd;
    } catch (error) {
      reportError(error, 'Kişi kaydedilirken');
      const message = 'Kişi kaydedilemedi: ' + error.message;
      Platform.OS === 'web' ? window.alert(message) : Alert.alert('Hata', message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // ── Kişiyi Düzenle (Modal) ──
  const openEditContact = (contact) => {
    if (savingRef.current) return;
    const index = projectRef.current?.contacts.findIndex(c => c.id === contact.id) ?? -1;
    const data = index === indexRef.current
      ? formDataRef.current
      : projectRef.current?.contacts[index]?.data || contact.data;
    setEditFormData({ ...data });
    setEditingContact(contact);
  };

  const handleSaveEditContact = async () => {
    if (!editingContact || !projectRef.current || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const updatedContacts = [...projectRef.current.contacts];
    const index = updatedContacts.findIndex(c => c.id === editingContact.id);
    if (index > -1) {
      // Açık anketteki son tuş vuruşları henüz diske yazılmamış olabilir.
      updatedContacts[indexRef.current] = {
        ...updatedContacts[indexRef.current], data: { ...formDataRef.current },
      };
      updatedContacts[index] = { ...updatedContacts[index], data: { ...editFormData } };
      changedRef.current = false;
      await updateProject(projectId, { contacts: updatedContacts });
      await clearDraft(projectId);
      const updatedProj = { ...projectRef.current, contacts: updatedContacts };
      setProject(updatedProj);
      projectRef.current = updatedProj;
      if (index === currentIndex) {
        setFormData(updatedContacts[index].data);
        formDataRef.current = updatedContacts[index].data;
      }
    }
    setEditingContact(null);
    } catch (error) {
      reportError(error, 'Kişi düzenlenirken');
      const message = 'Kişi düzenlenemedi: ' + error.message;
      Platform.OS === 'web' ? window.alert(message) : Alert.alert('Hata', message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // ── Önceki / Sonraki kişiye git ──
  const handleNav = (dir) => {
    if (!projectRef.current || savingRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const ni = currentIndex + dir;
    if (ni < 0 || ni >= projectRef.current.contacts.length) return;
    saveTimerRef.current = null;
    
    const contacts = [...projectRef.current.contacts];
    contacts[currentIndex] = { ...contacts[currentIndex], data: { ...formDataRef.current } };
    
    const updatedProj = { ...projectRef.current, contacts, currentIndex: ni };
    projectRef.current = updatedProj;
    changedRef.current = false;
    
    updateProject(projectId, { contacts, currentIndex: ni }).catch(console.error);
    clearDraft(projectId);
    setProject(updatedProj);
    setCurrentIndex(ni);
    indexRef.current = ni;
    const nd = contacts[ni]?.data || {};
    setFormData(nd);
    formDataRef.current = nd;
  };

  // ── Belirli bir kişiye zıpla ──
  const jumpToContact = (contactIdx) => {
    if (!projectRef.current || savingRef.current) return;
    if (contactIdx < 0 || contactIdx >= projectRef.current.contacts.length) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    
    const contacts = [...projectRef.current.contacts];
    contacts[currentIndex] = { ...contacts[currentIndex], data: { ...formDataRef.current } };
    
    const updatedProj = { ...projectRef.current, contacts, currentIndex: contactIdx };
    projectRef.current = updatedProj;
    changedRef.current = false;
    
    updateProject(projectId, { contacts, currentIndex: contactIdx }).catch(console.error);
    clearDraft(projectId);
    setProject(updatedProj);
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
    if (!projectRef.current || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const contacts = [...projectRef.current.contacts];
    contacts[indexRef.current] = { ...contacts[indexRef.current], data: { ...formDataRef.current } };
    const existingPhones = new Set(contacts.map(c => c.phone));
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
    const updatedContacts = [...contacts, ...newContacts];
    changedRef.current = false;
    await updateProject(projectId, { contacts: updatedContacts });
    await clearDraft(projectId);
    const updatedProj = { ...projectRef.current, contacts: updatedContacts };
    setProject(updatedProj);
    projectRef.current = updatedProj;
    setNewPhoneText('');
    setShowAddContacts(false);
    const m = `${newResults.length} yeni kişi eklendi! Toplam: ${updatedContacts.length}`;
    Platform.OS === 'web' ? window.alert(m) : Alert.alert('Başarılı ✅', m);
    } catch (error) {
      reportError(error, 'Kişi eklenirken');
      const message = 'Kişiler eklenemedi: ' + error.message;
      Platform.OS === 'web' ? window.alert(message) : Alert.alert('Hata', message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // ── Dışa aktarma vb işlemlerden önce bekleyen işlemleri bitir ──
  const forceFlush = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (changedRef.current) await persistCurrentContact();
    await waitForPendingWrites();
  };

  const value = {
    // State
    project, currentIndex, loading, loadError, reloadProject: loadProjectData, saving, formData,
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
    openEditContact,
    handleSaveAndNext,
    handleSaveEditContact,
    handleNav,
    jumpToContact,
    getFilteredContacts,
    handleAddContacts,
    forceFlush,
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
