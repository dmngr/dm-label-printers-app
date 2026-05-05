import { Injectable, computed, signal } from '@angular/core';

const TOKEN_STORAGE_KEY = 'dmLabelPrinterApp.bearerToken';

/**
 * Holds the per-customer bearer token obtained from a successful pairing
 * exchange. Persisted in localStorage so refreshes keep the session;
 * sign-out wipes it.
 *
 * The token is scoped server-side to a list of stores (Group values) — see
 * docs/app-label-ninja-design.md in the cloud repo. Loss of the token
 * doesn't compromise other stores or the admin fleet view.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenSignal = signal<string | null>(this.readFromStorage(TOKEN_STORAGE_KEY));

  readonly token = this.tokenSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.tokenSignal());

  setToken(token: string): void {
    const trimmed = token.trim();
    this.writeToStorage(TOKEN_STORAGE_KEY, trimmed);
    this.tokenSignal.set(trimmed);
  }

  clear(): void {
    this.removeFromStorage(TOKEN_STORAGE_KEY);
    this.tokenSignal.set(null);
  }

  private readFromStorage(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private writeToStorage(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* private mode / disabled storage */
    }
  }

  private removeFromStorage(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
