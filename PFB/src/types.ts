export type SalesOrderSummaryRow = {
  Company: string;
  Division: string;
  SlpName: string;
  Customers: number;
  Orders: number;
  SOAmount: string | number;
  Deliveries: number;
  DNAmount: string | number;
  Invoices: number;
  INVAmount: string | number;
};

export type ProcessedSalesRow = SalesOrderSummaryRow & {
  SOAmountNum: number;
  DNAmountNum: number;
  INVAmountNum: number;
  ConversionRate: number;
};

export type EorderSchema = { id: string; label: string };

export type DashboardFilters = {
  co: string;
  fromDate: string;
  toDate: string;
  company: string;
  division: string;
  salesman: string;
  search: string;
};

export type SalesSummaryResponse = {
  cachedAt: string;
  schema: string;
  fromDate: string;
  toDate: string;
  rowCount: number;
  rows: SalesOrderSummaryRow[];
};

export type KpiDrilldownId =
  | 'orders'
  | 'customers'
  | 'so-amount'
  | 'inv-amount'
  | 'deliveries'
  | 'conversion'
  | 'dn-amount'
  | 'invoices';

export type KpiCard = {
  id: string;
  label: string;
  value: string;
  hint: string;
  tone: 'blue' | 'green' | 'amber' | 'teal' | 'red' | 'indigo';
};

export type SalesmanAggregate = {
  name: string;
  company: string;
  division: string;
  customers: number;
  orders: number;
  deliveries: number;
  invoices: number;
  soAmount: number;
  dnAmount: number;
  invAmount: number;
  conversionRate: number;
};

export type CompanyAggregate = {
  company: string;
  orders: number;
  customers: number;
  soAmount: number;
  invAmount: number;
};

export type DivisionAggregate = {
  division: string;
  orders: number;
  soAmount: number;
  invAmount: number;
};

export type AiMessage = {
  role: 'user' | 'assistant';
  content: string;
};
