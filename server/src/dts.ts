import hana from '@sap/hana-client';
import type { Connection } from '@sap/hana-client';

const SCHEMA = 'BI_NEGT';
const PROC = 'BI_DTS_10001';

export const ORDER_TYPE_CODES = [
  { code: 'L', label: 'Local' },
  { code: 'E', label: 'Export' },
  { code: 'F', label: 'Free Zone' },
  { code: 'G', label: 'GCC' },
  { code: 'D', label: 'Direct Shipment' },
] as const;

const ORDER_TYPE_LABEL: Record<string, string> = {
  L: 'Local',
  E: 'Export',
  F: 'Free Zone',
  G: 'GCC',
  D: 'Direct Shipment',
};

export type DtsFilters = {
  fromDate: string;
  toDate: string;
  dispatchNo?: string;
  docNum?: string;
  slpCode?: string;
  cardCode?: string;
  orderType?: string;
  driver?: string;
  delivered?: string;
  dispatched?: string;
};

export type DtsSummaryRow = {
  orderType: string;
  orders: number;
  dispatched: number;
  pendingDispatch: number;
  delivered: number;
  pending: number;
  returned: number;
};

export type DtsDetailRow = {
  deliveryDate: string;
  docEntry: number;
  docNum: number;
  icDnDocEntry: string;
  icDnDocNum: string;
  custCode: string;
  custName: string;
  qty: number;
  slpCode: number;
  slpName: string;
  vehicleNo: string;
  driverName: string;
  delivered: boolean;
  podDateTime: string;
  receivedBy: string;
  gpsLocation: string;
  deliveredBy: string;
  atcEntry: string;
  orderType: string;
  shipment: string;
  returnRemarks: string;
  dispatchNo: string;
  dispatchDate: string;
  transitNo: string;
  diNo: string;
  loadListNo: string;
  lfsSo: string;
  rrNo: string;
  cmNo: string;
};

export type DtsLookups = {
  customers: { code: string; name: string }[];
  salespeople: { code: string; name: string }[];
  orderTypes: { code: string; label: string }[];
};

function connectConfig() {
  return {
    serverNode: process.env.SERVER_NODE!,
    uid: process.env.SAP_HANA_USER!,
    pwd: process.env.SAP_HANA_PASSWORD!,
    currentSchema: process.env.SAP_HANA_DATABASE ?? SCHEMA,
    pooling: true,
    connectionLifetime: 1800,
    communicationTimeout: 120_000,
  };
}

function exec<T>(conn: Connection, sql: string): Promise<T> {
  return new Promise((resolve, reject) => {
    conn.exec(sql, [], (err, result) => {
      if (err) reject(err);
      else resolve(result as T);
    });
  });
}

function withConn<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  const conn = hana.createConnection();
  return new Promise((resolve, reject) => {
    conn.connect(connectConfig(), async (err) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        resolve(await fn(conn));
      } catch (e) {
        reject(e);
      } finally {
        conn.disconnect();
      }
    });
  });
}

function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function asRows(result: unknown): Record<string, unknown>[] {
  return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
}

