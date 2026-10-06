import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindTemplateInputs, readTemplateInputs } from './template-inputs.ts';

test('browser forms bind aliases/defaults, required fields and typed values like the API', () => {
  const fields = readTemplateInputs(JSON.stringify({ inputs: [{ key: 'fields.title', required: true }, { key: 'route', defaultValue: 'R-7' }, { key: 'weight', type: 'number' }] }));
  assert.deepEqual({ ...bindTemplateInputs(fields, { Title: 'Dispatch', weight: '1.5' }) }, { title: 'Dispatch', route: 'R-7', weight: '1.5' });
  assert.throws(() => bindTemplateInputs(fields, {}));
  assert.throws(() => bindTemplateInputs(fields, { title: 'Dispatch', weight: 'Infinity' }));
  assert.throws(() => readTemplateInputs('{"inputs":[{"key":"__proto__"}]}'));
});
test('explicit empty input schema differs from legacy inferred fields and automatic bindings', () => {
  assert.deepEqual(readTemplateInputs('{"inputs":[]}'), []);
  const fields = readTemplateInputs('{"elements":[{"type":"text","field":"title"},{"type":"barcode","field":"code"},{"type":"text","field":"date"}]}');
  assert.deepEqual(fields.map(field => [field.key, field.required]), [['title', false], ['code', true]]);
  assert.throws(() => readTemplateInputs(JSON.stringify({ elements: Array.from({length:65},(_,i)=>({field:'field'+i})) })));
});
