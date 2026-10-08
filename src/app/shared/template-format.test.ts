import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewFormat } from './template-format.ts';

test('date and time formats use invariant parsing, not browser locale', () => {
  assert.deepEqual(previewFormat('2026-10-08', 'dd/MM/yyyy'), {value: '08/10/2026', supported: true});
  assert.deepEqual(previewFormat('2026-10-08T09:04:02Z', 'dd-MM-yy HH:mm'), {value: '08-10-26 09:04', supported: true});
  assert.equal(previewFormat('08/10/2026', 'yyyy-MM-dd').value, '2026-08-10');
  assert.equal(previewFormat('09:04:02', 'HH:mm').value, '09:04');
});
test('numeric preview supports precision, grouping and leading zeroes', () => {
  assert.equal(previewFormat('1234.5', 'N2').value, '1,234.50');
  assert.equal(previewFormat('12.5', '0.00').value, '12.50');
  assert.equal(previewFormat('12.5', '0000.0#').value, '0012.5');
  assert.equal(previewFormat('0.15', 'P0').value, '15 %');
});
test('unsupported/invalid formats retain the value and explicitly warn', () => {
  for (const [value, format] of [['2026-02-30', 'dd/MM/yyyy'], ['2026-10-08', 'MMMM'], ['2026-10-08', 'd'], ['12', 'F99'], ['12', '€ 0.00'], ['09:04:02', 'yyyy']]) {
    assert.deepEqual(previewFormat(value, format), {value, supported: false});
  }
});
test('ordinary text and casing remain supported', () => {
  assert.deepEqual(previewFormat('Κείμενο', ''), {value: 'Κείμενο', supported: true});
  assert.equal(previewFormat('abc', ' UPPER ').value, 'ABC');
});
