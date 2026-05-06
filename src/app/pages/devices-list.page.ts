import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-devices-list',
  standalone: true,
  imports: [],
  template: `
    <div class="page">
      <header>
        <h1>Your Stores</h1>
        <button class="btn" (click)="signOut()">Sign out</button>
      </header>

      <div class="card">
        <h2>Authorized stores</h2>
        @if (stores().length > 0) {
          <ul class="stores">
            @for (s of stores(); track s) {
              <li><span class="store-pill">{{ s }}</span></li>
            }
          </ul>
        } @else {
          <p class="muted">No stores recorded for this token.</p>
        }
        <p class="muted">
          Devices, status, recent jobs, catalog and templates show up here once
          the customer-api Lambda ships (next Phase 0 step). For now this page
          confirms you successfully paired and stores the bearer locally for
          subsequent calls.
        </p>
        <p class="muted small">
          Bearer (masked): <code class="mono">{{ maskedToken() }}</code>
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      .page { max-width: 920px; margin: 0 auto; padding: 32px 24px; }
      header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
      h1 { margin: 0; font-size: 24px; font-weight: 700; color: #1F2937; }
      .card {
        background: white;
        border: 1px solid #E5E7EB;
        border-radius: 10px;
        padding: 24px;
      }
      h2 { margin: 0 0 12px; font-size: 16px; color: #374151; }
      p { line-height: 1.5; color: #4B5563; margin: 0 0 12px; }
      .muted { color: #6B7280; font-size: 13px; }
      .small { font-size: 12px; }
      .stores { list-style: none; padding: 0; margin: 0 0 16px; display: flex; flex-wrap: wrap; gap: 6px; }
      .store-pill {
        display: inline-block;
        background: #EEF2FF;
        color: #3730A3;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      code.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #F3F4F6; padding: 1px 6px; border-radius: 4px; }
      .btn {
        background: white;
        border: 1px solid #D1D5DB;
        padding: 8px 14px;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
      }
      .btn:hover { background: #F9FAFB; }
    `,
  ],
})
export class DevicesListPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly stores = this.auth.stores;

  maskedToken(): string {
    const t = this.auth.token() ?? '';
    if (t.length <= 8) return '*'.repeat(t.length);
    return t.slice(0, 4) + '...' + t.slice(-4);
  }

  signOut(): void {
    this.auth.clear();
    this.router.navigate(['/login']);
  }
}
