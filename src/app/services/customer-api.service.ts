import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { pollCommand } from '../shared/command-status';
import type { LibraryApplicationStatus, LibraryRetryResult } from '../shared/library-application';

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

export interface DeviceDetail extends DeviceListItem {
  storeId: string; groupId: string; storeCode: string; installationId: string | null; hostName: string | null;
  printers: { name: string; isDefault: boolean }[] | null; printersReportedAtUtc: string | null;
}
export interface GroupHierarchy { groupId: string; stores: { storeCode: string; installations: DeviceDetail[] }[]; }
export interface LibraryTemplate { id: string; version: number; name: string; width: number; height: number; layoutJson: string; updatedAtUtc: string; }
export type TemplateHead = Omit<LibraryTemplate, 'layoutJson'> & {archived?: boolean; archiveRevision?: number};
export interface AssignmentEntry { templateId: string; version: number; printerName?: string; }
export interface TemplateAssignment { revision: number; inherit: boolean; entries: AssignmentEntry[]; }

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
  layoutJson: string;
  width: number;
  height: number;
  printerName: string;
  isActive: boolean;
  displayOrder: number;
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

  listGroups(): Observable<{ groups: GroupHierarchy[] }> {
    return this.http.get<{ groups: GroupHierarchy[] }>(`${API_BASE}/api/v1/me/groups`);
  }

  listLibrary(group: string, includeArchived = false): Observable<{ items: TemplateHead[] }> {
    return this.http.get<{ items: TemplateHead[] }>(`${API_BASE}/api/v1/me/groups/${encodeURIComponent(group)}/templates`, { params: { includeArchived } });
  }

  setTemplateArchived(group: string, head: TemplateHead): Observable<TemplateHead> {
    return this.http.post<TemplateHead>(`${API_BASE}/api/v1/me/groups/${encodeURIComponent(group)}/templates/${encodeURIComponent(head.id)}/archive`, { expectedVersion: head.version, expectedArchiveRevision: head.archiveRevision ?? 0, archived: !head.archived });
  }

  getLibraryTemplate(group: string, id: string, version?: number): Observable<LibraryTemplate> {
    return this.http.get<LibraryTemplate>(`${API_BASE}/api/v1/me/groups/${encodeURIComponent(group)}/templates/${encodeURIComponent(id)}`, { params: version === undefined ? {} : { version } });
  }

  saveLibraryTemplate(group: string, id: string, template: { name: string; width: number; height: number; layoutJson: string; expectedVersion: number }): Observable<LibraryTemplate> {
    return this.http.post<LibraryTemplate>(`${API_BASE}/api/v1/me/groups/${encodeURIComponent(group)}/templates/${encodeURIComponent(id)}`, template);
  }

  getAssignment(group: string, kind: 'store' | 'installation', target: string): Observable<TemplateAssignment> {
    return this.http.get<TemplateAssignment>(`${API_BASE}/api/v1/me/groups/${encodeURIComponent(group)}/${kind}s/${encodeURIComponent(target)}/assignment`);
  }

  getLibraryApplications(group: string, kind: 'store' | 'installation', target: string): Observable<{ items: LibraryApplicationStatus[] }> {
    return this.http.get<{ items: LibraryApplicationStatus[] }>(`${API_BASE}/api/v1/me/groups/${encodeURIComponent(group)}/${kind}s/${encodeURIComponent(target)}/applications`);
  }

  retryLibraryApplication(group: string, deviceCode: string, expectedSelectionId: string): Observable<LibraryRetryResult> {
    return this.http.post<LibraryRetryResult>(`${API_BASE}/api/v1/me/groups/${encodeURIComponent(group)}/installations/${encodeURIComponent(deviceCode)}/applications/retry`, { expectedSelectionId });
  }

  saveAssignment(group: string, kind: 'store' | 'installation', target: string, assignment: { expectedRevision: number; inherit: boolean; entries: AssignmentEntry[] }): Observable<TemplateAssignment> {
    return this.http.post<TemplateAssignment>(`${API_BASE}/api/v1/me/groups/${encodeURIComponent(group)}/${kind}s/${encodeURIComponent(target)}/assignment`, assignment);
  }

  printTemplate(deviceCode: string, templateCode: string, fields: Record<string, string | null>, quantity: number): Observable<CommandResponse> {
    return this.http.post<CommandResponse>(`${API_BASE}/api/v1/me/devices/${encodeURIComponent(deviceCode)}/commands`, { commandType: 'print-label', templateCode, fields, quantity });
  }

  listStores(): Observable<StoresResponse> {
    return this.http.get<StoresResponse>(`${API_BASE}/api/v1/me/stores`);
  }

  listDevices(): Observable<DevicesResponse> {
    return this.http.get<DevicesResponse>(`${API_BASE}/api/v1/me/devices`);
  }

  getDevice(deviceCode: string): Observable<DeviceDetail> {
    return this.http.get<DeviceDetail>(
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

  upsertProduct(
    deviceCode: string,
    product: { id?: number | null; code: string; name: string; categoryName?: string; priceCents?: number },
  ): Observable<CommandResponse> {
    return this.http.post<CommandResponse>(
      `${API_BASE}/api/v1/me/devices/${encodeURIComponent(deviceCode)}/commands`,
      { commandType: 'upsert-product', product },
    );
  }

  deleteProduct(deviceCode: string, productId: number): Observable<CommandResponse> {
    return this.http.post<CommandResponse>(
      `${API_BASE}/api/v1/me/devices/${encodeURIComponent(deviceCode)}/commands`,
      { commandType: 'delete-product', productId },
    );
  }

  upsertTemplate(
    deviceCode: string,
    template: { id?: number | null; code: string; name: string; body?: string },
  ): Observable<CommandResponse> {
    return this.http.post<CommandResponse>(
      `${API_BASE}/api/v1/me/devices/${encodeURIComponent(deviceCode)}/commands`,
      { commandType: 'upsert-template', template },
    );
  }

  deleteTemplate(deviceCode: string, templateId: number): Observable<CommandResponse> {
    return this.http.post<CommandResponse>(
      `${API_BASE}/api/v1/me/devices/${encodeURIComponent(deviceCode)}/commands`,
      { commandType: 'delete-template', templateId },
    );
  }

  getCommand(deviceCode: string, id: number): Observable<CommandDetail> {
    return this.http.get<CommandDetail>(
      `${API_BASE}/api/v1/me/devices/${encodeURIComponent(deviceCode)}/commands/${id}`,
    );
  }

  /** Bounded status monitoring; completion is not proof of physical output. */
  streamCommand(
    deviceCode: string,
    id: number,
    intervalMs = 2000,
    maxDurationMs = 60_000,
  ): Observable<CommandDetail> {
    return pollCommand(() => this.getCommand(deviceCode, id), intervalMs, maxDurationMs);
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
