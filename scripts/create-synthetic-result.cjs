// An Android incoming-file smoke test packet. It uses a deliberately unmatched event.
const crypto = require('node:crypto');
const fs = require('node:fs');

const at = '2026-10-14T09:00:00.000Z';
const result = {
  eventId: 'synthetic-unmatched-event', assignmentId: 'synthetic-inbox-task',
  formVersion: 1, round: 1, revision: 1, sourceId: 'synthetic-device',
  assignmentDigest: '0'.repeat(64), exportedAt: at,
  fields: [{ id: 'name', label: 'İsim Soyisim', type: 'text', options: [], order: 0, isSystemField: 'name' }],
  contacts: [{ recordId: 'synthetic-record', phone: '+905550001001',
    data: { name: 'Sentetik Kişi' }, completed: false, completedAt: null,
    callStatus: null, callbackNote: '', callbackAt: null, attempts: [] }],
};
const body = { format: 'arama-yonetim-sistemi', schemaVersion: 2, kind: 'result',
  eventId: result.eventId, assignmentId: result.assignmentId, exportedAt: at, payload: { result } };
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, sorted(value[key])]));
  return value;
}
const sha256 = crypto.createHash('sha256').update(JSON.stringify(sorted(body))).digest('hex');
const output = process.argv[2] || 'synthetic-inbox.ays';
fs.writeFileSync(output, JSON.stringify({ ...body, integrity: { algorithm: 'SHA-256', sha256 } }));
console.log(output);
