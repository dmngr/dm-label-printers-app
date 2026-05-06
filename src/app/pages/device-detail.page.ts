import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import {
  CatalogProductItem,
  CatalogTemplateItem,
  CommandResponse,
  CustomerApiService,
  DeviceListItem,
  PrintJobItem,
} from '../services/customer-api.service';

type Tab = 'products' | 'templates' | 'jobs';

interface ProductDraft {
  id: number | null;
  code: string;
  name: string;
  categoryName: string;
  priceEuros: string;
}

interface TemplateDraft {
  id: number | null;
  code: string;
  name: string;
  body: string;
}

@Component({
  selector: 'app-device-detail',
  standalone: true,
  imports: [RouterLink, FormsModule],
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
          <button class="tab" [class.active]="activeTab() === 'products'" (click)="activeTab.set('products')">
            Products ({{ products().length }})
          </button>
          <button class="tab" [class.active]="activeTab() === 'templates'" (click)="activeTab.set('templates')">
            Templates ({{ templates().length }})
          </button>
          <button class="tab" [class.active]="activeTab() === 'jobs'" (click)="activeTab.set('jobs')">
            Recent jobs ({{ jobs().length }})
          </button>
        </nav>

        @if (toast(); as t) {
          <div class="toast" [class.toast-error]="t.kind === 'error'">{{ t.message }}</div>
        }

        @if (loading()) {
          <div class="card muted">Loading…</div>
        } @else if (activeTab() === 'products') {
          @if (productDraft(); as draft) {
            <div class="card edit-card">
              <h3>{{ draft.id ? 'Edit product' : 'New product' }}</h3>
              <div class="form-grid">
                <label>Code <input class="input mono" [(ngModel)]="draft.code" /></label>
                <label>Name <input class="input" [(ngModel)]="draft.name" /></label>
                <label>Category <input class="input" [(ngModel)]="draft.categoryName" /></label>
                <label>Price (€) <input class="input" type="number" step="0.01" [(ngModel)]="draft.priceEuros" /></label>
              </div>
              <div class="form-actions">
                <button class="btn-secondary" (click)="cancelProductEdit()" [disabled]="busy()">Cancel</button>
                <button class="btn-primary" (click)="saveProduct(draft)" [disabled]="busy() || !draft.code.trim() || !draft.name.trim()">
                  {{ busy() ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </div>
          } @else {
            <button class="btn-add" (click)="startNewProduct()">+ New product</button>
          }

          @if (products().length === 0 && !productDraft()) {
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
                  <button class="btn-print" (click)="print(p)" [disabled]="busy()" title="Print sample">Print</button>
                  <button class="btn-icon" (click)="startEditProduct(p)" [disabled]="busy()" title="Edit">✎</button>
                  <button class="btn-icon btn-danger" (click)="deleteProductConfirm(p)" [disabled]="busy()" title="Delete">×</button>
                </div>
              }
            </div>
          }
        } @else if (activeTab() === 'templates') {
          @if (templateDraft(); as draft) {
            <div class="card edit-card">
              <h3>{{ draft.id ? 'Edit template' : 'New template' }}</h3>
              <div class="form-grid">
                <label>Code <input class="input mono" [(ngModel)]="draft.code" /></label>
                <label>Name <input class="input" [(ngModel)]="draft.name" /></label>
                <label class="span-2">Body
                  <textarea class="input mono" rows="6" [(ngModel)]="draft.body"></textarea>
                </label>
              </div>
              <div class="form-actions">
                <button class="btn-secondary" (click)="cancelTemplateEdit()" [disabled]="busy()">Cancel</button>
                <button class="btn-primary" (click)="saveTemplate(draft)" [disabled]="busy() || !draft.code.trim() || !draft.name.trim()">
                  {{ busy() ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </div>
          } @else {
            <button class="btn-add" (click)="startNewTemplate()">+ New template</button>
          }

          @if (templates().length === 0 && !templateDraft()) {
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
                  <button class="btn-icon" (click)="startEditTemplate(t)" [disabled]="busy()" title="Edit">✎</button>
                  <button class="btn-icon btn-danger" (click)="deleteTemplateConfirm(t)" [disabled]="busy()" title="Delete">×</button>
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
      .back { display: inline-block; color: #4F46E5; text-decoration: none; font-size: 13px; margin-bottom: 16px; }
      .back:hover { text-decoration: underline; }
      header { margin-bottom: 20px; }
      h1 { margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #1F2937; }
      .meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .small { font-size: 12px; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .muted { color: #6B7280; }
      .store-pill {
        background: #EEF2FF; color: #3730A3; padding: 4px 10px; border-radius: 999px; font-size: 12px;
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

      .toast {
        background: #DCFCE7; color: #14532D; padding: 10px 14px;
        border-radius: 8px; margin-bottom: 12px; font-size: 13px;
      }
      .toast-error { background: #FEE2E2; color: #991B1B; }

      .card { background: white; border: 1px solid #E5E7EB; border-radius: 10px; padding: 16px 20px; }
      .card.muted { color: #6B7280; text-align: center; padding: 32px; }
      .list { padding: 4px 0; }
      .row {
        display: flex; align-items: center; gap: 8px;
        padding: 12px 16px; border-bottom: 1px solid #F3F4F6;
      }
      .row:last-child { border-bottom: 0; }
      .row-main { flex: 1; min-width: 0; }
      .row-title { font-weight: 500; display: flex; align-items: center; gap: 8px; }
      .row-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 4px; font-size: 12px; }
      .row-price { font-weight: 600; color: #1F2937; margin-right: 4px; }

      .edit-card { margin-bottom: 12px; }
      .edit-card h3 { margin: 0 0 12px; font-size: 14px; color: #1F2937; }
      .form-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
      }
      .form-grid label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #4B5563; }
      .form-grid label.span-2 { grid-column: 1 / -1; }
      .input {
        padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px;
        font-size: 13px; box-sizing: border-box; width: 100%;
      }
      .input:focus { outline: 2px solid #C7D2FE; outline-offset: -1px; }
      textarea.input { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; resize: vertical; }

      .form-actions {
        display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px;
      }
      .btn-add {
        background: white; color: #4F46E5; border: 1px dashed #C7D2FE;
        padding: 8px 14px; border-radius: 8px; font-size: 13px; cursor: pointer;
        margin-bottom: 12px; font-weight: 500;
      }
      .btn-add:hover { background: #EEF2FF; }
      .btn-primary {
        background: #4F46E5; color: white; border: 0;
        padding: 8px 16px; border-radius: 6px; font-size: 13px;
        font-weight: 500; cursor: pointer;
      }
      .btn-primary:hover:not(:disabled) { background: #4338CA; }
      .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-secondary {
        background: white; color: #4B5563; border: 1px solid #D1D5DB;
        padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer;
      }
      .btn-secondary:hover:not(:disabled) { background: #F9FAFB; }
      .btn-print {
        background: #4F46E5; color: white; border: 0;
        padding: 6px 12px; border-radius: 6px; font-size: 12px;
        font-weight: 500; cursor: pointer;
      }
      .btn-print:hover:not(:disabled) { background: #4338CA; }
      .btn-print:disabled, .btn-icon:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-icon {
        background: transparent; border: 1px solid #E5E7EB; color: #6B7280;
        width: 32px; height: 32px; padding: 0; border-radius: 6px;
        font-size: 14px; cursor: pointer; display: inline-flex;
        align-items: center; justify-content: center;
      }
      .btn-icon:hover:not(:disabled) { background: #F9FAFB; color: #1F2937; }
      .btn-danger:hover:not(:disabled) { background: #FEE2E2; color: #991B1B; border-color: #FECACA; }
      .error { color: #991B1B; background: #FEE2E2; padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; }
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
  readonly busy = signal(false);
  readonly toast = signal<{ kind: 'success' | 'error'; message: string } | null>(null);

  readonly productDraft = signal<ProductDraft | null>(null);
  readonly templateDraft = signal<TemplateDraft | null>(null);

  ngOnInit(): void {
    const code = this.route.snapshot.paramMap.get('deviceCode') ?? '';
    if (!code) {
      this.router.navigate(['/devices']);
      return;
    }
    this.loadAll(code);
  }

  private loadAll(deviceCode: string): void {
    this.loading.set(true);
    this.api
      .getDevice(deviceCode)
      .pipe(
        switchMap((d) =>
          forkJoin({
            device: of(d),
            products: this.api.listProducts(deviceCode).pipe(catchError(() => of({ items: [] }))),
            templates: this.api.listTemplates(deviceCode).pipe(catchError(() => of({ items: [] }))),
            jobs: this.api.listJobs(deviceCode, 50).pipe(catchError(() => of({ items: [], nextCursor: null }))),
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

  // Products
  startNewProduct(): void {
    this.productDraft.set({ id: null, code: '', name: '', categoryName: '', priceEuros: '' });
  }

  startEditProduct(p: CatalogProductItem): void {
    this.productDraft.set({
      id: p.id,
      code: p.code,
      name: p.name,
      categoryName: p.categoryName ?? '',
      priceEuros: p.priceCents != null ? (p.priceCents / 100).toFixed(2) : '',
    });
  }

  cancelProductEdit(): void {
    this.productDraft.set(null);
  }

  saveProduct(draft: ProductDraft): void {
    const d = this.device();
    if (!d) return;
    const priceCents = draft.priceEuros.trim().length === 0 ? undefined : Math.round(parseFloat(draft.priceEuros) * 100);
    if (priceCents !== undefined && (Number.isNaN(priceCents) || priceCents < 0)) {
      this.flashToast('error', 'Invalid price.');
      return;
    }
    this.busy.set(true);
    this.api.upsertProduct(d.deviceCode, {
      id: draft.id ?? undefined,
      code: draft.code.trim(),
      name: draft.name.trim(),
      categoryName: draft.categoryName.trim() || undefined,
      priceCents,
    }).subscribe({
      next: (cmd) => {
        this.productDraft.set(null);
        this.busy.set(false);
        this.flashToast('success', `Queued ${draft.id ? 'update' : 'create'} (cmd #${cmd.id}). Catalog refreshes once the device picks it up.`);
      },
      error: (err: { status?: number }) => {
        this.busy.set(false);
        this.flashToast('error', err?.status === 400 ? 'Rejected by server (validation failed)' : 'Save failed.');
      },
    });
  }

  deleteProductConfirm(p: CatalogProductItem): void {
    if (!confirm(`Delete "${p.name}"? The device will remove it on next sync.`)) return;
    const d = this.device();
    if (!d) return;
    this.busy.set(true);
    this.api.deleteProduct(d.deviceCode, p.id).subscribe({
      next: (cmd) => {
        this.busy.set(false);
        this.flashToast('success', `Queued delete (cmd #${cmd.id}).`);
      },
      error: () => {
        this.busy.set(false);
        this.flashToast('error', 'Delete failed.');
      },
    });
  }

  // Templates
  startNewTemplate(): void {
    this.templateDraft.set({ id: null, code: '', name: '', body: '' });
  }

  startEditTemplate(t: CatalogTemplateItem): void {
    this.templateDraft.set({ id: t.id, code: t.code, name: t.name, body: '' });
  }

  cancelTemplateEdit(): void {
    this.templateDraft.set(null);
  }

  saveTemplate(draft: TemplateDraft): void {
    const d = this.device();
    if (!d) return;
    this.busy.set(true);
    this.api.upsertTemplate(d.deviceCode, {
      id: draft.id ?? undefined,
      code: draft.code.trim(),
      name: draft.name.trim(),
      body: draft.body.trim() || undefined,
    }).subscribe({
      next: (cmd) => {
        this.templateDraft.set(null);
        this.busy.set(false);
        this.flashToast('success', `Queued ${draft.id ? 'update' : 'create'} (cmd #${cmd.id}).`);
      },
      error: (err: { status?: number }) => {
        this.busy.set(false);
        this.flashToast('error', err?.status === 400 ? 'Rejected by server (validation failed)' : 'Save failed.');
      },
    });
  }

  deleteTemplateConfirm(t: CatalogTemplateItem): void {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    const d = this.device();
    if (!d) return;
    this.busy.set(true);
    this.api.deleteTemplate(d.deviceCode, t.id).subscribe({
      next: (cmd) => {
        this.busy.set(false);
        this.flashToast('success', `Queued delete (cmd #${cmd.id}).`);
      },
      error: () => {
        this.busy.set(false);
        this.flashToast('error', 'Delete failed.');
      },
    });
  }

  // Print (existing Phase 2 path)
  print(p: CatalogProductItem): void {
    const d = this.device();
    if (!d || this.busy()) return;
    this.busy.set(true);
    this.api.printLabel(d.deviceCode, p.code, 1).subscribe({
      next: (cmd: CommandResponse) => {
        this.busy.set(false);
        this.flashToast('success', `Print queued (cmd #${cmd.id}).`);
      },
      error: (err: { status?: number }) => {
        this.busy.set(false);
        this.flashToast('error', err?.status === 400 ? 'Print rejected by server' : 'Print failed.');
      },
    });
  }

  // Helpers
  private flashToast(kind: 'success' | 'error', message: string): void {
    this.toast.set({ kind, message });
    setTimeout(() => {
      const current = this.toast();
      if (current?.message === message) this.toast.set(null);
    }, 5000);
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
