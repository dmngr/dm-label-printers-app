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
        <h2>Phase 0 — feature shell</h2>
        <p>
          Pairing succeeded (placeholder mode). Once the customer-api Lambda
          ships you'll see your stores and devices here, with status, recent
          jobs, catalog and templates.
        </p>
        <p class="muted">
          Logged in with bearer: <code class="mono">{{ maskedToken() }}</code>
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
      h2 { margin: 0 0 8px; font-size: 16px; color: #374151; }
      p { line-height: 1.5; color: #4B5563; margin: 0 0 12px; }
      .muted { color: #6B7280; font-size: 13px; }
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
