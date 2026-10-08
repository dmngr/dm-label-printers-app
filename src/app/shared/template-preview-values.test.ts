import assert from 'node:assert/strict';
import { test } from 'node:test';
import { elementValue, visualElements } from './template-layout.ts';
const size = {width: 57, height: 40};
const element = (field: string, extra = {}) => visualElements({elements: [{type: 'text', field, ...extra}]}, size)[0];
test('automatic print context supports Windows underscore aliases and actual dimensions', () => {
  assert.equal(elementValue(element('label_width_mm'), {}, size), '57');
  assert.equal(elementValue(element('labelSize'), {}, size), '57 x 40 mm');
  assert.equal(elementValue(element('created_at_utc', {format: 'dd/MM/yyyy'}), {}, size), '08/10/2026');
});
test('empty static content and absent bindings do not create phantom barcode values', () => {
  assert.equal(elementValue(element('', {type: 'barcode'}), {}), '');
  assert.equal(elementValue(element('barcodeValue', {type: 'barcode'}), {}), 'DM-0001');
});
test('formatting, trimmed static content and nonblank prefix/suffix match Windows semantics', () => {
  assert.equal(elementValue(element('amount', {format: '0.00', prefix: '€ ', suffix: ' '}), {amount: '12.5'}), '€ 12.50');
  assert.equal(elementValue(element('amount', {text: ' Fixed ', format: 'upper'}), {amount: '12.5'}), 'FIXED');
});
