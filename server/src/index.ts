import 'dotenv/config';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { callLst5yrsForEmployee } from './employee-lst5yrs.js';
import { callLst5yrsAllDBs, type Lst5yrsRow } from './hana.js';
import {
  callAttDiscrepancy,
  isValidPayrollDatabase,
  PAYROLL_DATABASES,
  type AttDiscrepancyRow,
} from './sqlserver.js';
import { fetchHqAccessEvents, type HqAccessEvent } from './hq-attendance.js';
import {
  COLLECTION_COMPANIES,
  fetchCollectionDashboard,
  fetchCustomerInvoices,
  fetchAgingBucketCustomers,
  type CollectionFilters,
} from './collection-intelligence.js';
import {
  accessSummaryForUsers,
  fetchEmployeeCompanies,
  fetchEmployeesForFilter,
  fetchReportUsers,
  filterReportUsersByCompany,
  getAccessSummary,
  mergeUsersWithAccess,
  recordReportAccess,
} from './users.js';
import {
  analyzeWithClaude,
  callSalesOrderSummary,
  EORDER_SCHEMAS,
  isValidEorderSchema,
  normalizeDateInput,
  type AiAnalyzePayload,
} from './eorder-analysis.js';
import { callIntercompanyKsa, type IntercompanyRow } from './intercompany-ksa.js';
import { callVehicleSalesTrack, type VehicleSalesRow } from './vehicle-sales-track.js';
import { fetchNe02Approval } from './ne02-approval.js';
import {
  getAuditById,
  previewClassification,
  queryAudit,
  recordAudit,
} from './audit-log.js';
import { auditAccessMiddleware, buildModulesCatalog } from './audit-access.js';
import {
  fetchDtsDashboard,
  fetchDtsDrivers,
  fetchDtsLocation,
  fetchDtsLookups,
  fetchQuotationDetails,
  cacheKey as dtsCacheKey,
  parseDtsFilters,
} from './dts.js';

const app = express();
app.use(compression({ threshold: 1024 }));
const port = Number(process.env.PORT ?? 4012);
const cacheTtl = Number(process.env.CACHE_TTL_MS ?? 300_000);
const wlaCacheTtl = Number(process.env.WLA_CACHE_TTL_MS ?? 3_600_000);

let cache: { at: number; rows: Lst5yrsRow[] } | null = null;
const employeeCache = new Map<string, { at: number; rows: Lst5yrsRow[] }>();
const attCache = new Map<string, { at: number; rows: AttDiscrepancyRow[] }>();
const attCacheTtl = Number(process.env.ATT_CACHE_TTL_MS ?? 300_000);
const hqAttnCacheTtl = Number(process.env.HQ_ATTN_CACHE_TTL_MS ?? 60_000);
let hqAttnCache: { at: number; events: HqAccessEvent[] } | null = null;
const collectionCacheTtl = Number(process.env.COLLECTION_CACHE_TTL_MS ?? 300_000);
let collectionCache: { key: string; at: number; data: Awaited<ReturnType<typeof fetchCollectionDashboard>> } | null = null;

const eorderCacheTtl = Number(process.env.EORDER_CACHE_TTL_MS ?? 300_000);
const eorderCache = new Map<string, { at: number; rows: Awaited<ReturnType<typeof callSalesOrderSummary>> }>();
const icCacheTtl = Number(process.env.IC_CACHE_TTL_MS ?? 900_000);
let icCache: { at: number; rows: IntercompanyRow[] } | null = null;
let icRefreshInFlight: Promise<IntercompanyRow[]> | null = null;
const vstCacheTtl = Number(process.env.VST_CACHE_TTL_MS ?? 600_000);
let vstCache: { at: number; rows: VehicleSalesRow[] } | null = null;
let vstRefreshInFlight: Promise<VehicleSalesRow[]> | null = null;

async function refreshVehicleSalesCache(): Promise<VehicleSalesRow[]> {
  if (vstRefreshInFlight) return vstRefreshInFlight;
  vstRefreshInFlight = (async () => {
    const rows = await callVehicleSalesTrack();
    vstCache = { at: Date.now(), rows };
    return rows;
  })().finally(() => {
    vstRefreshInFlight = null;
  });
  return vstRefreshInFlight;
}

