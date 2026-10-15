/** Görev rezervasyonlarını hazırlayıp tek metadata yazımıyla kaydeder. */
import { createAssignmentFile, normalizeAssignment } from '../../../utils/assignmentFormat';
import { cleanPhoneNumber } from '../../../utils/phoneUtils';
import { currentAnswers, getAvailableContacts, getCallbackCandidates } from '../../../features/calls/pool/assignmentPool';

const findCoordinator = (projects, projectId) => {
  const project = projects.find((item) => item.id === projectId && item.role !== 'volunteer');
  if (!project) throw new Error('Koordinatör etkinliği bulunamadı.');
  return project;
};

const assignmentCount = (project, input) => {
  const count = Number(input.count);
  if (!Number.isInteger(count) || count < 1) throw new Error('Kişi sayısı en az 1 olmalı.');
  if ((project.assignments || []).some((item) => item.assignmentId === input.assignmentId)) {
    throw new Error('Görev kimliği zaten kullanılıyor.');
  }
  return count;
};

const taskRecord = async (assignment, input, reassignedFrom = null) => {
  const packetDigest = JSON.parse(await createAssignmentFile(assignment)).integrity.sha256;
  return { ...assignment, packetDigest, status: 'prepared', sentAt: null, cancelledAt: null,
    resultRevision: 0, resultDigest: null, lastApplied: {}, releasedRecordIds: [],
    ownerType: input.ownerType === 'coordinator' ? 'coordinator' : 'volunteer', reassignedFrom };
};

const markBackupPending = (project) => {
  project.backupPending = true;
  project.backupEpoch = (project.backupEpoch || 0) + 1;
};

export async function writeCallbackAssignment(projectId, input, { loadProjects, getContacts, saveProjects }) {
  const projects = await loadProjects();
  const project = findCoordinator(projects, projectId);
  const count = assignmentCount(project, input);
  const raw = await getContacts(projectId);
  if (!raw) throw new Error('Etkinliğin kişi listesi bulunamadı.');
  const candidates = getCallbackCandidates({ ...project, contacts: JSON.parse(raw) });
  if (!candidates.length) throw new Error('Şu anda geri aranacak kişi yok.');
  const round = candidates[0].round;
  const selected = candidates.filter((item) => item.round === round).slice(0, count);
  if (selected.length < count) throw new Error(`Bu turda yalnızca ${selected.length} kişi atanabilir.`);
  const assignment = normalizeAssignment({
    eventId: project.eventId || project.id, assignmentId: input.assignmentId,
    eventName: project.name, volunteerName: input.volunteerName,
    formVersion: project.formVersion || 1, round, createdAt: input.createdAt,
    fields: project.fields, contacts: selected.map(({ contact }) => ({
      recordId: contact.recordId || contact.id, phone: contact.phone,
      data: currentAnswers(contact.data, project.fields),
      previousCallbackNote: contact.callbackNote || '',
      baseline: { completed: !!contact.completed, callStatus: contact.callStatus || null,
        callbackNote: contact.callbackNote || '', callbackAt: contact.callbackAt || null },
    })),
  });
  const record = await taskRecord(assignment, input);
  project.assignments = [...(project.assignments || []), record];
  markBackupPending(project);
  await saveProjects(projects);
  return record;
}

export async function writeNewAssignment(projectId, input, { loadProjects, getContacts, saveProjects }) {
  const projects = await loadProjects();
  const project = findCoordinator(projects, projectId);
  const count = assignmentCount(project, input);
  const raw = await getContacts(projectId);
  if (!raw) throw new Error('Etkinliğin kişi listesi bulunamadı.');
  const available = getAvailableContacts({ ...project, contacts: JSON.parse(raw) });
  if (count > available.length) throw new Error(`Yalnızca ${available.length} kişi atanabilir.`);
  const assignment = normalizeAssignment({
    eventId: project.eventId || project.id, assignmentId: input.assignmentId,
    eventName: project.name, volunteerName: input.volunteerName,
    formVersion: project.formVersion || 1, round: 1, createdAt: input.createdAt,
    fields: project.fields, contacts: available.slice(0, count).map((contact) => ({
      recordId: contact.recordId || contact.id, phone: contact.phone,
      data: currentAnswers(contact.data, project.fields),
    })),
  });
  const record = await taskRecord(assignment, input);
  project.assignments = [...(project.assignments || []), record];
  project.formLocked = true;
  markBackupPending(project);
  await saveProjects(projects);
  return record;
}

