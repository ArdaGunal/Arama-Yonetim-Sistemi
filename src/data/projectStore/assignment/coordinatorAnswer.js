/** Koordinatörün kendi görevindeki cevabı ana listeye uygulamadan önce doğrular. */
import { cleanPhoneNumber } from '../../../utils/phoneUtils';
import { CALL_STATUSES } from '../../../utils/resultFormat';
import { missingRequiredField } from '../../../utils/formValidation';
import { currentAnswers } from '../../../features/calls/pool/assignmentPool';

export function prepareCoordinatorAnswer(projectsRaw, contactsRaw, projectId, assignmentId,
  recordId, input, { createId, now }) {
  const projects = JSON.parse(projectsRaw);
  const index = projects.findIndex((item) => item.id === projectId && item.role !== 'volunteer');
  if (index < 0) throw new Error('Ana etkinlik bulunamadı.');
  const project = projects[index];
  const assignment = project.assignments?.find((item) => item.assignmentId === assignmentId);
  if (!assignment || assignment.ownerType !== 'coordinator' ||
      ['cancelled', 'transferred'].includes(assignment.status) ||
      (assignment.releasedRecordIds || []).includes(recordId)) {
    throw new Error('Bu kişi artık sizin görevinizde değil.');
  }
  const taskRow = assignment.contacts.find((row) => row.recordId === recordId);
  const contacts = JSON.parse(contactsRaw);
  const contactIndex = contacts.findIndex((row) => (row.recordId || row.id) === recordId);
  const old = contacts[contactIndex];
  if (!taskRow || !old || cleanPhoneNumber(taskRow.phone) !== cleanPhoneNumber(old.phone)) {
    throw new Error('Görev kişisi ana listeyle uyuşmuyor.');
  }
  const newer = (project.assignments || []).some((item) => item.assignmentId !== assignmentId &&
    !['cancelled', 'transferred'].includes(item.status) && item.round >= assignment.round &&
    !(item.releasedRecordIds || []).includes(recordId) &&
    item.contacts.some((row) => row.recordId === recordId));
  if (newer) throw new Error('Bu kişi başka bir göreve devredilmiş. Ekranı yenileyin.');
  if (!input || !CALL_STATUSES.includes(input.callStatus) ||
      !input.data || typeof input.data !== 'object' || Array.isArray(input.data) ||
      typeof input.callbackNote !== 'string' || input.callbackNote.length > 2000 ||
      (input.callbackAt != null && !Number.isFinite(Date.parse(input.callbackAt)))) {
    throw new Error('Arama cevabı geçersiz.');
  }
  const fieldIds = new Set(assignment.fields.map((field) => field.id));
  if (Object.entries(input.data).some(([id, value]) => !fieldIds.has(id) || typeof value !== 'string')) {
    throw new Error('Arama cevabı görevin formuna uymuyor.');
  }
  const data = { ...old.data, ...input.data };
  const missing = missingRequiredField(assignment.fields, data, input.callStatus);
  if (missing) throw new Error(`"${missing.label}" cevabını girin.`);
  const at = now();
  const callbackNote = input.callStatus === 'later' ? input.callbackNote.trim() : '';
  const callbackAt = input.callStatus === 'later' ? input.callbackAt || null : null;
  const attempt = { id: createId(), at, status: input.callStatus,
    note: callbackNote, data: currentAnswers(data, assignment.fields) };
  const updated = { ...old, data, completed: true, completedAt: at,
    callStatus: input.callStatus, callbackNote, callbackAt,
    attempts: [...(old.attempts || []), attempt] };
  contacts[contactIndex] = updated;
  assignment.lastApplied = { ...(assignment.lastApplied || {}), [recordId]: {
    data: currentAnswers(data, assignment.fields), completed: true,
    callStatus: input.callStatus, callbackNote, callbackAt,
  } };
  const released = new Set(assignment.releasedRecordIds || []);
  assignment.status = assignment.contacts.every((row) => released.has(row.recordId) ||
    !!assignment.lastApplied[row.recordId]?.completed)
    ? released.size ? 'transferred' : 'completed' : 'partial';
  project.completedContacts = contacts.filter((row) => row.completed).length;
  project.backupPending = true;
  project.backupEpoch = (project.backupEpoch || 0) + 1;
  return { projects, contacts, updated, assignmentStatus: assignment.status };
}
