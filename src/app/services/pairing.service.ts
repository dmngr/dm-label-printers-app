import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';

/**
 * Live customer-pairing claim Function URL (cloud Lambda
 * `label-printer-cloud-customer-pairing-claim`, eu-west-1). The codes endpoint
 * lives at a sibling URL but is device-side only — the web app never calls it.
 *
 * If we ever stand up a fronting CloudFront with path-based routing, replace
 * with the unified base.
 */
const CLAIM_URL =
  'https://7tgo4bjd6fqwbueaxa5hdiuydi0wkuym.lambda-url.eu-west-1.on.aws/api/v1/pairing/claim';

export interface ClaimResponse {
  bearer: string;
  stores: string[];
}

export interface ClaimError {
  code: string;
  message: string;
  status: number;
}

/**
 * Cloud-side error codes the claim Lambda emits (mirror of
 * `customer-pairing/custom_errors.policy.json`). The login UI maps these to
 * friendly Greek messages.
 */
const ERROR_MESSAGES: Record<string, string> = {
  customer_pairing_invalid_json_body: 'Invalid request format. Try again.',
  customer_pairing_invalid_params: 'The pairing code is missing or malformed.',
  customer_pairing_code_not_found: 'Pairing code not found. Generate a new one from your device.',
  customer_pairing_code_expired: 'Pairing code expired. Generate a new one from your device.',
  customer_pairing_code_missing_store: 'The device that issued this code has no store assigned.',
};

@Injectable({ providedIn: 'root' })
export class PairingService {
  private readonly http = inject(HttpClient);

  /**
   * Exchange a pairing code for a customer bearer + the list of authorized
   * stores. If `existingBearer` is supplied, the cloud appends the new store
   * to that token row instead of minting a fresh bearer.
   */
  claim(code: string, existingBearer?: string | null): Observable<ClaimResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (existingBearer) headers['Authorization'] = `Bearer ${existingBearer}`;

    return this.http
      .post<ClaimResponse>(CLAIM_URL, { code: code.trim() }, { headers })
      .pipe(
        catchError((err: HttpErrorResponse) => {
          // The Lambda returns a plaintext body and a custom_error code via
          // the `ACTION:SLACK_HANDLED_ERROR_HE1=` log marker, but the HTTP
          // body itself is the human-readable reason. Status code carries
          // the discriminator we need at the UI level.
          const status = typeof err.status === 'number' ? err.status : 0;
          const guess = this.guessErrorCode(status, err.error);
          const message = ERROR_MESSAGES[guess] ?? this.fallbackMessage(status, err.error);
          return throwError(() => ({ code: guess, message, status } as ClaimError));
        }),
      );
  }

  private guessErrorCode(status: number, body: unknown): string {
    if (status === 400) return 'customer_pairing_invalid_json_body';
    if (status === 404) return 'customer_pairing_code_not_found';
    if (status === 410) return 'customer_pairing_code_expired';
    if (status === 409) return 'customer_pairing_code_missing_store';
    return 'unknown';
  }

  private fallbackMessage(status: number, body: unknown): string {
    const text = typeof body === 'string' ? body : '';
    if (text) return text;
    if (status === 0) return 'Network error. Check your connection and try again.';
    return `Pairing failed (HTTP ${status}).`;
  }
}
