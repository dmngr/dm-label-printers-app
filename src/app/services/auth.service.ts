import { Injectable, computed, signal } from '@angular/core';

const TOKEN_STORAGE_KEY = 'dmLabelPrinterApp.bearerToken';
const STORES_STORAGE_KEY = 'dmLabelPrinterApp.stores';

/**
 * Holds the per-customer bearer token + the list of authorized stores
 * (= Group values) returned by the pairing/claim exchange. Both persist in
 * localStorage so refreshes keep the session; sign-out wipes them.
 *
 * The token is scoped server-side to the same store list — see
 * docs/app-label-ninja-design.md in the cloud repo. Loss of the token
 * doesn't compromise other stores or the admin fleet view.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenSignal = signal<string | null>(this.readFromStorage(TOKEN_STORAGE_KEY));
  private readonly storesSignal = signal<string[]>(this.readStoresFromStorage());

  readonly token = this.tokenSignal.asReadonly();
  readonly stores = this.storesSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.tokenSignal());

  setSession(token: string, stores: string[]): void {
    const trimmedToken = token.trim();
    const cleanStores = (stores ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
    this.writeToStorage(TOKEN_STORAGE_KEY, trimmedToken);
    this.writeToStorage(STORES_STORAGE_KEY, JSON.stringify(cleanStores));
    this.tokenSignal.set(trimmedToken);
    this.storesSignal.set(cleanStores);
  }

  clear(): void {
    this.removeFromStorage(TOKEN_STORAGE_KEY);
    this.removeFromStorage(STORES_STORAGE_KEY);
    this.tokenSignal.set(null);
    this.storesSignal.set([]);
  }

  private readFromStorage(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private readStoresFromStorage(): string[] {
    const raw = this.readFromStorage(STORES_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
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
