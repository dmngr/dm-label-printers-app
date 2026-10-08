import assert from 'node:assert/strict';
import { test } from 'node:test';
import { geometryPatch, patchElement, visualElements } from './template-layout.ts';

test('drag/keyboard movement changes only position, never copies the visual projection', () => {
  const raw = {Type: 'text', X: 2, Y: 3, Field: 'fields.title', custom: {keep: true}, fontSizePt: 10};
  const doc = {elements: [raw]}, size = {width: 57, height: 40};
  const visual = visualElements(doc, size)[0];
  const patch = geometryPatch(visual, 1, 2, size);
  assert.deepEqual(Object.keys(patch).sort(), ['x', 'y']);
  assert.deepEqual(patchElement(doc, 0, patch), {elements: [{Type: 'text', Field: 'fields.title', custom: {keep: true}, fontSizePt: 10, x: 2, y: 5}]});
  assert.equal(raw.X, 2);
});
test('resize changes only dimensions and leaves aliases/format/extensions intact', () => {
  const raw = {type: 'text', x: 2, y: 3, width: 12, height: 5, fontSizePt: 10, format: 'N2', extension: 'keep'};
  const doc = {elements: [raw]}, size = {width: 57, height: 40};
  const patch = geometryPatch(visualElements(doc, size)[0], 2, 3, size, true);
  assert.deepEqual(patch, {width: 14, height: 8});
  assert.deepEqual(patchElement(doc, 0, patch), {elements: [{...raw, width: 14, height: 8}]});
});