async function refreshIntercompanyCache(force = false): Promise<IntercompanyRow[]> {
  if (icRefreshInFlight) return icRefreshInFlight;
  icRefreshInFlight = (async () => {
    const rows = await callIntercompanyKsa();
    icCache = { at: Date.now(), rows };
    return rows;
  })().finally(() => {
    icRefreshInFlight = null;
  });
  return icRefreshInFlight;
}
const dtsCacheTtl = Number(process.env.DTS_CACHE_TTL_MS ?? 45_000);
let dtsCache: { key: string; at: number; data: Awaited<ReturnType<typeof fetchDtsDashboard>> } | null =
  null;

function collectionCacheKey(filters: CollectionFilters): string {
  return JSON.stringify(filters);
}

app.use(
  cors({
    origin: [
      'https://mis.neweast.cloud',
      'http://mis.neweast.cloud',
      'https://intranet.neweast.cloud',
      'http://localhost:4013',
      'http://127.0.0.1:4013',
      'http://localhost:4014',
      'http://127.0.0.1:4014',
      'http://localhost:4022',
      'http://127.0.0.1:4022',
      'http://localhost:4015',
      'http://127.0.0.1:4015',
      'http://localhost:4017',
      'http://127.0.0.1:4017',
      'http://localhost:4018',
      'http://127.0.0.1:4018',
      'http://localhost:4019',
      'http://127.0.0.1:4019',
      'http://localhost:4028',
      'http://127.0.0.1:4028',
    ],
  }),
);
app.use(express.json());
app.use(auditAccessMiddleware);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'mis-dashboard-api' });
});

app.get('/api/audit-log/modules', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(buildModulesCatalog());
});

