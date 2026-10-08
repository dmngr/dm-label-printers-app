import assert from 'node:assert/strict';
import test from 'node:test';
import {archiveChoices, choiceEntry} from './template-archive.ts';
const active = {id:'a',version:4,name:'Active',width:57,height:40,updatedAtUtc:''};
const old = {...active,id:'b',archived:true,archiveRevision:1};
const unused = {...old,id:'c'};
const saved = {revision:3,inherit:false,entries:[{templateId:'b',version:1,printerName:'Thermal'}]};
test('archived assigned choice stays visible after an unsaved removal, but unrelated archives do not', () => {
  assert.deepEqual(archiveChoices([active,old,unused], saved, saved),[active,old]);
  assert.deepEqual(archiveChoices([active,old,unused], {...saved,entries:[]}, saved),[active,old]);
  assert.deepEqual(archiveChoices([active,old,unused], null, null),[active]);
});
test('undoing removal keeps the exact saved version and printer; a new archive is never selectable', () => {
  assert.deepEqual(choiceEntry(old,saved),saved.entries[0]);
  assert.equal(choiceEntry(unused,saved),undefined);
  assert.deepEqual(choiceEntry(active,saved),{templateId:'a',version:4});
});
test('a draft reference archived elsewhere stays visible so the user can remove it', () => {
  assert.deepEqual(archiveChoices([unused],{...saved,entries:[{templateId:'c',version:2}]},saved),[unused]);
});
