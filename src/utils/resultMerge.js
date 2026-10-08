import { canonicalJson } from './canonicalJson';
import { cleanPhoneNumber } from './phoneUtils';

const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const answerView = (contact, fieldIds) => ({ data: fieldIds
  ? Object.fromEntries(Object.entries(contact.data || {}).filter(([id]) => fieldIds.has(id)))
  : contact.data || {}, completed: !!contact.completed,
  callStatus: contact.callStatus || null, callbackNote: contact.callbackNote || '', callbackAt: contact.callbackAt || null });

/** Doğrulanmış dosyaları, cihazdaki ana listeye yazmadan önce inceler. */
export function previewResultMerge(project, packets) {
  if (project.role === 'volunteer') throw new Error('Sonuçlar yalnızca ana etkinlikte birleştirilir.');
  const assignments = new Map((project.assignments || []).map((assignment) => [assignment.assignmentId, assignment]));
  const current = new Map(project.contacts.map((contact) => [contact.recordId || contact.id, contact]));
  const latest = new Map();
  for (const packet of packets) {
    const { result, sha256 } = packet;
    const assignment = assignments.get(result.assignmentId);
    if (!assignment || assignment.status === 'cancelled') throw new Error('Bilinmeyen veya iptal edilmiş görev sonucu var.');
    if (result.eventId !== project.eventId && result.eventId !== project.id) throw new Error('Sonuç farklı etkinliğe ait.');
    if (result.formVersion !== assignment.formVersion || result.round !== assignment.round ||
        !same(result.fields, assignment.fields)) throw new Error('Görev formu veya turu uyuşmuyor.');
    if (result.contacts.length !== assignment.contacts.length) throw new Error('Sonuç kişi sayısı görevle uyuşmuyor.');
    const originals = new Map(assignment.contacts.map((contact) => [contact.recordId, contact]));
    for (const row of result.contacts) {
      const original = originals.get(row.recordId);
      if (!original || cleanPhoneNumber(original.phone) !== cleanPhoneNumber(row.phone) || !current.has(row.recordId)) {
        throw new Error('Sonuçta bilinmeyen veya telefonu değişmiş kişi var.');
      }
    }
    const prior = latest.get(result.assignmentId);
    if (prior && prior.result.revision === result.revision && prior.sha256 !== sha256) {
      throw new Error('Aynı görev ve sürüm için iki farklı sonuç dosyası var.');
    }
    if (!prior || result.revision > prior.result.revision) latest.set(result.assignmentId, packet);
  }
  const changes = [];
  const conflicts = [];
  const skipped = [];
  const usedRecords = new Set();
  for (const packet of latest.values()) {
    const { result, sha256 } = packet;
    const assignment = assignments.get(result.assignmentId);
    if (result.assignmentDigest !== assignment.packetDigest) throw new Error('Sonuç farklı görev dosyasından üretildi.');
    if (result.revision < (assignment.resultRevision || 0) ||
        (result.revision === (assignment.resultRevision || 0) && sha256 === assignment.resultDigest)) {
      skipped.push(result.assignmentId); continue;
    }
    if (result.revision === (assignment.resultRevision || 0)) {
      throw new Error('Aynı gönderim sürümünde farklı sonuç var; otomatik birleştirilemez.');
    }
    const originals = new Map(assignment.contacts.map((contact) => [contact.recordId, contact]));
    const assignmentFields = assignment.fields;
    const fieldIds = new Set(assignmentFields.map((field) => field.id));
    for (const incoming of result.contacts) {
      if (!incoming.completed && !incoming.attempts.length) continue;
      if (usedRecords.has(incoming.recordId)) throw new Error('Aynı kişi birden çok sonuç dosyasında var; dosyaları sırayla birleştirin.');
      usedRecords.add(incoming.recordId);
      const old = current.get(incoming.recordId);
      const previous = assignment.lastApplied?.[incoming.recordId];
      const original = originals.get(incoming.recordId);
      const baseline = previous || original.baseline || { data: original.data, completed: false };
      const item = { assignmentId: result.assignmentId, recordId: incoming.recordId,
        name: incoming.data[assignmentFields.find((field) => field.isSystemField === 'name')?.id] || incoming.recordId,
        old, incoming, revision: result.revision,
        differences: [
          ...assignmentFields.filter((field) => (old.data?.[field.id] || '') !== (incoming.data?.[field.id] || ''))
            .map((field) => ({ label: field.label, old: old.data?.[field.id] || 'Boş',
              incoming: incoming.data?.[field.id] || 'Boş' })),
          ...(old.callStatus !== incoming.callStatus ? [{ label: 'Arama sonucu',
            old: old.callStatus || 'Aranmadı', incoming: incoming.callStatus || 'Aranmadı' }] : []),
          ...((old.callbackNote || '') !== incoming.callbackNote ? [{ label: 'Geri arama notu',
            old: old.callbackNote || 'Boş', incoming: incoming.callbackNote || 'Boş' }] : []),
        ] };
      if (!same(answerView(old, fieldIds), answerView(baseline, fieldIds))) conflicts.push(item);
      else changes.push(item);
    }
  }
  return { changes, conflicts, skipped, packets: [...latest.values()] };
}

