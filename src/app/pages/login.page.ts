import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs';

import { isValidPairingCode, normalizePairingCode } from '../pairing-code';
import { AuthService } from '../services/auth.service';
import { PairingService } from '../services/pairing.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="card">
        <h1>DM Label Printer - Customer App</h1>
        <p class="muted">
          Generate a pairing code in the native app, then scan its QR or enter
          the code here to link this browser to your store.
        </p>

        @if (loadedFromQr()) {
          <div class="scan-notice" role="status">
            <strong>QR code loaded.</strong>
            Review the pairing code, then select Connect to approve this browser.
          </div>
        }

        <label>
          <span>Pairing code</span>
          <input
            class="input mono"
            type="text"
            placeholder="ABCD-EF12"
            [ngModel]="code"
            (ngModelChange)="updateCode($event)"
            (blur)="normalizeCode()"
            name="code"
            required
            maxlength="9"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            aria-describedby="pairing-help"
            [disabled]="busy()"
          />
        </label>

        <p id="pairing-help" class="hint">Format: XXXX-XXXX. Codes expire after 15 minutes.</p>

        @if (error()) {
          <div class="error" role="alert">{{ error() }}</div>
        }

        <button class="btn btn-primary" (click)="connect()" [disabled]="!canSubmit() || busy()">
          {{ busy() ? 'Pairing...' : 'Connect' }}
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
      .scan-notice {
        color: #14532D;
        background: #DCFCE7;
        border: 1px solid #86EFAC;
        border-radius: 8px;
        padding: 10px 12px;
        margin: 16px 0 4px;
        font-size: 13px;
        line-height: 1.45;
      }
      .scan-notice strong { display: block; margin-bottom: 2px; }
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
      .input:disabled { background: #F9FAFB; }
      .hint { color: #6B7280; font-size: 12px; margin: -10px 0 16px; }
      .error {
        color: #991B1B;
        background: #FEE2E2;
        padding: 8px 12px;
        border-radius: 6px;
        margin: 12px 0;
        font-size: 13px;
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
  private readonly pairing = inject(PairingService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  code = '';
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly loadedFromQr = signal(false);

  constructor() {
    this.route.queryParamMap.pipe(take(1)).subscribe((params) => {
      const linkedCode = normalizePairingCode(params.get('code'));
      if (linkedCode) {
        this.code = linkedCode;
        this.loadedFromQr.set(true);
      }
    });
  }

  canSubmit(): boolean {
    return isValidPairingCode(this.code);
  }

  updateCode(value: string): void {
    this.code = value;
    this.loadedFromQr.set(false);
    this.error.set(null);
  }

  normalizeCode(): void {
    const normalized = normalizePairingCode(this.code);
    if (normalized) this.code = normalized;
  }

  connect(): void {
    this.error.set(null);
    if (this.busy()) return;

    const normalized = normalizePairingCode(this.code);
    if (!normalized) {
      this.error.set('Enter a valid pairing code in XXXX-XXXX format.');
      return;
    }
    this.code = normalized;

    this.busy.set(true);
    const existingBearer = this.auth.token();
    this.pairing.claim(normalized, existingBearer).subscribe({
      next: (response) => {
        this.auth.setSession(response.bearer, response.stores);
        this.busy.set(false);
        this.router.navigate(['/devices']);
      },
      error: (err: { message?: string }) => {
        this.error.set(err?.message ?? 'Pairing failed. Try again.');
        this.busy.set(false);
      },
    });
  }
}
