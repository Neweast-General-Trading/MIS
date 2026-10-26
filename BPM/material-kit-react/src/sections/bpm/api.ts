import { loadAccessProfile, type PermissionKey, ACCESS_TOKEN_STORAGE_KEY } from './access-control';

import type {
  BpmProcess,
  ActivityItem,
  ActivityTemplate,
  DepartmentFolder,
  ActivityTemplateField,
} from './storage';

const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const runtimeApiBaseUrl =
  typeof window !== 'undefined'
    ? import.meta.env.DEV
      ? ''
      : `${window.location.origin}`
    : 'http://localhost:3000';
const API_BASE_URL = envApiBaseUrl ?? runtimeApiBaseUrl;

/** Same base URL used for all BPM API calls (for display / debugging). */
export function getBpmApiBaseUrl(): string {
  return API_BASE_URL;
}

/**
 * Public files under `/docx/BPM-Files/…` are served by the API.
 * In dev, Vite proxies `/docx` so a relative path works; otherwise prefix with API base.
 */
export function resolveBpmPublicFileUrl(storedPath: string): string {
  const normalized = storedPath.trim();
  if (!normalized) return '';
  const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
  const base = getBpmApiBaseUrl();
  if (base) {
    return `${base.replace(/\/$/, '')}${path}`;
  }
  return path;
}

/** True when `VITE_API_BASE_URL` was not set at build time (UI uses `window.location.hostname:3000`). */
export function bpmApiUsesDefaultHostPort(): boolean {
  return !envApiBaseUrl && !import.meta.env.DEV;
}

export type LoginResponse = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    roleName: string;
    fullAccess: boolean;
    departmentIds: string[];
    permissions: Record<PermissionKey, boolean>;
    canUseAi?: boolean;
  };
};

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? 'Sign-in failed');
  }
  return body as LoginResponse;
}

export async function fetchAuthProfile(): Promise<LoginResponse['user']> {
  return request<LoginResponse['user']>('/auth/me');
}

type DepartmentPayload = {
  code: string;
  name: string;
  companyCode: string;
  hanaBranch: string;
  hanaDeptCode: number;
  hanaDepartmentName: string;
  processFunctionOwners?: string[];
  processCodeLevels?: 3 | 4;
};

type ProcessPayload = {
  processName: string;
  companyCode: string;
  activityTemplateId?: string;
  processOwners?: string[];
  description?: string;
  processDescription?: string;
};

type UpdateProcessPayload = {
  code2: string;
  processName: string;
};

type DefineProcessPayload = {
  activityTemplateId: string;
  projectName?: string;
  description?: string;
  processOwners: string[];
  processDescription?: string;
  processName?: string;
};

/**
 * Read cache for the big list endpoints: identical GETs fired within a few seconds (several
 * components asking for /companies, the explorer tree, …) share ONE network call.
 * Any write (POST/PUT/PATCH/DELETE) clears it, so screens never show stale data after an edit.
 */
const READ_CACHE_TTL_MS = 20_000;
const CACHEABLE_READ_PATHS: RegExp[] = [
  /^\/companies$/,
  /^\/departments(\?.*)?$/,
  /^\/departments\/dashboard-summary(\?.*)?$/,
  /^\/activity-templates$/,
  /^\/applications\/options$/,
];
const readCache = new Map<string, { at: number; promise: Promise<unknown> }>();

function readCacheKey(path: string): string {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : '';
  return `${token ?? ''}|${path}`;
}

/** Drops cached reads (called automatically after writes; also handy after login/logout). */
export function clearApiReadCache(): void {
  readCache.clear();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();

  if (method !== 'GET') {
    clearApiReadCache();
    try {
      return await requestNetwork<T>(path, init);
    } finally {
      clearApiReadCache();
    }
  }

  if (!init?.signal && CACHEABLE_READ_PATHS.some((re) => re.test(path))) {
    const key = readCacheKey(path);
    const hit = readCache.get(key);
    if (hit && Date.now() - hit.at < READ_CACHE_TTL_MS) {
      return structuredClone(await hit.promise) as T;
    }
    const promise = requestNetwork<T>(path, init);
    readCache.set(key, { at: Date.now(), promise });
    promise.catch(() => {
      if (readCache.get(key)?.promise === promise) readCache.delete(key);
    });
    return structuredClone(await promise) as T;
  }

  return requestNetwork<T>(path, init);
}

