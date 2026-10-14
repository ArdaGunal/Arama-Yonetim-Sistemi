const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

function load(relative, mocks = {}) {
  const { code } = babel.transformFileSync(path.join(__dirname, '..', relative), {
    babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => mocks[name] || require(name), module, module.exports);
  return module.exports;
}

const { createSurveyProject } = load('src/features/surveys/createSurveyProject.js');
const { createCallProject } = load('src/features/calls/createCallProject.js', {
  '../../utils/sourcePreview': {
    selectSourceRows: (analysis, selections) => {
      assert.equal(selections['5000000000'], 2);
      return { selected: [analysis.valid[1]], excluded: [{ sourceRow: 1, reason: 'duplicate' }] };
    },
  },
  '../../utils/newProjectFields': {
    resolveDuplicateSelections: () => ({ '5000000000': 2 }),
    importedContactName: (value) => value || 'İsimsiz kişi',
  },
});

test('survey creation has no call identity or source list and rejects invalid choices', () => {
  const input = { projectName: ' Anket ', templateId: 'survey-template',
    fields: [{ id: 'q', label: ' Geliyor musun? ', type: 'select', options: [' Evet ', ' Hayır '], required: true }],
    randomUUID: () => 'survey-id', createdAt: '2026-10-14T00:00:00.000Z' };
  const project = createSurveyProject(input);
  assert.equal(project.mode, 'survey');
  assert.equal(project.id, project.eventId);
  assert.deepEqual(project.contacts, []);
  assert.equal(project.sourceReview, null);
  assert.deepEqual(project.fields[0].options, ['Evet', 'Hayır']);
  assert.equal(project.fields[0].isSystemField, undefined);
  assert.throws(() => createSurveyProject({ ...input,
    fields: [{ ...input.fields[0], options: ['Evet', 'Evet'] }] }), /iki farklı seçenek/);
});

test('call creation keeps selected source row, phone and field mapping', () => {
  const analysis = { valid: [
    { sourceRow: 1, name: 'Eski', phone: '5000000000', cells: ['Eski', '5000000000', 'Hayır'] },
    { sourceRow: 2, name: 'Yeni', phone: '5000000000', cells: ['Yeni', '5000000000', 'Evet'] },
  ], duplicates: [], error: null };
  const source = { sourceName: 'sentetik.csv', hasHeader: true, rows: [[], [], []], columns: [
    { index: 0, label: 'İsim', role: 'name' }, { index: 1, label: 'Telefon', role: 'phone' },
    { index: 2, label: 'Katılıyor', role: 'field' },
  ] };
  const fields = [
    { id: 'name', label: 'İsim', type: 'text', options: [], isSystemField: 'name' },
    { id: 'phone', label: 'Telefon', type: 'phone', options: [], isSystemField: 'phone' },
    { id: 'answer', label: 'Katılıyor', type: 'select', options: ['Evet', 'Hayır'] },
  ];
  let next = 0;
  const project = createCallProject({ projectName: ' Arama ', analysis, selections: {}, fields, source,
    sourceFieldIds: { 2: 'answer' }, originalWorkbook: null, templateId: null,
    randomUUID: () => `id-${++next}`, createdAt: '2026-10-14T00:00:00.000Z' });
  assert.equal(project.name, 'Arama');
  assert.equal(project.mode, undefined);
  assert.equal(project.contacts.length, 1);
  assert.equal(project.contacts[0].sourceRow, 2);
  assert.equal(project.contacts[0].phone, '5000000000');
  assert.equal(project.contacts[0].data.name, 'Yeni');
  assert.equal(project.contacts[0].data.answer, 'Evet');
  assert.equal(project.sourceReview.excludedRows[0].sourceRow, 1);
  assert.equal(project.sourceReview.columns[2].fieldId, 'answer');
  assert.equal(project.fields.some((field) => field.isSystemField === 'phone'), false);
});
