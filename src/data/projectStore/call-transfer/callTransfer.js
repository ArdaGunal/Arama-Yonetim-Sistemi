import { createAssignmentFile, normalizeAssignment } from '../../../utils/assignmentFormat';
import { canonicalJson } from '../../../utils/canonicalJson';
import { createResultFile, normalizeResult } from '../../../utils/resultFormat';
import { applyPreview, previewResultMerge } from '../../../utils/resultMerge';

/** Gönüllü görevini açma, sonuç dosyalama ve ana arama listesine birleştirme. */
export function createCallTransferOperations({
  AsyncStorage, Crypto, keys, enqueueWrite, getAllProjects, saveAllProjects,
  getProject, waitForPendingWrites, recoverMergeAfterFailure, setMergeInProgress,
}) {
  const { PROJECTS_KEY, PROJECT_DATA_PREFIX, MERGE_JOURNAL_KEY } = keys;

  async function importVolunteerAssignment(assignment, digest) {
    const packet = normalizeAssignment(assignment);
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Görev özeti geçersiz.');
    return enqueueWrite(async () => {
      const projects = await getAllProjects();
      const existing = projects.find((item) => item.id === packet.assignmentId);
      if (existing) {
        if (existing.role === 'volunteer' && existing.eventId === packet.eventId && existing.importDigest === digest) return 'already-present';
        throw new Error('Bu görev kimliği cihazda farklı içerikle var. Mevcut veriler korunuyor.');
      }
      const contacts = packet.contacts.map((contact) => ({ id: contact.recordId, recordId: contact.recordId,
        phone: contact.phone, data: { ...contact.data }, completed: false, completedAt: null,
        callStatus: null, callbackNote: '', callbackAt: null, attempts: [],
        previousCallbackNote: contact.previousCallbackNote || '', sourceRow: null }));
      const project = {
        id: packet.assignmentId, eventId: packet.eventId, assignmentId: packet.assignmentId,
        role: 'volunteer', importDigest: digest, round: packet.round, resultRevision: 0,
        resultSourceId: Crypto.randomUUID(),
        resultDataEpoch: 0, resultExportedEpoch: 0,
        name: `${packet.eventName} · ${packet.volunteerName}`,
        createdAt: packet.createdAt, currentIndex: 0, formVersion: packet.formVersion, formLocked: true,
        templateId: null, sourceReview: null, fields: packet.fields,
        totalContacts: contacts.length, completedContacts: 0, assignments: [],
      };
      const key = PROJECT_DATA_PREFIX + project.id;
      if (await AsyncStorage.getItem(key)) throw new Error('Bu kimlikte eksik bir yerel kayıt var.');
      await AsyncStorage.setItem(key, JSON.stringify(contacts));
      try { await saveAllProjects([project, ...projects]); }
      catch (error) {
        try { await AsyncStorage.removeItem(key); }
        catch (cleanupError) {
          throw new Error(`Görev kaydedilemedi: ${error.message || error}. Oluşturulan kişi dosyası temizlenemedi: ${cleanupError.message || cleanupError}.`);
        }
        throw error;
      }
      return 'imported';
    });
  }

  /** Her paylaşımda artan sürüm numarasıyla gönüllünün son durumunu dosyalar. */
  async function createVolunteerResultFile(projectId) {
    return enqueueWrite(async () => {
      const projects = await getAllProjects();
      const project = projects.find((item) => item.id === projectId && item.role === 'volunteer');
      if (!project) throw new Error('Gönüllü görevi bulunamadı.');
      const raw = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
      if (!raw) throw new Error('Görev kişileri bulunamadı.');
      const contacts = JSON.parse(raw);
      const revision = (project.resultRevision || 0) + 1;
      project.resultSourceId ||= Crypto.randomUUID();
      const result = normalizeResult({ eventId: project.eventId, assignmentId: project.assignmentId,
        formVersion: project.formVersion, round: project.round || 1, revision,
        sourceId: project.resultSourceId,
        assignmentDigest: project.importDigest, exportedAt: new Date().toISOString(), fields: project.fields,
        contacts: contacts.map((contact) => ({ recordId: contact.recordId || contact.id,
          phone: contact.phone, data: contact.data || {}, completed: !!contact.completed,
          completedAt: contact.completedAt || null, callStatus: contact.callStatus || null,
          callbackNote: contact.callbackNote || '', callbackAt: contact.callbackAt || null,
          attempts: contact.attempts || [] })) });
      const content = await createResultFile(result);
      project.resultRevision = revision;
      await saveAllProjects(projects);
      return { content, revision, completed: contacts.filter((contact) => contact.completed).length,
        total: contacts.length,
        epoch: project.resultDataEpoch || (project.completedContacts > 0 ? 1 : 0) };
    });
  }

  /** Yalnızca dışa aktarılan görüntü hâlâ güncelse hatırlatmayı kapatır. */
  async function markVolunteerResultExported(projectId, revision, expectedEpoch) {
    return enqueueWrite(async () => {
      const projects = await getAllProjects();
      const project = projects.find((item) => item.id === projectId && item.role === 'volunteer');
      if (!project) throw new Error('Gönüllü görevi bulunamadı.');
      const currentEpoch = project.resultDataEpoch || (project.completedContacts > 0 ? 1 : 0);
      if (project.resultRevision !== revision || currentEpoch !== expectedEpoch) return false;
      project.resultDataEpoch = currentEpoch;
      project.resultExportedEpoch = currentEpoch;
      await saveAllProjects(projects);
      return true;
    });
  }

  /** Eski görevler için güvenli tarafta kalıp tamamlanan cevapları yeniden dışa aktarmayı ister. */
  function hasUnexportedVolunteerResult(project) {
    if (project?.role !== 'volunteer') return false;
    if (!Number.isInteger(project.resultDataEpoch)) return (project.completedContacts || 0) > 0;
    return project.resultDataEpoch > (project.resultExportedEpoch || 0);
  }

  async function projectWithDigests(project) {
    const assignments = await Promise.all((project.assignments || []).map(async (item) => ({ ...item,
      packetDigest: item.packetDigest || JSON.parse(await createAssignmentFile(item)).integrity.sha256 })));
    return { ...project, assignments };
  }

  async function previewImportedResults(projectId, packets) {
    await waitForPendingWrites();
    const project = await getProject(projectId);
    if (!project) throw new Error('Etkinlik bulunamadı.');
    const prepared = await projectWithDigests(project);
    const preview = previewResultMerge(prepared, packets);
    return { ...preview, snapshot: canonicalJson({ contacts: project.contacts, assignments: project.assignments }) };
  }

  /** Önizleme değişmediyse bütün sonucu uygular; kesinti halinde eski duruma dönen günlük bırakır. */
  async function applyImportedResults(projectId, packets, decisions, expectedSnapshot) {
    return enqueueWrite(async () => {
      const projectsRaw = await AsyncStorage.getItem(PROJECTS_KEY);
      const contactsRaw = await AsyncStorage.getItem(PROJECT_DATA_PREFIX + projectId);
      if (!projectsRaw || !contactsRaw) throw new Error('Ana etkinlik bulunamadı.');
      const projects = JSON.parse(projectsRaw);
      const index = projects.findIndex((item) => item.id === projectId && item.role !== 'volunteer');
      if (index < 0) throw new Error('Ana etkinlik bulunamadı.');
      const project = { ...projects[index], contacts: JSON.parse(contactsRaw) };
      if (canonicalJson({ contacts: project.contacts, assignments: project.assignments }) !== expectedSnapshot) {
        throw new Error('Etkinlik önizlemeden sonra değişti. Dosyaları yeniden inceleyin.');
      }
      const prepared = await projectWithDigests(project);
      const preview = previewResultMerge(prepared, packets);
      const next = applyPreview(prepared, preview, decisions);
      const { contacts, ...meta } = next;
      meta.backupPending = true;
      meta.backupEpoch = (project.backupEpoch || 0) + 1;
      projects[index] = meta;
      const journal = JSON.stringify({ projectId, projectsRaw, contactsRaw });
      await AsyncStorage.setItem(MERGE_JOURNAL_KEY, journal);
      setMergeInProgress(true);
      try {
        await AsyncStorage.setItem(PROJECT_DATA_PREFIX + projectId, JSON.stringify(contacts));
        await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
        await AsyncStorage.removeItem(MERGE_JOURNAL_KEY);
      } catch (error) {
        setMergeInProgress(false);
        await recoverMergeAfterFailure(error, 'Görev sonuçlarını birleştirme');
      } finally { setMergeInProgress(false); }
      return { changed: preview.changes.length, conflicts: preview.conflicts.length,
        skipped: preview.skipped.length };
    });
  }

  return { importVolunteerAssignment, createVolunteerResultFile, markVolunteerResultExported, hasUnexportedVolunteerResult, previewImportedResults, applyImportedResults };
}
