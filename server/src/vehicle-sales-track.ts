import hana from '@sap/hana-client';
import type { Connection } from '@sap/hana-client';

const SP = 'CALL "BI_NEGT_KSAISUZU"."BI_VEHICLESALESTRACK"';

const ETA_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export type VehicleEtaPoint = { month: string; label: string; qty: number };

export type VehicleSalesRow = {
  itemCode: string;
  model: string;
  itemName: string;
  brand: string;
  inStock: number;
  avgCost: number;
  salesQtyYtd: number;
  salesAmtYtd: number;
  grossProfit: number;
  aged030: number;
  aged3160: number;
  aged6190: number;
  aged91120: number;
  aged121: number;
  broker1: number;
  retail: number;
  fleet1: number;
  broker2: number;
  broker3: number;
  fleetSme: number;
  poQty: number;
  sdQty: number;
  committed: number;
  stockPlusSd: number;
  pendingDi: number;
  available: number;
  eta: VehicleEtaPoint[];
  raw: Record<string, unknown>;
};

function connectConfig() {
  return {
    serverNode: process.env.SERVER_NODE!,
    uid: process.env.SAP_HANA_USER!,
    pwd: process.env.SAP_HANA_PASSWORD!,
    currentSchema: process.env.SAP_HANA_DATABASE ?? 'BI_NEGT_KSAISUZU',
    pooling: true,
    connectionLifetime: 1800,
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

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function jsonable(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const asNum = Number(value as object);
    if (Number.isFinite(asNum) && Object.prototype.toString.call(value) !== '[object Object]') {
      return asNum;
    }
  }
  return value;
}

function etaFrom(raw: Record<string, unknown>): VehicleEtaPoint[] {
  return ETA_MONTHS.map((month) => {
    const key = `SD ETA Qty ${month}-26`;
    return { month: `2026-${String(ETA_MONTHS.indexOf(month) + 1).padStart(2, '0')}`, label: `${month} 26`, qty: num(raw[key]) };
  });
}

function mapRow(raw: Record<string, unknown>): VehicleSalesRow {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) clean[k] = jsonable(v);
  return {
    itemCode: str(raw.ITEMCODE),
    model: str(raw.MODEL),
    itemName: str(raw.ItemName),
    brand: str(raw['BRAND/GROUP']) || 'Unspecified',
    inStock: num(raw['In Stock']),
    avgCost: num(raw['Average Cost']),
    salesQtyYtd: num(raw['Total Sales  Qty - YTD']),
    salesAmtYtd: num(raw['Total Sales - YTD']),
    grossProfit: num(raw.GrssProfit),
    aged030: num(raw['Aged 0-30 Days']),
    aged3160: num(raw['Aged 31-60 Days']),
    aged6190: num(raw['Aged 61-90 Days']),
    aged91120: num(raw['Aged 91-120 Days']),
    aged121: num(raw['Aged 121+ Days']),
    broker1: num(raw['Vehicle Broker Price-1']),
    retail: num(raw['Vehicle Retail Price']),
    fleet1: num(raw['Vehicle Fleets Price-1']),
    broker2: num(raw['Vehicle Broker Price-2']),
    broker3: num(raw['Vehicle Broker Price-3']),
    fleetSme: num(raw["Vehicles Fleet Sales - SME's"]),
    poQty: num(raw['Purchase Orders Quantity']),
    sdQty: num(raw['SD Quantity']),
    committed: num(raw['Total Commited in Customer Orders']),
    stockPlusSd: num(raw['(In Stock- Committed)+ SD Qty']),
    pendingDi: num(raw['Pending DI Quantity']),
    available: num(raw['Available to Release']),
    eta: etaFrom(raw),
    raw: clean,
  };
}

export async function callVehicleSalesTrack(): Promise<VehicleSalesRow[]> {
  const conn = hana.createConnection();
  return new Promise((resolve, reject) => {
    conn.connect(connectConfig(), async (err) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        const rows = await exec<Record<string, unknown>[]>(conn, SP);
        resolve((rows ?? []).map(mapRow));
      } catch (e) {
        reject(e);
      } finally {
        conn.disconnect();
      }
    });
  });
}
