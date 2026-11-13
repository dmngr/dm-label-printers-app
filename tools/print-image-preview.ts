/** Local-only visual acceptance host for the actual history component.
 * The API provider below has no command method and reads synthetic fixture files
 * from loopback. It cannot contact the cloud or a printer.
 */
import '@angular/compiler';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { defer, delay, throwError } from 'rxjs';
import { PrintJobImagesComponent } from '../src/app/pages/print-job-images.component';
import { CustomerApiService } from '../src/app/services/customer-api.service';
import type { PrintImage } from '../src/app/shared/print-images';

let mode = 'available';
const names = ['generic-product-55x25-r1-203', 'generic-bag-58x43-r1-300'];
const mockApi = {
  listPrintImages: () => mode === 'error' ? throwError(() => ({ status: 500 })) : mode === 'disabled' ? throwError(() => ({ status: 503 })) : defer(async () => {
    if (mode === 'empty') return { items: [], nextCursor: null, state: 'unavailable' };
    const items: PrintImage[] = [];
    for (let index = 0; index < names.length; index++) {
      const original = await (await fetch('/fixtures/' + names[index] + '.json')).json();
      items.push({ ...original, artifactId: String(index + 1).repeat(64), copyIndex: index + 1, copyCount: 2 });
    }
    return { items, nextCursor: null, state: 'available' };
  }).pipe(delay(mode === 'slow' ? 3000 : 150)),
  getPrintImage: (_device: string, _job: number, artifact: string) => mode === 'download-error' ? throwError(() => ({ status: 404 })) :
    defer(async () => (await fetch('/fixtures/' + names[Number(artifact[0]) - 1] + '.png')).blob()).pipe(delay(mode === 'slow' ? 3000 : 100))
};
@Component({ selector: 'app-root', standalone: true, imports: [PrintJobImagesComponent],
  template: `
    <main><p class="eyebrow">Label Ninja · Απομονωμένη δοκιμή</p><h1>Εικόνες στο ιστορικό</h1>
    <p>Συνθετικά δεδομένα στον υπολογιστή. Καμία σύνδεση σε cloud ή εκτυπωτή.</p>
    <nav aria-label="Σενάρια δοκιμής">
      @for (entry of cases; track entry.key) { <button (click)="choose(entry.key)">{{ entry.label }}</button> }
    </nav>
    <article><h2>Εργασία #{{ job }} · Πρότυπα προϊόντος και σακούλας</h2><p class="status">Κατάσταση εργασίας: Submitted</p>
      <app-print-job-images deviceCode="fixture-device" [jobId]="job" />
    </article></main>`,
  styles: [`:host{font-family:Arial,sans-serif;color:#1f2937}main{max-width:760px;margin:35px auto;padding:0 20px}h1{font-size:26px}h2{font-size:18px}.eyebrow{color:#4f46e5;font-size:13px}p{font-size:13px;line-height:1.5}nav{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}nav button{padding:8px 12px;background:white;border:1px solid #cbd5e1;border-radius:7px;cursor:pointer}article{border:1px solid #e2e8f0;border-radius:12px;padding:20px;background:white}.status{color:#166534}`]
})
class PreviewHost {
  job = 1301;
  readonly cases = [{ key: 'available', label: 'Δύο ετικέτες' }, { key: 'empty', label: 'Παλιά εργασία' },
    { key: 'error', label: 'Αποσύνδεση' }, { key: 'download-error', label: 'Ληγμένη εικόνα' },
    { key: 'disabled', label: 'Ανενεργή αποθήκευση' }, { key: 'slow', label: 'Αργή απάντηση' }];
  choose(value: string): void { mode = value; this.job++; }
}
bootstrapApplication(PreviewHost, { providers: [provideZonelessChangeDetection(), { provide: CustomerApiService, useValue: mockApi }] });
