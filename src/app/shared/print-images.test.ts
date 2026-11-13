import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { imageFailureMessage, mergeImages, verifyImageBlob, type PrintImage } from './print-images.ts';

const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const image: PrintImage = { artifactId: 'a'.repeat(64), localJobId: 17, attempt: 1, copyIndex: 1, copyCount: 2,
  reprintOfJobId: null, capturedAtUtc: '2026-11-13T11:00:00Z', widthMm: 55, heightMm: 25, dpiX: 203, dpiY: 203,
  pixelWidth: 440, pixelHeight: 200, templateCode: 'TEST', sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length };
test('download verification rejects substituted or non-PNG content before creating a URL', async () => {
  await verifyImageBlob(new Blob([bytes], { type: 'image/png' }), image);
  await assert.rejects(verifyImageBlob(new Blob([bytes], { type: 'text/html' }), image));
  await assert.rejects(verifyImageBlob(new Blob([bytes], { type: 'image/png' }), { ...image, sha256: 'b'.repeat(64) }));
  await assert.rejects(verifyImageBlob(new Blob([bytes], { type: 'image/png' }), { ...image, byteLength: 999 }));
});
test('pagination retains separate copies and attempts, deduplicating only the same artifact', () => {
  const second = { ...image, artifactId: 'b'.repeat(64), copyIndex: 2 };
  const reprint = { ...image, artifactId: 'c'.repeat(64), attempt: 2, reprintOfJobId: 16 };
  assert.deepEqual(mergeImages([second], [reprint, image, second]).map(row => row.artifactId), [image.artifactId, second.artifactId, reprint.artifactId]);
  assert.throws(() => mergeImages([image], [{ ...image, sha256: 'b'.repeat(64) }]), /identity_conflict/);
});
test('unavailable, unauthorized, disabled storage and transport errors have distinct messages', () => {
  assert.equal(new Set([404, 403, 503, 500].map(imageFailureMessage)).size, 4);
  assert.equal(imageFailureMessage(401), imageFailureMessage(403));
});