app.get('/api/audit-log', (req, res) => {
  try {
    const result = queryAudit({
      kind: typeof req.query.kind === 'string' ? req.query.kind : undefined,
      action: typeof req.query.action === 'string' ? req.query.action : undefined,
      module: typeof req.query.module === 'string' ? req.query.module : undefined,
      actor: typeof req.query.actor === 'string' ? req.query.actor : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
      limit: req.query.limit != null ? Number(req.query.limit) : 25,
      offset: req.query.offset != null ? Number(req.query.offset) : 0,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      cachedAt: new Date().toISOString(),
      ...result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/audit-log/:id', (req, res) => {
  const event = getAuditById(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Audit event not found' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json(event);
});

app.post('/api/audit-log/classify', (req, res) => {
  const preview = previewClassification(req.body ?? {});
  res.json(preview);
});

app.post('/api/audit-log', (req, res) => {
  try {
    const body = req.body ?? {};
    if (!body.summary && !body.action && !body.module) {
      res.status(400).json({ error: 'summary, action, or module is required' });
      return;
    }
    const event = recordAudit(body);
    res.status(201).json(event);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.get('/api/ne02-approval', async (req, res) => {
  try {
    const data = await fetchNe02Approval(
      req.query.cardCode,
      req.query.itemCodes,
      req.query.quotationDocNum,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      cachedAt: new Date().toISOString(),
      ...data,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /required|Invalid|Too many|No open quotation/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

app.get('/api/vehicle-sales-track', async (req, res) => {
  try {
    const bust = typeof req.query._ === 'string';
    const now = Date.now();
    if (bust) vstCache = null;
    const age = vstCache ? now - vstCache.at : Number.POSITIVE_INFINITY;
    const fresh = age <= vstCacheTtl;
    if (!vstCache) {
      await refreshVehicleSalesCache();
    } else if (!fresh) {
      void refreshVehicleSalesCache().catch((err) => {
        console.warn('VST: background refresh failed:', err instanceof Error ? err.message : err);
      });
    }
    res.setHeader(
      'Cache-Control',
      `public, max-age=${Math.floor(vstCacheTtl / 1000)}, stale-while-revalidate=60`,
    );
    res.json({
      cachedAt: new Date(vstCache!.at).toISOString(),
      rowCount: vstCache!.rows.length,
      rows: vstCache!.rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/intercompany-ksa', async (req, res) => {
  try {
    const bust = typeof req.query._ === 'string';
    const now = Date.now();
    if (bust) icCache = null;

    const age = icCache ? now - icCache.at : Number.POSITIVE_INFINITY;
    const fresh = age <= icCacheTtl;

    if (!icCache) {
      await refreshIntercompanyCache();
    } else if (!fresh) {
      // Stale-while-revalidate: serve cached rows immediately, refresh in background
      void refreshIntercompanyCache().catch((err) => {
        console.warn('IC: background refresh failed:', err instanceof Error ? err.message : err);
      });
    }

    res.setHeader('Cache-Control', `public, max-age=${Math.floor(icCacheTtl / 1000)}, stale-while-revalidate=60`);
    res.json({
      cachedAt: new Date(icCache!.at).toISOString(),
      rowCount: icCache!.rows.length,
      rows: icCache!.rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/dts/lookups', async (req, res) => {
  try {
    const bust = typeof req.query._ === 'string';
    const data = await fetchDtsLookups(bust);
    res.json({
      cachedAt: new Date().toISOString(),
      ...data,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/dts/drivers', async (req, res) => {
  try {
    const filters = parseDtsFilters(req.query as Record<string, unknown>);
    const drivers = await fetchDtsDrivers(filters.fromDate, filters.toDate);
    res.json({ fromDate: filters.fromDate, toDate: filters.toDate, drivers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/dts/location', async (req, res) => {
  try {
    const docNum = typeof req.query.docNum === 'string' ? req.query.docNum : '';
    const data = await fetchDtsLocation(docNum);
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.get('/api/dts/quotation-details', async (req, res) => {
  try {
    const data = await fetchQuotationDetails({
      docNum: req.query.docNum,
      deliveryDocEntry: req.query.deliveryDocEntry,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /required|Invalid/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

app.get('/api/dts/dashboard', async (req, res) => {
  try {
    const filters = parseDtsFilters(req.query as Record<string, unknown>);
    const bust = typeof req.query._ === 'string';
    const key = dtsCacheKey(filters);
    const now = Date.now();
    if (bust || !dtsCache || dtsCache.key !== key || now - dtsCache.at > dtsCacheTtl) {
      const data = await fetchDtsDashboard(filters);
      dtsCache = { key, at: now, data };
    }
    res.json({
      cachedAt: new Date(dtsCache.at).toISOString(),
      rowCount: dtsCache.data.details.length,
      ...dtsCache.data,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/eorder/schemas', (_req, res) => {
  res.json({ schemas: EORDER_SCHEMAS });
});

app.get('/api/eorder/sales-order-summary', async (req, res) => {
  try {
    const fromDate = normalizeDateInput(req.query.from ?? req.query.fromDate);
    const toDate = normalizeDateInput(req.query.to ?? req.query.toDate);
    const schema =
      typeof req.query.co === 'string' && req.query.co.trim()
        ? req.query.co.trim()
        : process.env.SAP_HANA_DATABASE ?? 'BI_NEGT';
    const bust = typeof req.query._ === 'string';

    if (!isValidEorderSchema(schema)) {
      res.status(400).json({ error: `Invalid schema: ${schema}` });
      return;
    }

    const cacheKey = `${schema}|${fromDate}|${toDate}`;
    const now = Date.now();
    if (bust) eorderCache.delete(cacheKey);

    let entry = eorderCache.get(cacheKey);
    if (!entry || now - entry.at > eorderCacheTtl) {
      const rows = await callSalesOrderSummary(fromDate, toDate, schema);
      entry = { at: now, rows };
      eorderCache.set(cacheKey, entry);
    }

    res.json({
      cachedAt: new Date(entry.at).toISOString(),
      schema,
      fromDate,
      toDate,
      rowCount: entry.rows.length,
      rows: entry.rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/eorder/ai-assistant', async (req, res) => {
  try {
    const body = req.body as Partial<AiAnalyzePayload>;
    if (!body.question?.trim()) {
      res.status(400).json({ error: 'question is required' });
      return;
    }
    if (!body.fromDate || !body.toDate) {
      res.status(400).json({ error: 'fromDate and toDate are required' });
      return;
    }

    const answer = await analyzeWithClaude({
      report: 'sales-order-summary',
      question: body.question.trim(),
      fromDate: normalizeDateInput(body.fromDate),
      toDate: normalizeDateInput(body.toDate),
      filters: body.filters,
      summary: body.summary ?? {},
      sampleRows: Array.isArray(body.sampleRows) ? body.sampleRows : [],
    });

    res.json({ answer });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/collection/companies', (_req, res) => {
  res.json({ companies: COLLECTION_COMPANIES });
});

function parseCollectionFilters(req: express.Request): CollectionFilters {
  return {
    company: typeof req.query.company === 'string' ? req.query.company.trim() : 'ALL',
    customer: typeof req.query.customer === 'string' ? req.query.customer.trim() : undefined,
    salesperson: typeof req.query.salesperson === 'string' ? req.query.salesperson.trim() : undefined,
    customerGroup: typeof req.query.customerGroup === 'string' ? req.query.customerGroup.trim() : undefined,
    region: typeof req.query.region === 'string' ? req.query.region.trim() : undefined,
    businessUnit: typeof req.query.businessUnit === 'string' ? req.query.businessUnit.trim() : undefined,
    year: typeof req.query.year === 'string' ? req.query.year.trim() : undefined,
    month: typeof req.query.month === 'string' ? req.query.month.trim() : undefined,
  };
}

app.get('/api/collection/dashboard', async (req, res) => {
  try {
    const filters = parseCollectionFilters(req);
    const bust = typeof req.query._ === 'string';
    const key = collectionCacheKey(filters);
    const now = Date.now();

    if (bust || !collectionCache || collectionCache.key !== key || now - collectionCache.at > collectionCacheTtl) {
      const data = await fetchCollectionDashboard(filters);
      collectionCache = { key, at: now, data };
    }

    res.json({
      cachedAt: new Date(collectionCache.at).toISOString(),
      ...collectionCache.data,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/collection/aging-customers', async (req, res) => {
  try {
    const bucket = typeof req.query.bucket === 'string' ? req.query.bucket.trim() : '';
    if (!bucket) {
      res.status(400).json({ error: 'bucket is required' });
      return;
    }
    const filters = parseCollectionFilters(req);
    const data = await fetchAgingBucketCustomers(filters, bucket);
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/collection/customer-invoices', async (req, res) => {
  try {
    const company = typeof req.query.company === 'string' ? req.query.company.trim() : '';
    const customer = typeof req.query.customer === 'string' ? req.query.customer.trim() : '';
    if (!company || !customer) {
      res.status(400).json({ error: 'company and customer are required' });
      return;
    }
    const data = await fetchCustomerInvoices(company, customer);
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/hq-attendance', async (_req, res) => {
  try {
    const now = Date.now();
    if (!hqAttnCache || now - hqAttnCache.at > hqAttnCacheTtl) {
      const events = await fetchHqAccessEvents();
      hqAttnCache = { at: now, events };
    }
    res.json({
      cachedAt: new Date(hqAttnCache.at).toISOString(),
      source: 'NEGT_HQ_ATTN.dbo.HCP_Access + Pr_EmpMaster',
      rowCount: hqAttnCache.events.length,
      events: hqAttnCache.events,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/attendance/databases', (_req, res) => {
  res.json({ databases: PAYROLL_DATABASES });
});

app.get('/api/attendance/discrepancy', async (req, res) => {
  try {
    const database =
      typeof req.query.database === 'string'
        ? req.query.database.trim()
        : process.env.SQL_DB_DATABASE ?? 'NEGTPAYROLL_UAE';
    const year = Number(req.query.year ?? new Date().getFullYear());
    const month = Number(req.query.month ?? new Date().getMonth() + 1);
    const bust = typeof req.query._ === 'string';

    if (!isValidPayrollDatabase(database)) {
      res.status(400).json({ error: `Invalid database: ${database}` });
      return;
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ error: 'Invalid month' });
      return;
    }

    const cacheKey = `${database}|${year}|${month}`;
    const now = Date.now();
    if (bust) attCache.delete(cacheKey);

    let entry = attCache.get(cacheKey);
    if (!entry || now - entry.at > attCacheTtl) {
      const rows = await callAttDiscrepancy(database, year, month);
      entry = { at: now, rows };
      attCache.set(cacheKey, entry);
    }

    const dbMeta = PAYROLL_DATABASES.find((d) => d.id === database);
    res.json({
      cachedAt: new Date(entry.at).toISOString(),
      database,
      databaseLabel: dbMeta?.label ?? database,
      country: dbMeta?.country ?? '',
      year,
      month,
      rowCount: entry.rows.length,
      rows: entry.rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/dashboard/lst5yrs', async (req, res) => {
  try {
    const employee =
      typeof req.query.employee === 'string' ? req.query.employee.trim() : '';
    const company =
      typeof req.query.company === 'string' ? req.query.company.trim() : '';

    const bust = typeof req.query._ === 'string';
    const now = Date.now();

    if (!employee) {
      if (bust) cache = null;
      if (!cache || now - cache.at > wlaCacheTtl) {
        const rows = await callLst5yrsAllDBs();
        cache = { at: now, rows };
      }
      const companies = [...new Set(cache.rows.map((r) => r.Company))].sort();
      if (!bust) {
        res.setHeader('Cache-Control', `public, max-age=${Math.floor(wlaCacheTtl / 1000)}`);
      }
      res.json({
        cachedAt: new Date(cache.at).toISOString(),
        rowCount: cache.rows.length,
        rows: cache.rows,
        employeeFilter: null,
        companyFilter: null,
        employeeCompanies: companies,
      });
      return;
    }

    const cacheKey = company ? `${employee}|${company}` : employee;
    if (bust) employeeCache.delete(cacheKey);
    let entry = employeeCache.get(cacheKey);
    if (!entry || now - entry.at > wlaCacheTtl) {
      const rows = await callLst5yrsForEmployee(
        employee,
        company ? [company] : undefined,
      );
      entry = { at: now, rows };
      employeeCache.set(cacheKey, entry);
    }

    const companies = [...new Set(entry.rows.map((r) => r.Company))].sort();

    res.json({
      cachedAt: new Date(entry.at).toISOString(),
      rowCount: entry.rows.length,
      rows: entry.rows,
      employeeFilter: employee,
      companyFilter: company || null,
      employeeCompanies: companies,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('insufficient privilege') ? 403 : 500;
    res.status(status).json({
      error: message,
      hint:
        status === 403
          ? 'Grant EXECUTE on procedure "BI_NEGT"."DA_Lst5yrs_AllDBs" to your HANA user (ROUSR), or use an account that already has execute rights.'
          : undefined,
    });
  }
});

app.get('/api/dashboard/employees', async (_req, res) => {
  try {
    const employees = await fetchEmployeesForFilter();
    res.json({ employees });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/dashboard/employees/:userId/companies', async (req, res) => {
  try {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) {
      res.status(400).json({ error: 'userId required' });
      return;
    }
    const companies = await fetchEmployeeCompanies(userId);
    res.json({ userId, companies });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/dashboard/report-users', async (req, res) => {
  try {
    const company =
      typeof req.query.company === 'string' ? req.query.company.trim() : '';
    const allUsers = await fetchReportUsers();
    const users = await filterReportUsersByCompany(allUsers, company || undefined);
    const access = getAccessSummary();
    const scopedAccess = company
      ? accessSummaryForUsers(users, access.viewers)
      : access;
    const merged = mergeUsersWithAccess(users, scopedAccess.viewers);
    res.json({
      companyFilter: company || null,
      totalActiveUsers: users.length,
      totalViews: scopedAccess.totalViews,
      uniqueViewers: scopedAccess.uniqueViewers,
      viewers: scopedAccess.viewers,
      users: merged,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/dashboard/report-access', (req, res) => {
  const { userId, userName, userEmail } = req.body ?? {};
  if (!userName && !userEmail && !userId) {
    res.status(400).json({ error: 'userName, userEmail, or userId required' });
    return;
  }
  recordReportAccess({
    userId: String(userId ?? ''),
    userName: String(userName ?? ''),
    userEmail: String(userEmail ?? ''),
  });
  try {
    recordAudit({
      kind: 'data',
      action: 'access',
      module: 'work-load-analysis',
      actor: String(userName || userEmail || userId || 'unknown'),
      actorRole: 'enduser',
      summary: 'Opened Work Load Analysis report',
      targetType: 'report',
      targetId: 'lst5yrs',
      meta: { userId, userEmail, source: 'report-access' },
    });
  } catch {
    // never block report access on audit failure
  }
  res.json({ ok: true, access: getAccessSummary() });
});

app.get('/api/dashboard/report-access', (_req, res) => {
  res.json(getAccessSummary());
});

app.post('/api/dashboard/lst5yrs/refresh', async (_req, res) => {
  try {
    const rows = await callLst5yrsAllDBs();
    cache = { at: Date.now(), rows };
    res.json({
      cachedAt: new Date(cache.at).toISOString(),
      rowCount: rows.length,
      rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`MIS dashboard API listening on http://0.0.0.0:${port}`);
  void (async () => {
    try {
      console.log('WLA: pre-warming lst5yrs cache…');
      const rows = await callLst5yrsAllDBs();
      cache = { at: Date.now(), rows };
      console.log(`WLA: cache ready (${rows.length} rows)`);
    } catch (err) {
      console.warn('WLA: cache pre-warm failed:', err instanceof Error ? err.message : err);
    }
  })();
  void (async () => {
    try {
      console.log('IC: pre-warming intercompany cache…');
      await refreshIntercompanyCache(true);
      console.log(`IC: cache ready (${icCache?.rows.length ?? 0} rows)`);
    } catch (err) {
      console.warn('IC: cache pre-warm failed:', err instanceof Error ? err.message : err);
    }
  })();
});
