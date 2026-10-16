import { sameBackupProject } from '../../../utils/backupFormat';

/** Form sürümü ve dış yedekle doğrulanmış proje silme işlemleri. */
export function createProjectLifecycleOperations({
  AsyncStorage, keys, enqueueWrite, getAllProjects, saveAllProjects, getProject,
  loadDraft, readSurveyDraft, loadAttachedSource, removeSourceWorkbook,
}) {
  const { PROJECT_DATA_PREFIX, RESPONSES_PREFIX, DRAFT_KEY } = keys;

  /** Tamamlanan arama veya görev dağıtımından sonra form değişmez. */
  async function lockProjectForm(projectId) {
    return enqueueWrite(async () => {
      const projects = await getAllProjects();
      const project = projects.find((item) => item.id === projectId);
      if (!project) throw new Error('Etkinlik bulunamadı.');
      if (project.formLocked) return project;
      project.formLocked = true;
      await saveAllProjects(projects);
      return project;
    });
  }

  /** Formun yeni sürümünü oluşturur; eski görevlerin soruları ve cevapları saklanır. */
  async function updateProjectForm(projectId, fields) {
    return enqueueWrite(async () => {
      const projects = await getAllProjects();
      const project = projects.find((item) => item.id === projectId);
      if (!project || project.role === 'volunteer') throw new Error('Koordinatör etkinliği bulunamadı.');
      const surveyOnly = project.mode === 'survey';
      const stored = await AsyncStorage.getItem((surveyOnly && project.responseStorage === 1
        ? RESPONSES_PREFIX : PROJECT_DATA_PREFIX) + projectId);
      if (surveyOnly && project.responseStorage === 1 && stored === null) {
        throw new Error('Anket yanıt dosyası bulunamadı.');
      }
      const contacts = stored ? JSON.parse(stored) : project.contacts || [];
      if (await AsyncStorage.getItem(DRAFT_KEY + projectId)) {
        throw new Error(surveyOnly
          ? 'Açık bir anket taslağı var. Önce cevabı kaydedin veya taslağı silin.'
          : 'Açık bir cevap taslağı var. Önce arama ekranındaki kişiyi kaydedin.');
      }
      if (!Array.isArray(fields) || !fields.length ||
          (surveyOnly ? fields.some((field) => field.isSystemField) :
            fields.filter((field) => field.isSystemField === 'name' && field.type === 'text').length !== 1 ||
            fields.some((field) => field.isSystemField && field.isSystemField !== 'name'))) {
        throw new Error(surveyOnly ? 'En az bir anket sorusu gerekli.' : 'İsim alanı gerekli.');
      }
      const ids = new Set();
      for (const field of fields) {
        if (!field.id || ids.has(field.id) || !field.label?.trim() ||
            !['text', 'select'].includes(field.type) || !Array.isArray(field.options) ||
            (field.required !== undefined && typeof field.required !== 'boolean')) {
          throw new Error('Formda geçersiz veya tekrar eden alan var.');
        }
        ids.add(field.id);
        if (field.type === 'select' && (field.options.length < 2 ||
            field.options.some((option) => !option.trim()) ||
            new Set(field.options).size !== field.options.length)) {
          throw new Error(`"${field.label}" şıkları geçersiz.`);
        }
      }
      const locked = !!project.formLocked || contacts.some((contact) => contact.completed);
      if (!locked) {
        for (const contact of contacts) {
          for (const [fieldId, answer] of Object.entries(contact.data || {})) {
            const field = fields.find((item) => item.id === fieldId);
            if (!field) throw new Error('Kaynak kişide dolu olan bir alan silinemez.');
            if (field.type === 'select' && answer && !field.options.includes(answer)) {
              throw new Error(`"${field.label}" için mevcut cevap şıklarda yok.`);
            }
          }
        }
      }
      if (JSON.stringify(project.fields) === JSON.stringify(fields)) return project;
      const oldVersion = project.formVersion || 1;
      const oldFields = project.fields;
      const usedIds = new Set([...(project.formHistory || []).flatMap((item) => item.fields.map((field) => field.id)),
        ...oldFields.map((field) => field.id), ...fields.map((field) => field.id)]);
      const previous = new Map(oldFields.map((field) => [field.id, field]));
      const nextFields = fields.map((field) => {
        const old = previous.get(field.id);
        if (!locked || !old || field.isSystemField === 'name' ||
            (old.label === field.label && old.type === field.type &&
              JSON.stringify(old.options) === JSON.stringify(field.options))) return field;
        let id = `${field.id}_v${oldVersion + 1}`;
        while (usedIds.has(id)) id += '_';
        usedIds.add(id);
        return { ...field, id };
      });
      project.fields = nextFields;
      project.formVersion = oldVersion + 1;
      project.formLocked = locked;
      project.formHistory = [...(project.formHistory || [{ version: oldVersion, fields: oldFields }]),
        { version: project.formVersion, fields: nextFields }];
      const nextIds = new Set(nextFields.map((field) => field.id));
      if (project.sourceReview) project.sourceReview.columns = project.sourceReview.columns.map((column) => ({
        ...column, fieldId: nextIds.has(column.fieldId) ? column.fieldId : null,
      }));
      await saveAllProjects(projects);
      return project;
    });
  }

  /** Dışarı kaydedilen yedekten sonra yalnızca aynı proje görüntüsünü siler. */
  async function deleteProject(projectId, expectedBackup) {
    return enqueueWrite(async () => {
      if (!expectedBackup) throw new Error('Silmeden önce proje yedeği alın.');
      const projects = await getAllProjects();
      const project = await getProject(projectId);
      if (!project) throw new Error('Silinecek proje bulunamadı.');
      project.sourceWorkbook = await loadAttachedSource(project.sourceWorkbookMeta);
      const draft = await loadDraft(projectId);
      if (project.mode === 'survey') project.surveyDraft = await readSurveyDraft(projectId, project);
      if (project.mode !== 'survey' && draft && Number.isInteger(draft.contactIndex) &&
          draft.contactIndex >= 0 && draft.contactIndex < project.contacts.length &&
          draft.formData && typeof draft.formData === 'object' && !Array.isArray(draft.formData)) {
        project.contacts = project.contacts.map((contact, index) =>
          index === draft.contactIndex ? { ...contact, data: { ...draft.formData } } : contact);
      }
      if (!sameBackupProject(project, expectedBackup)) {
        throw new Error('Proje yedekten sonra değişti. Yeni yedek alıp tekrar deneyin.');
      }
      const filtered = projects.filter((p) => p.id !== projectId);
      await saveAllProjects(filtered);
      const cleanupWarnings = [];
      for (const key of [PROJECT_DATA_PREFIX + projectId, RESPONSES_PREFIX + projectId, DRAFT_KEY + projectId]) {
        try { await AsyncStorage.removeItem(key); }
        catch (error) { cleanupWarnings.push(error.message || 'Yerel dosya temizlenemedi.'); }
      }
      if (project.sourceWorkbookMeta) {
        try { await removeSourceWorkbook(project.sourceWorkbookMeta.ref); }
        catch (error) { cleanupWarnings.push(error.message || 'Excel eki temizlenemedi.'); }
      }
      return { cleanupWarnings };
    });
  }

  return { lockProjectForm, updateProjectForm, deleteProject };
}
