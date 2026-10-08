import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationPresentation, retryDraftRevision, type LibraryApplicationStatus } from './library-application.ts';

const item: LibraryApplicationStatus = { deviceCode: 'i', deviceName: 'Kitchen', isOnline: true, state: 'waiting', reasonCode: null,
  capabilityVersion: 1, desired: { selectionId: 'a'.repeat(64), source: 'store', revision: 1, templates: [{ id: 'id', name: 'Dispatch', version: 3 }] },
  lastApplied: null, reportedAtUtc: null };
test('only an exact applied state is green; online and saved choices stay pending', () => {
  assert.equal(applicationPresentation(item).tone, 'pending');
  assert.equal(applicationPresentation(item).desiredText, 'Dispatch · v3');
  for (const state of ['waiting', 'pending', 'offline', 'unsupported', 'failed'] as const)
    assert.notEqual(applicationPresentation({ ...item, state }).tone, 'success');
  assert.equal(applicationPresentation({ ...item, state: 'applied' }).tone, 'success');
  assert.equal(applicationPresentation({ ...item, desired: { ...item.desired, templates: [] } }).desiredText, 'Κανένα ενεργό πρότυπο κοινής βιβλιοθήκης');
});
test('retry is restricted to supported online failures and unknown reasons never expose raw text', () => {
  const failed = { ...item, state: 'failed' as const, reasonCode: 'local_template_modified' };
  assert.equal(applicationPresentation(failed).canRetry, true);
  assert.match(applicationPresentation(failed).detail, /αντίγραφο/);
  assert.equal(applicationPresentation({ ...failed, isOnline: false }).canRetry, false);
  assert.equal(applicationPresentation({ ...failed, capabilityVersion: null }).canRetry, false);
  assert.equal(applicationPresentation({ ...failed, reasonCode: 'private exception' }).detail.includes('private'), false);
});
test('a new desired version keeps the last confirmed version visible; retry preserves a concurrent draft revision', () => {
  const view = applicationPresentation({ ...item, lastApplied: { ...item.desired, templates: [{ id: 'id', name: 'Dispatch', version: 2 }], appliedAtUtc: '2026-10-08T10:00:00Z', confirmedAtUtc: '2026-10-08T10:00:10Z' } });
  assert.equal(view.appliedText, 'Dispatch · v2'); assert.equal(view.desiredText, 'Dispatch · v3'); assert.ok(view.confirmedTime);
  const retry = { accepted: true, previousAssignmentRevision: 3, assignmentRevision: 4 };
  assert.equal(retryDraftRevision(3, retry), 4); assert.equal(retryDraftRevision(8, retry), 8);
});