function n(value: unknown): number {
  if (value == null || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function s(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function displayOrderType(label: string): string {
  if (label === 'Direct Shifment') return 'Direct Shipment';
  return label || 'Unspecified';
}

const QRY_TYPES = new Set([
  'TrackingSummary',
  'DTSDetails',
  'DTSStatus',
  'Customer',
  'Salesperson',
  'Drivers',
  'DownloadExcel',
  'DeliveryLocation',
]);

function callProc(qryType: string, inputs: string[]): Promise<Record<string, unknown>[]> {
  if (!QRY_TYPES.has(qryType)) {
    throw new Error(`Unsupported QRYTYPE: ${qryType}`);
  }
  const padded = inputs.slice(0, 10);
  while (padded.length < 10) {
    padded.push(padded.length < 3 ? '0' : '');
  }
  const sql = `CALL "${SCHEMA}".${PROC} (${lit(qryType)}, ${padded.map(lit).join(', ')})`;
  return withConn(async (conn) => asRows(await exec(conn, sql)));
}

export function normalizeDateInput(value: unknown, fallback?: string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  if (fallback) return fallback;
  throw new Error('Date is required (YYYY-MM-DD)');
}

function todayIso(): string {
  const now = new Date();
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function sanitizeId(value: unknown, empty = '0'): string {
  if (value == null) return empty;
  const t = String(value).trim();
  if (!t) return empty;
  if (!/^[0-9A-Za-z._-]{1,40}$/.test(t)) {
    throw new Error('Invalid identifier');
  }
  return t;
}

function sanitizeCode(value: unknown): string {
  if (value == null) return '';
  const t = String(value).trim();
  if (!t) return '';
  if (!/^[0-9A-Za-z._-]{1,50}$/.test(t)) {
    throw new Error('Invalid code');
  }
  return t;
}

function sanitizeOrderType(value: unknown): string {
  if (value == null) return '';
  const parts = String(value)
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  const out: string[] = [];
  for (const t of parts) {
    if (!ORDER_TYPE_LABEL[t]) throw new Error(`Invalid order type: ${value}`);
    if (!out.includes(t)) out.push(t);
  }
  return out.join(',');
}

function sanitizeDriver(value: unknown): string {
  if (value == null) return '';
  const parts = String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const t of parts) {
    if (t.length > 80) throw new Error('Driver name is too long');
    if (/['";\\]/.test(t)) throw new Error('Invalid driver name');
    if (!out.includes(t)) out.push(t);
  }
  return out.join(',');
}

function sanitizeIdList(value: unknown, empty = '0'): string {
  if (value == null) return empty;
  const parts = String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return empty;
  for (const t of parts) {
    if (!/^[0-9A-Za-z._-]{1,40}$/.test(t)) throw new Error('Invalid identifier');
  }
  return [...new Set(parts)].join(',');
}

function sanitizeCodeList(value: unknown): string {
  if (value == null) return '';
  const parts = String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const t of parts) {
    if (!/^[0-9A-Za-z._-]{1,50}$/.test(t)) throw new Error('Invalid code');
    if (!out.includes(t)) out.push(t);
  }
  return out.join(',');
}

function yn(value: unknown): '' | 'Y' | 'N' {
  if (value == null) return '';
  const t = String(value).trim().toUpperCase();
  if (!t) return '';
  if (t === 'Y' || t === 'YES' || t === 'DELIVERED' || t === 'DISPATCHED') return 'Y';
  if (t === 'N' || t === 'NO' || t === 'PENDING') return 'N';
  throw new Error(`Invalid Y/N flag: ${value}`);
}

export function parseDtsFilters(query: Record<string, unknown>): DtsFilters {
  const fromDate = normalizeDateInput(query.from ?? query.fromDate, todayIso());
  const toDate = normalizeDateInput(query.to ?? query.toDate, fromDate);
  if (fromDate > toDate) throw new Error('fromDate must be on or before toDate');
  return {
    fromDate,
    toDate,
    dispatchNo: sanitizeId(query.dispatchNo),
    docNum: sanitizeId(query.docNum),
    slpCode: sanitizeIdList(query.slpCode),
    cardCode: sanitizeCodeList(query.cardCode),
    orderType: sanitizeOrderType(query.orderType),
    driver: sanitizeDriver(query.driver),
    delivered: yn(query.delivered),
    dispatched: yn(query.dispatched),
  };
}

function csvList(value?: string): string[] {
  return String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function spInputs(f: DtsFilters): string[] {
  const slp = csvList(f.slpCode).filter((v) => v && v !== '0');
  const types = csvList(f.orderType);
  const drivers = csvList(f.driver);
  const cards = csvList(f.cardCode);
  return [
    f.fromDate,
    f.toDate,
    f.dispatchNo && f.dispatchNo !== '0' ? f.dispatchNo : '0',
    f.docNum && f.docNum !== '0' ? f.docNum : '0',
    slp.length === 1 ? slp[0] : '0',
    cards.length === 1 ? cards[0] : '',
    types.length === 1 ? types[0] : '',
    drivers.length === 1 ? drivers[0] : '',
    '',
    '',
  ];
}

function normalizeSummary(row: Record<string, unknown>): DtsSummaryRow {
  const orders = n(row.Orders);
  const dispatched = n(row.Dispatched);
  const delivered = n(row.Delivered);
  const returned = n(row.Returned);
  return {
    orderType: displayOrderType(s(row.OrderType)),
    orders,
    dispatched,
    pendingDispatch: n(row.PeningDispatch ?? row.PendingDispatch) || Math.max(0, orders - dispatched),
    delivered,
    pending: n(row.Pending) || Math.max(0, dispatched - delivered - returned),
    returned,
  };
}

function normalizeDetail(row: Record<string, unknown>): DtsDetailRow {
  return {
    deliveryDate: s(row.DeliveryDate),
    docEntry: n(row.DocEntry),
    docNum: n(row.DocNum),
    icDnDocEntry: s(row.U_IC_DNDOCENTRY),
    icDnDocNum: s(row.U_IC_DNDOCNUM),
    custCode: s(row.CustCode),
    custName: s(row.CustName),
    qty: n(row.Qty),
    slpCode: n(row.SlpCode),
    slpName: s(row.SlpName),
    vehicleNo: s(row.U_VehicleNo),
    driverName: s(row.U_DriverName) || 'No Driver',
    delivered: s(row.Delivered).toUpperCase() === 'YES' || s(row.Delivered).toUpperCase() === 'Y',
    podDateTime: s(row.PODDateTime).replace(/\s?null\s?/gi, ' ').trim(),
    receivedBy: s(row.U_PODRECDBY),
    gpsLocation: s(row.U_PODGPSlocation),
    deliveredBy: s(row.U_PODDELBY),
    atcEntry: s(row.AtcEntry),
    orderType: displayOrderType(s(row.InvoiceType)),
    shipment: s(row.Shipment),
    returnRemarks: s(row.DELIVERYRETURN),
    dispatchNo: s(row.U_BIDISPATCHNO),
    dispatchDate: s(row.DispatchDate),
    transitNo: s(row.TransitNo),
    diNo: s(row.DINO),
    loadListNo: s(row.LoadListNo),
    lfsSo: s(row.LFSSO),
    rrNo: s(row.RRNo),
    cmNo: s(row.CMNo),
  };
}

function isDispatched(row: DtsDetailRow): boolean {
  return Boolean(row.dispatchNo);
}

function applyPostFilters(rows: DtsDetailRow[], f: DtsFilters): DtsDetailRow[] {
  const types = csvList(f.orderType).map((code) => ORDER_TYPE_LABEL[code] ?? code);
  const slps = csvList(f.slpCode).filter((v) => v && v !== '0');
  const cards = csvList(f.cardCode);
  const drivers = csvList(f.driver);
  return rows.filter((row) => {
    if (types.length && !types.includes(row.orderType)) return false;
    if (slps.length && !slps.includes(String(row.slpCode))) return false;
    if (cards.length && !cards.includes(row.custCode)) return false;
    if (drivers.length && !drivers.includes(row.driverName)) return false;
    if (f.delivered === 'Y' && !row.delivered) return false;
    if (f.delivered === 'N' && row.delivered) return false;
    if (f.dispatched === 'Y' && !isDispatched(row)) return false;
    if (f.dispatched === 'N' && isDispatched(row)) return false;
    return true;
  });
}

export function summarizeDetails(rows: DtsDetailRow[]): DtsSummaryRow[] {
  const map = new Map<string, DtsSummaryRow>();
  for (const row of rows) {
    const key = row.orderType || 'Unspecified';
    let rec = map.get(key);
    if (!rec) {
      rec = {
        orderType: key,
        orders: 0,
        dispatched: 0,
        pendingDispatch: 0,
        delivered: 0,
        pending: 0,
        returned: 0,
      };
      map.set(key, rec);
    }
    rec.orders += 1;
    if (isDispatched(row)) rec.dispatched += 1;
    if (row.delivered) rec.delivered += 1;
    if (row.rrNo) rec.returned += 1;
  }
  for (const rec of map.values()) {
    rec.pendingDispatch = Math.max(0, rec.orders - rec.dispatched);
    rec.pending = Math.max(0, rec.dispatched - rec.delivered - rec.returned);
  }
  const order = ['Export', 'Free Zone', 'Local', 'GCC', 'Direct Shipment', 'Unspecified'];
  return [...map.values()].sort(
    (a, b) => order.indexOf(a.orderType) - order.indexOf(b.orderType) || a.orderType.localeCompare(b.orderType),
  );
}

export function cacheKey(f: DtsFilters): string {
  return JSON.stringify(f);
}

export async function fetchDtsDashboard(f: DtsFilters) {
  const inputs = spInputs(f);
  const [summaryRaw, detailsRaw] = await Promise.all([
    callProc('TrackingSummary', [f.fromDate, f.toDate, '0', '0', '0', '', '', '', '', '']),
    callProc('DTSDetails', inputs),
  ]);

  const details = applyPostFilters(detailsRaw.map(normalizeDetail), f);
  const extraFilters = Boolean(
    (f.dispatchNo && f.dispatchNo !== '0') ||
      (f.docNum && f.docNum !== '0') ||
      (f.slpCode && f.slpCode !== '0') ||
      f.cardCode ||
      f.orderType ||
      f.driver ||
      f.delivered ||
      f.dispatched,
  );
  const summary = extraFilters ? summarizeDetails(details) : summaryRaw.map(normalizeSummary);

  return {
    source: `${SCHEMA}.${PROC}`,
    company: 'NEW EAST GENERAL TRADING FZCO',
    filters: f,
    summary,
    details,
    kpis: totalsFromSummary(summary),
  };
}

export function totalsFromSummary(rows: DtsSummaryRow[]) {
  return rows.reduce(
    (acc, r) => ({
      orders: acc.orders + r.orders,
      dispatched: acc.dispatched + r.dispatched,
      pendingDispatch: acc.pendingDispatch + r.pendingDispatch,
      delivered: acc.delivered + r.delivered,
      pending: acc.pending + r.pending,
      returned: acc.returned + r.returned,
    }),
    { orders: 0, dispatched: 0, pendingDispatch: 0, delivered: 0, pending: 0, returned: 0 },
  );
}

let lookupsCache: { at: number; data: DtsLookups } | null = null;
const LOOKUPS_TTL = Number(process.env.DTS_LOOKUPS_TTL_MS ?? 3_600_000);

export async function fetchDtsLookups(bust = false): Promise<DtsLookups> {
  const now = Date.now();
  if (!bust && lookupsCache && now - lookupsCache.at < LOOKUPS_TTL) {
    return lookupsCache.data;
  }
  const [customersRaw, salesRaw] = await Promise.all([
    callProc('Customer', ['', '', '0', '0', '0', '', '', '', '', '']),
    callProc('Salesperson', ['', '', '0', '0', '0', '', '', '', '', '']),
  ]);
  const data: DtsLookups = {
    customers: customersRaw
      .map((r) => ({ code: s(r.CardCode), name: s(r.CardName) }))
      .filter((r) => r.code),
    salespeople: salesRaw
      .map((r) => ({ code: s(r.SlpCode), name: s(r.SlpName) }))
      .filter((r) => r.code),
    orderTypes: ORDER_TYPE_CODES.map((t) => ({ code: t.code, label: t.label })),
  };
  lookupsCache = { at: now, data };
  return data;
}

export async function fetchDtsDrivers(fromDate: string, toDate: string): Promise<string[]> {
  const rows = await callProc('Drivers', [fromDate, toDate, '0', '0', '0', '', '', '', '', '']);
  return rows
    .map((r) => s(r.Driver ?? r.U_DRVRNAME ?? Object.values(r)[0]))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export async function fetchDtsLocation(docNum: string) {
  const id = sanitizeId(docNum, '');
  if (!id || id === '0') throw new Error('docNum is required');
  const rows = await callProc('DeliveryLocation', [id, '', '0', '0', '0', '', '', '', '', '']);
  const row = rows[0] ?? {};
  return {
    docNum: id,
    longitude: s(row.U_PODGPSLong),
    latitude: s(row.U_PODGPSLatit),
    location: s(row.U_PODGPSlocation),
  };
}

export type QuotationLine = {
  quotationDocNum: number;
  cardCode: string;
  cardName: string;
  quotationDate: string;
  itemCode: string;
  itemDescription: string;
  quantity: number;
  price: number;
  lineTotal: number;
};

export type QuotationDetails = {
  docNum: number;
  cardCode: string;
  cardName: string;
  quotationDate: string;
  lines: QuotationLine[];
};

function sanitizeDocNumInt(value: unknown, label: string): number {
  const t = String(value ?? '').trim();
  if (!/^\d{1,10}$/.test(t)) throw new Error(`${label} is required`);
  const parsed = Number(t);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${label.toLowerCase()}`);
  return parsed;
}

function isoDay(value: unknown): string {
  const m = s(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s(value);
}

export function normalizeQuotationLine(row: Record<string, unknown>): QuotationLine {
  return {
    quotationDocNum: n(row.QuotationDocNum),
    cardCode: s(row.CardCode),
    cardName: s(row.CardName),
    quotationDate: isoDay(row.QuotationDate),
    itemCode: s(row.ItemCode),
    itemDescription: s(row.ItemDescription),
    quantity: n(row.Quantity),
    price: n(row.Price),
    lineTotal: n(row.LineTotal),
  };
}

async function resolveQuotationDocNum(deliveryDocEntry: number): Promise<number> {
  const sql = `
    SELECT MIN("DocNum") AS "DocNum" FROM (
      SELECT Q."DocNum"
      FROM "NEWEASTGENTRAD"."DLN1" L
      INNER JOIN "NEWEASTGENTRAD"."OQUT" Q
        ON L."BaseType" = 23 AND L."BaseEntry" = Q."DocEntry"
      WHERE L."DocEntry" = ${deliveryDocEntry}
      UNION
      SELECT Q."DocNum"
      FROM "NEWEASTGENTRAD"."DLN1" L
      INNER JOIN "NEWEASTGENTRAD"."RDR1" R
        ON L."BaseType" = 17 AND L."BaseEntry" = R."DocEntry" AND L."BaseLine" = R."LineNum"
      INNER JOIN "NEWEASTGENTRAD"."OQUT" Q
        ON R."BaseType" = 23 AND R."BaseEntry" = Q."DocEntry"
      WHERE L."DocEntry" = ${deliveryDocEntry}
    )
  `;
  const rows = await withConn(async (conn) => asRows(await exec(conn, sql)));
  return n(rows[0]?.DocNum);
}

async function callQuotationDetails(docNum: number): Promise<Record<string, unknown>[]> {
  const sql = `CALL "${SCHEMA}"."SP_QUOTATION_DETAILS"(${docNum})`;
  return withConn(async (conn) => asRows(await exec(conn, sql)));
}

export async function fetchQuotationDetails(query: {
  docNum?: unknown;
  deliveryDocEntry?: unknown;
}): Promise<QuotationDetails> {
  const empty: QuotationDetails = { docNum: 0, cardCode: '', cardName: '', quotationDate: '', lines: [] };
  let docNum = 0;
  if (query.docNum != null && String(query.docNum).trim()) {
    docNum = sanitizeDocNumInt(query.docNum, 'Quotation number');
  } else if (query.deliveryDocEntry != null && String(query.deliveryDocEntry).trim()) {
    const entry = sanitizeDocNumInt(query.deliveryDocEntry, 'Delivery document');
    docNum = await resolveQuotationDocNum(entry);
    if (!docNum) return empty;
  } else {
    throw new Error('Quotation number is required');
  }

  const lines = (await callQuotationDetails(docNum)).map(normalizeQuotationLine);
  const head = lines[0];
  return {
    docNum,
    cardCode: head?.cardCode ?? '',
    cardName: head?.cardName ?? '',
    quotationDate: head?.quotationDate ?? '',
    lines,
  };
}
