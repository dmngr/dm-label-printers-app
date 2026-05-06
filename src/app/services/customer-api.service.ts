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
}
