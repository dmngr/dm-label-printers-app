import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { CustomerApiService, StoreWithDevices } from '../services/customer-api.service';

@Component({
  selector: 'app-devices-list',
  standalone: true,
  imports: [],
  template: `
    <div class="page">
      <header>
        <h1>Your Stores</h1>
        <div class="header-actions">
          <button class="btn" (click)="refresh()" [disabled]="loading()">
            {{ loading() ? 'Loading…' : 'Refresh' }}
          </button>
          <button class="btn" (click)="signOut()">Sign out</button>
        </div>
      </header>

      @if (errorMessage()) {
        <div class="error">{{ errorMessage() }}</div>
      }

      @if (stores().length === 0 && !loading() && !errorMessage()) {
        <div class="card">
          <p class="muted">No devices found for your account yet.</p>
        </div>
      }

      @for (store of stores(); track store.storeId) {
        <section class="store">
          <h2>
            <span class="store-pill">{{ store.storeId }}</span>
            <span class="muted small">{{ store.devices.length }} device(s)</span>
          </h2>

          <div class="device-grid">
            @for (d of store.devices; track d.deviceCode) {
              <div class="device-card">
                <div class="device-title">
                  {{ d.deviceName || d.deviceCode }}
                  @if (d.isOnline) {
                    <span class="badge badge-active">online</span>
                  } @else if (d.isActive) {
                    <span class="badge badge-warn">recent</span>
                  } @else {
                    <span class="badge badge-mute">offline</span>
                  }
                </div>
                <div class="device-meta">
                  <span class="mono small">v{{ d.appVersion || '?' }}</span>
                  <span class="muted small">last seen {{ relativeTime(d.lastSeenAtUtc) }}</span>
                  @if (d.failedJobs > 0) {
                    <span class="badge badge-stale">{{ d.failedJobs }} failed</span>
                  }
                  @if (d.pendingCommands > 0) {
                    <span class="badge badge-mute">{{ d.pendingCommands }} cmd</span>
                  }
                </div>
              </div>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .page { max-width: 920px; margin: 0 auto; padding: 32px 24px; }
      header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
      .header-actions { display: flex; gap: 8px; }
      h1 { margin: 0; font-size: 24px; font-weight: 700; color: #1F2937; }
      h2 {
        margin: 0 0 12px;
        font-size: 14px;
        color: #374151;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .small { font-size: 12px; }
      .muted { color: #6B7280; }
      .store { margin-bottom: 28px; }
      .store-pill {
        display: inline-block;
        background: #EEF2FF;
        color: #3730A3;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .device-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 8px;
      }
      .device-card {
        background: white;
        border: 1px solid #E5E7EB;
        border-radius: 8px;
        padding: 12px 14px;
      }
      .device-title { font-weight: 500; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
      .device-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 12px; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .badge {
        font-size: 10px;
        padding: 2px 7px;
        border-radius: 999px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        font-weight: 600;
      }
      .badge-active { background: #DCFCE7; color: #14532D; }
      .badge-warn { background: #FEF3C7; color: #92400E; }
      .badge-mute { background: #E5E7EB; color: #4B5563; }
      .badge-stale { background: #FEE2E2; color: #991B1B; }
      .card {
        background: white;
        border: 1px solid #E5E7EB;
        border-radius: 10px;
        padding: 24px;
      }
      .error {
        color: #991B1B;
        background: #FEE2E2;
        padding: 10px 14px;
        border-radius: 8px;
        margin-bottom: 12px;
      }
      .btn {
        background: white;
        border: 1px solid #D1D5DB;
        padding: 8px 14px;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
      }
      .btn:hover:not(:disabled) { background: #F9FAFB; }
      .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    `,
  ],
})
export class DevicesListPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(CustomerApiService);
  private readonly router = inject(Router);

  readonly stores = signal<StoreWithDevices[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.errorMessage.set(null);
    this.loading.set(true);
    this.api.listDevices().subscribe({
      next: (response) => {
        this.stores.set(response.stores ?? []);
        this.loading.set(false);
      },
      error: (err: { status?: number; message?: string }) => {
        if (err?.status === 401 || err?.status === 403) {
          // The interceptor already cleared the token + navigated to /login.
          return;
        }
        this.errorMessage.set(err?.message ?? 'Failed to load your devices.');
        this.loading.set(false);
      },
    });
  }

  signOut(): void {
    this.auth.clear();
    this.router.navigate(['/login']);
  }

  relativeTime(iso: string | null): string {
    if (!iso) return 'never';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    const seconds = Math.max(0, (Date.now() - t) / 1000);
    if (seconds < 60) return `${Math.floor(seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86_400)}d ago`;
  }
}
