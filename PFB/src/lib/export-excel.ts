import * as XLSX from 'xlsx';
import type { ProcessedSalesRow, SalesmanAggregate } from '../types';
import { formatMoney, formatPct } from './format';

export function exportSalesSummaryWorkbook(
  detailRows: ProcessedSalesRow[],
  salesmanRows: SalesmanAggregate[],
  filename: string,
) {
  const detailSheet = detailRows.map((r) => ({
    Company: r.Company,
    Division: r.Division,
    Salesperson: r.SlpName,
    Customers: r.Customers,
    Orders: r.Orders,
    'SO Amount': r.SOAmountNum,
    Deliveries: r.Deliveries,
    'DN Amount': r.DNAmountNum,
    Invoices: r.Invoices,
    'Invoice Amount': r.INVAmountNum,
    'Conversion %': r.ConversionRate,
  }));

  const salesmanSheet = salesmanRows.map((s) => ({
    Salesperson: s.name,
    Company: s.company,
    Division: s.division,
    Customers: s.customers,
    Orders: s.orders,
    'SO Amount': s.soAmount,
    Deliveries: s.deliveries,
    'DN Amount': s.dnAmount,
    Invoices: s.invoices,
    'Invoice Amount': s.invAmount,
    'Conversion %': s.conversionRate,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesmanSheet), 'Salesperson Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailSheet), 'Detail');
  XLSX.writeFile(wb, filename);
}

export function exportSalesmanCsv(rows: SalesmanAggregate[]) {
  const header = ['Salesperson', 'Company', 'Division', 'Customers', 'Orders', 'SO Amount', 'Invoice Amount', 'Conversion %'];
  const lines = rows.map((s) =>
    [
      `"${s.name}"`,
      `"${s.company}"`,
      `"${s.division}"`,
      s.customers,
      s.orders,
      formatMoney(s.soAmount),
      formatMoney(s.invAmount),
      formatPct(s.conversionRate),
    ].join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sales-order-summary-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
