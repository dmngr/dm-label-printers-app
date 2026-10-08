import { DOCUMENT } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, OnDestroy, ViewChild, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TemplateDesignerComponent } from './template-designer.component';
import { designerCopy } from '../shared/template-designer.copy';
import { validateLayout } from '../shared/template-layout';

export interface TemplateDraft { name: string; width: number; height: number; layoutJson: string; }
export const initialTemplateLayout = JSON.stringify({elements: [{type: 'text', field: 'title', x: 3, y: 4, width: 50, height: 10, fontSize: 14, wrap: true}], inputs: [{key: 'title', label: 'Τίτλος', type: 'text', required: true}]}, null, 2);

/** Native modal supplies focus trapping, inert background and Escape handling.
 * Keep the draft until an explicit discard or successful server response.
 */
@Component({
  selector: 'app-template-editor', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TemplateDesignerComponent],
  templateUrl: './template-editor.component.html', styleUrl: './template-editor.component.css',
})
export class TemplateEditorComponent implements AfterViewInit, OnDestroy {
  readonly template = input<TemplateDraft | null>(null);
  readonly expectedVersion = input(0);
  readonly loading = input(false);
  readonly saving = input(false);
  readonly serverError = input('');
  readonly save = output<TemplateDraft>();
  readonly dismissed = output<void>();
  readonly copy = designerCopy;
  readonly discardPrompt = signal(false);
  readonly propertiesValid = signal(true);
  readonly form = new FormGroup({
    name: new FormControl('', {nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(200)]}),
    width: new FormControl(57, {nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(1000)]}),
    height: new FormControl(40, {nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(1000)]}),
    layoutJson: new FormControl(initialTemplateLayout, {nonNullable: true, validators: [Validators.required]}),
  });
  readonly value = signal(this.form.getRawValue());
  readonly baseline = signal('');
  readonly dirty = computed(() => !!this.baseline() && (JSON.stringify(this.value()) !== this.baseline() || !this.propertiesValid()));
  readonly validationError = computed(() => validateLayout(this.value().layoutJson, this.value()));
  readonly width = computed(() => Math.max(1, Math.min(1000, Number(this.value().width) || 57)));
  readonly height = computed(() => Math.max(1, Math.min(1000, Number(this.value().height) || 40)));
  @ViewChild('dialog') private dialog!: ElementRef<HTMLDialogElement>;
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private previousOverflow = '';

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.value.set(this.form.getRawValue()));
    effect(() => {
      const template = this.template();
      untracked(() => {
        if (!template) return;
        this.form.reset(template); this.value.set(this.form.getRawValue());
        this.baseline.set(JSON.stringify(this.form.getRawValue())); this.discardPrompt.set(false);
      });
    });
  }
  ngAfterViewInit(): void {
    this.previousOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';
    this.dialog.nativeElement.showModal();
  }
  ngOnDestroy(): void { this.dialog.nativeElement.close(); this.document.body.style.overflow = this.previousOverflow; }
  close(event?: Event): void { event?.preventDefault(); if (this.saving()) return; if (this.dirty()) this.discardPrompt.set(true); else this.dismissed.emit(); }
  discard(): void { if (!this.saving()) this.dismissed.emit(); }
  updateLayout(json: string): void { this.form.controls.layoutJson.setValue(json); }
  submit(): void {
    this.form.markAllAsTouched();
    if (this.saving() || this.loading() || this.form.invalid || this.validationError() || !this.propertiesValid()) return;
    this.save.emit({...this.form.getRawValue(), name: this.form.controls.name.value.trim()});
  }
  @HostListener('window:beforeunload', ['$event']) preventLostDraft(event: BeforeUnloadEvent): void {
    if (this.dirty()) { event.preventDefault(); event.returnValue = ''; }
  }
}