async function requestNetwork<T>(path: string, init?: RequestInit): Promise<T> {
  const profile = loadAccessProfile();
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  } else if (profile.email?.trim()) {
    headers['x-user-email'] = profile.email.trim().toLowerCase();
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers,
      ...init,
    });
  } catch (err) {
    const hint = bpmApiUsesDefaultHostPort()
      ? ' Cannot reach the API. In dev, the UI proxies API calls through Vite; ensure bpm-api is running on port 3000 (pm2 restart bpm-api).'
      : ' Cannot reach the API at the configured VITE_API_BASE_URL.';
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch${hint} (${detail})`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const rawBody = await response.text();
  const parseJson = () => {
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      return null;
    }
  };

  if (!response.ok) {
    const body = parseJson() as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    if (message) {
      throw new Error(message);
    }
    if (rawBody.trimStart().startsWith('<')) {
      throw new Error(
        'API returned HTML instead of JSON. Restart bpm-api (port 3010) and ensure /companies is proxied to it.'
      );
    }
    throw new Error(message ?? `Unexpected API error (${response.status})`);
  }

  if (!contentType.includes('application/json')) {
    if (rawBody.trimStart().startsWith('<')) {
      throw new Error(
        'API returned HTML instead of JSON. Restart bpm-api (port 3010) and ensure API routes (e.g. /companies) reach it.'
      );
    }
    throw new Error('API returned a non-JSON response.');
  }

  const parsed = parseJson();
  if (parsed === null) {
    throw new Error('API returned invalid JSON.');
  }
  return parsed as T;
}

export type PurgeBpmOperationalDataResult = {
  purged: boolean;
  reseededNewEast: boolean;
  keptActivityTemplates?: boolean;
};

export type BackupHistoryRow = {
  timestamp?: string;
  status?: string;
  message?: string;
  backupFile?: string | null;
  backupSizeBytes?: number | null;
};

export type UserLogRow = {
  timestampUtc?: string;
  timestampUae?: string;
  outcome?: string;
  error?: string | null;
  statusCode?: number;
  durationMs?: number;
  method?: string;
  path?: string;
  actor?: string;
  ip?: string;
  userAgent?: string;
};

export type UserLogGroup = {
  actor: string;
  displayName?: string | null;
  count: number;
  lastTimestampUtc?: string;
};

export type UserLogActorCatalogEntry = {
  actor: string;
  displayName?: string | null;
  count: number;
  lastTimestampUtc?: string | null;
};

export type UserLogResponse = {
  rows: UserLogRow[];
  total: number;
  page: number;
  pageSize: number;
  groups: UserLogGroup[];
  actorCatalog?: UserLogActorCatalogEntry[];
  summary: { total: number; pass: number; fail: number };
  meta?: {
    totalLinesInFile: number;
    linesScanned: number;
    truncated: boolean;
  };
};

export type UserLogAnalytics = {
  meta?: UserLogResponse['meta'];
  overview: {
    totalRequests: number;
    passCount: number;
    failCount: number;
    failRatePercent: number;
    uniqueActors: number;
    registeredUsers: number;
    activeLast7Days: number;
    activeLast30Days: number;
    inactiveRegisteredUsers: number;
    neverLoggedCount: number;
    avgDurationMs: number;
  };
  activityByDay: Array<{ date: string; pass: number; fail: number; total: number }>;
  topUsers: Array<{
    actor: string;
    displayName: string | null;
    count: number;
    failCount: number;
    lastSeenUtc: string;
  }>;
  inactiveUsers: Array<{
    actor: string;
    displayName: string | null;
    lastSeenUtc: string | null;
    daysSinceActivity: number | null;
  }>;
  topPaths: Array<{ path: string; label: string; count: number }>;
  topTopics: Array<{ topic: string; count: number }>;
  httpMethods: Array<{ method: string; count: number }>;
};

/** Requires JWT for a **full-access** user (e.g. Super Admin). */
export type ActivityTemplateSummary = { id: string; name: string };

export type ImportBpmIndexXlsxResult = {
  created: number;
  skipped: number;
  items: Array<{ excelProcessId: string; processCode: string; processName: string }>;
  errors: string[];
};

export type ImportWorkbookPerSheetRow = {
  sheet: string;
  ok: boolean;
  processCode?: string;
  processId?: string;
  processName?: string;
  activitiesCreated: number;
  message?: string;
  error?: string;
};

export type ImportWorkbookPerSheetResult = {
  sheets: ImportWorkbookPerSheetRow[];
  totals: {
    sheetsSkippedIndex: number;
    sheetsAttempted: number;
    processesCreated: number;
    activitiesCreated: number;
  };
};

export type ImportBpmGridSheetPayload = {
  sheetName: string;
  parentProcessId?: string;
  processCode?: string;
  processName?: string;
  processDescription?: string;
  rows: Record<string, string>[];
};

export type ImportBpmGridPayload = {
  companyCode: string;
  activityTemplateId: string;
  processOwners: string[];
  sheets: ImportBpmGridSheetPayload[];
};

export async function importBpmGrid(departmentId: string, payload: ImportBpmGridPayload) {
  return request<ImportWorkbookPerSheetResult>(`/departments/${departmentId}/import-bpm-grid`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchActivityTemplatesForImport(): Promise<ActivityTemplateSummary[]> {
  return request<ActivityTemplateSummary[]>('/departments/activity-templates-for-import');
}

/** Downloads the server-built .xlsx (Index + Process_Example + _README) for the chosen template. */
export async function downloadBpmImportTemplateXlsx(
  templateId: string,
  suggestedBaseName?: string
): Promise<void> {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;
  const headers: Record<string, string> = {};
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  const url = `${API_BASE_URL}/departments/bpm-import-template.xlsx?templateId=${encodeURIComponent(templateId)}`;
  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const msg = body?.message;
    const text = Array.isArray(msg) ? msg.join(', ') : msg;
    throw new Error(text ?? 'Template download failed');
  }
  const blob = await response.blob();
  const base = (suggestedBaseName ?? 'bpm-import-template')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .slice(0, 80);
  const filename = `${base || 'bpm-import-template'}.xlsx`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/** Multipart: form fields `file`, `companyCode`, `activityTemplateId`, optional `processOwnersJson` (JSON array or comma-separated emails/names). */
export async function importDepartmentIndexXlsx(
  departmentId: string,
  formData: FormData
): Promise<ImportBpmIndexXlsxResult> {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;
  const headers: Record<string, string> = {};
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  const response = await fetch(
    `${API_BASE_URL}/departments/${departmentId}/import-bpm-index-xlsx`,
    {
      method: 'POST',
      headers,
      body: formData,
    }
  );
  const body = (await response.json().catch(() => null)) as
    | ImportBpmIndexXlsxResult
    | { message?: string | string[] }
    | null;
  if (!response.ok) {
    const msg = body && 'message' in body ? body.message : undefined;
    const text = Array.isArray(msg) ? msg.join(', ') : msg;
    throw new Error(text ?? 'Import failed');
  }
  return body as ImportBpmIndexXlsxResult;
}

/** Each worksheet (except `Index`) → one process + activity rows under a header matching template columns. */
export async function importDepartmentWorkbookPerSheetXlsx(
  departmentId: string,
  formData: FormData
): Promise<ImportWorkbookPerSheetResult> {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;
  const headers: Record<string, string> = {};
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  const response = await fetch(
    `${API_BASE_URL}/departments/${departmentId}/import-bpm-workbook-per-sheet-xlsx`,
    {
      method: 'POST',
      headers,
      body: formData,
    }
  );
  const body = (await response.json().catch(() => null)) as
    | ImportWorkbookPerSheetResult
    | { message?: string | string[] }
    | null;
  if (!response.ok) {
    const msg = body && 'message' in body ? body.message : undefined;
    const text = Array.isArray(msg) ? msg.join(', ') : msg;
    throw new Error(text ?? 'Import failed');
  }
  return body as ImportWorkbookPerSheetResult;
}

export async function purgeBpmOperationalData(options: {
  confirm: 'DELETE_ALL';
  reseedNewEast?: boolean;
  /** When true, sub-process / activity templates are not deleted. */
  keepActivityTemplates?: boolean;
}): Promise<PurgeBpmOperationalDataResult> {
  return request<PurgeBpmOperationalDataResult>('/maintenance/purge-bpm-operational-data', {
    method: 'POST',
    body: JSON.stringify({
      confirm: options.confirm,
      ...(options.reseedNewEast !== undefined ? { reseedNewEast: options.reseedNewEast } : {}),
      ...(options.keepActivityTemplates !== undefined
        ? { keepActivityTemplates: options.keepActivityTemplates }
        : {}),
    }),
  });
}

export async function fetchBackupHistory(limit = 200) {
  return request<{ rows: BackupHistoryRow[] }>(
    `/maintenance/backup-history?limit=${Math.max(1, limit)}`
  );
}

export type SystemHealthResponse = {
  timestamp: string;
  api: {
    uptimeSeconds: number;
    nodeVersion: string;
    platform: string;
    pid: number;
    memory: {
      heapUsed: number;
      heapTotal: number;
      heapFree: number;
      rss: number;
      external: number;
    };
  };
  database: {
    ok: boolean;
    latencyMs: number | null;
    error?: string;
  };
  scores: {
    overall: number;
    database: number;
    memory: number;
    availability: number;
  };
  checks: {
    processUp: boolean;
    databaseReachable: boolean;
    memoryPressureOk: boolean;
  };
  dataCounts: {
    departments: number;
    processes: number;
    activities: number;
    accessUsers: number;
    roles: number;
  };
};

export async function fetchSystemHealth() {
  let lastErr: unknown;
  const paths = ['/system-health', '/maintenance/system-health'] as const;
  for (const path of paths) {
    try {
      return await request<SystemHealthResponse>(path);
    } catch (e) {
      lastErr = e;
    }
  }
  const base =
    lastErr instanceof Error ? lastErr.message : String(lastErr ?? 'System health unavailable');
  throw new Error(`${base} (tried ${paths.join(', ')})`);
}

export async function fetchUserLog(options?: {
  page?: number;
  pageSize?: number;
  status?: string;
  user?: string;
  q?: string;
}) {
  const params = new URLSearchParams();
  params.set('page', String(Math.max(1, options?.page ?? 1)));
  params.set('pageSize', String(Math.min(100, Math.max(1, options?.pageSize ?? 20))));
  if (options?.status?.trim()) params.set('status', options.status.trim());
  if (options?.user?.trim()) params.set('user', options.user.trim());
  if (options?.q?.trim()) params.set('q', options.q.trim());
  return request<UserLogResponse>(`/maintenance/user-log?${params.toString()}`);
}

export function fetchUserLogAnalytics() {
  return request<UserLogAnalytics>('/maintenance/user-log/analytics');
}

export type MasterDataLegalEntitySide = {
  name: string;
  database?: string;
  businessUnit?: string;
  employeeCount?: number;
};

export type MasterDataDepartmentRow = {
  code: string;
  name: string;
};

export type MasterDataCompanyComparison = {
  bpmCode: string;
  legalEntity: {
    bpm: MasterDataLegalEntitySide | null;
    sql: MasterDataLegalEntitySide | null;
  };
  departments: {
    bpm: MasterDataDepartmentRow[];
    sql: MasterDataDepartmentRow[];
  };
  designations: {
    bpm: string[];
    sql: string[];
  };
};

export type MasterDataComparisonResult = {
  generatedAt: string;
  cachedAt: string | null;
  fromCache: boolean;
  hasCache: boolean;
  sqlConfigured: boolean;
  sqlDatabases: string[];
  companies: MasterDataCompanyComparison[];
  errors: Array<{ bpmCode: string; source: 'bpm' | 'sql'; message: string }>;
};

export function fetchMasterDataComparison() {
  return request<MasterDataComparisonResult>('/maintenance/master-data-comparison');
}

export function syncMasterDataComparison() {
  return request<MasterDataComparisonResult>('/maintenance/master-data-comparison/sync', {
    method: 'POST',
  });
}

export type BpmCompany = {
  /** BPM abbreviation (FZCO, NESA, …) — shown in the UI. */
  code: string;
  name: string;
  sortOrder: number;
  bpmCode?: string;
  hanaBranch?: string;
  /** Oracle Fusion legal employer name. */
  fullName?: string;
  oracleLegalEntityId?: string;
  oracleLegalEntityName?: string;
  oracleBusinessUnitId?: string;
  source?: 'oracle' | 'hana' | 'local';
};

export function companyBpmCode(company: Pick<BpmCompany, 'code' | 'bpmCode'>): string {
  return (company.bpmCode ?? company.code).trim();
}

export function fetchCompanies() {
  return request<BpmCompany[]>('/companies');
}

export function fetchHanaDepartments(params: { hanaBranch?: string; bpmCode?: string }) {
  const search = new URLSearchParams();
  if (params.hanaBranch?.trim()) search.set('hanaBranch', params.hanaBranch.trim());
  if (params.bpmCode?.trim()) search.set('bpmCode', params.bpmCode.trim());
  return request<Array<{ code: number; name: string; hanaBranch: string }>>(
    `/companies/hana/departments?${search.toString()}`
  );
}

export type PolicyCreatorCatalogItem = {
  id: string;
  name: string;
  version: number | null;
  status: string;
  companyCode: string;
  companyName: string;
  departmentCode: number;
  departmentName: string;
  visibilityScope: 'general' | 'department';
  policyCreatorUrl: string;
};

export function fetchPolicyCreatorPolicies(params: {
  companyCode: string;
  departmentCode: number;
  departmentName?: string;
}) {
  const search = new URLSearchParams();
  search.set('companyCode', params.companyCode.trim());
  search.set('departmentCode', String(params.departmentCode));
  if (params.departmentName?.trim()) {
    search.set('departmentName', params.departmentName.trim());
  }
  return request<PolicyCreatorCatalogItem[]>(`/companies/catalog/policies?${search.toString()}`);
}

export type PolicyCreatorPolicyDocument = PolicyCreatorCatalogItem & {
  businessRole: string;
  sections: Array<{ id: string; title: string; content: string }>;
};

export function fetchPolicyCreatorPolicy(policyId: string) {
  return request<PolicyCreatorPolicyDocument>(
    `/companies/catalog/policies/${encodeURIComponent(policyId)}`
  );
}

export type HanaDepartment = {
  code: number;
  name: string;
  hanaBranch: string;
};

export type HanaDesignation = {
  name: string;
  bpmCode?: string | null;
  hanaBranch?: string | null;
  source?: 'oracle';
};

export type OracleJobRole = {
  name: string;
  bpmCode?: string | null;
  hanaBranch?: string | null;
  source?: 'oracle';
};

export function fetchHanaDesignations(params: { hanaBranch?: string; bpmCode?: string }) {
  const search = new URLSearchParams();
  if (params.hanaBranch?.trim()) search.set('hanaBranch', params.hanaBranch.trim());
  if (params.bpmCode?.trim()) search.set('bpmCode', params.bpmCode.trim());
  return request<HanaDesignation[]>(`/companies/hana/designations?${search.toString()}`);
}

export function fetchOracleJobRoles(params: { hanaBranch?: string; bpmCode?: string }) {
  const search = new URLSearchParams();
  if (params.hanaBranch?.trim()) search.set('hanaBranch', params.hanaBranch.trim());
  if (params.bpmCode?.trim()) search.set('bpmCode', params.bpmCode.trim());
  return request<OracleJobRole[]>(`/companies/oracle/job-roles?${search.toString()}`);
}

export function fetchCatalogProcesses(hanaBranch: string, departmentName: string) {
  const params = new URLSearchParams({ hanaBranch, departmentName });
  return request<{
    processFunction: {
      id: string;
      code: string;
      name: string;
      companyCode: string;
      orgDepartmentName: string | null;
    } | null;
    processes: Array<{ id: string; code: string; name: string }>;
  }>(`/companies/catalog/processes?${params}`);
}

export function fetchCatalogSubProcesses(processId: string) {
  return request<
    Array<{ id: string; code: string; name: string; parentActivityId: string | null }>
  >(`/companies/catalog/processes/${processId}/sub-processes`);
}

export function createCompany(payload: {
  code: string;
  name?: string;
  oracleLegalEntityId?: string;
}) {
  return request<BpmCompany>('/companies', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type OracleLegalEntity = {
  legalEntityId: string;
  legalEntityName: string;
  organizationCode?: string;
  businessUnitId?: string;
};

export function fetchOracleLegalEntities() {
  return request<OracleLegalEntity[]>('/companies/oracle/legal-entities');
}

export function fetchHanaBranches() {
  return request<Array<{ branch: string; name: string }>>('/companies/hana/branches');
}

export function updateCompanySettings(
  code: string,
  payload: {
    name?: string;
    oracleLegalEntityId?: string | null;
    hanaBranchCode?: string | null;
  }
) {
  return request<BpmCompany>(`/companies/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export type OrgDepartment = {
  id: string;
  name: string;
  sortOrder: number;
};

export function fetchOrgDepartments() {
  return request<OrgDepartment[]>('/departments/org-departments');
}

export function fetchDepartments() {
  return request<DepartmentFolder[]>('/departments');
}

export type CompanyDashboardSummary = {
  companyCode: string;
  processFunctions: number;
  processes: number;
  subProcesses: number;
  impactedJobRoles: number;
  policies: number;
  tatDaysAvg: number | null;
  tatDaysSampleSize: number;
  processFunctionRows: Array<{
    id: string;
    code: string;
    name: string;
    processCount: number;
    subProcessCount: number;
    impactedJobRoles: number;
    policies: number;
    tatDaysAvg: number | null;
    tatDaysSampleSize: number;
  }>;
  /** Distinct sub-processes that have an approval flow / recorded exception handling. */
  approvalSubProcesses?: number;
  exceptionSubProcesses?: number;
  jobRoles: Array<{
    name: string;
    taskCount: number;
    /** Sub-processes where the role is an approver (approval flow). */
    approvalCount: number;
    /** Sub-processes the role takes part in that have exception handling recorded. */
    exceptionCount: number;
    departmentIds: string[];
    /** Where the role works: one entry per process function, busiest first. */
    departments: Array<{
      departmentId: string;
      taskCount: number;
      processCount: number;
      exceptionCount: number;
      tatDaysAvg: number | null;
      /** Sub-processes where the role is Responsible / Accountable / Consulted / Informed / Verifier / Approver (approval flow). */
      raci: { R: number; A: number; C: number; I: number; V: number; P: number };
      processes: Array<{
        id: string;
        code: string;
        name: string;
        taskCount: number;
        approvalCount: number;
        exceptionCount: number;
      }>;
    }>;
    tatDaysAvg: number | null;
    employees: number | null;
  }>;
  processRows: Array<{
    id: string;
    code: string;
    name: string;
    departmentId: string;
    subProcessCount: number;
    roleCount: number;
    tatDaysAvg: number | null;
    tatDaysSampleSize: number;
  }>;
  /** Each policy with the process functions and processes it is linked to. */
  policyRows: Array<{
    name: string;
    /** Policy Creator id; null when the policy is only typed as text on a sub-process. */
    policyId: string | null;
    processCount: number;
    subProcessCount: number;
    departments: Array<{
      departmentId: string;
      subProcessCount: number;
      processes: Array<{ id: string; code: string; name: string }>;
    }>;
  }>;
  reports: Array<{
    activityId: string;
    activityCode: string;
    activityName: string;
    processId: string;
    processCode: string;
    processName: string;
    departmentId: string;
    departmentCode: string;
    departmentName: string;
    reportText: string;
  }>;
  reportsTotal: number;
};

/** Opens a Policy Creator policy as a PDF in a new browser tab. */
export async function openPolicyPdfInNewTab(policyId: string): Promise<void> {
  // Open the tab straight away (inside the click) so popup blockers allow it.
  const tab = window.open('', '_blank');
  if (tab) {
    tab.document.write(
      '<title>Policy</title><p style="font:14px sans-serif;padding:24px;color:#637381">Preparing the PDF…</p>'
    );
  }
  try {
    const token = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    const headers: Record<string, string> = {};
    if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;
    const response = await fetch(
      `${API_BASE_URL}/companies/catalog/policies/${encodeURIComponent(policyId)}/pdf`,
      { headers }
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      const msg = body?.message;
      throw new Error(
        (Array.isArray(msg) ? msg.join(', ') : msg) ?? 'Could not open the policy PDF.'
      );
    }
    const blob = new Blob([await response.blob()], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    if (tab && !tab.closed) tab.location.href = url;
    else window.open(url, '_blank');
    window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

/** Opens a PDF of every sub-process in a process (generated on the server from the stored data). */
export async function openProcessPdfInNewTab(departmentId: string, processId: string): Promise<void> {
  await openPrintPdfInNewTab(
    `/activity-print/process/${encodeURIComponent(departmentId)}/${encodeURIComponent(processId)}`
  );
}

/** Opens a PDF of a whole process function (all its processes and sub-processes). */
export async function openProcessFunctionPdfInNewTab(departmentId: string): Promise<void> {
  await openPrintPdfInNewTab(`/activity-print/department/${encodeURIComponent(departmentId)}`);
}

async function openPrintPdfInNewTab(path: string): Promise<void> {
  const tab = window.open('', '_blank');
  if (tab) {
    tab.document.write(
      '<title>Process</title><p style="font:14px sans-serif;padding:24px;color:#637381">Preparing the PDF…</p>'
    );
  }
  try {
    const token = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    const headers: Record<string, string> = {};
    if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;
    const response = await fetch(`${API_BASE_URL}${path}`, { headers });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      const msg = body?.message;
      throw new Error((Array.isArray(msg) ? msg.join(', ') : msg) ?? 'Could not build the PDF.');
    }
    const blob = new Blob([await response.blob()], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    if (tab && !tab.closed) tab.location.href = url;
    else window.open(url, '_blank');
    window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export type ActivityPrintPayload = {
  title: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: string }>;
  bodyHtml: string;
  css: string;
  htmlAttrs?: Record<string, string>;
  fontFamily?: string;
  watermark?: string;
  filename?: string;
};

/** Renders the given sub-process markup to a PDF on the server and opens it in a new tab. */
export async function openActivityPdfInNewTab(payload: ActivityPrintPayload): Promise<void> {
  const tab = window.open('', '_blank');
  if (tab) {
    tab.document.write(
      '<title>Sub-process</title><p style="font:14px sans-serif;padding:24px;color:#637381">Preparing the PDF…</p>'
    );
  }
  try {
    const token = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;
    const response = await fetch(`${API_BASE_URL}/activity-print/pdf`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      const msg = body?.message;
      throw new Error((Array.isArray(msg) ? msg.join(', ') : msg) ?? 'Could not build the PDF.');
    }
    const blob = new Blob([await response.blob()], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    if (tab && !tab.closed) tab.location.href = url;
    else window.open(url, '_blank');
    window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export function fetchCompanyDashboardSummary(companyCode: string) {
  const q = new URLSearchParams({ companyCode: companyCode.trim().toUpperCase() });
  return request<CompanyDashboardSummary>(`/departments/dashboard-summary?${q.toString()}`);
}

/** Slim department tree for sidebar explorer (faster load). */
export function fetchDepartmentsExplorerTree(companyCode?: string | null) {
  const q = new URLSearchParams({ view: 'explorer' });
  const cc = companyCode?.trim();
  if (cc) q.set('companyCode', cc);
  return request<DepartmentFolder[]>(`/departments?${q.toString()}`);
}

export function createDepartment(payload: DepartmentPayload) {
  return request<DepartmentFolder>('/departments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateDepartment(departmentId: string, payload: DepartmentPayload) {
  return request<DepartmentFolder>(`/departments/${departmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteDepartment(departmentId: string) {
  return request<{ deleted: true }>(`/departments/${departmentId}`, {
    method: 'DELETE',
  });
}

export function addProcess(departmentId: string, payload: ProcessPayload) {
  return request<BpmProcess>(`/departments/${departmentId}/processes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchDepartment(departmentId: string) {
  return request<DepartmentFolder>(`/departments/${departmentId}`);
}

export function updateProcess(
  departmentId: string,
  processId: string,
  payload: UpdateProcessPayload
) {
  return request<BpmProcess>(`/departments/${departmentId}/processes/${processId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteProcess(departmentId: string, processId: string) {
  return request<{ deleted: true }>(`/departments/${departmentId}/processes/${processId}`, {
    method: 'DELETE',
  });
}

export function fetchProcess(departmentId: string, processId: string) {
  return request<BpmProcess>(`/departments/${departmentId}/processes/${processId}`);
}

type CreateActivityPayload = {
  activityName: string;
  /** When set, creates a nested sub-process with code {parentCode}-NNN. */
  parentActivityId?: string;
  details?: Record<string, string | string[]>;
  fieldDiscussion?: Record<string, boolean>;
  activityDescription?: string;
  owners?: string[];
  status?: string;
  discussionEnabled?: boolean;
};

type UpdateActivityPayload = {
  activityName?: string;
  details?: Record<string, string | string[]>;
  fieldDiscussion?: Record<string, boolean>;
  activityDescription?: string;
  owners?: string[];
  status?: string;
  discussionEnabled?: boolean;
};

type AddCommentPayload = {
  message: string;
};

export type UploadedAttachmentItem = {
  id: string;
  subProcessCode: string;
  folderName: string;
  originalName: string;
  storedFileName: string;
  storedPath: string;
  downloadUrl?: string | null;
  uploadedBy: string;
  createdAt: string;
  processCode: string;
  processName: string;
  departmentCode: string;
};

export type ApplicationRecord = {
  id: string;
  name: string;
  vendor: string | null;
  category: string;
  hosting: string;
  status: string;
  description: string | null;
  businessOwner: string | null;
  itOwner: string | null;
  url: string | null;
  /** BPM company codes that use the application. */
  companyCodes: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationPayload = {
  name: string;
  vendor?: string;
  category: string;
  hosting: string;
  status: string;
  description?: string;
  businessOwner?: string;
  itOwner?: string;
  url?: string;
  companyCodes: string[];
};

export function fetchApplications() {
  return request<ApplicationRecord[]>('/applications');
}

/** Application names selectable in sub-process forms (available to any signed-in user). */
export function fetchApplicationOptions() {
  return request<string[]>('/applications/options');
}

export function createApplication(payload: ApplicationPayload) {
  return request<ApplicationRecord>('/applications', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateApplication(id: string, payload: ApplicationPayload) {
  return request<ApplicationRecord>(`/applications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteApplication(id: string) {
  return request<{ deleted: boolean }>(`/applications/${id}`, { method: 'DELETE' });
}

type UpsertTemplatePayload = {
  name: string;
  description?: string;
  fields: ActivityTemplateField[];
};

export type AccessRole = {
  id: string;
  name: string;
  fullAccess: boolean;
  /** When false, users cannot be assigned this role and existing sessions are rejected at sign-in. */
  enabled?: boolean;
  permissions: string[];
  /** Empty = all processes in the user’s assigned process functions; otherwise only these process IDs. */
  allowedProcessIds?: string[];
};

type UpdateAccessRolePayload = {
  name?: string;
  enabled?: boolean;
  permissionKeys?: PermissionKey[];
  allowedProcessIds?: string[];
};

type CreateAccessRolePayload = {
  name: string;
  fullAccess?: boolean;
  enabled?: boolean;
  permissionKeys: PermissionKey[];
  allowedProcessIds?: string[];
};

export type AccessUser = {
  id: string;
  email: string;
  displayName: string;
  roleId: string;
  roleName: string;
  /** Stored on the user row only (what you edit in Users dialog). */
  fullAccess: boolean;
  /** True when the assigned role grants full module access (combine with `fullAccess` for effective scope). */
  roleFullAccess?: boolean;
  departmentIds: string[];
  enabled?: boolean;
};

type UpsertAccessUserPayload = {
  email: string;
  displayName: string;
  roleId: string;
  fullAccess?: boolean;
  departmentIds?: string[];
  enabled?: boolean;
  password?: string;
};

export function createActivity(
  departmentId: string,
  processId: string,
  payload: CreateActivityPayload
) {
  return request<ActivityItem>(`/departments/${departmentId}/processes/${processId}/activities`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateActivity(
  departmentId: string,
  processId: string,
  activityId: string,
  payload: UpdateActivityPayload
) {
  return request<BpmProcess>(
    `/departments/${departmentId}/processes/${processId}/activities/${activityId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export type AddActivityRelationPayload = {
  targetDepartmentId: string;
  targetProcessId: string;
  targetActivityId: string;
};

export function addActivityRelation(
  departmentId: string,
  processId: string,
  activityId: string,
  payload: AddActivityRelationPayload
) {
  return request<BpmProcess>(
    `/departments/${departmentId}/processes/${processId}/activities/${activityId}/relations`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export function removeActivityRelation(
  departmentId: string,
  processId: string,
  activityId: string,
  targetActivityId: string
) {
  return request<BpmProcess>(
    `/departments/${departmentId}/processes/${processId}/activities/${activityId}/relations/${targetActivityId}`,
    {
      method: 'DELETE',
    }
  );
}

export type AddActivityPolicyLinkPayload = {
  policyCreatorPolicyId: string;
  policyName: string;
  policyVersion?: number;
  companyCode?: string;
  companyName?: string;
  departmentName?: string;
  processCode?: string;
  processName?: string;
  activityCode?: string;
  policyCreatorUrl?: string;
};

export function addActivityPolicyLink(
  departmentId: string,
  processId: string,
  activityId: string,
  payload: AddActivityPolicyLinkPayload
) {
  return request<BpmProcess>(
    `/departments/${departmentId}/processes/${processId}/activities/${activityId}/policy-links`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export function removeActivityPolicyLink(
  departmentId: string,
  processId: string,
  activityId: string,
  policyLinkId: string
) {
  return request<BpmProcess>(
    `/departments/${departmentId}/processes/${processId}/activities/${activityId}/policy-links/${policyLinkId}`,
    {
      method: 'DELETE',
    }
  );
}

export function deleteActivity(departmentId: string, processId: string, activityId: string) {
  return request<{ deleted: true }>(
    `/departments/${departmentId}/processes/${processId}/activities/${activityId}`,
    {
      method: 'DELETE',
    }
  );
}

export type VendorVersionInlinePayload = {
  vendorName?: string;
  activityName?: string;
  activityDescription?: string;
  /** null clears the key from the overlay; undefined keeps the previous value. */
  details?: Record<string, string | string[] | null>;
};

export type VendorVersionBulkRow = {
  activityCode: string;
  activityName?: string;
  activityDescription?: string;
  details?: Record<string, string | string[] | null>;
};

export function patchActivityVendorVersion(
  departmentId: string,
  processId: string,
  activityId: string,
  payload: VendorVersionInlinePayload
) {
  return request<BpmProcess>(
    `/departments/${departmentId}/processes/${processId}/activities/${activityId}/vendor-version`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export function uploadProcessVendorVersion(
  departmentId: string,
  processId: string,
  payload: { vendorName?: string; rows: VendorVersionBulkRow[] }
) {
  return request<BpmProcess>(`/departments/${departmentId}/processes/${processId}/vendor-version`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function defineProcess(
  departmentId: string,
  processId: string,
  payload: DefineProcessPayload
) {
  return request<BpmProcess>(`/departments/${departmentId}/processes/${processId}/definition`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function addActivityComment(
  departmentId: string,
  processId: string,
  activityId: string,
  payload: AddCommentPayload,
  files?: File[] | null
) {
  const form = new FormData();
  form.append('message', payload.message);
  for (const file of files ?? []) {
    form.append('files', file);
  }
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;
  const headers: Record<string, string> = {};
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  } else {
    const profile = loadAccessProfile();
    if (profile.email?.trim()) {
      headers['x-user-email'] = profile.email.trim().toLowerCase();
    }
  }
  return fetch(
    `${API_BASE_URL}/departments/${departmentId}/processes/${processId}/activities/${activityId}/comments`,
    {
      method: 'POST',
      headers,
      body: form,
    }
  ).then(async (response) => {
    const body = (await response.json().catch(() => null)) as
      | BpmProcess
      | { message?: string | string[] }
      | null;
    if (!response.ok) {
      const msg = body && 'message' in body ? body.message : undefined;
      const text = Array.isArray(msg) ? msg.join(', ') : msg;
      throw new Error(text ?? 'Comment submit failed');
    }
    return body as BpmProcess;
  });
}

export function updateActivityComment(
  departmentId: string,
  processId: string,
  activityId: string,
  commentId: string,
  payload: { message: string }
) {
  return request<BpmProcess>(
    `/departments/${departmentId}/processes/${processId}/activities/${activityId}/comments/${commentId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export function deleteActivityComment(
  departmentId: string,
  processId: string,
  activityId: string,
  commentId: string
) {
  return request<BpmProcess>(
    `/departments/${departmentId}/processes/${processId}/activities/${activityId}/comments/${commentId}`,
    { method: 'DELETE' }
  );
}

export function fetchUploadedAttachments() {
  return request<UploadedAttachmentItem[]>('/departments/administration/attachments');
}

export function getActivityCommentAttachmentUrl(
  departmentId: string,
  processId: string,
  activityId: string,
  commentId: string
) {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;
  const base = `${API_BASE_URL}/departments/${departmentId}/processes/${processId}/activities/${activityId}/comments/${commentId}/file`;
  if (!token?.trim()) {
    return base;
  }
  return `${base}?accessToken=${encodeURIComponent(token.trim())}`;
}

export function fetchActivityTemplates() {
  return request<ActivityTemplate[]>('/activity-templates');
}

export function fetchProcessActivityTemplate(departmentId: string, processId: string) {
  return request<ActivityTemplate>(
    `/departments/${departmentId}/processes/${processId}/activity-template`
  );
}

export function createActivityTemplate(payload: UpsertTemplatePayload) {
  return request<ActivityTemplate>('/activity-templates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateActivityTemplate(templateId: string, payload: UpsertTemplatePayload) {
  return request<ActivityTemplate>(`/activity-templates/${templateId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteActivityTemplate(templateId: string) {
  return request<{ deleted: true }>(`/activity-templates/${templateId}`, {
    method: 'DELETE',
  });
}

export function fetchAccessRoles() {
  return request<AccessRole[]>('/access-control/roles');
}

export function updateAccessRole(roleId: string, payload: UpdateAccessRolePayload) {
  return request<AccessRole>(`/access-control/roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function createAccessRole(payload: CreateAccessRolePayload) {
  return request<AccessRole>('/access-control/roles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteAccessRole(roleId: string) {
  return request<{ deleted: true }>(`/access-control/roles/${roleId}`, {
    method: 'DELETE',
  });
}

export function fetchAccessUsers() {
  return request<AccessUser[]>('/access-control/users');
}

export function createAccessUser(payload: UpsertAccessUserPayload) {
  return request<AccessUser>('/access-control/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAccessUser(userId: string, payload: UpsertAccessUserPayload) {
  return request<AccessUser>(`/access-control/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export type ProcessDocumentationFile = {
  id: string;
  departmentId: string | null;
  processId: string | null;
  source: 'upload' | 'automation';
  processFunctionCode: string | null;
  processCode: string | null;
  comments: string | null;
  originalName: string;
  mimeType: string | null;
  fileSize: number;
  uploadedByEmail: string;
  uploadedByName: string;
  createdAt: string;
};

export type ProcessDocumentationRecordsQuery = {
  page?: number;
  pageSize?: number;
  processFunctionCode?: string;
  processCode?: string;
  search?: string;
  source?: 'upload' | 'automation';
};

export type ProcessDocumentationRecordsPage = {
  items: ProcessDocumentationFile[];
  total: number;
  page: number;
  pageSize: number;
};

export type ProcessDocumentationGroupedRecord = {
  scopeKey: string;
  departmentId: string;
  processId: string | null;
  processFunctionCode: string | null;
  processCode: string | null;
  automationFiles: ProcessDocumentationFile[];
  uploadFiles: ProcessDocumentationFile[];
  commentTargetId: string | null;
  comments: string | null;
};

export type ProcessDocumentationGroupedPage = {
  items: ProcessDocumentationGroupedRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export type ProcessDocumentationTarget = {
  id: string;
  code: string;
  name: string;
  companyCode: string | null;
  processes: Array<{ id: string; code: string; name: string }>;
};

export function fetchProcessDocumentationTargets() {
  return request<ProcessDocumentationTarget[]>('/process-documentation/targets');
}

export function fetchProcessDocumentationRecords(query: ProcessDocumentationRecordsQuery = {}) {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.processFunctionCode?.trim()) {
    params.set('processFunctionCode', query.processFunctionCode.trim());
  }
  if (query.processCode?.trim()) params.set('processCode', query.processCode.trim());
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.source) params.set('source', query.source);
  const qs = params.toString();
  return request<ProcessDocumentationRecordsPage>(
    `/process-documentation/records${qs ? `?${qs}` : ''}`
  );
}

export function fetchProcessDocumentationGrouped(query: ProcessDocumentationRecordsQuery = {}) {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.processFunctionCode?.trim()) {
    params.set('processFunctionCode', query.processFunctionCode.trim());
  }
  if (query.processCode?.trim()) params.set('processCode', query.processCode.trim());
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.source) params.set('source', query.source);
  const qs = params.toString();
  return request<ProcessDocumentationGroupedPage>(
    `/process-documentation/records/grouped${qs ? `?${qs}` : ''}`
  );
}

export function patchProcessDocumentationComments(fileId: string, comments: string | null) {
  return request<ProcessDocumentationFile>(`/process-documentation/files/${fileId}/comments`, {
    method: 'PATCH',
    body: JSON.stringify({ comments }),
  });
}

export function fetchProcessFunctionDocumentation(departmentId: string) {
  return request<ProcessDocumentationFile[]>(`/process-documentation/departments/${departmentId}`);
}

export function fetchProcessDocumentation(departmentId: string, processId: string) {
  return request<ProcessDocumentationFile[]>(
    `/process-documentation/departments/${departmentId}/processes/${processId}`
  );
}

async function requestMultipart<T>(path: string, formData: FormData): Promise<T> {
  const profile = loadAccessProfile();
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;
  const headers: Record<string, string> = {};
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  } else if (profile.email?.trim()) {
    headers['x-user-email'] = profile.email.trim().toLowerCase();
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? 'Upload failed');
  }
  return response.json() as Promise<T>;
}

export function uploadProcessFunctionDocumentation(departmentId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestMultipart<ProcessDocumentationFile>(
    `/process-documentation/departments/${departmentId}`,
    formData
  );
}

export function uploadProcessDocumentation(departmentId: string, processId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestMultipart<ProcessDocumentationFile>(
    `/process-documentation/departments/${departmentId}/processes/${processId}`,
    formData
  );
}

export async function downloadProcessDocumentationFile(
  fileId: string,
  originalName: string
): Promise<void> {
  const profile = loadAccessProfile();
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;
  const headers: Record<string, string> = {};
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  } else if (profile.email?.trim()) {
    headers['x-user-email'] = profile.email.trim().toLowerCase();
  }
  const response = await fetch(`${API_BASE_URL}/process-documentation/files/${fileId}/download`, {
    headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? 'Download failed');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = originalName || 'download';
  link.click();
  URL.revokeObjectURL(url);
}

export function deleteProcessDocumentationFile(fileId: string) {
  return request<{ deleted: true }>(`/process-documentation/files/${fileId}`, {
    method: 'DELETE',
  });
}

export type AiBpmTemplate = {
  id: string;
  name: string;
  description: string;
  promptSummary: string;
};

export type AiBpmGenerateResult = {
  scope: 'process' | 'processFunction';
  userPrompt: string | null;
  templateIds: string[];
  templateNames: string[];
  processId: string | null;
  processCode: string | null;
  processName: string;
  processCount: number;
  departmentCode: string;
  departmentName: string;
  subProcessCount: number;
  docxFilename: string;
  docxBase64: string;
  generationSource: string;
  warningMessage: string | null;
  markdown: string;
  sectionHeadings: string[];
  document: {
    cover: {
      title: string;
      subtitle?: string;
      processFunction: string;
      processFunctionCode: string;
      processTarget: string;
    };
    sections: Array<{ heading: string; level?: number }>;
  };
  usage: { inputTokens: number; outputTokens: number };
};

export type AiBpmTarget = {
  id: string;
  code: string;
  name: string;
  companyCode: string | null;
  processes: Array<{ id: string; code: string; name: string }>;
};

export function fetchAiBpmTemplates() {
  return request<AiBpmTemplate[]>('/ai-bpm/templates');
}

export function fetchAiBpmTargets() {
  return request<AiBpmTarget[]>('/ai-bpm/targets');
}

export type AiBpmWordExportResult = {
  scope: 'process' | 'processFunction';
  processName: string;
  departmentName: string;
  departmentCode: string;
  subProcessCount: number;
  docxFilename: string;
  docxBase64: string;
  sopDocxFilename?: string | null;
  sopDocxBase64?: string | null;
  warningMessage: string | null;
};

export function exportAiBpmWordDocument(payload: { departmentId: string; processId?: string }) {
  return request<AiBpmWordExportResult>('/ai-bpm/export-word', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type WordExportStage =
  | 'prepare'
  | 'analysis'
  | 'narratives'
  | 'structure'
  | 'sop'
  | 'summary'
  | 'jd'
  | 'build';

export type WordFileKind = 'bpm' | 'sop' | 'summary' | 'jd';

export type WordExportJobStatus = {
  jobId: string;
  status: 'running' | 'done' | 'error';
  phase: WordFileKind;
  stage: WordExportStage;
  label: string;
  progress: number;
  filename: string | null;
  files: Array<{ kind: WordFileKind; filename: string }>;
  /** The document that can be requested next, once the current one is ready. */
  next: 'sop' | 'summary' | null;
  /** Job descriptions can be requested (they are written from the BPM data alone). */
  canJd: boolean;
  warningMessage: string | null;
  note: string | null;
  error: string | null;
};

export function startWordFollowUpJob(jobId: string, kind: 'sop' | 'summary' | 'jd') {
  return request<{ jobId: string }>(
    `/ai-bpm/export-word/jobs/${encodeURIComponent(jobId)}/${kind}`,
    { method: 'POST' }
  );
}

export function startWordExportJob(payload: { departmentId: string; processId?: string }) {
  return request<{ jobId: string }>('/ai-bpm/export-word/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchWordExportJob(jobId: string) {
  return request<WordExportJobStatus>(`/ai-bpm/export-word/jobs/${encodeURIComponent(jobId)}`);
}

export async function downloadWordExportJobFile(
  jobId: string,
  filename: string,
  kind: WordFileKind = 'bpm'
): Promise<void> {
  const profile = loadAccessProfile();
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) : null;
  const headers: Record<string, string> = {};
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  } else if (profile.email?.trim()) {
    headers['x-user-email'] = profile.email.trim().toLowerCase();
  }
  const response = await fetch(
    `${API_BASE_URL}/ai-bpm/export-word/jobs/${encodeURIComponent(jobId)}/file?kind=${kind}`,
    { headers }
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? 'Download failed');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'BPM-Document.docx';
  link.click();
  URL.revokeObjectURL(url);
}

export function generateAiBpmContent(payload: {
  departmentId: string;
  /** Omit to generate for the entire process function (all accessible processes). */
  processId?: string;
  userPrompt?: string;
  templateIds?: string[];
}) {
  return request<AiBpmGenerateResult>('/ai-bpm/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function approveAiBpmDocument(payload: {
  departmentId: string;
  processId?: string;
  docxBase64: string;
  docxFilename: string;
  comments?: string;
}) {
  return request<ProcessDocumentationFile>('/ai-bpm/approve-document', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function askBpmAssistant(payload: { question: string; pagePath?: string }) {
  return request<{ answer: string }>('/bpm-assistant/ask', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type AssistantInquiryRow = {
  id: string;
  userEmail: string;
  question: string;
  pagePath: string | null;
  createdAt: string;
};

export type AssistantInquiriesResponse = {
  rows: AssistantInquiryRow[];
  meta: { page: number; pageSize: number; total: number };
};

export function fetchAssistantInquiries(params?: {
  page?: number;
  pageSize?: number;
  user?: string;
  q?: string;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  if (params?.user?.trim()) query.set('user', params.user.trim());
  if (params?.q?.trim()) query.set('q', params.q.trim());
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<AssistantInquiriesResponse>(`/bpm-assistant/inquiries${suffix}`);
}
