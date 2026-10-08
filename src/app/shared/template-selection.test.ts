import assert from 'node:assert/strict';
import test from 'node:test';
import { findActiveSelection, preserveTemplateValues, templatePrintChanged } from './template-selection.ts';
import type { TemplateInput } from './template-inputs.ts';

const template = { id: 7, code: 'CLOUD_abc', layoutJson: '{}', width: 58, height: 40, printerName: 'Printer A', isActive: true };
const field = (key: string, type: TemplateInput['type'] = 'text', defaultValue = ''): TemplateInput => ({ key, label: key, type, required: false, defaultValue });

test('active selection matches identity, never a removed, inactive or reused id', () => {
  assert.equal(findActiveSelection(template, []), undefined);
  assert.equal(findActiveSelection(template, [{ ...template, isActive: false }]), undefined);
  assert.equal(findActiveSelection(template, [{ ...template, code: 'OTHER' }]), undefined);
  const renamed = { ...template, name: 'New display name' };
  assert.equal(findActiveSelection(template, [renamed]), renamed);
});

test('layout, label size and printer changes require review; a mere refreshed object does not', () => {
  assert.equal(templatePrintChanged(template, { ...template }), false);
  for (const changed of [{ layoutJson: '{"inputs":[]}' }, { width: 60 }, { height: 50 }, { printerName: 'Printer B' }]) {
    assert.equal(templatePrintChanged(template, { ...template, ...changed }), true);
  }
});

test('draft keeps compatible fields, including deliberate blanks, and defaults new or changed types', () => {
  const before = [field('title'), field('notes'), field('batch'), field('removed')];
  const after = [field('TITLE'), field('notes', 'text', 'default'), field('batch', 'number', '12'), field('date', 'date', '2026-10-08')];
  assert.deepEqual(preserveTemplateValues(before, after, { title: 'Δοκιμή', notes: '', batch: 'ABC', removed: 'omit' }), {
    TITLE: 'Δοκιμή', notes: '', batch: '12', date: '2026-10-08',
  });
});

test('no-schema changes preserve a populated draft while explicitly empty schemas remove stale fields', () => {
  const fields = [field('productName'), field('commentsText')];
  const values = { productName: 'LN-261008-01', commentsText: 'Do not lose this' };
  assert.deepEqual(preserveTemplateValues(fields, fields, values), values);
  assert.deepEqual(preserveTemplateValues(fields, [], values), {});
});