export async function writeAssignmentStatus(projectId, assignmentId, nextStatus, allowSentCancellation,
  { loadProjects, saveProjects, now }) {
  const projects = await loadProjects();
  const project = projects.find((item) => item.id === projectId && item.role !== 'volunteer');
  const assignment = project?.assignments?.find((item) => item.assignmentId === assignmentId);
  if (!assignment) throw new Error('Görev bulunamadı.');
  if (nextStatus === 'sent' && assignment.status === 'prepared') {
    assignment.status = 'sent'; assignment.sentAt = now();
  } else if (nextStatus === 'cancelled' &&
      (assignment.status === 'prepared' || (assignment.status === 'sent' && allowSentCancellation))) {
    assignment.status = 'cancelled'; assignment.cancelledAt = now();
  } else throw new Error('Bu görev durumu değiştirilemez.');
  markBackupPending(project);
  await saveProjects(projects);
  return assignment;
}

export async function writeTransferredContacts(projectId, oldAssignmentId, recordIds, nextInput,
  { loadProjects, getContacts, saveProjects, now }) {
  if (!Array.isArray(recordIds) || !recordIds.length || new Set(recordIds).size !== recordIds.length) {
    throw new Error('Devredilecek kişileri seçin.');
  }
  const projects = await loadProjects();
  const project = projects.find((item) => item.id === projectId && item.role !== 'volunteer');
  const old = project.assignments?.find((item) => item.assignmentId === oldAssignmentId);
  if (!old || !['prepared', 'sent', 'partial'].includes(old.status)) {
    throw new Error('Bu görevden kişi devredilemez.');
  }
  const raw = await getContacts(projectId);
  if (!raw) throw new Error('Ana kişi listesi bulunamadı.');
  const contacts = JSON.parse(raw);
  const master = new Map(contacts.map((contact) => [contact.recordId || contact.id, contact]));
  const oldRows = new Map(old.contacts.map((contact) => [contact.recordId, contact]));
  const alreadyReleased = new Set(old.releasedRecordIds || []);
  const selected = recordIds.map((recordId) => {
    const row = oldRows.get(recordId);
    const contact = master.get(recordId);
    if (!row || !contact || alreadyReleased.has(recordId) || contact.completed ||
        cleanPhoneNumber(row.phone) !== cleanPhoneNumber(contact.phone)) {
      throw new Error('Seçilen kişi artık bu görevde devredilebilir durumda değil.');
    }
    return contact;
  });
  if (nextInput) {
    if (!nextInput.assignmentId || project.assignments.some((item) => item.assignmentId === nextInput.assignmentId)) {
      throw new Error('Yeni görev kimliği zaten kullanılıyor veya boş.');
    }
    const selectedIds = new Set(recordIds);
    const selectedPhones = new Set(selected.map((contact) => cleanPhoneNumber(contact.phone)));
    for (const assignment of project.assignments || []) {
      if (assignment.round !== old.round || ['cancelled', 'transferred'].includes(assignment.status)) continue;
      const released = new Set(assignment.releasedRecordIds || []);
      for (const row of assignment.contacts || []) {
        if (released.has(row.recordId) ||
            (assignment.assignmentId === oldAssignmentId && selectedIds.has(row.recordId))) continue;
        if (selectedIds.has(row.recordId) || selectedPhones.has(cleanPhoneNumber(row.phone))) {
          throw new Error('Kişi başka bir etkin görevde bulunuyor.');
        }
      }
    }
  }
  old.releasedRecordIds = [...alreadyReleased, ...recordIds];
  const remaining = old.contacts.filter((row) => !old.releasedRecordIds.includes(row.recordId) &&
    !master.get(row.recordId)?.completed);
  if (!remaining.length) {
    old.status = old.contacts.some((row) => master.get(row.recordId)?.completed) ? 'transferred' : 'cancelled';
    old.cancelledAt = now();
  }
  let replacement = null;
  if (nextInput) {
    const assignment = normalizeAssignment({
      eventId: project.eventId || project.id, assignmentId: nextInput.assignmentId,
      eventName: project.name, volunteerName: nextInput.volunteerName,
      formVersion: project.formVersion || 1, round: old.round, createdAt: nextInput.createdAt,
      fields: project.fields, contacts: selected.map((contact) => ({
        recordId: contact.recordId || contact.id, phone: contact.phone,
        data: currentAnswers(contact.data, project.fields),
        ...(old.round >= 2 ? { previousCallbackNote: contact.callbackNote || '',
          baseline: { completed: !!contact.completed, callStatus: contact.callStatus || null,
            callbackNote: contact.callbackNote || '', callbackAt: contact.callbackAt || null } } : {}),
      })),
    });
    replacement = await taskRecord(assignment, nextInput, oldAssignmentId);
    project.assignments.push(replacement);
  }
  markBackupPending(project);
  await saveProjects(projects);
  return replacement || { released: recordIds.length };
}
