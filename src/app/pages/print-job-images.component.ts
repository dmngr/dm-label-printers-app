/** Read-only, on-demand history viewer. Closing/changing the job invalidates
 * in-flight results and revokes the previous blob URL; no token goes in a URL.
 */
import { ChangeDetectionStrategy, Component, OnDestroy, effect, inject, input, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CustomerApiService } from '../services/customer-api.service';
import { imageFailureMessage, mergeImages, verifyImageBlob, type PrintImage } from '../shared/print-images';

@Component({
  selector: 'app-print-job-images', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="toggle" (click)="toggle()" [attr.aria-expanded]="open()">{{ open() ? 'Κλείσιμο εικόνων' : 'Εικόνες ετικετών' }}</button>
    @if (open()) {
      <section class="viewer" aria-label="Εικόνες της εργασίας">
        <p class="note">Το αποθηκευμένο σχέδιο της ετικέτας. Η κατάσταση εκτύπωσης φαίνεται χωριστά στην εργασία.</p>
        @if (loading()) { <p role="status">Φόρτωση εικόνων…</p> }
        @if (error()) { <p class="error" role="alert">{{ error() }}</p><button (click)="reload()">Δοκιμή ξανά</button> }
        @if (!loading() && !error() && images().length === 0) {
          <p class="empty">Δεν υπάρχει διαθέσιμη εικόνα για αυτή την εργασία. Μπορεί να μην έχει καταγραφεί ή μεταφορτωθεί, ή να έχει λήξει η διατήρησή της.</p>
        }
        <div class="choices">
          @for (image of images(); track image.artifactId) {
            <button (click)="select(image)" [class.selected]="selected()?.artifactId === image.artifactId" [attr.aria-pressed]="selected()?.artifactId === image.artifactId">
              Ετικέτα {{ image.copyIndex }}/{{ image.copyCount }} · προσπάθεια {{ image.attempt }}
            </button>
          }
          @if (cursor()) { <button (click)="loadMore()" [disabled]="loading()">Περισσότερες εικόνες</button> }
        </div>
        @if (selected(); as image) {
          <div class="meta">{{ image.widthMm }} × {{ image.heightMm }} mm · {{ image.dpiX }} × {{ image.dpiY }} DPI · {{ formatTime(image.capturedAtUtc) }}</div>
          @if (image.reprintOfJobId) { <p class="note">Επανεκτύπωση της τοπικής εργασίας #{{ image.reprintOfJobId }}</p> }
          @if (imageLoading()) { <p role="status">Φόρτωση ετικέτας…</p> }
          @if (imageError()) { <p class="error" role="alert">{{ imageError() }}</p><button (click)="select(image)">Επανάληψη λήψης</button> }
          @if (imageUrl(); as url) {
            <div class="paper"><img [src]="url" [alt]="'Ετικέτα ' + image.copyIndex + ' της εργασίας ' + jobId()" (error)="imageError.set('Η εικόνα δεν μπορεί να εμφανιστεί.')" /></div>
            <a [href]="url" [download]="'label-' + jobId() + '-' + image.copyIndex + '.png'">Λήψη PNG</a>
          }
        }
      </section>
    }
  `,
  styles: [`
    :host { display:block; margin-top:8px; }
    button,a { font:inherit; font-size:12px; }
    button { cursor:pointer; border:1px solid #c7d2fe; border-radius:6px; padding:7px 10px; background:#fff; color:#3730a3; }
    button:focus-visible,a:focus-visible { outline:2px solid #4f46e5; outline-offset:2px; }
    button:disabled { cursor:wait; opacity:.6; }
    .viewer { margin-top:10px; padding:14px; border:1px solid #e5e7eb; border-radius:8px; background:#f8fafc; }
    .note,.empty,.meta { color:#475569; font-size:12px; line-height:1.5; margin:0 0 10px; }
    .error { color:#991b1b; font-size:13px; }
    .choices { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
    .selected { background:#e0e7ff; border-color:#4f46e5; }
    .paper { display:flex; justify-content:center; background:#e2e8f0; padding:16px; border-radius:6px; margin-bottom:12px; }
    img { display:block; max-width:100%; height:auto; background:white; box-shadow:0 2px 8px #0002; }
    a { color:#3730a3; }
  `]
})
export class PrintJobImagesComponent implements OnDestroy {
  readonly deviceCode = input.required<string>();
  readonly jobId = input.required<number>();
  private readonly api = inject(CustomerApiService);
  readonly open = signal(false); readonly loading = signal(false); readonly error = signal('');
  readonly images = signal<PrintImage[]>([]); readonly cursor = signal<string | null>(null);
  readonly selected = signal<PrintImage | null>(null); readonly imageUrl = signal<string | null>(null);
  readonly imageLoading = signal(false); readonly imageError = signal('');
  private generation = 0;
  private imageGeneration = 0;

  constructor() { effect(() => { this.deviceCode(); this.jobId(); untracked(() => this.close()); }); }
  ngOnDestroy(): void { this.close(); }
  private releaseImage(): void { const old = this.imageUrl(); if (old) URL.revokeObjectURL(old); this.imageUrl.set(null); }
  private close(): void {
    this.generation++; this.imageGeneration++; this.releaseImage(); this.open.set(false);
    this.images.set([]); this.cursor.set(null); this.selected.set(null); this.error.set(''); this.imageError.set('');
    this.loading.set(false); this.imageLoading.set(false);
  }
  toggle(): void { if (this.open()) this.close(); else { this.open.set(true); void this.load(); } }
  reload(): void {
    this.imageGeneration++; this.imageLoading.set(false); this.imageError.set('');
    this.images.set([]); this.cursor.set(null); this.selected.set(null); this.releaseImage(); void this.load();
  }
  loadMore(): void { if (!this.loading()) void this.load(this.cursor() ?? undefined); }
  private async load(cursor?: string): Promise<void> {
    const generation = ++this.generation;
    this.loading.set(true); this.error.set('');
    try {
      const result = await firstValueFrom(this.api.listPrintImages(this.deviceCode(), this.jobId(), cursor));
      if (generation !== this.generation) return;
      this.images.set(mergeImages(this.images(), result.items)); this.cursor.set(result.nextCursor);
      if (!this.selected() && this.images().length) void this.select(this.images()[0]);
    } catch (error) {
      if (generation === this.generation) this.error.set(imageFailureMessage(Number((error as { status?: number }).status ?? 0)));
    } finally { if (generation === this.generation) this.loading.set(false); }
  }
  async select(image: PrintImage): Promise<void> {
    const generation = ++this.imageGeneration;
    this.selected.set(image); this.releaseImage(); this.imageError.set(''); this.imageLoading.set(true);
    try {
      const blob = await firstValueFrom(this.api.getPrintImage(this.deviceCode(), this.jobId(), image.artifactId));
      await verifyImageBlob(blob, image);
      if (generation === this.imageGeneration) this.imageUrl.set(URL.createObjectURL(blob));
    } catch (error) {
      if (generation === this.imageGeneration) this.imageError.set(imageFailureMessage(Number((error as { status?: number }).status ?? 0)));
    } finally { if (generation === this.imageGeneration) this.imageLoading.set(false); }
  }
  formatTime(value: string): string { return new Date(value).toLocaleString('el-GR'); }
}
