import { cleanPhoneNumber } from '../../../utils/phoneUtils';

const ACTIVE_ASSIGNMENT_STATUSES = new Set(['prepared', 'sent', 'partial', 'completed']);
export const currentAnswers = (data, fields) => Object.fromEntries(
  (fields || []).filter((field) => typeof data?.[field.id] === 'string')
    .map((field) => [field.id, data[field.id]]));

/** İlk turda kimliği veya telefonu etkin göreve ayrılmış kişileri havuzdan çıkarır. */
export function getAvailableContacts(project) {
  const reservedIds = new Set();
  const reservedPhones = new Set();
  const returnedIds = new Set();
  for (const assignment of project.assignments || []) {
    if (assignment.round !== 1) continue;
    if (assignment.status === 'cancelled') {
      for (const contact of assignment.contacts || []) returnedIds.add(contact.recordId);
      continue;
    }
    for (const recordId of assignment.releasedRecordIds || []) returnedIds.add(recordId);
    if (!ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)) continue;
    const released = new Set(assignment.releasedRecordIds || []);
    for (const contact of assignment.contacts || []) {
      if (released.has(contact.recordId)) continue;
      reservedIds.add(contact.recordId);
      reservedPhones.add(cleanPhoneNumber(contact.phone));
    }
  }
  const seenPhones = new Set();
  const available = (project.contacts || []).filter((contact) => {
    const phone = cleanPhoneNumber(contact.phone);
    const recordId = contact.recordId || contact.id;
    if (!phone || contact.completed || reservedIds.has(recordId) || reservedPhones.has(phone) || seenPhones.has(phone)) return false;
    seenPhones.add(phone);
    return true;
  });
  return [...available.filter((contact) => returnedIds.has(contact.recordId || contact.id)),
    ...available.filter((contact) => !returnedIds.has(contact.recordId || contact.id))];
}

/** İptal sonrası bekleyen ve henüz yeni bir göreve ayrılmamış ilk tur kişileri. */
export function getReturnedContacts(project) {
  const returnedIds = new Set((project.assignments || [])
    .filter((assignment) => assignment.round === 1)
    .flatMap((assignment) => assignment.status === 'cancelled'
      ? (assignment.contacts || []).map((contact) => contact.recordId)
      : assignment.releasedRecordIds || []));
  return getAvailableContacts(project).filter((contact) => returnedIds.has(contact.recordId || contact.id));
}

/** Sonra ara sonucunu almış ve hâlihazırda geri arama görevinde olmayan kişiler. */
export function getCallbackCandidates(project) {
  const activeIds = new Set();
  const activePhones = new Set();
  const latestByRecord = new Map();
  for (const assignment of project.assignments || []) {
    if (assignment.status === 'cancelled') continue;
    const round = assignment.round || 1;
    const isActiveCallback = round >= 2 && ['prepared', 'sent', 'partial'].includes(assignment.status);
    for (const row of assignment.contacts || []) {
      if ((assignment.releasedRecordIds || []).includes(row.recordId)) continue;
      const rowDone = assignment.status === 'completed' || assignment.status === 'transferred' ||
        !!assignment.lastApplied?.[row.recordId]?.completed;
      if (isActiveCallback && !rowDone) {
        activeIds.add(row.recordId);
        activePhones.add(cleanPhoneNumber(row.phone));
      }
      const prior = latestByRecord.get(row.recordId);
      if (!prior || round > prior.round) {
        latestByRecord.set(row.recordId, { round, unfinished: !rowDone });
      } else if (round === prior.round && !rowDone) {
        prior.unfinished = true;
      }
    }
  }
  const seenPhones = new Set();
  return (project.contacts || []).flatMap((contact) => {
    if (contact.callStatus !== 'later' || !contact.completed) return [];
    const recordId = contact.recordId || contact.id;
    const phone = cleanPhoneNumber(contact.phone);
    if (!phone || seenPhones.has(phone) || activeIds.has(recordId) || activePhones.has(phone)) return [];
    seenPhones.add(phone);
    const prior = latestByRecord.get(recordId);
    if (prior?.unfinished) return [];
    return [{ contact, round: (prior?.round || 1) + 1 }];
  });
}

