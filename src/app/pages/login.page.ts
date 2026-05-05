import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="card">
        <h1>DM Label Printer — Customer App</h1>
        <p class="muted">
          Open the native DM Label Printer app on your installed PC, generate a
          pairing code, and enter it here to link this browser to your store.
        </p>

        <label>
          <span>Pairing code</span>
          <input
            class="input mono"
            type="text"
            placeholder="ABCD-EF12"
            [(ngModel)]="code"
            name="code"
            required
            autocomplete="off"
            spellcheck="false"
          />
        </label>

        @if (error()) {
          <div class="error">{{ error() }}</div>
        }

        <p class="phase-note">
          Phase 0 — pairing exchange not yet wired. Submitting stores the code
          locally as a placeholder bearer; the full claim flow ships with the
          customer-api Lambda.
        </p>

        <button class="btn btn-primary" (click)="connect()" [disabled]="!canSubmit()">
          Connect
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .page {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: linear-gradient(180deg, #F9FAFB 0%, #E5E7EB 100%);
      }
      .card {
        max-width: 460px;
        width: 100%;
        background: white;
        border-radius: 12px;
        padding: 32px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
      }
      h1 { font-size: 18px; margin: 0 0 8px; }
      .muted { color: #4B5563; font-size: 13px; line-height: 1.5; margin: 0 0 16px; }
      label { display: block; margin: 16px 0; }
      label > span { display: block; font-weight: 500; margin-bottom: 6px; font-size: 13px; }
      .input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #D1D5DB;
        border-radius: 6px;
        font-size: 14px;
        box-sizing: border-box;
      }
      .input.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.5px; }
      .error {
        color: #991B1B;
        background: #FEE2E2;
        padding: 8px 12px;
        border-radius: 6px;
        margin: 12px 0;
        font-size: 13px;
      }
      .phase-note {
        color: #6B7280;
        background: #F9FAFB;
        border-left: 3px solid #D1D5DB;
        padding: 8px 12px;
        margin: 16px 0;
        font-size: 12px;
        line-height: 1.5;
      }
      .btn {
        background: #1F2937;
        color: white;
        border: 0;
        padding: 10px 18px;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
      }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    `,
  ],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  code = '';
  readonly error = signal<string | null>(null);

  canSubmit(): boolean {
    return this.code.trim().length > 0;
  }

  connect(): void {
    this.error.set(null);
    if (!this.canSubmit()) return;

    // Phase 0 placeholder: store the code as the bearer. The real flow
    // exchanges it with /api/v1/pairing/claim on the customer-pairing Lambda.
    this.auth.setToken(this.code.trim());
    this.router.navigate(['/devices']);
  }
}
