import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { CatalogTemplateItem, CustomerApiService, DeviceDetail } from '../services/customer-api.service';
import { bindTemplateInputs, readTemplateInputs, TemplateInput } from '../shared/template-inputs';

@Component({
  selector: 'app-template-print-panel', standalone: true, imports: [FormsModule],
  template: `
    <div class="print-layout"><section class="cards" aria-label="Ενεργά πρότυπα">
      @for (template of active(); track template.id) {
        <button class="template" [class.selected]="selected()?.id === template.id" (click)="select(template)" [disabled]="sending()"><strong>{{ template.name }}</strong><span>{{ template.width }} × {{ template.height }} mm</span><small>{{ template.printerName || 'Προεπιλεγμένος εκτυπωτής εφαρμογής' }}</small></button>
      } @empty { <p class="empty">Δεν έχουν συγχρονιστεί ενεργά πρότυπα. Επιλέξτε πρότυπα στην κοινή βιβλιοθήκη ή ενεργοποιήστε τα στην εφαρμογή Windows.</p> }
    </section><section class="form">
      @if (selected(); as template) {
        <h3>{{ template.name }}</h3><p>Συμπληρώστε τα πεδία και στείλτε την ετικέτα στην εγκατάσταση.</p>
        <form (ngSubmit)="print()">@for (field of fields(); track field.key) {
          <label>{{ field.label || field.key }} {{ field.required ? '*' : '' }}<input [type]="field.type" [name]="field.key" [(ngModel)]="values[field.key]" [required]="field.required" [disabled]="sending()" [attr.step]="field.type === 'number' ? 'any' : null" maxlength="4000" /></label>
        }
        <label>Αντίγραφα<input type="number" name="quantity" min="1" max="999" [(ngModel)]="quantity" [disabled]="sending()" required /></label>
        @if (!device().isOnline) { <p class="offline">Η εγκατάσταση είναι offline. Η εργασία θα περιμένει μέχρι να συνδεθεί.</p> }
        <button type="submit" class="primary" [disabled]="sending() || !!formError()">{{ sending() ? 'Αποστολή…' : 'Εκτύπωση ετικέτας' }}</button></form>
      } @else { <p class="empty">Επιλέξτε ένα ενεργό πρότυπο για εκτύπωση.</p> }
      @if (formError()) { <p class="error" role="alert">{{ formError() }}</p> }
      @if (status()) { <p class="status" role="status">{{ status() }}</p> }
    </section></div>
  `,
  styles: [`
    .print-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:24px}.cards{display:flex;flex-direction:column;gap:12px}.template{text-align:left;display:flex;flex-direction:column;gap:10px;padding:20px;border:1px solid #e2e8f0;border-radius:10px;background:white;cursor:pointer}.selected{border-color:#6366f1;background:#eef2ff}.template span,.template small{font-size:12px;color:#64748b}.form{padding:24px;background:white;border:1px solid #e2e8f0;border-radius:12px}h3{margin:0;font-size:20px}p{font-size:13px;line-height:1.5;color:#64748b}label{display:flex;flex-direction:column;gap:7px;font-size:13px;margin:18px 0;color:#475569}input{padding:11px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;width:100%;box-sizing:border-box}input[type=number]{max-width:150px}.primary{border:0;border-radius:7px;background:#4f46e5;color:white;padding:12px 20px;cursor:pointer}button:disabled{opacity:.5}.offline{background:#fffbeb;padding:10px;color:#92400e}.error{color:#991b1b;background:#fef2f2;padding:12px;border-radius:6px}.status{background:#eff6ff;color:#1e40af;padding:12px;border-radius:6px}.empty{padding:15px}@media(max-width:650px){.print-layout{grid-template-columns:1fr}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}}
  `]
})
export class TemplatePrintPanelComponent {
  private readonly api = inject(CustomerApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly device = input.required<DeviceDetail>();
  readonly templates = input.required<CatalogTemplateItem[]>();
  readonly active = computed(() => this.templates().filter(t => t.isActive !== false).sort((a,b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)));
  readonly selected = signal<CatalogTemplateItem | null>(null);
  readonly fields = signal<TemplateInput[]>([]); readonly sending = signal(false);
  readonly formError = signal(''); readonly status = signal('');
  values: Record<string, string> = {}; quantity = 1;
  private monitor = 0;
  select(template: CatalogTemplateItem): void {
    this.monitor++; this.selected.set(template); this.formError.set(''); this.status.set(''); this.values = {}; this.fields.set([]);
    try { const fields = readTemplateInputs(template.layoutJson); this.fields.set(fields); for (const field of fields) this.values[field.key] = field.defaultValue ?? ''; }
    catch { this.formError.set('Η διάταξη του προτύπου δεν είναι έγκυρη. Διορθώστε την στην κοινή βιβλιοθήκη.'); }
  }
  print(): void {
    const template = this.selected(); if (!template || this.sending()) return;
    let fields: Record<string, string | null>;
    try {
      if (!Number.isInteger(this.quantity) || this.quantity < 1 || this.quantity > 999) throw new Error('Η ποσότητα πρέπει να είναι από 1 έως 999.');
      fields = bindTemplateInputs(this.fields(), Object.fromEntries(Object.entries(this.values).map(([key,value]) => [key, value == null ? '' : String(value)])));
    } catch (error) { this.status.set(error instanceof Error ? error.message : 'Ελέγξτε τα πεδία.'); return; }
    const monitor = ++this.monitor;
    this.sending.set(true); this.status.set('Αποστολή εργασίας…');
    this.api.printTemplate(this.device().deviceCode, template.code, fields, this.quantity).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: command => {
        this.sending.set(false); this.status.set(`Η εργασία #${command.id} μπήκε στην ουρά.`);
        let terminal = false;
        this.api.streamCommand(this.device().deviceCode, command.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: result => {
            if (monitor !== this.monitor) return;
            terminal = ['completed', 'failed'].includes(result.status.toLowerCase());
            this.status.set(result.status.toLowerCase() === 'completed' ? `Η εργασία #${command.id} παραδόθηκε στην τοπική υπηρεσία εκτύπωσης.` : result.status.toLowerCase() === 'failed' ? `Η εργασία #${command.id} απέτυχε: ${result.errorMessage ?? 'άγνωστο σφάλμα'}` : `Η εργασία #${command.id}: ${result.status}`);
          },
          complete: () => { if (monitor === this.monitor && !terminal) this.status.set(`Η εργασία #${command.id} παραμένει σε αναμονή. Ελέγξτε το ιστορικό· μην επαναλάβετε την αποστολή.`); }
        });
      },
      error: error => { this.sending.set(false); this.status.set(error.status === 409 ? 'Η εγκατάσταση χρειάζεται ενημέρωση για εκτύπωση χωρίς προϊόν.' : error.status === 400 ? 'Η εκτύπωση απορρίφθηκε. Ελέγξτε τα πεδία και ανανεώστε τα πρότυπα.' : 'Δεν επιβεβαιώθηκε η αποστολή. Ελέγξτε το ιστορικό πριν δοκιμάσετε ξανά.'); }
    });
  }
}
