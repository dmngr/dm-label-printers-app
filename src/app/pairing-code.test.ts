import assert from 'node:assert/strict';
import test from 'node:test';

import { isValidPairingCode, normalizePairingCode } from './pairing-code.ts';

test('normalizes canonical, lowercase, and compact pairing codes', () => {
  assert.equal(normalizePairingCode('ABCD-EF23'), 'ABCD-EF23');
  assert.equal(normalizePairingCode(' abcd-ef23 '), 'ABCD-EF23');
  assert.equal(normalizePairingCode('ABCDEF23'), 'ABCD-EF23');
  assert.equal(normalizePairingCode('ABCD EF23'), 'ABCD-EF23');
});

test('rejects ambiguous glyphs and malformed query values', () => {
  for (const value of ['', 'ABCD', 'ABCD-EF2', 'ABCD-EF230', 'ABCI-EF23', 'ABCO-EF23', 'ABC0-EF23']) {
    assert.equal(normalizePairingCode(value), '', value);
    assert.equal(isValidPairingCode(value), false, value);
  }
});

test('accepts exactly the Lambda XXXX-XXXX alphabet', () => {
  assert.equal(isValidPairingCode('WXYZ-6789'), true);
  assert.equal(isValidPairingCode('wxyz6789'), true);
});
