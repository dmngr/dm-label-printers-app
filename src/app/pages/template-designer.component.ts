import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewChild, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TemplatePreviewComponent } from './template-preview.component';
import { designerCopy } from '../shared/template-designer.copy';
import { addElement, addInput, canvasSize, canvasTransform, duplicateElement, inputsOf, layoutElements, moveLayer, outsideBounds, parseLayout, patchElement, removeElement, removeInput, rotation, sampleInputs, serializeLayout, setInput, setProperty, unrotatePoint, visualElements, type ElementType, type Geometry, type LayoutObject } from '../shared/template-layout';
import type { TemplateInput } from '../shared/template-inputs';
import { previewFormat } from '../shared/template-format';
import { elementValue, geometryPatch } from '../shared/template-layout';

/** Local draft editor. Every gesture changes one immutable JSON document;
 * remote versions and assignment state belong to the parent page/API.
 * Pointer coordinates are transformed into the same rotated mm space as Windows.
 */
@Component({
  selector: 'app-template-designer', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TemplatePreviewComponent],
  templateUrl: './template-designer.component.html', styleUrl: './template-designer.component.css',
})
export class TemplateDesignerComponent {
  readonly layoutJson = input.required<string>();
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  readonly disabled = input(false);
  readonly layoutChange = output<string>();
  readonly validityChange = output<boolean>();
  readonly copy = designerCopy;
  readonly doc = signal<LayoutObject | null>(null);
  readonly selectedIndex = signal(0);
  readonly error = signal('');
  readonly tab = signal<'properties' | 'inputs'>('properties');
  readonly inputIndex = signal(0);
  readonly sampleValues = signal<Record<string, string>>({});
  readonly past = signal<string[]>([]);
  readonly future = signal<string[]>([]);
  readonly size = computed(() => ({width: this.width(), height: this.height()}));
  readonly canvas = computed(() => this.doc() ? canvasSize(this.doc()!, this.size()) : this.size());
  readonly transform = computed(() => this.doc() ? canvasTransform(this.doc()!, this.size()) : '');
  readonly angle = computed(() => this.doc() ? rotation(this.doc()!) : 0);
  readonly elements = computed(() => this.doc() ? visualElements(this.doc()!, this.size()) : []);
  readonly selected = computed(() => this.elements()[this.selectedIndex()]);
  readonly inputs = computed(() => { try { return this.doc() ? inputsOf(this.doc()!) : []; } catch { return []; } });
  readonly values = computed(() => { try { return {...(this.doc() ? sampleInputs(this.doc()!) : {}), ...this.sampleValues()}; } catch { return this.sampleValues(); } });
  readonly outside = computed(() => this.elements().some(element => outsideBounds(element, this.canvas())));
  readonly formatWarning = computed(() => this.elements().some(element => !previewFormat(elementValue({...element, format: '', prefix: '', suffix: ''}, this.values()), element.format).supported));
  readonly source = computed(() => this.selected()?.field && !this.selected()?.text.trim() ? 'field' : 'text');
  readonly currentJson = computed(() => this.doc() ? serializeLayout(this.doc()!) : this.layoutJson());
  readonly kinds = [
    {type: 'text' as const, label: this.copy.text, icon: 'T'}, {type: 'barcode' as const, label: this.copy.barcode, icon: '▥'},
    {type: 'qrcode' as const, label: this.copy.qrcode, icon: '▦'}, {type: 'line' as const, label: this.copy.line, icon: '╱'},
    {type: 'box' as const, label: this.copy.box, icon: '□'}, {type: 'ellipse' as const, label: this.copy.ellipse, icon: '○'},
  ];
  readonly propertyForm = new FormGroup({
    x: new FormControl(0, {nonNullable: true, validators: [Validators.required]}),
    y: new FormControl(0, {nonNullable: true, validators: [Validators.required]}),
    width: new FormControl(20, {nonNullable: true, validators: [Validators.required, Validators.min(0)]}),
    height: new FormControl(7, {nonNullable: true, validators: [Validators.required, Validators.min(0)]}),
    text: new FormControl('', {nonNullable: true}), field: new FormControl('', {nonNullable: true}),
    prefix: new FormControl('', {nonNullable: true}), suffix: new FormControl('', {nonNullable: true}),
    fontFamily: new FormControl('Arial', {nonNullable: true}),
    fontSize: new FormControl(11, {nonNullable: true, validators: [Validators.required, Validators.min(4), Validators.max(72)]}),
    bold: new FormControl(false, {nonNullable: true}), wrap: new FormControl(false, {nonNullable: true}),
    align: new FormControl('left', {nonNullable: true}), foregroundColor: new FormControl('black', {nonNullable: true}),
    backgroundColor: new FormControl('transparent', {nonNullable: true}),
    borderWidth: new FormControl(0, {nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(20)]}),
    cornerRadius: new FormControl(0, {nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(1000)]}),
    humanReadable: new FormControl(true, {nonNullable: true}), format: new FormControl('', {nonNullable: true}),
  });
  @ViewChild('hitSurface') private hitSurface?: ElementRef<SVGSVGElement>;
  private readonly destroyRef = inject(DestroyRef);
  private emitted = '';
  private drag: {pointerId: number; start: {x: number; y: number}; original: Geometry; index: number; resize: boolean; before: string} | null = null;

  constructor() {
    effect(() => {
      const json = this.layoutJson();
      untracked(() => {
        if (json === this.emitted) return;
        try {
          this.doc.set(parseLayout(json)); this.error.set('');
          this.selectedIndex.set(Math.min(this.selectedIndex(), Math.max(0, this.elements().length - 1)));
          this.past.set([]); this.future.set([]); this.sampleValues.set({});
          this.validityChange.emit(true);
        } catch { this.doc.set(null); this.error.set(''); this.validityChange.emit(false); } // Parent reports the JSON validation error once.
      });
    });
    effect(() => {
      const selected = this.selected();
      untracked(() => {
        if (selected) this.propertyForm.patchValue(selected, {emitEvent: false});
        else this.propertyForm.reset(undefined, {emitEvent: false});
        this.validityChange.emit(this.propertyForm.valid);
      });
    });
    this.propertyForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.disabled() || !this.doc() || !this.selected()) return;
      this.validityChange.emit(this.propertyForm.valid);
      if (this.propertyForm.invalid) { this.error.set(this.copy.invalidGeometry); return; }
      const before = this.selected()!;
      const values = this.propertyForm.getRawValue();
      const patch = Object.fromEntries(Object.entries(values).filter(([key, value]) => before[key as keyof typeof before] !== value));
      if (Object.keys(patch).length) this.commit(patchElement(this.doc()!, before.index, patch));
    });
  }
  private commit(doc: LayoutObject, history = true): void {
    if (this.disabled()) return;
    const before = this.doc() ? serializeLayout(this.doc()!) : '';
    const json = serializeLayout(doc);
    if (before === json) return;
    if (history && before) { this.past.update(items => [...items.slice(-49), before]); this.future.set([]); }
    this.doc.set(doc); this.error.set(''); this.emitted = json; this.layoutChange.emit(json);
  }
  label(type: ElementType | null): string { return type ? this.copy[type] : this.copy.unsupported; }
  select(index: number): void { this.selectedIndex.set(index); this.tab.set('properties'); this.error.set(''); }
  add(type: ElementType, variable = false): void {
    if (!this.doc()) return;
    let doc = this.doc()!, field = '';
    if (variable) { const result = addInput(doc); doc = result.doc; field = result.key; }
    const next = addElement(doc, type, this.size(), field);
    this.commit(next); this.select(layoutElements(next).length - 1);
    if (variable) this.inputIndex.set(this.inputs().length - 1);
  }
  remove(): void { if (this.doc()) this.commit(removeElement(this.doc()!, this.selectedIndex())); this.selectedIndex.update(index => Math.max(0, index - 1)); }
  duplicate(): void { if (!this.doc()) return; const doc = duplicateElement(this.doc()!, this.selectedIndex(), this.size()); this.commit(doc); this.select(layoutElements(doc).length - 1); }
  layer(direction: -1 | 1): void {
    if (!this.doc()) return;
    const doc = moveLayer(this.doc()!, this.selectedIndex(), direction);
    if (doc !== this.doc()) { this.commit(doc); this.selectedIndex.update(index => index + direction); }
  }
  rotate(event: Event): void { if (this.doc()) this.commit(setProperty(this.doc()!, 'rotateDegrees', Number((event.target as HTMLSelectElement).value))); }
  changeSource(event: Event): void {
    if (!this.doc() || !this.selected()) return;
    const mode = (event.target as HTMLSelectElement).value;
    let doc = this.doc()!, field = this.inputs()[0]?.key ?? '';
    if (mode === 'field' && !field) { const result = addInput(doc); doc = result.doc; field = result.key; }
    this.commit(patchElement(doc, this.selectedIndex(), mode === 'field' ? {text: '', field} : {field: '', text: this.copy.sampleText}));
  }
  addField(): void { if (!this.doc()) return; try { this.commit(addInput(this.doc()!).doc); this.inputIndex.set(this.inputs().length - 1); this.tab.set('inputs'); } catch (error) { this.setError(error); } }
  changeInput(index: number, key: keyof TemplateInput, event: Event): void {
    if (!this.doc()) return;
    const target = event.target as HTMLInputElement;
    const value = key === 'required' ? target.checked : target.value;
    try { this.commit(setInput(this.doc()!, index, {[key]: value})); }
    catch (error) { this.setError(error); if (key === 'required') target.checked = this.inputs()[index].required; else target.value = String(this.inputs()[index][key] ?? ''); }
  }
  removeField(index: number): void { if (this.doc()) { try { this.commit(removeInput(this.doc()!, index)); } catch (error) { this.setError(error); } } }
  sample(key: string, event: Event): void { this.sampleValues.update(values => ({...values, [key]: (event.target as HTMLInputElement).value})); }
  private setError(error: unknown): void { this.error.set(error instanceof Error ? error.message : this.copy.invalidLayout); }
  undo(): void {
    const previous = this.past().at(-1); if (!previous || !this.doc() || this.disabled()) return;
    this.future.update(items => [...items, serializeLayout(this.doc()!)]); this.past.update(items => items.slice(0, -1));
    this.commit(parseLayout(previous), false); this.selectedIndex.set(Math.min(this.selectedIndex(), Math.max(0, this.elements().length - 1)));
  }
  redo(): void {
    const next = this.future().at(-1); if (!next || !this.doc() || this.disabled()) return;
    this.past.update(items => [...items, serializeLayout(this.doc()!)]); this.future.update(items => items.slice(0, -1)); this.commit(parseLayout(next), false);
  }
  private point(event: PointerEvent): {x: number; y: number} {
    const surface = this.hitSurface!.nativeElement, box = surface.getBoundingClientRect();
    return unrotatePoint({x: (event.clientX - box.left) * this.width() / box.width, y: (event.clientY - box.top) * this.height() / box.height}, this.doc()!, this.size());
  }
  begin(event: PointerEvent, index: number, resize = false): void {
    if (this.disabled() || event.button !== 0 || !this.doc() || !this.elements()[index]?.type) return;
    event.preventDefault(); event.stopPropagation(); this.select(index);
    this.drag = {pointerId: event.pointerId, start: this.point(event), original: this.elements()[index], index, resize, before: serializeLayout(this.doc()!)};
    this.hitSurface!.nativeElement.setPointerCapture(event.pointerId);
  }
  move(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId || !this.doc()) return;
    const current = this.point(event), drag = this.drag;
    const patch = geometryPatch(drag.original, current.x - drag.start.x, current.y - drag.start.y, this.canvas(), drag.resize);
    this.commit(patchElement(this.doc()!, drag.index, patch), false);
  }
  end(event: PointerEvent, cancelled = false): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const before = this.drag.before; this.drag = null;
    if (cancelled) this.commit(parseLayout(before), false);
    else if (this.doc() && serializeLayout(this.doc()!) !== before) { this.past.update(items => [...items.slice(-49), before]); this.future.set([]); }
    if (this.hitSurface?.nativeElement.hasPointerCapture(event.pointerId)) this.hitSurface.nativeElement.releasePointerCapture(event.pointerId);
  }
  key(event: KeyboardEvent, index: number): void {
    if (this.disabled() || !this.doc()) return;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.select(index); this.remove(); return; }
    const delta: Record<string, [number, number]> = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
    if (!Object.hasOwn(delta, event.key)) return;
    event.preventDefault(); const [dx, dy] = delta[event.key], step = event.shiftKey ? 1 : .1;
    const origin = unrotatePoint({x: 0, y: 0}, this.doc()!, this.size());
    const target = unrotatePoint({x: dx * step, y: dy * step}, this.doc()!, this.size());
    this.commit(patchElement(this.doc()!, index, geometryPatch(this.elements()[index], target.x - origin.x, target.y - origin.y, this.canvas())));
  }
}
