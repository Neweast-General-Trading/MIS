export type BrandPerformanceRow = {
  CardCode: string;
  CardName: string;
  Brand: string;
  SalesValue_CurrentYear: number | string | null;
  SalesValue_LastYear: number | string | null;
  SalesValue_2YearsAgo: number | string | null;
  SalesQty_CurrentYear: number | string | null;
  SalesQty_LastYear: number | string | null;
  SalesQty_2YearsAgo: number | string | null;
  BrandBackorderQty: number | string | null;
  BrandBackorderValue: number | string | null;
  CustomerTotalBackorderValue: number | string | null;
  CustomerTotalSalesValue_LastYear: number | string | null;
  BackorderPctOfLastYearSales: number | string | null;
};

export type FinancialStatusRow = {
  CardCode: string;
  CardName: string;
  PaymentType: string | null;
  PaymentTermsName: string | null;
  CreditLimit: number | string | null;
  CurrentBalance: number | string | null;
  OverCreditLimit: string | null;
  TotalOverdueAmount: number | string | null;
  OverdueInvoiceCount: number | string | null;
  MaxDaysOverdue: number | string | null;
  OverdueInvoiceDocNum: number | string | null;
  InvoiceDate: string | null;
  InvoiceDueDate: string | null;
  DocTotal: number | string | null;
  PaidToDate: number | string | null;
  OpenBalance: number | string | null;
  DaysOverdue: number | string | null;
};

export type ItemEvaluationRow = {
  ItemCode: string;
  ItemName: string | null;
  Brand: string | null;
  SalesQty_LastYear: number | string | null;
  SalesValue_LastYear: number | string | null;
  DistinctCustomers_LastYear: number | string | null;
  DistinctCountries_LastYear: number | string | null;
  CatalogAvgQty_LastYear: number | string | null;
  MovementClass: string | null;
  CustomerSpecific: string | null;
  TopCustomerCode: string | null;
  TopCustomerName: string | null;
  CountrySpecific: string | null;
  TopCountry: string | null;
};

export type ItemBackorderRow = {
  ItemCode: string;
  ItemName: string | null;
  TotalOnHandQty: number | string | null;
  TotalCommittedQty: number | string | null;
  TotalOnOrderQty: number | string | null;
  TotalAvailableQty: number | string | null;
  BackorderWhsCode: string | null;
  BackorderWhsOnHandQty: number | string | null;
  BackorderWhsCommittedQty: number | string | null;
  BackorderWhsAvailableQty: number | string | null;
  BackorderDocNum: number | string | null;
  OrderDate: string | null;
  DueDate: string | null;
  CardCode: string | null;
  CardName: string | null;
  BackorderQty: number | string | null;
  Price: number | string | null;
  BackorderValue: number | string | null;
};

export type AllocatedStockRow = {
  ItemCode: string;
  ItemName: string | null;
  WhsCode: string | null;
  WhsName: string | null;
  SalesOrderDocNum: number | string | null;
  OrderDate: string | null;
  DueDate: string | null;
  CardCode: string | null;
  CardName: string | null;
  AllocatedQty: number | string | null;
  Price: number | string | null;
  AllocatedValue: number | string | null;
  DaysAllocated: number | string | null;
  MonthsAllocated_Approx: number | string | null;
  ItemTotalAgedAllocatedQty: number | string | null;
  ItemTotalAgedAllocatedValue: number | string | null;
};

export type QuotationDetailRow = {
  QuotationDocNum: number | string;
  CardCode: string;
  CardName: string | null;
  QuotationDate: string | null;
  ItemCode: string;
  ItemDescription: string | null;
  Quantity: number | string | null;
  Price: number | string | null;
  LineTotal: number | string | null;
};

export type Ne02Response = {
  cachedAt: string;
  cardCode: string;
  itemCodes: string[];
  quotationDocNum: number | null;
  quotationDetails: QuotationDetailRow[];
  brandPerformance: BrandPerformanceRow[];
  financialStatus: FinancialStatusRow[];
  itemEvaluation: ItemEvaluationRow[];
  itemBackorder: ItemBackorderRow[];
  allocatedStock: AllocatedStockRow[];
  error?: string;
};

export function num(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function money(v: unknown, digits = 0): string {
  const n = num(v);
  return n.toLocaleString('en-AE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function qty(v: unknown): string {
  return num(v).toLocaleString('en-AE', { maximumFractionDigits: 2 });
}

export function pct(v: unknown): string {
  return `${money(v, 1)}%`;
}

export function yn(v: unknown): boolean {
  return String(v ?? '').trim().toUpperCase() === 'Y';
}

export function shortDate(v: unknown): string {
  if (v == null || v === '') return '—';
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : String(v);
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => String(v ?? '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}
