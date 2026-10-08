import {AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, input, output} from '@angular/core';
import type {TemplateHead} from '../services/customer-api.service';

/** Native modal makes archive scope reviewable before the reversible write. */
@Component({
  selector: 'app-template-archive-dialog', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<dialog #dialog (cancel)="cancel($event)" aria-labelledby="archive-title">
    <h2 id="archive-title">{{ head().archived ? 'Επαναφορά προτύπου' : 'Αρχειοθέτηση προτύπου' }}</h2>
    <p><strong>{{ head().name }}</strong> · v{{ head().version }}</p>
    @if (head().archived) { <p>Θα εμφανίζεται ξανά στη βιβλιοθήκη για επεξεργασία και νέες επιλογές.</p> }
    @else { <p>Θα αποσυρθεί από τις νέες επιλογές. Οι εγκαταστάσεις που το χρησιμοποιούν ήδη θα συνεχίσουν να εκτυπώνουν την επιλεγμένη έκδοση.</p><p>Μπορείτε να το επαναφέρετε από τα «Αρχειοθετημένα».</p> }
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    <footer><button type="button" (click)="cancel()" [disabled]="saving()" autofocus>Ακύρωση</button><button type="button" class="primary" (click)="confirmed.emit()" [disabled]="saving() || !!error()">{{ saving() ? 'Αποθήκευση…' : head().archived ? 'Επαναφορά' : 'Αρχειοθέτηση' }}</button></footer>
  </dialog>`,
  styles: [`dialog{box-sizing:border-box;max-width:min(460px,calc(100vw - 32px));max-height:calc(100dvh - 32px);border:1px solid #e2e8f0;border-radius:16px;padding:24px;color:#17212d;box-shadow:0 24px 80px #17212d40}dialog::backdrop{background:#17212d66}h2{font-size:21px;margin-top:0}p{font-size:14px;line-height:1.6;overflow-wrap:anywhere}footer{display:flex;gap:10px;justify-content:flex-end;margin-top:24px}button{font:inherit;font-size:13px;border:1px solid #cbd5e1;border-radius:7px;padding:10px 14px;background:white;color:#334155;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.primary{background:#4f46e5;border-color:#4f46e5;color:white}.error{color:#991b1b;background:#fef2f2;padding:12px;border-radius:8px}`]
})
export class TemplateArchiveDialogComponent implements AfterViewInit, OnDestroy {
  readonly head = input.required<TemplateHead>();
  readonly saving = input(false); readonly error = input('');
  readonly confirmed = output<void>(); readonly dismissed = output<void>();
  @ViewChild('dialog') private dialog!: ElementRef<HTMLDialogElement>;
  ngAfterViewInit(): void { this.dialog.nativeElement.showModal(); }
  ngOnDestroy(): void { this.dialog.nativeElement.close(); }
  cancel(event?: Event): void { event?.preventDefault(); if (!this.saving()) this.dismissed.emit(); }
}
