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
import { missingRequiredField } from '../utils/formValidation';

const SurveyContext = createContext(null);

const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);

export function SurveyProvider({ projectId, projectName, navigation, children }) {
  // ── Core state ──
  const [project, setProject] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formData, setFormData] = useState({});
  const [callStatus, setCallStatus] = useState(null);
  const [callbackNote, setCallbackNote] = useState('');
  const [callbackDate, setCallbackDate] = useState('');

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
  const draftCleanupPendingRef = useRef(false);
  const projectRef = useRef(null);
  const formDataRef = useRef({});
  const indexRef = useRef(0);
  const showSaveFailure = (error, context) => {
    reportError(error, context);
    setSaveError(`Değişiklik kaydedilemedi: ${error.message || 'Depolama hatası'}. Tekrar deneyin.`);
  };
  const clearDraftAfterWrite = async () => {
    try {
      await clearDraft(projectId);
      draftCleanupPendingRef.current = false;
      setSaveError('');
    } catch (error) {
      draftCleanupPendingRef.current = true;
      reportError(error, 'Arama taslağı temizlenirken');
      setSaveError('Cevap kaydedildi, ancak eski taslak silinemedi. Tekrar deneyin.');
    }
  };

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
      if (!savingRef.current && changedRef.current) persistCurrentContact().catch((error) => showSaveFailure(error, 'Otomatik kayıt'));
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
      setCallStatus(proj.contacts[idx]?.callStatus || null);
      setCallbackNote(proj.contacts[idx]?.callbackNote || '');
      setCallbackDate(proj.contacts[idx]?.callbackAt?.slice(0, 10) || '');
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
    if (!draftCleanupPendingRef.current) setSaveError('');
  }, [projectId]);

  // ── Form alanı güncelleme ──
  const setField = (fieldId, value) => {
    if (savingRef.current) return;
    draftCleanupPendingRef.current = false;
    const newData = { ...formDataRef.current, [fieldId]: value };
    setFormData(newData);
    formDataRef.current = newData;
    changedRef.current = true;
    saveDraft(projectId, { contactIndex: indexRef.current, formData: newData })
      .catch((error) => showSaveFailure(error, 'Arama taslağı kaydedilirken'));
    
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persistCurrentContact().catch((error) => showSaveFailure(error, 'Arama cevabı otomatik kaydedilirken'));
    }, 500); // 500ms debounce
  };

  // ── Kaydet ve Sonraki ──
  const handleSaveAndNext = async () => {
    if (!projectRef.current?.contacts[currentIndex] || savingRef.current) return;
    if (projectRef.current.role === 'volunteer' && !callStatus) {
      const message = 'Önce arama sonucunu seçin.';
      Platform.OS === 'web' ? window.alert(message) : Alert.alert('Arama sonucu eksik', message);
      return;
    }
    const missing = missingRequiredField(projectRef.current.fields, formDataRef.current, callStatus || 'contacted');
    if (missing) {
      const message = `"${missing.label}" cevabını girin.`;
      Platform.OS === 'web' ? window.alert(message) : Alert.alert('Zorunlu cevap eksik', message);
      return;
    }
    if (callStatus === 'later' && callbackDate && (!/^\d{4}-\d{2}-\d{2}$/.test(callbackDate) ||
        !Number.isFinite(Date.parse(`${callbackDate}T12:00:00.000Z`)) ||
        new Date(`${callbackDate}T12:00:00.000Z`).toISOString().slice(0, 10) !== callbackDate)) {
      const message = 'Geri arama tarihi YYYY-AA-GG biçiminde olmalı.';
      Platform.OS === 'web' ? window.alert(message) : Alert.alert('Tarih geçersiz', message);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;

    const contacts = [...projectRef.current.contacts];
    const now = new Date().toISOString();
    const status = callStatus || 'contacted';
    contacts[currentIndex] = {
      ...contacts[currentIndex],
      data: { ...formDataRef.current },
      completed: true,
      completedAt: now,
      callStatus: status,
      callbackNote: status === 'later' ? callbackNote.trim() : '',
      callbackAt: status === 'later' && callbackDate ? `${callbackDate}T12:00:00.000Z` : null,
      attempts: [...(contacts[currentIndex].attempts || []), {
        id: uid(), at: now, status, note: status === 'later' ? callbackNote.trim() : '',
        data: { ...formDataRef.current },
      }],
    };
    
    const next = currentIndex + 1;
    const isLast = next >= contacts.length;
    
    const nextIdx = isLast ? currentIndex : next;
    
    // Projeyi güncelle
    const updatedProj = { ...projectRef.current, contacts, currentIndex: nextIdx };
    await updateProject(projectId, { contacts, currentIndex: nextIdx });
    projectRef.current = updatedProj;
    changedRef.current = false;
    await clearDraftAfterWrite();
    
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
    setCallStatus(contacts[next]?.callStatus || null);
    setCallbackNote(contacts[next]?.callbackNote || '');
    setCallbackDate(contacts[next]?.callbackAt?.slice(0, 10) || '');
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
      await updateProject(projectId, { contacts: updatedContacts });
      changedRef.current = false;
      await clearDraftAfterWrite();
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
  const moveToContact = async (nextIndex, fromList = false) => {
    if (!projectRef.current || savingRef.current || nextIndex < 0 ||
        nextIndex >= projectRef.current.contacts.length) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    savingRef.current = true;
    setSaving(true);
    try {
      const previousIndex = indexRef.current;
      const contacts = [...projectRef.current.contacts];
      contacts[previousIndex] = { ...contacts[previousIndex], data: { ...formDataRef.current } };
      await updateProject(projectId, { contacts, currentIndex: nextIndex });
      await clearDraftAfterWrite();
      const updatedProj = { ...projectRef.current, contacts, currentIndex: nextIndex };
      projectRef.current = updatedProj;
      changedRef.current = false;
      setProject(updatedProj);
      setCurrentIndex(nextIndex);
      indexRef.current = nextIndex;
      const data = contacts[nextIndex]?.data || {};
      setFormData(data);
      formDataRef.current = data;
      setCallStatus(contacts[nextIndex]?.callStatus || null);
      setCallbackNote(contacts[nextIndex]?.callbackNote || '');
      setCallbackDate(contacts[nextIndex]?.callbackAt?.slice(0, 10) || '');
      if (fromList) setActiveTab('survey');
      if (!draftCleanupPendingRef.current) setSaveError('');
    } catch (error) { showSaveFailure(error, 'Kişiler arasında geçilirken'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const handleNav = (dir) => moveToContact(indexRef.current + dir);
  const jumpToContact = (contactIdx) => moveToContact(contactIdx, true);

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
    if (projectRef.current.role === 'volunteer') {
      const message = 'Görev dosyasındaki kişi listesi değiştirilemez.';
      Platform.OS === 'web' ? window.alert(message) : Alert.alert('Bilgi', message);
      return;
    }
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
    await updateProject(projectId, { contacts: updatedContacts });
    changedRef.current = false;
    await clearDraftAfterWrite();
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

  const retrySave = () => (draftCleanupPendingRef.current ? clearDraftAfterWrite() : forceFlush())
    .then(() => { if (!draftCleanupPendingRef.current) setSaveError(''); })
    .catch((error) => showSaveFailure(error, 'Arama kaydı yeniden denenirken'));

  const value = {
    // State
    project, currentIndex, loading, loadError, saveError, retrySave,
    reloadProject: loadProjectData, saving, formData,
    callStatus, setCallStatus, callbackNote, setCallbackNote, callbackDate, setCallbackDate,
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
