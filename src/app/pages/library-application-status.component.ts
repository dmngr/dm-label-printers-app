import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, fromEvent, map, startWith } from 'rxjs';
import { CustomerApiService } from '../services/customer-api.service';
import { applicationPresentation, type LibraryApplicationStatus, type LibraryRetryCompleted } from '../shared/library-application';
import { refreshVisiblePage } from '../shared/page-refresh';

/** Per-target, visibility-aware receipt reads. Polls never touch library forms.
 * Changing the target cancels old reads; a failed refresh keeps the last snapshot
 * and labels it stale. Retry uses its exact selection token and does not force
 * replacement of local edits or bypass the print queue.
 */
@Component({
  selector: 'app-library-application-status', standalone: true,
  template: `
    <section class="application-status" aria-label="Εφαρμογή κοινών προτύπων">
      <div class="heading"><h3>Εφαρμογή στις εγκαταστάσεις</h3><button (click)="refresh()" [disabled]="refreshing() || retrying() !== ''">{{ refreshing() ? 'Έλεγχος…' : 'Ανανέωση' }}</button></div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }
      <div class="receipts">@for (item of rows(); track item.deviceCode) {
        <article>
          <div class="title"><strong>{{ item.deviceName || item.deviceCode }}</strong><span class="badge" [class]="'badge ' + item.tone">{{ item.label }}</span></div>
          <p>{{ item.detail }} @if (item.state === 'applied' && !item.isOnline) { <span>Η εγκατάσταση είναι τώρα offline.</span> }</p>
          <p class="selection">{{ item.desiredText }}</p>
          @if (item.state === 'applied' && item.confirmedTime) { <small>Επιβεβαίωση: {{ item.confirmedTime }}</small> }
          @if (item.state !== 'applied' && item.lastApplied) {
            <details><summary>Τελευταία επιβεβαιωμένη εφαρμογή · {{ item.confirmedTime }}</summary><p>{{ item.appliedText }}</p></details>
          }
          @if (item.canRetry) { <button class="retry" (click)="retry(item)" [disabled]="disabled() || retrying() !== ''">{{ retrying() === item.deviceCode ? 'Αποστολή…' : 'Νέα προσπάθεια' }}</button> }
        </article>
      } @empty { @if (!error()) { <p>{{ refreshing() ? 'Φόρτωση κατάστασης…' : 'Δεν υπάρχει ακόμη διαθέσιμη επιβεβαίωση.' }}</p> } }</div>
      <small class="cadence">Αυτόματος έλεγχος όσο η σελίδα είναι ανοικτή.</small>
    </section>
  `,
  styles: [`
    .receipts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:12px;margin-top:12px}.receipts article{margin-top:0}
    :host{display:block;min-width:0}.application-status{border-top:1px solid #e2e8f0;margin-top:22px;padding-top:18px}.heading,.title{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}h3{font-size:14px;margin:0}button{font:inherit;font-size:12px;border:1px solid #cbd5e1;border-radius:6px;background:white;color:#475569;padding:7px 10px;cursor:pointer}button:disabled{opacity:.55;cursor:default}article{border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-top:12px;overflow-wrap:anywhere}.title strong{font-size:13px}.badge{font-size:11px;padding:4px 8px;border-radius:20px;font-weight:600}.success{background:#dcfce7;color:#166534}.pending{background:#fef3c7;color:#92400e}.error{background:#fef2f2;color:#991b1b}.muted{background:#f1f5f9;color:#475569}p{font-size:12px;line-height:1.6;color:#64748b;margin:10px 0}.selection{color:#334155;font-weight:500}small,summary{font-size:11px;color:#64748b;line-height:1.5}summary{cursor:pointer;margin-top:10px}.retry{margin-top:12px;color:#4f46e5;border-color:#c7d2fe}.cadence{display:block;margin-top:12px}.notice{color:#166534}.heading button{flex-shrink:0}
  `],
})
export class LibraryApplicationStatusComponent {
  private readonly api = inject(CustomerApiService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requested = new Subject<void>();
  private readonly refreshEpoch = signal(0);
  readonly group = input.required<string>();
  readonly targetKind = input.required<'store' | 'installation'>();
  readonly targetId = input.required<string>();
  readonly refreshKey = input(0);
  readonly disabled = input(false);
  readonly retryCompleted = output<LibraryRetryCompleted>();
  readonly items = signal<LibraryApplicationStatus[]>([]);
  readonly rows = computed(() => this.items().map(item => ({ ...item, ...applicationPresentation(item) })));
  readonly refreshing = signal(false); readonly retrying = signal('');
  readonly error = signal(''); readonly notice = signal('');
  private activeKey = '';
  private targetGeneration = 0;
  private lastRefreshKey = 0;

  constructor() {
    effect(onCleanup => {
      const group = this.group(), kind = this.targetKind(), target = this.targetId();
      const refreshKey = this.refreshKey();
      if (refreshKey !== this.lastRefreshKey) { this.notice.set(''); this.lastRefreshKey = refreshKey; }
      this.refreshEpoch();
      const key = JSON.stringify([group, kind, target]);
      if (key !== this.activeKey) { this.items.set([]); this.notice.set(''); this.error.set(''); this.retrying.set(''); this.activeKey = key; this.targetGeneration++; }
      const visible = fromEvent(this.document, 'visibilitychange').pipe(startWith(null), map(() => this.document.visibilityState !== 'hidden'));
      const subscription = refreshVisiblePage(() => this.api.getLibraryApplications(group, kind, target), visible, this.requested, 60_000)
        .subscribe(result => {
          this.refreshing.set(result.state === 'refreshing');
          if (result.state === 'ready') { this.items.set(result.value.items); this.error.set(''); }
          else if (result.state === 'error') this.error.set('Ο έλεγχος δεν ολοκληρώθηκε. Η εμφανιζόμενη κατάσταση μπορεί να έχει αλλάξει.');
        });
      onCleanup(() => subscription.unsubscribe());
    });
  }
  refresh(): void { this.requested.next(); }
  retry(item: LibraryApplicationStatus): void {
    if (this.disabled() || this.retrying() || !applicationPresentation(item).canRetry) return;
    const generation = this.targetGeneration;
    this.retrying.set(item.deviceCode); this.error.set(''); this.notice.set('');
    this.api.retryLibraryApplication(this.group(), item.deviceCode, item.desired.selectionId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        if (generation !== this.targetGeneration) return;
        this.retrying.set(''); this.notice.set('Η νέα προσπάθεια θα γίνει στον επόμενο συγχρονισμό.');
        this.retryCompleted.emit({ ...result, deviceCode: item.deviceCode });
        // Cancel any pre-retry read before fetching the new desired state.
        this.refreshEpoch.update(value => value + 1);
      },
      error: error => {
        if (generation !== this.targetGeneration) return;
        this.retrying.set(''); this.error.set(error.status === 409 ? 'Οι επιλογές άλλαξαν στο μεταξύ. Ανανεώστε την κατάσταση πριν δοκιμάσετε ξανά.' : 'Η νέα προσπάθεια δεν καταχωρίστηκε. Δοκιμάστε ξανά.');
      },
    });
  }
}
