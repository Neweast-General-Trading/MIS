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

export type ApiResponse = {
  cachedAt: string;
  rowCount: number;
  rows: VehicleSalesRow[];
};
