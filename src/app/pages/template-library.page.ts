import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AssignmentEntry, CatalogTemplateItem, CustomerApiService, DeviceDetail, GroupHierarchy, TemplateAssignment, TemplateHead } from '../services/customer-api.service';
import { readTemplateInputs } from '../shared/template-inputs';

interface Target { kind: 'store' | 'installation'; id: string; label: string; device?: DeviceDetail; }
const initialLayout = JSON.stringify({ elements: [{ type: 'text', field: 'title', x: 3, y: 4, width: 50, height: 20, fontSize: 14 }], inputs: [{ key: 'title', label: 'Τίτλος', type: 'text', required: true }] }, null, 2);

/** Edits the group library; selected immutable versions are activated explicitly.
 * An installation may inherit its store's selection or keep a complete override.
 * A saved assignment is desired state; offline agents apply it on their next sync.
 */
@Component({
  selector: 'app-template-library', standalone: true,
  imports: [RouterLink, ReactiveFormsModule, FormsModule],
  template: `
    <main class="page">
      <a routerLink="/devices" class="back">‹ Εγκαταστάσεις</a>
      <header><div><span class="eyebrow">{{ groupId }} · LABEL NINJA</span><h1>Κοινή βιβλιοθήκη</h1><p>Ένα πρότυπο για την ομάδα σας. Επιλέξτε πού θα χρησιμοποιείται.</p></div>
        <button class="primary" (click)="newTemplate()" [disabled]="loading() || saving()">+ Νέο πρότυπο</button></header>
      @if (error()) { <div role="alert" class="error">{{ error() }} <button (click)="load()" [disabled]="saving()">Ανανέωση</button></div> }
      @if (message()) { <p role="status" class="message">{{ message() }}</p> }
      @if (loading()) { <p>Φόρτωση βιβλιοθήκης…</p> }
      <div class="layout">
        <section>
          <h2>Πρότυπα <span>{{ templates().length }}</span></h2>
          <div class="cards">@for (template of templates(); track template.id) {
            <button class="template-card" (click)="edit(template)" [disabled]="saving()">
              <span class="paper">Aa</span><strong>{{ template.name }}</strong><small>{{ template.width }} × {{ template.height }} mm · v{{ template.version }}</small><span class="edit-link">Προβολή / νέα έκδοση →</span>
            </button>
          } @empty { @if (!loading() && !error()) { <p class="empty">Δημιουργήστε ένα πρότυπο ή αντιγράψτε ένα από μια εγκατάσταση.</p> } }</div>
          <details class="import"><summary>Αντιγραφή από εγκατάσταση</summary>
            <label>Εγκατάσταση<select #source (change)="loadSource(source.value)"><option value="">Επιλέξτε…</option>@for (device of devices(); track device.deviceCode) { <option [value]="device.deviceCode">{{ device.deviceName || device.deviceCode }}</option> }</select></label>
            @for (template of sourceTemplates(); track template.id) { <button class="import-row" (click)="copySource(template)" [disabled]="saving()">{{ template.name }} <span>Αντιγραφή →</span></button> }
          </details>
        </section>
        <section class="assignments">
          <h2>Ενεργά πρότυπα</h2><p>Η σειρά επιλογής τους είναι και η σειρά εμφάνισης.</p>
          <label>Κατάστημα ή εγκατάσταση<select [ngModel]="targetIndex()" (ngModelChange)="selectTarget(+$event)" [disabled]="saving() || loading()">
            <option [ngValue]="-1">Επιλέξτε…</option>@for (target of targets(); track $index) { <option [ngValue]="$index">{{ target.label }}</option> }
          </select></label>
          @if (assignmentLoading()) { <p>Φόρτωση επιλογών…</p> }
          @if (selectedTarget(); as target) { @if (draft(); as selection) {
            @if (target.kind === 'installation') { <label class="check"><input type="checkbox" [ngModel]="selection.inherit" (ngModelChange)="setInheritance($event)" [disabled]="saving()" /> Ίδια πρότυπα με το κατάστημα</label> }
            @if (!selection.inherit) {
              @for (template of templates(); track template.id) {
                <div class="choice"><label class="check"><input type="checkbox" [checked]="entry(template.id) !== undefined" (change)="toggle(template, $any($event.target).checked)" [disabled]="saving()" /> {{ template.name }}</label>
                  @if (entry(template.id); as selected) {
                    <div class="version"><label>Έκδοση<input type="number" min="1" [max]="template.version" [ngModel]="selected.version" (ngModelChange)="setVersion(template.id, $event)" [disabled]="saving()" /></label><small>Νεότερη: v{{ template.version }}</small></div>
                    @if (target.kind === 'installation') { <label>Εκτυπωτής<select [ngModel]="selected.printerName || ''" (ngModelChange)="setPrinter(template.id, $event)" [disabled]="saving()"><option value="">Τοπική επιλογή εκτυπωτή</option>@for (printer of target.device?.printers || []; track printer.name) { <option [value]="printer.name">{{ printer.name }}</option> } @if (selected.printerName && !hasPrinter(target, selected.printerName)) { <option [value]="selected.printerName">{{ selected.printerName }} · δεν αναφέρεται τώρα</option> }</select></label> }
                  }
                </div>
              }
              @if (!selection.entries.length) { <p class="hint">Κενή επιλογή: κανένα πρότυπο της κοινής βιβλιοθήκης δεν θα είναι ενεργό εδώ.</p> }
            } @else { <p class="hint">Η εγκατάσταση ακολουθεί τις επιλογές του καταστήματος. Τα τοπικά πρότυπα διατηρούνται.</p> }
            <button class="primary wide" (click)="saveSelection()" [disabled]="saving() || assignmentLoading()">{{ saving() ? 'Αποθήκευση…' : 'Αποθήκευση ενεργών' }}</button>
            <p class="hint">Οι offline εγκαταστάσεις θα ενημερωθούν όταν συνδεθούν. Απαιτείται agent με υποστήριξη κοινής βιβλιοθήκης.</p>
          } }
        </section>
      </div>
      @if (editing()) {
        <div class="editor-backdrop"><section class="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
          <h2 id="editor-title">{{ expectedVersion() ? 'Νέα έκδοση προτύπου' : 'Νέο πρότυπο' }}</h2>
          @if (editorError()) { <p class="error" role="alert">{{ editorError() }}</p> }
          <form [formGroup]="form" (ngSubmit)="saveTemplate()">
            <label>Όνομα<input formControlName="name" maxlength="200" /></label>
            <div class="dimensions"><label>Πλάτος (mm)<input type="number" formControlName="width" min="1" max="1000" /></label><label>Ύψος (mm)<input type="number" formControlName="height" min="1" max="1000" /></label></div>
            <details><summary>Διάταξη και πεδία εισαγωγής</summary><p class="hint">Μπορείτε να αντιγράψετε ένα έτοιμο πρότυπο από εγκατάσταση. Η διάταξη χρησιμοποιείται και στην εφαρμογή Windows.</p><label>Διάταξη JSON<textarea rows="13" formControlName="layoutJson" spellcheck="false"></textarea></label></details>
            @if (expectedVersion()) { <p class="hint">Η αποθήκευση δημιουργεί v{{ expectedVersion() + 1 }}. Οι υπάρχουσες αναθέσεις κρατούν την επιλεγμένη έκδοσή τους.</p> }
            <div class="actions"><button type="button" (click)="editing.set(false)" [disabled]="saving()">Ακύρωση</button><button class="primary" type="submit" [disabled]="saving() || form.invalid">Αποθήκευση έκδοσης</button></div>
          </form>
        </section></div>
      }
    </main>
  `,
  styles: [`
    .page{max-width:1120px;margin:auto;padding:28px 24px;color:#17212d}.back{font-size:13px;color:#4f46e5;text-decoration:none}header{display:flex;justify-content:space-between;align-items:center;gap:24px;margin:24px 0 30px}h1{font-size:30px;margin:8px 0}h2{font-size:18px;margin:0 0 18px}h2 span{color:#94a3b8;font-size:14px;margin-left:8px}p{color:#64748b;font-size:14px;line-height:1.5}.eyebrow{font-size:11px;font-weight:700;letter-spacing:1.5px;color:#6366f1}.layout{display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:28px}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}.template-card{text-align:left;padding:20px;display:flex;flex-direction:column;gap:12px;background:white;border:1px solid #e2e8f0;border-radius:12px;cursor:pointer}.template-card:hover{border-color:#6366f1}.paper{display:grid;place-items:center;height:80px;width:100%;background:#f1f5f9;border-radius:8px;color:#94a3b8;font-size:30px}.template-card small{color:#64748b}.edit-link{color:#4f46e5;font-size:11px}.assignments{padding:24px;border:1px solid #e2e8f0;background:white;border-radius:14px;align-self:start}.assignments p{font-size:12px}label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#475569;margin:14px 0}input,select,textarea{box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:10px;background:white;color:#17212d;font:inherit}textarea{font-family:monospace;resize:vertical;font-size:12px}.check{flex-direction:row;align-items:center;gap:10px;font-size:13px}.check input{width:17px;height:17px}.choice{border-bottom:1px solid #eef2f6;padding-bottom:8px}.version{display:flex;align-items:center;gap:16px}.version input{width:85px}.version small{font-size:11px;color:#64748b}.hint{font-size:12px!important;line-height:1.6}.wide{width:100%;margin-top:18px}button{border:1px solid #cbd5e1;background:white;padding:10px 14px;border-radius:7px;color:#334155;cursor:pointer;font-size:13px}button:disabled{opacity:.5;cursor:not-allowed}.primary{background:#4f46e5;border-color:#4f46e5;color:white}.error{background:#fef2f2;color:#991b1b;padding:12px;border-radius:8px}.message{background:#ecfdf5;color:#166534;padding:14px;border-radius:8px}.import{margin-top:28px;padding:18px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px}summary{font-size:13px;cursor:pointer;color:#475569}.import-row{width:100%;display:flex;justify-content:space-between;margin-top:10px}.import-row span{color:#4f46e5}.editor-backdrop{position:fixed;inset:0;background:#17212d80;display:flex;align-items:center;justify-content:center;padding:20px;z-index:10}.editor{background:white;padding:28px;border-radius:16px;width:540px;max-height:85vh;overflow:auto;box-shadow:0 24px 70px #0003}.dimensions,.actions{display:flex;gap:16px}.dimensions label{flex:1}.actions{justify-content:flex-end;margin-top:24px}.empty{padding:28px;background:#f8fafc;border-radius:12px}@media(max-width:850px){.layout{grid-template-columns:1fr}.assignments{order:2}header{align-items:flex-start;flex-direction:column}.page{padding:22px 16px}.editor{padding:20px}}
  `]
})
export class TemplateLibraryPage implements OnInit {
  private readonly api = inject(CustomerApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly groupId = this.route.snapshot.paramMap.get('groupId') ?? '';
  readonly templates = signal<TemplateHead[]>([]);
  readonly hierarchy = signal<GroupHierarchy | null>(null);
  readonly loading = signal(false); readonly saving = signal(false);
  readonly error = signal(''); readonly message = signal(''); readonly editorError = signal('');
  readonly editing = signal(false); readonly expectedVersion = signal(0);
  readonly sourceTemplates = signal<CatalogTemplateItem[]>([]);
  readonly targetIndex = signal(-1); readonly draft = signal<TemplateAssignment | null>(null);
  readonly assignmentLoading = signal(false);
  readonly devices = computed(() => this.hierarchy()?.stores.flatMap(store => store.installations) ?? []);
  readonly targets = computed<Target[]>(() => this.hierarchy()?.stores.flatMap(store => [
    ...(store.storeCode ? [{ kind: 'store' as const, id: store.storeCode, label: `Κατάστημα · ${store.storeCode}` }] : []),
    ...store.installations.map(device => ({ kind: 'installation' as const, id: device.deviceCode, label: `↳ ${device.deviceName || device.deviceCode}`, device }))
  ]) ?? []);
  readonly selectedTarget = computed(() => this.targets()[this.targetIndex()]);
  readonly form = new FormGroup({ name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }), width: new FormControl(57, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(1000)] }), height: new FormControl(40, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(1000)] }), layoutJson: new FormControl(initialLayout, { nonNullable: true, validators: [Validators.required] }) });
  private draftId = ''; private selectionRequest = 0; private sourceRequest = 0;
  ngOnInit(): void { this.load(); }
  load(): void {
    if (this.loading() || this.saving()) return;
    this.loading.set(true); this.error.set('');
    forkJoin({ library: this.api.listLibrary(this.groupId), groups: this.api.listGroups() }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => { this.templates.set(result.library.items); this.hierarchy.set(result.groups.groups.find(g => g.groupId === this.groupId) ?? null); this.loading.set(false); this.targetIndex.set(-1); this.draft.set(null); },
      error: () => { this.loading.set(false); this.error.set('Η βιβλιοθήκη δεν φορτώθηκε. Δοκιμάστε ξανά.'); }
    });
  }
  newTemplate(): void { this.draftId = crypto.randomUUID(); this.expectedVersion.set(0); this.form.reset({ name: '', width: 57, height: 40, layoutJson: initialLayout }); this.editorError.set(''); this.editing.set(true); }
  edit(head: TemplateHead): void {
    this.saving.set(true);
    this.api.getLibraryTemplate(this.groupId, head.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: template => { this.draftId = template.id; this.expectedVersion.set(template.version); this.form.reset(template); this.editorError.set(''); this.editing.set(true); this.saving.set(false); },
      error: () => { this.saving.set(false); this.error.set('Το πρότυπο δεν φορτώθηκε.'); }
    });
  }
  saveTemplate(): void {
    if (this.saving() || this.form.invalid) return;
    const value = this.form.getRawValue();
    try { readTemplateInputs(value.layoutJson); } catch (error) { this.editorError.set(error instanceof Error ? error.message : 'Μη έγκυρη διάταξη.'); return; }
    this.saving.set(true); this.editorError.set('');
    this.api.saveLibraryTemplate(this.groupId, this.draftId, { ...value, expectedVersion: this.expectedVersion() }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: template => { this.templates.update(items => [...items.filter(t => t.id !== template.id), template].sort((a,b) => a.name.localeCompare(b.name))); this.saving.set(false); this.editing.set(false); this.message.set(`Αποθηκεύτηκε «${template.name}» v${template.version}. Επιλέξτε την έκδοση στις ενεργές αναθέσεις.`); },
      error: error => { this.saving.set(false); this.editorError.set(error.status === 409 ? 'Το πρότυπο άλλαξε από άλλον χρήστη. Κλείστε το παράθυρο και φορτώστε τη νέα έκδοση πριν αποθηκεύσετε.' : 'Η αποθήκευση απέτυχε. Ελέγξτε τη διάταξη και δοκιμάστε ξανά.'); }
    });
  }
  loadSource(deviceCode: string): void {
    const request = ++this.sourceRequest; this.sourceTemplates.set([]);
    if (!deviceCode) return;
    this.api.listTemplates(deviceCode).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: response => { if (request === this.sourceRequest) this.sourceTemplates.set(response.items); }, error: () => { if (request === this.sourceRequest) this.error.set('Δεν φορτώθηκαν τα πρότυπα της εγκατάστασης.'); } });
  }
  copySource(template: CatalogTemplateItem): void { this.newTemplate(); this.form.reset({ name: template.name, width: template.width, height: template.height, layoutJson: template.layoutJson }); }
  selectTarget(index: number): void {
    const request = ++this.selectionRequest; this.targetIndex.set(index); this.draft.set(null); this.error.set('');
    const target = this.selectedTarget(); if (!target) { this.assignmentLoading.set(false); return; }
    this.assignmentLoading.set(true);
    this.api.getAssignment(this.groupId, target.kind, target.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => { if (request === this.selectionRequest) { this.draft.set(result); this.assignmentLoading.set(false); } },
      error: () => { if (request === this.selectionRequest) { this.assignmentLoading.set(false); this.error.set('Οι ενεργές επιλογές δεν φορτώθηκαν. Δεν έγιναν αλλαγές.'); } }
    });
  }
  entry(id: string): AssignmentEntry | undefined { return this.draft()?.entries.find(entry => entry.templateId === id); }
  setInheritance(inherit: boolean): void { this.draft.update(value => value ? { ...value, inherit, entries: inherit ? [] : value.entries } : null); }
  toggle(template: TemplateHead, checked: boolean): void { this.draft.update(value => value ? { ...value, entries: checked ? [...value.entries, { templateId: template.id, version: template.version }] : value.entries.filter(entry => entry.templateId !== template.id) } : null); }
  setVersion(id: string, version: number): void { this.updateEntry(id, { version }); }
  setPrinter(id: string, printerName: string): void { this.updateEntry(id, { printerName: printerName || undefined }); }
  private updateEntry(id: string, change: Partial<AssignmentEntry>): void { this.draft.update(value => value ? { ...value, entries: value.entries.map(entry => entry.templateId === id ? { ...entry, ...change } : entry) } : null); }
  hasPrinter(target: Target, name: string): boolean { return target.device?.printers?.some(printer => printer.name === name) ?? false; }
  saveSelection(): void {
    const target = this.selectedTarget(); const draft = this.draft(); if (!target || !draft || this.saving()) return;
    this.saving.set(true); this.error.set('');
    this.api.saveAssignment(this.groupId, target.kind, target.id, { expectedRevision: draft.revision, inherit: draft.inherit, entries: draft.entries }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => { this.draft.set(result); this.saving.set(false); this.message.set('Οι επιλογές αποθηκεύτηκαν. Θα εφαρμοστούν στον επόμενο συγχρονισμό, αφού ολοκληρωθούν οι εκκρεμείς εκτυπώσεις.'); },
      error: error => { this.saving.set(false); this.error.set(error.status === 409 ? 'Οι επιλογές άλλαξαν αλλού. Επιλέξτε ξανά την εγκατάσταση για να φορτώσετε τις τρέχουσες.' : 'Οι επιλογές δεν αποθηκεύτηκαν. Ελέγξτε τις εκδόσεις και δοκιμάστε ξανά.'); }
    });
  }
}
