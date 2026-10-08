import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, from, map, mergeMap, of } from 'rxjs';
import { AssignmentEntry, CatalogTemplateItem, CustomerApiService, DeviceDetail, GroupHierarchy, TemplateAssignment, TemplateHead, LibraryTemplate } from '../services/customer-api.service';
import { validateLayout } from '../shared/template-layout';
import { designerCopy } from '../shared/template-designer.copy';
import { TemplatePreviewComponent } from './template-preview.component';
import { TemplateEditorComponent, initialTemplateLayout, type TemplateDraft } from './template-editor.component';
import { LibraryApplicationStatusComponent } from './library-application-status.component';
import { retryDraftRevision, type LibraryRetryCompleted } from '../shared/library-application';

import { TemplateArchiveDialogComponent } from './template-archive-dialog.component';
import { archiveChoices, choiceEntry } from '../shared/template-archive';

interface Target { kind: 'store' | 'installation'; id: string; label: string; device?: DeviceDetail; }

/** Edits the group library; selected immutable versions are activated explicitly.
 * An installation may inherit its store's selection or keep a complete override.
 * A saved assignment is desired state; offline agents apply it on their next sync.
 */
@Component({
  selector: 'app-template-library', standalone: true,
  imports: [RouterLink, FormsModule, LibraryApplicationStatusComponent, TemplatePreviewComponent, TemplateEditorComponent, TemplateArchiveDialogComponent],
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
          <h2>Πρότυπα <span>{{ filtered().length }}</span></h2><div class="library-filter" aria-label="Κατάσταση προτύπων"><button type="button" [attr.aria-pressed]="!archivedView()" (click)="setArchivedView(false)">Διαθέσιμα</button><button type="button" [attr.aria-pressed]="archivedView()" (click)="setArchivedView(true)">Αρχειοθετημένα ({{ archivedCount() }})</button></div>
          <label class="library-search">{{ copy.search }}<input type="search" [ngModel]="search()" (ngModelChange)="setSearch($event)" /></label>
          <div class="cards">@for (card of cards(); track card.head.id) {
            <article class="template-card"><button class="card-open" (click)="edit(card.head)" [disabled]="saving() || !!card.head.archived">
              <span class="paper">@if (card.preview) { <app-template-preview [layoutJson]="card.preview.layoutJson" [width]="card.preview.width" [height]="card.preview.height" /> } @else { <span class="preview-note">{{ card.failed ? copy.thumbnailFailed : copy.thumbnailLoading }}</span> }</span>
              <strong>{{ card.head.name }}</strong><small>{{ card.head.width }} × {{ card.head.height }} mm · v{{ card.head.version }}</small><span class="edit-link">{{ card.head.archived ? 'Αρχειοθετημένο' : copy.editTemplate + ' →' }}</span>
            </button><button class="archive-action" type="button" (click)="confirmArchive(card.head)" [disabled]="saving()" [attr.aria-label]="(card.head.archived ? 'Επαναφορά · ' : 'Αρχειοθέτηση · ') + card.head.name">{{ card.head.archived ? 'Επαναφορά' : 'Αρχειοθέτηση' }}</button></article>
          } @empty { @if (!loading() && !error()) { <p class="empty">{{ search() ? copy.noMatches : archivedView() ? 'Δεν υπάρχουν αρχειοθετημένα πρότυπα.' : copy.empty }}</p> } }</div>
          @if (pageCount() > 1) { <nav class="pagination"><button type="button" (click)="page.set(displayPage() - 1)" [disabled]="displayPage() === 0">{{ copy.previous }}</button><span>{{ displayPage() + 1 }} / {{ pageCount() }}</span><button type="button" (click)="page.set(displayPage() + 1)" [disabled]="displayPage() + 1 >= pageCount()">{{ copy.next }}</button></nav> }
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
              @for (template of assignmentChoices(); track template.id) {
                <div class="choice"><label class="check"><input type="checkbox" [checked]="entry(template.id) !== undefined" (change)="toggle(template, $any($event.target).checked)" [disabled]="saving() || (template.archived && !entry(template.id) && !savedEntry(template.id))" /> {{ template.name }} @if (template.archived) { <small class="archived-note">Αρχειοθετημένο</small> }</label>
                  @if (entry(template.id); as selected) {
                    <div class="version"><label>Έκδοση<input type="number" min="1" [max]="template.version" [ngModel]="selected.version" (ngModelChange)="setVersion(template.id, $event)" [disabled]="saving() || !!template.archived" /></label><small>{{ template.archived ? 'Διατηρείται η επιλεγμένη έκδοση' : 'Νεότερη: v' + template.version }}</small></div>
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
        @if (selectedTarget(); as target) { @if (draft()) {
          <app-library-application-status [group]="groupId" [targetKind]="target.kind" [targetId]="target.id" [refreshKey]="applicationRefresh()" [disabled]="saving()" (retryCompleted)="retryRevisionChanged($event)" />
        } }
      </div>
      @if (archiveCandidate(); as head) { <app-template-archive-dialog [head]="head" [saving]="saving()" [error]="archiveError()" (dismissed)="archiveCandidate.set(null)" (confirmed)="saveArchive()" /> }
      @if (editing()) { <app-template-editor [template]="templateDraft()" [expectedVersion]="expectedVersion()" [loading]="editorLoading()" [saving]="saving()" [serverError]="editorError()" (save)="saveTemplate($event)" (dismissed)="closeEditor()" /> }
    </main>
  `,
  styles: [`
    .library-filter{display:flex;gap:8px;flex-wrap:wrap}.library-filter [aria-pressed=true]{background:#eef2ff;border-color:#6366f1;color:#4338ca}.card-open{border:0;padding:0;text-align:left;display:flex;flex-direction:column;gap:12px;min-width:0;background:transparent}.card-open:disabled{opacity:1;cursor:default}.card-open strong{overflow-wrap:anywhere}.archive-action{align-self:flex-start;font-size:11px;padding:6px 9px}.archived-note{color:#92400e;font-size:10px}.check{flex-wrap:wrap}
    .layout>app-library-application-status{grid-column:1;grid-row:2}.layout>.assignments{grid-column:2;grid-row:1 / 3}@media(max-width:850px){.layout>.assignments{grid-column:auto;grid-row:auto;order:2}.layout>app-library-application-status{grid-column:auto;grid-row:auto;order:3}}
    .page{max-width:1120px;margin:auto;padding:28px 24px;color:#17212d}.back{font-size:13px;color:#4f46e5;text-decoration:none}header{display:flex;justify-content:space-between;align-items:center;gap:24px;margin:24px 0 30px}h1{font-size:30px;margin:8px 0}h2{font-size:18px;margin:0 0 18px}h2 span{color:#94a3b8;font-size:14px;margin-left:8px}p{color:#64748b;font-size:14px;line-height:1.5}.eyebrow{font-size:11px;font-weight:700;letter-spacing:1.5px;color:#6366f1}.layout{display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:28px}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}.template-card{text-align:left;padding:20px;display:flex;flex-direction:column;gap:12px;background:white;border:1px solid #e2e8f0;border-radius:12px;cursor:pointer}.template-card:hover{border-color:#6366f1}.paper{display:grid;place-items:center;height:125px;width:100%;padding:10px;background:#f1f5f9;border-radius:8px;overflow:hidden}.paper app-template-preview{filter:drop-shadow(0 2px 4px #33415520)}.preview-note{font-size:11px;text-align:center;color:#64748b}.library-search{margin:0 0 16px}.pagination{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:18px;font-size:12px}.template-card small{color:#64748b}.edit-link{color:#4f46e5;font-size:11px}.assignments{padding:24px;border:1px solid #e2e8f0;background:white;border-radius:14px;align-self:start}.assignments p{font-size:12px}label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#475569;margin:14px 0}input,select,textarea{box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:10px;background:white;color:#17212d;font:inherit}textarea{font-family:monospace;resize:vertical;font-size:12px}.check{flex-direction:row;align-items:center;gap:10px;font-size:13px}.check input{width:17px;height:17px}.choice{border-bottom:1px solid #eef2f6;padding-bottom:8px}.version{display:flex;align-items:center;gap:16px}.version input{width:85px}.version small{font-size:11px;color:#64748b}.hint{font-size:12px!important;line-height:1.6}.wide{width:100%;margin-top:18px}button{border:1px solid #cbd5e1;background:white;padding:10px 14px;border-radius:7px;color:#334155;cursor:pointer;font-size:13px}button:disabled{opacity:.5;cursor:not-allowed}.primary{background:#4f46e5;border-color:#4f46e5;color:white}.error{background:#fef2f2;color:#991b1b;padding:12px;border-radius:8px}.message{background:#ecfdf5;color:#166534;padding:14px;border-radius:8px}.import{margin-top:28px;padding:18px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px}summary{font-size:13px;cursor:pointer;color:#475569}.import-row{width:100%;display:flex;justify-content:space-between;margin-top:10px}.import-row span{color:#4f46e5}.empty{padding:28px;background:#f8fafc;border-radius:12px}@media(max-width:850px){.layout{grid-template-columns:1fr}.assignments{order:2}header{align-items:flex-start;flex-direction:column}.page{padding:22px 16px}}
  `]
})
export class TemplateLibraryPage implements OnInit {
  private readonly api = inject(CustomerApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly groupId = this.route.snapshot.paramMap.get('groupId') ?? '';
  readonly templates = signal<TemplateHead[]>([]);
  readonly copy = designerCopy;
  readonly search = signal(''); readonly page = signal(0);
  readonly archivedView = signal(false);
  readonly archivedCount = computed(() => this.templates().filter(head => head.archived).length);
  readonly archiveCandidate = signal<TemplateHead | null>(null); readonly archiveError = signal('');
  readonly savedSelection = signal<TemplateAssignment | null>(null);
  readonly assignmentChoices = computed(() => archiveChoices(this.templates(), this.draft(), this.savedSelection()));
  readonly previews = signal<Record<string, LibraryTemplate | null>>({});
  readonly filtered = computed(() => this.templates().filter(template => !!template.archived === this.archivedView() && template.name.toLocaleLowerCase('el').includes(this.search().trim().toLocaleLowerCase('el'))));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 12)));
  readonly displayPage = computed(() => Math.min(this.page(), this.pageCount() - 1));
  readonly visible = computed(() => this.filtered().slice(this.displayPage() * 12, (this.displayPage() + 1) * 12));
  readonly cards = computed(() => this.visible().map(head => { const preview = this.previews()[head.id + ':' + head.version]; return {head, preview, failed: preview === null}; }));
  readonly templateDraft = signal<TemplateDraft | null>(null);
  readonly editorLoading = signal(false);
  private editorRequest = 0;
  readonly hierarchy = signal<GroupHierarchy | null>(null);
  readonly loading = signal(false); readonly saving = signal(false);
  readonly error = signal(''); readonly message = signal(''); readonly editorError = signal('');
  readonly editing = signal(false); readonly expectedVersion = signal(0);
  readonly sourceTemplates = signal<CatalogTemplateItem[]>([]);
  readonly targetIndex = signal(-1); readonly draft = signal<TemplateAssignment | null>(null);
  readonly assignmentLoading = signal(false);
  readonly applicationRefresh = signal(0);
  readonly devices = computed(() => this.hierarchy()?.stores.flatMap(store => store.installations) ?? []);
  readonly targets = computed<Target[]>(() => this.hierarchy()?.stores.flatMap(store => [
    ...(store.storeCode ? [{ kind: 'store' as const, id: store.storeCode, label: `Κατάστημα · ${store.storeCode}` }] : []),
    ...store.installations.map(device => ({ kind: 'installation' as const, id: device.deviceCode, label: `↳ ${device.deviceName || device.deviceCode}`, device }))
  ]) ?? []);
  readonly selectedTarget = computed(() => this.targets()[this.targetIndex()]);
  private draftId = ''; private selectionRequest = 0; private sourceRequest = 0;
  constructor() {
    effect(onCleanup => {
      const heads = this.visible();
      if (this.loading()) return;
      const missing = untracked(() => heads.filter(head => !Object.hasOwn(this.previews(), head.id + ':' + head.version)));
      // Fetch only this page, at most three concurrent immutable-version reads.
      // Closing/changing the page cancels obsolete requests; no failed read is a blank layout.
      const subscription = from(missing).pipe(mergeMap(head => this.api.getLibraryTemplate(this.groupId, head.id, head.version).pipe(
        map(template => ({head, template: template.version === head.version && template.id === head.id ? template : null})),
        catchError(() => of({head, template: null})),
      ), 3)).subscribe(({head, template}) => this.cachePreview(head, template));
      onCleanup(() => subscription.unsubscribe());
    });
  }
  private cachePreview(head: TemplateHead, template: LibraryTemplate | null): void {
    this.previews.update(cache => {
      const next = {...cache, [head.id + ':' + head.version]: template};
      Object.keys(next).slice(0, Math.max(0, Object.keys(next).length - 36)).forEach(key => delete next[key]);
      return next;
    });
  }
  setSearch(value: string): void { this.search.set(value); this.page.set(0); }
  setArchivedView(archived: boolean): void { this.archivedView.set(archived); this.page.set(0); }
  savedEntry(id: string): AssignmentEntry | undefined { return this.savedSelection()?.entries.find(entry => entry.templateId === id); }
  confirmArchive(head: TemplateHead): void { if (this.saving()) return; this.archiveError.set(''); this.archiveCandidate.set(head); }
  saveArchive(): void {
    const head = this.archiveCandidate(); if (!head || this.saving()) return;
    this.saving.set(true); this.archiveError.set('');
    this.api.setTemplateArchived(this.groupId, head).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => { this.templates.update(items => items.map(item => item.id === updated.id ? updated : item)); this.saving.set(false); this.archiveCandidate.set(null); this.message.set(updated.archived ? `Το «${updated.name}» αρχειοθετήθηκε. Οι υπάρχουσες επιλογές διατηρούνται.` : `Το «${updated.name}» επανήλθε στα διαθέσιμα πρότυπα.`); },
      error: error => { this.saving.set(false); this.archiveError.set(error.status === 409 ? 'Το πρότυπο άλλαξε αλλού. Κλείστε αυτό το παράθυρο και ανανεώστε τη βιβλιοθήκη πριν δοκιμάσετε ξανά.' : 'Η αλλαγή δεν επιβεβαιώθηκε. Κλείστε αυτό το παράθυρο και ανανεώστε τη βιβλιοθήκη.'); this.error.set('Ανανεώστε τη βιβλιοθήκη για να δείτε την τρέχουσα κατάσταση.'); }
    });
  }
  ngOnInit(): void { this.load(); }
  load(): void {
    if (this.loading() || this.saving()) return;
    this.loading.set(true); this.error.set(''); this.previews.set({});
    forkJoin({ library: this.api.listLibrary(this.groupId, true), groups: this.api.listGroups() }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => { this.templates.set(result.library.items); this.hierarchy.set(result.groups.groups.find(g => g.groupId === this.groupId) ?? null); this.loading.set(false); this.targetIndex.set(-1); this.draft.set(null); this.savedSelection.set(null); },
      error: () => { this.loading.set(false); this.error.set('Η βιβλιοθήκη δεν φορτώθηκε. Δοκιμάστε ξανά.'); }
    });
  }
  newTemplate(): void {
    ++this.editorRequest; this.draftId = crypto.randomUUID(); this.expectedVersion.set(0);
    this.templateDraft.set({name: '', width: 57, height: 40, layoutJson: initialTemplateLayout});
    this.editorLoading.set(false); this.editorError.set(''); this.editing.set(true);
  }
  closeEditor(): void { if (this.saving()) return; ++this.editorRequest; this.editing.set(false); this.templateDraft.set(null); }
  edit(head: TemplateHead): void {
    if (head.archived || this.saving()) return;
    const request = ++this.editorRequest;
    this.draftId = head.id; this.expectedVersion.set(head.version); this.templateDraft.set(null);
    this.editorError.set(''); this.editorLoading.set(true); this.editing.set(true);
    this.api.getLibraryTemplate(this.groupId, head.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: template => { if (request !== this.editorRequest || !this.editing()) return; this.expectedVersion.set(template.version); this.templateDraft.set(template); this.cachePreview(template, template); this.editorLoading.set(false); },
      error: () => { if (request !== this.editorRequest || !this.editing()) return; this.editorLoading.set(false); this.editorError.set(this.copy.loadFailed); }
    });
  }
  saveTemplate(value: TemplateDraft): void {
    if (this.saving() || this.editorLoading()) return;
    const problem = validateLayout(value.layoutJson, value);
    if (problem) { this.editorError.set(problem); return; }
    this.saving.set(true); this.editorError.set('');
    this.api.saveLibraryTemplate(this.groupId, this.draftId, { ...value, expectedVersion: this.expectedVersion() }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: template => { this.cachePreview(template, template); this.templates.update(items => [...items.filter(t => t.id !== template.id), template].sort((a,b) => a.name.localeCompare(b.name))); this.saving.set(false); this.editing.set(false); this.setArchivedView(false); this.message.set(`Αποθηκεύτηκε «${template.name}» v${template.version}. Επιλέξτε την έκδοση στις ενεργές αναθέσεις.`); },
      error: error => { this.saving.set(false); this.editorError.set(error.error?.error === 'library_template_archived' ? 'Το πρότυπο αρχειοθετήθηκε. Κρατήστε τη διάταξή σας και επαναφέρετέ το από τη βιβλιοθήκη πριν αποθηκεύσετε.' : error.status === 409 ? 'Το πρότυπο άλλαξε από άλλον χρήστη. Κρατήστε τη διάταξή σας πριν φορτώσετε τη νέα έκδοση.' : 'Η αποθήκευση απέτυχε. Ελέγξτε τη διάταξη και δοκιμάστε ξανά.'); }
    });
  }
  loadSource(deviceCode: string): void {
    const request = ++this.sourceRequest; this.sourceTemplates.set([]);
    if (!deviceCode) return;
    this.api.listTemplates(deviceCode).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: response => { if (request === this.sourceRequest) this.sourceTemplates.set(response.items); }, error: () => { if (request === this.sourceRequest) this.error.set('Δεν φορτώθηκαν τα πρότυπα της εγκατάστασης.'); } });
  }
  copySource(template: CatalogTemplateItem): void { this.newTemplate(); this.templateDraft.set({ name: template.name, width: template.width, height: template.height, layoutJson: template.layoutJson }); }
  selectTarget(index: number): void {
    const request = ++this.selectionRequest; this.targetIndex.set(index); this.draft.set(null); this.savedSelection.set(null); this.error.set('');
    const target = this.selectedTarget(); if (!target) { this.assignmentLoading.set(false); return; }
    this.assignmentLoading.set(true);
    this.api.getAssignment(this.groupId, target.kind, target.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => { if (request === this.selectionRequest) { this.draft.set(result); this.savedSelection.set(result); this.assignmentLoading.set(false); } },
      error: () => { if (request === this.selectionRequest) { this.assignmentLoading.set(false); this.error.set('Οι ενεργές επιλογές δεν φορτώθηκαν. Δεν έγιναν αλλαγές.'); } }
    });
  }
  entry(id: string): AssignmentEntry | undefined { return this.draft()?.entries.find(entry => entry.templateId === id); }
  setInheritance(inherit: boolean): void { this.draft.update(value => value ? { ...value, inherit, entries: inherit ? [] : value.entries } : null); }
  toggle(template: TemplateHead, checked: boolean): void { const entry = choiceEntry(template, this.savedSelection()); if (checked && !entry) return; this.draft.update(value => value ? { ...value, entries: checked ? [...value.entries.filter(item => item.templateId !== template.id), entry!] : value.entries.filter(item => item.templateId !== template.id) } : null); }
  setVersion(id: string, version: number): void { if (this.templates().find(head => head.id === id)?.archived) return; this.updateEntry(id, { version }); }
  setPrinter(id: string, printerName: string): void { this.updateEntry(id, { printerName: printerName || undefined }); }
  private updateEntry(id: string, change: Partial<AssignmentEntry>): void { this.draft.update(value => value ? { ...value, entries: value.entries.map(entry => entry.templateId === id ? { ...entry, ...change } : entry) } : null); }
  hasPrinter(target: Target, name: string): boolean { return target.device?.printers?.some(printer => printer.name === name) ?? false; }
  retryRevisionChanged(result: LibraryRetryCompleted): void {
    const target = this.selectedTarget();
    if (target?.kind === 'installation' && target.id === result.deviceCode)
      this.draft.update(draft => draft ? { ...draft, revision: retryDraftRevision(draft.revision, result) } : null);
  }
  saveSelection(): void {
    const target = this.selectedTarget(); const draft = this.draft(); if (!target || !draft || this.saving()) return;
    this.saving.set(true); this.error.set('');
    this.api.saveAssignment(this.groupId, target.kind, target.id, { expectedRevision: draft.revision, inherit: draft.inherit, entries: draft.entries }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => { this.draft.set(result); this.savedSelection.set(result); this.saving.set(false); this.applicationRefresh.update(value => value + 1); this.message.set('Οι επιλογές αποθηκεύτηκαν. Παρακολουθήστε παρακάτω την επιβεβαίωση από κάθε εγκατάσταση.'); },
      error: error => { this.saving.set(false); this.error.set(error.error?.error === 'library_template_archived' ? 'Ένα νέο πρότυπο αρχειοθετήθηκε. Οι επιλογές σας παραμένουν εδώ· αφαιρέστε το ή επαναφέρετε το πρότυπο πριν αποθηκεύσετε.' : error.status === 409 ? 'Οι επιλογές άλλαξαν αλλού. Επιλέξτε ξανά την εγκατάσταση για να φορτώσετε τις τρέχουσες.' : 'Οι επιλογές δεν αποθηκεύτηκαν. Ελέγξτε τις εκδόσεις και δοκιμάστε ξανά.'); }
    });
  }
}