export function applyPreview(project, preview, decisions = {}) {
  const assignmentFieldIds = new Map((project.assignments || []).map((assignment) =>
    [assignment.assignmentId, assignment.fields.map((field) => field.id)]));
  const replacements = new Map();
  for (const item of preview.changes) replacements.set(item.recordId, item);
  for (const item of preview.conflicts) {
    const decision = decisions[`${item.assignmentId}:${item.recordId}`];
    if (!['incoming', 'keep'].includes(decision)) throw new Error('Tüm çakışmalar için karar verin.');
    if (decision === 'incoming') replacements.set(item.recordId, item);
  }
  const next = { ...project, contacts: project.contacts.map((old) => {
    const item = replacements.get(old.recordId || old.id);
    if (!item) return old;
    const incoming = item.incoming;
    const known = new Set((old.attempts || []).map((attempt) => attempt.id));
    const attempts = [...(old.attempts || []), ...incoming.attempts.filter((attempt) => !known.has(attempt.id))];
    const data = { ...old.data };
    for (const fieldId of assignmentFieldIds.get(item.assignmentId) || []) delete data[fieldId];
    Object.assign(data, incoming.data);
    return { ...old, data, completed: incoming.completed,
      completedAt: incoming.completedAt, callStatus: incoming.callStatus,
      callbackNote: incoming.callbackNote, callbackAt: incoming.callbackAt, attempts };
  }) };
  next.assignments = (project.assignments || []).map((assignment) => {
    const packet = preview.packets.find((item) => item.result.assignmentId === assignment.assignmentId);
    if (!packet || preview.skipped.includes(assignment.assignmentId)) return assignment;
    const lastApplied = { ...(assignment.lastApplied || {}) };
    for (const row of packet.result.contacts) {
      const decision = decisions[`${assignment.assignmentId}:${row.recordId}`];
      if (row.completed && decision !== 'keep') lastApplied[row.recordId] = answerView(row);
    }
    return { ...assignment, status: packet.result.contacts.every((row) => row.completed) ? 'completed' : 'partial',
      resultRevision: packet.result.revision, resultDigest: packet.sha256, lastApplied };
  });
  next.mergeConflicts = [...(project.mergeConflicts || []), ...preview.conflicts.map((item) => ({
    assignmentId: item.assignmentId, recordId: item.recordId,
    decision: decisions[`${item.assignmentId}:${item.recordId}`], at: new Date().toISOString(),
    oldAnswer: JSON.stringify(answerView(item.old)), incomingAnswer: JSON.stringify(answerView(item.incoming)),
  }))];
  next.completedContacts = next.contacts.filter((contact) => contact.completed).length;
  return next;
}
