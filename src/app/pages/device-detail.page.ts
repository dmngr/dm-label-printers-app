import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import {
  CatalogProductItem,
  CatalogTemplateItem,
  CustomerApiService,
  DeviceListItem,
  PrintJobItem,
} from '../services/customer-api.service';

type Tab = 'products' | 'templates' | 'jobs';

@Component({
  selector: 'app-device-detail',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <a routerLink="/devices" class="back">‹ Back to stores</a>

      @if (errorMessage()) {
        <div class="error">{{ errorMessage() }}</div>
      }

      @if (device(); as d) {
        <header>
          <h1>{{ d.deviceName || d.deviceCode }}</h1>
          <div class="meta">
            <span class="store-pill">{{ d.storeId }}</span>
            <span class="mono small">v{{ d.appVersion || '?' }}</span>
            @if (d.isOnline) {
              <span class="badge badge-active">online</span>
            } @else if (d.isActive) {
              <span class="badge badge-warn">recent</span>
            } @else {
              <span class="badge badge-mute">offline</span>
            }
            <span class="muted small">last seen {{ relativeTime(d.lastSeenAtUtc) }}</span>
          </div>
        </header>

        <nav class="tabs">
          <button
            class="tab"
            [class.active]="activeTab() === 'products'"
            (click)="activeTab.set('products')"
          >
            Products ({{ products().length }})
          </button>
          <button
            class="tab"
            [class.active]="activeTab() === 'templates'"
            (click)="activeTab.set('templates')"
          >
            Templates ({{ templates().length }})
          </button>
          <button
            class="tab"
            [class.active]="activeTab() === 'jobs'"
            (click)="activeTab.set('jobs')"
          >
            Recent jobs ({{ jobs().length }})
          </button>
        </nav>

        @if (loading()) {
          <div class="card muted">Loading…</div>
        } @else if (activeTab() === 'products') {
          @if (products().length === 0) {
            <div class="card muted">No products synced from this device yet.</div>
          } @else {
            <div class="card list">
              @for (p of products(); track p.id) {
                <div class="row">
                  <div class="row-main">
                    <div class="row-title">{{ p.name }}</div>
                    <div class="row-meta">
                      <span class="mono small">{{ p.code }}</span>
                      @if (p.categoryName) {
                        <span class="muted small">· {{ p.categoryName }}</span>
                      }
                    </div>
                  </div>
                  @if (p.priceCents != null) {
                    <div class="row-price">{{ formatPrice(p.priceCents) }}</div>
                  }
                </div>
              }
            </div>
          }
        } @else if (activeTab() === 'templates') {
          @if (templates().length === 0) {
            <div class="card muted">No templates synced from this device yet.</div>
          } @else {
            <div class="card list">
              @for (t of templates(); track t.id) {
                <div class="row">
                  <div class="row-main">
                    <div class="row-title">{{ t.name }}</div>
                    <div class="row-meta">
                      <span class="mono small">{{ t.code }}</span>
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        } @else if (activeTab() === 'jobs') {
          @if (jobs().length === 0) {
            <div class="card muted">No recent print jobs.</div>
          } @else {
            <div class="card list">
              @for (j of jobs(); track j.id) {
                <div class="row">
                  <div class="row-main">
                    <div class="row-title">
                      @if (j.productCode) {
                        {{ j.productCode }}
                      } @else if (j.templateCode) {
                        Template {{ j.templateCode }}
                      } @else {
                        Job #{{ j.id }}
                      }
                      <span class="badge" [class]="statusBadgeClass(j.status)">{{ j.status }}</span>
                    </div>
                    <div class="row-meta">
                      <span class="muted small">{{ relativeTime(j.createdAtUtc) }}</span>
                      @if (j.labelCount && j.labelCount > 1) {
                        <span class="muted small">· {{ j.labelCount }} labels</span>
                      }
                      @if (j.operator) {
                        <span class="muted small">· {{ j.operator }}</span>
                      }
                      @if (j.errorMessage) {
                        <span class="error-inline small">· {{ j.errorMessage }}</span>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        }
      } @else if (!loading() && !errorMessage()) {
        <div class="card muted">Loading device…</div>
      }
    </div>
  `,
  styles: [
    `
      .page { max-width: 920px; margin: 0 auto; padding: 32px 24px; }
      .back {
        display: inline-block;
        color: #4F46E5;
        text-decoration: none;
        font-size: 13px;
        margin-bottom: 16px;
      }
      .back:hover { text-decoration: underline; }
      header { margin-bottom: 20px; }
      h1 { margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #1F2937; }
      .meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .small { font-size: 12px; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .muted { color: #6B7280; }
      .store-pill {
        background: #EEF2FF; color: #3730A3;
        padding: 4px 10px; border-radius: 999px; font-size: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .badge {
        font-size: 10px; padding: 2px 7px; border-radius: 999px;
        text-transform: uppercase; letter-spacing: 0.3px; font-weight: 600;
      }
      .badge-active { background: #DCFCE7; color: #14532D; }
      .badge-warn { background: #FEF3C7; color: #92400E; }
      .badge-mute { background: #E5E7EB; color: #4B5563; }
      .badge-fail { background: #FEE2E2; color: #991B1B; }
      .badge-pending { background: #DBEAFE; color: #1E3A8A; }

      .tabs { display: flex; gap: 4px; border-bottom: 1px solid #E5E7EB; margin-bottom: 16px; }
      .tab {
        background: transparent; border: 0; border-bottom: 2px solid transparent;
        padding: 10px 14px; cursor: pointer; font-size: 13px; color: #6B7280;
      }
      .tab.active { color: #1F2937; border-bottom-color: #4F46E5; font-weight: 500; }
      .tab:hover:not(.active) { color: #374151; }

      .card {
        background: white; border: 1px solid #E5E7EB; border-radius: 10px;
        padding: 16px 20px;
      }
      .card.muted { color: #6B7280; text-align: center; padding: 32px; }
      .list { padding: 4px 0; }
      .row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 16px; border-bottom: 1px solid #F3F4F6;
      }
      .row:last-child { border-bottom: 0; }
      .row-main { flex: 1; min-width: 0; }
      .row-title { font-weight: 500; display: flex; align-items: center; gap: 8px; }
      .row-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 4px; font-size: 12px; }
      .row-price { font-weight: 600; color: #1F2937; }
      .error {
        color: #991B1B; background: #FEE2E2;
        padding: 10px 14px; border-radius: 8px; margin-bottom: 12px;
      }
      .error-inline { color: #991B1B; }
    `,
  ],
})
export class DeviceDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CustomerApiService);

  readonly device = signal<(DeviceListItem & { storeId: string }) | null>(null);
  readonly products = signal<CatalogProductItem[]>([]);
  readonly templates = signal<CatalogTemplateItem[]>([]);
  readonly jobs = signal<PrintJobItem[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly activeTab = signal<Tab>('products');

  ngOnInit(): void {
    const code = this.route.snapshot.paramMap.get('deviceCode') ?? '';
    if (!code) {
      this.router.navigate(['/devices']);
      return;
    }

    this.api
      .getDevice(code)
      .pipe(
        switchMap((d) =>
          forkJoin({
            device: of(d),
            products: this.api.listProducts(code).pipe(catchError(() => of({ items: [] }))),
            templates: this.api.listTemplates(code).pipe(catchError(() => of({ items: [] }))),
            jobs: this.api
              .listJobs(code, 50)
              .pipe(catchError(() => of({ items: [], nextCursor: null }))),
          }),
        ),
      )
      .subscribe({
        next: ({ device, products, templates, jobs }) => {
          this.device.set(device);
          this.products.set(products.items ?? []);
          this.templates.set(templates.items ?? []);
          this.jobs.set(jobs.items ?? []);
          this.loading.set(false);
        },
        error: (err: { status?: number; message?: string }) => {
          if (err?.status === 401 || err?.status === 403) return;
          this.errorMessage.set(err?.message ?? 'Failed to load device.');
          this.loading.set(false);
        },
      });
  }

  formatPrice(cents: number): string {
    return `€${(cents / 100).toFixed(2)}`;
  }

  statusBadgeClass(status: string): string {
    const s = (status ?? '').toLowerCase();
    if (s === 'completed' || s === 'printed') return 'badge-active';
    if (s === 'failed' || s === 'error') return 'badge-fail';
    if (s === 'pending' || s === 'queued') return 'badge-pending';
    return 'badge-mute';
  }

  relativeTime(iso: string | null | undefined): string {
    if (!iso) return 'never';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso ?? '';
    const seconds = Math.max(0, (Date.now() - t) / 1000);
    if (seconds < 60) return `${Math.floor(seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86_400)}d ago`;
  }
}
