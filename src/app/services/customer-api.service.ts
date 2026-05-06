import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

const API_BASE = 'https://qqk5lvoos7ljgftlleth5ize2i0nwkxe.lambda-url.eu-west-1.on.aws';

export interface StoreSummary {
  storeId: string;
  deviceCount: number;
  onlineCount: number;
}

export interface DeviceListItem {
  deviceCode: string;
  deviceName: string;
  appVersion: string;
  lastSeenAtUtc: string | null;
  isActive: boolean;
  isOnline: boolean;
  pendingCommands: number;
  failedJobs: number;
}

export interface StoreWithDevices {
  storeId: string;
  devices: DeviceListItem[];
}

export interface DevicesResponse {
  stores: StoreWithDevices[];
}

export interface StoresResponse {
  stores: StoreSummary[];
}

export interface CatalogProductItem {
  id: number;
  code: string;
  name: string;
  categoryName?: string;
  priceCents?: number;
  isActive?: boolean;
  updatedAtUtc?: string;
}

export interface CatalogProductsResponse {
  items: CatalogProductItem[];
}

export interface CatalogTemplateItem {
  id: number;
  code: string;
  name: string;
  updatedAtUtc?: string;
}

export interface CatalogTemplatesResponse {
  items: CatalogTemplateItem[];
}

export interface PrintJobItem {
  id: number;
  createdAtUtc: string;
  completedAtUtc: string | null;
  status: string;
  productCode?: string | null;
  templateCode?: string | null;
  operator?: string | null;
  errorMessage?: string | null;
  labelCount?: number;
}

export interface PrintJobsResponse {
  items: PrintJobItem[];
  nextCursor: string | null;
}

/**
 * Calls the customer-api Lambda
 * (`label-printer-cloud-customer-api`, eu-west-1). Bearer is auto-attached by
 * the auth interceptor since it's scoped to this base URL.
 */
@Injectable({ providedIn: 'root' })
export class CustomerApiService {
  private readonly http = inject(HttpClient);

  listStores(): Observable<StoresResponse> {
    return this.http.get<StoresResponse>(`${API_BASE}/api/v1/me/stores`);
  }

  listDevices(): Observable<DevicesResponse> {
    return this.http.get<DevicesResponse>(`${API_BASE}/api/v1/me/devices`);
  }

  getDevice(deviceCode: string): Observable<DeviceListItem & { storeId: string }> {
    return this.http.get<DeviceListItem & { storeId: string }>(
      `${API_BASE}/api/v1/me/devices/${encodeURIComponent(deviceCode)}`,
    );
  }

  listProducts(deviceCode: string): Observable<CatalogProductsResponse> {
    return this.http.get<CatalogProductsResponse>(
      `${API_BASE}/api/v1/me/devices/${encodeURIComponent(deviceCode)}/products`,
    );
  }

  listTemplates(deviceCode: string): Observable<CatalogTemplatesResponse> {
    return this.http.get<CatalogTemplatesResponse>(
      `${API_BASE}/api/v1/me/devices/${encodeURIComponent(deviceCode)}/templates`,
    );
  }

  listJobs(deviceCode: string, limit = 50): Observable<PrintJobsResponse> {
    return this.http.get<PrintJobsResponse>(
      `${API_BASE}/api/v1/me/devices/${encodeURIComponent(deviceCode)}/jobs?limit=${limit}`,
    );
  }

  printLabel(
    deviceCode: string,
    productCode: string,
    quantity = 1,
  ): Observable<CommandResponse> {
    return this.http.post<CommandResponse>(
      `${API_BASE}/api/v1/me/devices/${encodeURIComponent(deviceCode)}/commands`,
      { commandType: 'print-label', productCode, quantity },
    );
  }

  getCommand(deviceCode: string, id: number): Observable<CommandDetail> {
    return this.http.get<CommandDetail>(
      `${API_BASE}/api/v1/me/devices/${encodeURIComponent(deviceCode)}/commands/${id}`,
    );
  }
}

export interface CommandResponse {
  id: number;
  status: string;
  requestedAtUtc: string;
  commandType: string;
  productCode?: string;
}

export interface CommandDetail {
  id: number;
  status: string;
  commandType: string;
  requestedAtUtc: string;
  claimedAtUtc: string | null;
  completedAtUtc: string | null;
  productCode?: string | null;
  errorMessage?: string | null;
}
