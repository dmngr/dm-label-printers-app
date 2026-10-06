import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { CustomerApiService, GroupHierarchy } from '../services/customer-api.service';
import { parseUtcTimestamp } from '../shared/utc-timestamp';

/** Group grants are unchanged; stores below each group use actual StoreCode. */
@Component({
  selector: 'app-devices-list', standalone: true, imports: [RouterLink],
  template: `
    <main class="page">
      <header><div><span class="eyebrow">LABEL NINJA</span><h1>Οι εγκαταστάσεις σας</h1><p>Επιλέξτε πού θέλετε να εκτυπώσετε.</p></div>
        <div class="actions"><button (click)="refresh()" [disabled]="loading()">Ανανέωση</button><button (click)="signOut()">Αποσύνδεση</button></div></header>
      @if (errorMessage()) { <p class="error" role="alert">{{ errorMessage() }}</p> }
      @if (loading()) { <p role="status">Φόρτωση εγκαταστάσεων…</p> }
      @for (group of groups(); track group.groupId) {
        <section class="group"><div class="group-heading"><h2>{{ group.groupId }}</h2>
          <a class="library-link" [routerLink]="['/groups', group.groupId, 'templates']">Κοινή βιβλιοθήκη προτύπων →</a></div>
          @for (store of group.stores; track store.storeCode) {
            <h3>{{ store.storeCode || 'Χωρίς κατάστημα' }}</h3>
            <div class="grid">@for (device of store.installations; track device.deviceCode) {
              <a class="installation" [routerLink]="['/devices', device.deviceCode]">
                <div class="title"><strong>{{ device.deviceName || device.deviceCode }}</strong><span class="badge" [class.online]="device.isOnline">{{ device.isOnline ? 'Συνδεδεμένο' : 'Offline' }}</span></div>
                <p>{{ device.hostName || 'Το όνομα υπολογιστή δεν έχει αναφερθεί ακόμη' }}</p>
                <div class="details"><span>v{{ device.appVersion || '—' }}</span><span>{{ device.printers === null ? 'Εκτυπωτές: αναμονή αναφοράς' : device.printers.length + ' εκτυπωτές' }}</span></div>
                <small>Τελευταία επικοινωνία: {{ relativeTime(device.lastSeenAtUtc) }}</small>
              </a>
            }</div>
          } @empty { <p>Δεν έχουν συνδεθεί εγκαταστάσεις σε αυτή την ομάδα.</p> }
        </section>
      } @empty { @if (!loading() && !errorMessage()) { <p>Δεν βρέθηκαν ομάδες για αυτόν τον λογαριασμό.</p> } }
    </main>
  `,
  styles: [`
    .page{max-width:1060px;margin:auto;padding:32px 24px;color:#17212d}header,.group-heading,.actions,.title,.details{display:flex;align-items:center;justify-content:space-between;gap:12px}header{margin-bottom:28px}h1{font-size:28px;margin:8px 0}p,small{color:#64748b}.eyebrow{font-size:11px;font-weight:700;letter-spacing:2px;color:#4f46e5}.group{padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;margin-bottom:24px}h2{font-size:20px;margin:0}h3{font-size:14px;margin:26px 0 12px;color:#475569}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(265px,1fr));gap:12px}.installation{display:block;border:1px solid #e2e8f0;border-radius:12px;padding:20px;color:inherit;text-decoration:none;background:#f8fafc}.installation:hover{border-color:#6366f1;background:#f5f3ff}.installation p{font-size:13px;margin:12px 0}.details{justify-content:flex-start;color:#475569;font-size:12px;margin-bottom:14px}small{font-size:11px}.badge{font-size:10px;padding:5px 8px;border-radius:16px;background:#e2e8f0;white-space:nowrap}.online{background:#dcfce7;color:#166534}.library-link{color:#4f46e5;font-size:13px;text-decoration:none}button{border:1px solid #d1d5db;background:white;border-radius:7px;padding:9px 12px;cursor:pointer}button:disabled{opacity:.5}.error{padding:15px;background:#fef2f2;color:#991b1b;border-radius:8px}@media(max-width:650px){header,.group-heading{align-items:flex-start;flex-direction:column}.page{padding:20px 14px}.group{padding:18px}.title{align-items:flex-start}}
  `]
})
export class DevicesListPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(CustomerApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly groups = signal<GroupHierarchy[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  ngOnInit(): void { this.refresh(); }
  refresh(): void {
    if (this.loading()) return;
    this.loading.set(true); this.errorMessage.set(null);
    this.api.listGroups().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => { this.groups.set(response.groups); this.loading.set(false); },
      error: () => { this.errorMessage.set('Δεν φορτώθηκαν οι εγκαταστάσεις. Δοκιμάστε ξανά. Η σύνδεσή σας διατηρείται.'); this.loading.set(false); }
    });
  }
  signOut(): void { this.auth.clear(); void this.router.navigate(['/login']); }
  relativeTime(iso: string | null): string {
    const timestamp = parseUtcTimestamp(iso);
    if (!Number.isFinite(timestamp)) return 'δεν υπάρχει αναφορά';
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    return minutes < 1 ? 'μόλις τώρα' : minutes < 60 ? `${minutes} λεπτά πριν` : minutes < 1440 ? `${Math.floor(minutes / 60)} ώρες πριν` : `${Math.floor(minutes / 1440)} ημέρες πριν`;
  }
}
