import type { KpiDrilldownId } from '../types';
import type { ProcessedSalesRow, SalesmanAggregate } from '../types';

export type DrilldownConfig = {
  title: string;
  subtitle: string;
  sortSalesmanBy: keyof Pick<
    SalesmanAggregate,
    'orders' | 'customers' | 'soAmount' | 'dnAmount' | 'invAmount' | 'deliveries' | 'invoices' | 'conversionRate'
  >;
  highlightSalesmanColumn: keyof SalesmanAggregate;
  sortDetailBy: keyof Pick<
    ProcessedSalesRow,
    'Orders' | 'Customers' | 'SOAmountNum' | 'DNAmountNum' | 'INVAmountNum' | 'Deliveries' | 'Invoices' | 'ConversionRate'
  >;
  highlightDetailColumn: keyof ProcessedSalesRow;
};

export const KPI_DRILLDOWN: Record<KpiDrilldownId, DrilldownConfig> = {
  orders: {
    title: 'Sales Orders',
    subtitle: 'Salespeople and lines ranked by order count',
    sortSalesmanBy: 'orders',
    highlightSalesmanColumn: 'orders',
    sortDetailBy: 'Orders',
    highlightDetailColumn: 'Orders',
  },
  customers: {
    title: 'Customers',
    subtitle: 'Who serves the most customers in this period',
    sortSalesmanBy: 'customers',
    highlightSalesmanColumn: 'customers',
    sortDetailBy: 'Customers',
    highlightDetailColumn: 'Customers',
  },
  'so-amount': {
    title: 'Sales Order Amount',
    subtitle: 'SO value by salesperson and line',
    sortSalesmanBy: 'soAmount',
    highlightSalesmanColumn: 'soAmount',
    sortDetailBy: 'SOAmountNum',
    highlightDetailColumn: 'SOAmountNum',
  },
  'inv-amount': {
    title: 'Invoice Amount',
    subtitle: 'Invoiced revenue breakdown',
    sortSalesmanBy: 'invAmount',
    highlightSalesmanColumn: 'invAmount',
    sortDetailBy: 'INVAmountNum',
    highlightDetailColumn: 'INVAmountNum',
  },
  deliveries: {
    title: 'Deliveries',
    subtitle: 'Delivery note counts',
    sortSalesmanBy: 'deliveries',
    highlightSalesmanColumn: 'deliveries',
    sortDetailBy: 'Deliveries',
    highlightDetailColumn: 'Deliveries',
  },
  conversion: {
    title: 'SO → Invoice Conversion',
    subtitle: 'Invoice % of sales order value',
    sortSalesmanBy: 'conversionRate',
    highlightSalesmanColumn: 'conversionRate',
    sortDetailBy: 'ConversionRate',
    highlightDetailColumn: 'ConversionRate',
  },
  'dn-amount': {
    title: 'Delivery Amount',
    subtitle: 'Delivery note value',
    sortSalesmanBy: 'dnAmount',
    highlightSalesmanColumn: 'dnAmount',
    sortDetailBy: 'DNAmountNum',
    highlightDetailColumn: 'DNAmountNum',
  },
  invoices: {
    title: 'Invoices',
    subtitle: 'Invoice document counts',
    sortSalesmanBy: 'invoices',
    highlightSalesmanColumn: 'invoices',
    sortDetailBy: 'Invoices',
    highlightDetailColumn: 'Invoices',
  },
};

export function sortSalesmanByMetric(rows: SalesmanAggregate[], key: DrilldownConfig['sortSalesmanBy']) {
  return [...rows].sort((a, b) => (b[key] as number) - (a[key] as number));
}

export function sortDetailByMetric(rows: ProcessedSalesRow[], key: DrilldownConfig['sortDetailBy']) {
  return [...rows].sort((a, b) => (b[key] as number) - (a[key] as number));
}
