import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addElement, addInput, canvasSize, canvasTransform, duplicateElement, elementValue, inputsOf, layoutElements, moveLayer, movedGeometry, outsideBounds, parseLayout, patchElement, removeElement, removeInput, rotation, safeColor, sampleInputs, serializeLayout, setInput, unrotatePoint, validateLayout, visualElements } from './template-layout.ts';

const size = {width: 57, height: 40};
const original = {version: 'vendor-extension', rotation: 0, vendor: {keep: [1, 2]}, elements: [{type: 'text', x: 3, y: 4, width: 50, height: 8, fontSizePt: 14, field: 'title', prefix: '→ ', custom: {retain: true}}, {type: 'vendor-logo', assetId: 'private-reference'}]};

test('editing one property preserves extensions, aliases, order and the source object', () => {
  const doc = parseLayout(JSON.stringify(original));
  const changed = patchElement(doc, 0, {x: 5});
  assert.deepEqual(doc, original);
  assert.deepEqual(changed, {...original, elements: [{...original.elements[0], x: 5}, original.elements[1]]});
  assert.deepEqual(parseLayout(serializeLayout(changed)), changed);
  assert.equal(visualElements(changed, size)[1].type, null);
});
test('editing a known alias replaces only aliases of that property', () => {
  const doc = {Elements: [{type: 'text', FontSizePt: '12', FontSize: 13, X: 3, extension: 9}]};
  const changed = patchElement(doc, 0, {fontSize: 18});
  assert.deepEqual(layoutElements(changed), [{type: 'text', fontSize: 18, X: 3, extension: 9}]);
  assert.equal(visualElements(changed, size)[0].fontSize, 18);
});
test('geometry and millimetre canvas follow all four Windows rotations', () => {
  const transforms = ['','matrix(0 1 -1 0 57 0)','matrix(-1 0 0 -1 57 40)','matrix(0 -1 1 0 0 40)'];
  const screenPoints = [{x: 7,y: 9},{x: 48,y: 7},{x: 50,y: 31},{x: 9,y: 33}];
  [0,90,180,270].forEach((angle, index) => {
    const doc = {rotateDegrees: angle};
    assert.equal(canvasTransform(doc,size),transforms[index]);
    assert.deepEqual(canvasSize(doc,size),angle % 180 ? {width:40,height:57} : size);
    assert.deepEqual(unrotatePoint(screenPoints[index],doc,size),{x:7,y:9});
  });
  assert.equal(rotation({rotationDegrees:-90}),270);
  assert.equal(rotation({rotateDegrees:42}),0);
});
test('movement and resize clamp to the label with one decimal precision', () => {
  const element = {x:3,y:4,width:20,height:10};
  assert.deepEqual(movedGeometry(element,100,-100,size),{x:37,y:0,width:20,height:10});
  assert.deepEqual(movedGeometry(element,.14,.26,size),{x:3.1,y:4.3,width:20,height:10});
  assert.deepEqual(movedGeometry(element,100,100,size,true),{x:3,y:4,width:54,height:36});
  assert.equal(movedGeometry(element,-100,-100,size,true).width,.5);
  assert.equal(outsideBounds({...element,x:50},size),true);
  assert.equal(outsideBounds(element,size),false);
});
test('layer operations preserve unsupported elements unless explicitly removed', () => {
  const moved = moveLayer(original,0,1);
  assert.equal(layoutElements(moved)[0],original.elements[1]);
  assert.equal(layoutElements(moved)[1],original.elements[0]);
  assert.deepEqual(removeElement(moved,1)['elements'],[original.elements[1]]);
  assert.equal(moveLayer(original,0,-1),original);
});
test('new and duplicated elements fit even small and rotated labels', () => {
  const tiny = addElement({rotateDegrees:90},'qrcode',{width:3,height:2});
  assert.equal(outsideBounds(visualElements(tiny,{width:3,height:2})[0],{width:2,height:3}),false);
  const duplicate = duplicateElement(original,0,size);
  assert.equal(layoutElements(duplicate).length,3);
  assert.deepEqual(layoutElements(duplicate)[2]['custom'],{retain:true});
  assert.equal(outsideBounds(visualElements(duplicate,size)[2],size),false);
});
test('geometry edits retain absent versus explicit empty input schemas', () => {
  const inferred = patchElement(original,0,{x:6});
  assert.equal(Object.hasOwn(inferred,'inputs'),false);
  assert.deepEqual(inputsOf(inferred).map(input=>input.key),['title']);
  const explicit = patchElement({...original, inputs:[]},0,{x:6});
  assert.deepEqual(inputsOf(explicit),[]);
  assert.deepEqual(explicit['inputs'],[]);
});
test('input rename updates case-insensitive field bindings and preserves extensions', () => {
  const doc = {...original, elements:[{type:'text',field:'fields.TITLE',x:2,keep:true}], inputs:[{key:'title',label:'Name',required:true,metadata:'preserve'}]};
  const result = setInput(doc,0,{key:'dispatch'});
  assert.equal(layoutElements(result)[0]['field'],'dispatch');
  assert.equal(layoutElements(result)[0]['keep'],true);
  assert.equal((result['inputs'] as Record<string, unknown>[])[0]['metadata'],'preserve');
  assert.equal(doc.elements[0].field,'fields.TITLE');
});
test('bound input deletion is rejected and unbound deletion creates explicit schema', () => {
  assert.throws(()=>removeInput(original,0),/χρησιμοποιείται/);
  const unused = {elements:[{type:'text',text:'Constant'}],inputs:[{key:'unused'}]};
  assert.deepEqual(removeInput(unused,0)['inputs'],[]);
});
test('reserved, duplicate and invalid typed inputs cannot corrupt the draft', () => {
  const doc={inputs:[{key:'one',type:'number',defaultValue:'10'},{key:'two',type:'text'}]};
  for (const key of ['date','fields.quantity','__proto__','constructor','two','']) assert.throws(()=>setInput(doc,0,{key}));
  assert.throws(()=>setInput(doc,0,{defaultValue:'not-a-number'}));
  assert.equal(doc.inputs[0].key,'one');
  assert.equal(addInput({inputs:[{key:'field1'},{key:'FIELD2'}]}).key,'field3');
});
test('validation distinguishes bad JSON, numeric values and UTF-8 byte size', () => {
  assert.notEqual(validateLayout('[]',size),null);
  assert.notEqual(validateLayout('{',size),null);
  assert.notEqual(validateLayout(JSON.stringify({elements:[{type:'text',x:'Infinity'}]}),size),null);
  assert.notEqual(validateLayout(JSON.stringify({elements:[],note:'α'.repeat(17000)}),size),null);
  assert.notEqual(validateLayout('{}',{width:NaN,height:40}),null);
  assert.equal(validateLayout(JSON.stringify(original),size),null);
  assert.equal(validateLayout('{}',size),null);
});
test('preview values use actual defaults and usable symbol samples without altering inputs', () => {
  const doc={elements:[{type:'barcode',field:'lot'},{type:'text',field:'name'}],inputs:[{key:'lot',label:'Παρτίδα'},{key:'name',defaultValue:'Καφές'}]};
  assert.deepEqual(sampleInputs(doc),{lot:'DM-0001',name:'Καφές'});
  const e=visualElements({elements:[{type:'text',field:'fields.NAME',prefix:'[',suffix:']',format:'upper'}]},size)[0];
  assert.equal(elementValue(e,{name:'coffee'}),'[COFFEE]');
  assert.equal(elementValue({...e,text:'Fixed'}, {name:'coffee'}),'[FIXED]');
});
test('colours and text cannot become markup, CSS URLs or prototype values', () => {
  assert.equal(safeColor('url(https://example.test/track)','black'),'black');
  assert.equal(safeColor('#f8fafc','black'),'#f8fafc');
  const e=visualElements({elements:[{type:'text',field:'__proto__'}]},size)[0];
  assert.equal(elementValue(e,{}),'{{__proto__}}');
  assert.equal(elementValue({...e,text:'<img onerror=alert(1)>'},{}),'<img onerror=alert(1)>');
});
