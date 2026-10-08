/** Visual editing of the Windows LabelLayoutDefinition wire format.
 * Geometry is millimetres, fontSize is points. Edit only the requested keys:
 * imported extensions, aliases and absent-vs-empty input schemas must survive.
 * Unknown element types remain in the document even though they cannot preview.
 */
import { inputKey, readTemplateInputs, type TemplateInput } from './template-inputs.ts';
import { designerCopy as copy } from './template-designer.copy.ts';
import { previewFormat } from './template-format.ts';

export type LayoutObject = Record<string, unknown>;
export type ElementType = 'text' | 'barcode' | 'qrcode' | 'line' | 'box' | 'ellipse';
export interface Size { width: number; height: number; }
export interface Geometry extends Size { x: number; y: number; }
export interface VisualElement extends Geometry {
  index: number; type: ElementType | null; text: string; field: string; prefix: string; suffix: string;
  format: string; fontFamily: string; fontSize: number; bold: boolean; wrap: boolean;
  align: 'left' | 'center' | 'right'; foregroundColor: string; backgroundColor: string;
  borderWidth: number; cornerRadius: number; humanReadable: boolean;
}
const aliases: Record<string, string[]> = {
  text: ['value'], fontSize: ['fontSizePt'], foregroundColor: ['strokeColor', 'color'],
  backgroundColor: ['fillColor'], borderWidth: ['strokeWidth', 'thickness'], cornerRadius: ['radius'],
  rotateDegrees: ['rotationDegrees', 'rotation'],
};
export const elementTypes: ElementType[] = ['text', 'barcode', 'qrcode', 'line', 'box', 'ellipse'];
const typeAliases: Record<string, ElementType> = { text: 'text', barcode: 'barcode', qr: 'qrcode', qrcode: 'qrcode', rule: 'line', line: 'line', rectangle: 'box', rect: 'box', box: 'box', oval: 'ellipse', ellipse: 'ellipse' };
export function isObject(value: unknown): value is LayoutObject { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function property(object: LayoutObject, key: string): unknown {
  for (const candidate of [key, ...(aliases[key] ?? [])]) {
    const found = Object.keys(object).find(name => name.toLowerCase() === candidate.toLowerCase());
    if (found !== undefined && object[found] !== null) return object[found];
  }
  return undefined;
}
export function setProperty(object: LayoutObject, key: string, value: unknown): LayoutObject {
  const updated = { ...object };
  const names = [key, ...(aliases[key] ?? [])].map(name => name.toLowerCase());
  Object.keys(updated).filter(name => names.includes(name.toLowerCase())).forEach(name => delete updated[name]);
  updated[key] = value;
  return updated;
}
export function parseLayout(json: string): LayoutObject {
  let doc: unknown;
  try { doc = JSON.parse(json); } catch { throw new Error(copy.invalidLayout); }
  if (!isObject(doc)) throw new Error(copy.invalidLayout);
  const elements = property(doc, 'elements');
  if (elements !== undefined && elements !== null && (!Array.isArray(elements) || !elements.every(isObject))) throw new Error(copy.invalidLayout);
  if (Array.isArray(elements) && elements.length > 128) throw new Error(copy.tooMany);
  return doc;
}
export function layoutElements(doc: LayoutObject): LayoutObject[] {
  const elements = property(doc, 'elements');
  return Array.isArray(elements) ? elements.filter(isObject) : [];
}
export function serializeLayout(doc: LayoutObject): string { return JSON.stringify(doc, null, 2); }
export function validateLayout(json: string, size: Size): string | null {
  try {
    if (![size.width, size.height].every(n => Number.isFinite(n) && n >= 1 && n <= 1000)) return copy.invalidSize;
    const doc = parseLayout(json);
    if (new TextEncoder().encode(json).length > 32768) return copy.tooLarge;
    readTemplateInputs(json);
    for (const element of layoutElements(doc)) {
      for (const key of ['x', 'y', 'width', 'height', 'fontSize', 'borderWidth', 'cornerRadius']) {
        const value = property(element, key);
        if (value !== undefined && ((typeof value !== 'number' && typeof value !== 'string') || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 10000)) return copy.invalidGeometry;
      }
    }
    return null;
  } catch (error) { return error instanceof Error ? error.message : copy.invalidLayout; }
}
const number = (raw: LayoutObject, key: string, fallback = 0): number => {
  const value = property(raw, key);
  return value !== undefined && Number.isFinite(Number(value)) ? Number(value) : fallback;
};
const string = (raw: LayoutObject, key: string, fallback = ''): string => String(property(raw, key) ?? fallback);
const boolean = (raw: LayoutObject, key: string, fallback = false): boolean => {
  const value = property(raw, key); return value === undefined ? fallback : value === true || String(value).toLowerCase() === 'true';
};
export function rotation(doc: LayoutObject): number {
  const value = number(doc, 'rotateDegrees'); return value % 90 === 0 ? (value % 360 + 360) % 360 : 0;
}
export function canvasSize(doc: LayoutObject, size: Size): Size {
  return rotation(doc) % 180 ? { width: size.height, height: size.width } : size;
}
export function canvasTransform(doc: LayoutObject, size: Size): string {
  switch (rotation(doc)) {
    case 90: return `matrix(0 1 -1 0 ${size.width} 0)`;
    case 180: return `matrix(-1 0 0 -1 ${size.width} ${size.height})`;
    case 270: return `matrix(0 -1 1 0 0 ${size.height})`;
    default: return '';
  }
}
export function unrotatePoint(point: {x: number; y: number}, doc: LayoutObject, size: Size): {x: number; y: number} {
  switch (rotation(doc)) {
    case 90: return {x: point.y, y: size.width - point.x};
    case 180: return {x: size.width - point.x, y: size.height - point.y};
    case 270: return {x: size.height - point.y, y: point.x};
    default: return point;
  }
}
/** Colours enter style attributes, never markup or URLs. Unknown CSS values fall back. */
export function safeColor(value: string, fallback: string): string {
  return /^(?:#[\da-f]{3,8}|black|white|red|green|blue|gray|grey|yellow|orange|purple|transparent)$/i.test(value.trim()) ? value.trim() : fallback;
}
export function visualElements(doc: LayoutObject, size: Size): VisualElement[] {
  const canvas = canvasSize(doc, size);
  return layoutElements(doc).map((raw, index) => {
    const name = string(raw, 'type').trim().toLowerCase();
    const type = Object.hasOwn(typeAliases, name) ? typeAliases[name] : null;
    const x = number(raw, 'x'), y = number(raw, 'y');
    const fontSize = Math.max(4, Math.min(72, number(raw, 'fontSize', 9) > 0 ? number(raw, 'fontSize', 9) : 9));
    const width = type === 'line' ? Math.max(0, number(raw, 'width')) : number(raw, 'width') > 0 ? number(raw, 'width') : Math.max(.254, canvas.width - x);
    const fallbackHeight = type === 'barcode' ? Math.max(10, Math.min(size.height / 4, 18)) : Math.max(4, number(raw, 'fontSize', 9) * .45);
    const height = type === 'line' ? Math.max(0, number(raw, 'height')) : number(raw, 'height') > 0 ? number(raw, 'height') : fallbackHeight;
    const align = string(raw, 'align').toLowerCase();
    return {
      index, type, x, y, width, height, text: string(raw, 'text'), field: string(raw, 'field'),
      prefix: string(raw, 'prefix'), suffix: string(raw, 'suffix'), format: string(raw, 'format'),
      fontFamily: string(raw, 'fontFamily', 'Arial'), fontSize, bold: boolean(raw, 'bold'), wrap: boolean(raw, 'wrap'),
      align: align === 'center' || align === 'middle' ? 'center' : align === 'right' || align === 'far' ? 'right' : 'left',
      foregroundColor: safeColor(string(raw, 'foregroundColor'), 'black'), backgroundColor: safeColor(string(raw, 'backgroundColor'), 'transparent'),
      borderWidth: number(raw, 'borderWidth', 0), cornerRadius: number(raw, 'cornerRadius'), humanReadable: boolean(raw, 'humanReadable', true),
    };
  });
}
export function patchElement(doc: LayoutObject, index: number, patch: LayoutObject): LayoutObject {
  const elements = layoutElements(doc);
  if (!elements[index]) return doc;
  let updated = elements[index];
  for (const [key, value] of Object.entries(patch)) updated = setProperty(updated, key, value);
  return setProperty(doc, 'elements', elements.map((item, i) => i === index ? updated : item));
}
export function removeElement(doc: LayoutObject, index: number): LayoutObject {
  return setProperty(doc, 'elements', layoutElements(doc).filter((_, i) => i !== index));
}
export function duplicateElement(doc: LayoutObject, index: number, size: Size): LayoutObject {
  const element = visualElements(doc, size)[index];
  if (!element || layoutElements(doc).length >= 128) return doc;
  const bounds = canvasSize(doc, size);
  let clone = setProperty(layoutElements(doc)[index], 'x', Math.max(0, Math.min(bounds.width - element.width, element.x + 2)));
  clone = setProperty(clone, 'y', Math.max(0, Math.min(bounds.height - element.height, element.y + 2)));
  return setProperty(doc, 'elements', [...layoutElements(doc), clone]);
}
export function moveLayer(doc: LayoutObject, index: number, direction: -1 | 1): LayoutObject {
  const elements = [...layoutElements(doc)], target = index + direction;
  if (target < 0 || target >= elements.length) return doc;
  [elements[index], elements[target]] = [elements[target], elements[index]];
  return setProperty(doc, 'elements', elements);
}
export function movedGeometry(element: Geometry, dx: number, dy: number, size: Size, resize = false): Geometry {
  const round = (n: number) => Math.round(n * 10) / 10;
  return resize
    ? {x: element.x, y: element.y, width: round(Math.max(.5, Math.min(size.width - element.x, element.width + dx))), height: round(Math.max(element.height === 0 ? 0 : .5, Math.min(size.height - element.y, element.height + dy)))}
    : {width: element.width, height: element.height, x: round(Math.max(0, Math.min(Math.max(0, size.width - element.width), element.x + dx))), y: round(Math.max(0, Math.min(Math.max(0, size.height - element.height), element.y + dy)))};
}
/** A visual projection also contains defaults and an index. A gesture may write
 * only its geometry keys; copying the projection would rewrite imported fields. */
export function geometryPatch(element: Geometry, dx: number, dy: number, size: Size, resize = false): LayoutObject {
  const geometry = movedGeometry(element, dx, dy, size, resize);
  return resize ? {width: geometry.width, height: geometry.height} : {x: geometry.x, y: geometry.y};
}
export function outsideBounds(element: Geometry, size: Size): boolean {
  return element.x < 0 || element.y < 0 || element.x + element.width > size.width + .01 || element.y + element.height > size.height + .01;
}
export function addElement(doc: LayoutObject, type: ElementType, size: Size, field = ''): LayoutObject {
  if (layoutElements(doc).length >= 128) return doc;
  const canvas = canvasSize(doc, size), margin = Math.min(3, canvas.width / 10, canvas.height / 10);
  const width = Math.min(type === 'qrcode' || type === 'ellipse' ? 14 : 35, canvas.width - margin * 2);
  const height = type === 'line' ? 0 : Math.min(type === 'text' ? 7 : 14, canvas.height - margin * 2);
  const element: LayoutObject = {type, x: margin, y: margin, width, height};
  if (type === 'text' || type === 'barcode' || type === 'qrcode') {
    Object.assign(element, {text: field ? '' : type === 'text' ? copy.sampleText : copy.sampleCode, field, fontSize: 11, wrap: type === 'text'});
  }
  if (type === 'line' || type === 'box' || type === 'ellipse') element['borderWidth'] = .3;
  return setProperty(doc, 'elements', [...layoutElements(doc), element]);
}
export function inputsOf(doc: LayoutObject): TemplateInput[] { return readTemplateInputs(serializeLayout(doc)); }
export function setInput(doc: LayoutObject, index: number, patch: Partial<TemplateInput>): LayoutObject {
  const inputs = inputsOf(doc), original = inputs[index];
  if (!original) return doc;
  // Materialize inferred definitions only when their form is explicitly edited.
  const raw = Array.isArray(doc['inputs']) ? doc['inputs'] as LayoutObject[] : inputs as unknown as LayoutObject[];
  const next = raw.map((item, i) => i === index ? {...item, ...patch} : item);
  let updated = {...doc, inputs: next};
  if (patch.key !== undefined && patch.key !== original.key) {
    updated = setProperty(updated, 'elements', layoutElements(doc).map(element => {
      const field = property(element, 'field');
      return typeof field === 'string' && inputKey(field).toLowerCase() === original.key.toLowerCase() ? setProperty(element, 'field', patch.key) : element;
    })) as typeof updated;
  }
  inputsOf(updated); // Reject duplicate/reserved keys and invalid defaults before changing the draft.
  return updated;
}
export function addInput(doc: LayoutObject): {doc: LayoutObject; key: string} {
  const inputs = inputsOf(doc); let n = 1;
  while (inputs.some(input => input.key.toLowerCase() === `field${n}`)) n++;
  const key = `field${n}`;
  const raw = Array.isArray(doc['inputs']) ? doc['inputs'] : inputs;
  const updated = {...doc, inputs: [...raw, {key, label: `${copy.variable} ${n}`, type: 'text', required: false}]};
  inputsOf(updated);
  return {doc: updated, key};
}
export function removeInput(doc: LayoutObject, index: number): LayoutObject {
  const inputs = inputsOf(doc), input = inputs[index];
  if (!input) return doc;
  if (layoutElements(doc).some(element => inputKey(String(property(element, 'field') ?? '')).toLowerCase() === input.key.toLowerCase())) throw new Error(copy.fieldInUse);
  const raw = Array.isArray(doc['inputs']) ? doc['inputs'] : inputs;
  return {...doc, inputs: raw.filter((_, i) => i !== index)};
}
export function sampleInputs(doc: LayoutObject): Record<string, string> {
  return Object.fromEntries(inputsOf(doc).map(input => {
    const code = layoutElements(doc).some(element => ['barcode', 'qr', 'qrcode'].includes(String(property(element, 'type')).toLowerCase()) && inputKey(String(property(element, 'field') ?? '')).toLowerCase() === input.key.toLowerCase());
    return [input.key, input.defaultValue || (input.type === 'number' ? copy.sampleNumber : input.type === 'date' ? copy.sampleDate : code ? copy.sampleCode : input.label || input.key)];
  }));
}
export function elementValue(element: VisualElement, values: Record<string, string>, size?: Size): string {
  const key = inputKey(element.field.trim());
  const name = Object.keys(values).find(name => name.toLowerCase() === key.toLowerCase());
  const defaults: Record<string, string> = {date: '08/10/2026', time: '12:30:00', now: '08/10/2026 12:30:00', printedat: '08/10/2026 12:30:00', createdatutc: '2026-10-08T09:30:00Z', printedatutc: '2026-10-08T09:30:00Z', quantity: '1', printername: 'Label Ninja', templatecode: 'LABEL', sourcename: 'Label Ninja', ...(size ? {labelsize: `${size.width} x ${size.height} mm`, labelwidthmm: String(size.width), labelheightmm: String(size.height)} : {})};
  const automaticKey = key.replace(/_/g, '').toLowerCase();
  let value = element.text.trim() || (name !== undefined ? values[name] : Object.hasOwn(defaults, automaticKey) ? defaults[automaticKey] : !key ? '' : element.type === 'barcode' || element.type === 'qrcode' ? copy.sampleCode : `{{${key}}}`);
  if (!value) return '';
  value = previewFormat(value, element.format).value;
  return (element.prefix.trim() ? element.prefix : '') + value + (element.suffix.trim() ? element.suffix : '');
}
