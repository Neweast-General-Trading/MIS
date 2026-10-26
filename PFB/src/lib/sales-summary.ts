import type {
  CompanyAggregate,
  DashboardFilters,
  DivisionAggregate,
  KpiCard,
  ProcessedSalesRow,
  SalesmanAggregate,
  SalesOrderSummaryRow,
} from '../types';
import { parseAmount } from './format';

export function processRows(rows: SalesOrderSummaryRow[]): ProcessedSalesRow[] {
  return rows.map((row) => {
    const SOAmountNum = parseAmount(row.SOAmount);
    const DNAmountNum = parseAmount(row.DNAmount);
    const INVAmountNum = parseAmount(row.INVAmount);
    const ConversionRate = SOAmountNum > 0 ? (INVAmountNum / SOAmountNum) * 100 : 0;
    return {
      ...row,
      SOAmountNum,
      DNAmountNum,
      INVAmountNum,
      ConversionRate,
    };
  });
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function filterRows(rows: ProcessedSalesRow[], filters: DashboardFilters): ProcessedSalesRow[] {
  let out = rows;
  if (filters.company !== 'all') {
    out = out.filter((r) => r.Company === filters.company);
  }
  if (filters.division !== 'all') {
    out = out.filter((r) => r.Division === filters.division);
  }
  if (filters.salesman !== 'all') {
    out = out.filter((r) => r.SlpName === filters.salesman);
  }
  const q = filters.search.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (r) =>
        r.SlpName.toLowerCase().includes(q) ||
        r.Company.toLowerCase().includes(q) ||
        r.Division.toLowerCase().includes(q),
    );
  }
  return out;
}

export function buildKpis(rows: ProcessedSalesRow[]): KpiCard[] {
  const totalOrders = rows.reduce((s, r) => s + r.Orders, 0);
  const totalCustomers = rows.reduce((s, r) => s + r.Customers, 0);
  const totalDeliveries = rows.reduce((s, r) => s + r.Deliveries, 0);
  const totalInvoices = rows.reduce((s, r) => s + r.Invoices, 0);
  const totalSO = rows.reduce((s, r) => s + r.SOAmountNum, 0);
  const totalDN = rows.reduce((s, r) => s + r.DNAmountNum, 0);
  const totalINV = rows.reduce((s, r) => s + r.INVAmountNum, 0);
  const conversion = totalSO > 0 ? (totalINV / totalSO) * 100 : 0;

  return [
    {
      id: 'orders',
      label: 'Sales Orders',
      value: totalOrders.toLocaleString(),
      hint: 'Count of sales orders in the selected period and filters.',
      tone: 'blue',
    },
    {
      id: 'customers',
      label: 'Customers',
      value: totalCustomers.toLocaleString(),
      hint: 'Unique customers represented in the filtered rows.',
      tone: 'teal',
    },
    {
      id: 'so-amount',
      label: 'SO Amount',
      value: totalSO.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      hint: 'Total sales order value before invoicing.',
      tone: 'indigo',
    },
    {
      id: 'inv-amount',
      label: 'Invoice Amount',
      value: totalINV.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      hint: 'Total invoiced amount for the same scope.',
      tone: 'green',
    },
    {
      id: 'deliveries',
      label: 'Deliveries',
      value: totalDeliveries.toLocaleString(),
      hint: 'Delivery notes count in scope.',
      tone: 'amber',
    },
    {
      id: 'conversion',
      label: 'SO → Invoice %',
      value: `${conversion.toFixed(2)}%`,
      hint: 'Invoice Amount ÷ Sales Order Amount × 100.',
      tone: conversion >= 70 ? 'green' : conversion >= 40 ? 'amber' : 'red',
    },
    {
      id: 'dn-amount',
      label: 'Delivery Amount',
      value: totalDN.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      hint: 'Total delivery note value.',
      tone: 'blue',
    },
    {
      id: 'invoices',
      label: 'Invoices',
      value: totalInvoices.toLocaleString(),
      hint: 'Invoice document count.',
      tone: 'teal',
    },
  ];
}

export function aggregateBySalesman(rows: ProcessedSalesRow[]): SalesmanAggregate[] {
  const map = new Map<string, SalesmanAggregate>();

  rows.forEach((row) => {
    const key = `${row.SlpName}|${row.Company}|${row.Division}`;
    if (!map.has(key)) {
      map.set(key, {
        name: row.SlpName,
        company: row.Company,
        division: row.Division,
        customers: 0,
        orders: 0,
        deliveries: 0,
        invoices: 0,
        soAmount: 0,
        dnAmount: 0,
        invAmount: 0,
        conversionRate: 0,
      });
    }
    const agg = map.get(key)!;
    agg.customers += row.Customers;
    agg.orders += row.Orders;
    agg.deliveries += row.Deliveries;
    agg.invoices += row.Invoices;
    agg.soAmount += row.SOAmountNum;
    agg.dnAmount += row.DNAmountNum;
    agg.invAmount += row.INVAmountNum;
    agg.conversionRate = agg.soAmount > 0 ? (agg.invAmount / agg.soAmount) * 100 : 0;
  });

  return [...map.values()].sort((a, b) => b.soAmount - a.soAmount);
}

export function aggregateByCompany(rows: ProcessedSalesRow[]): CompanyAggregate[] {
  const map = new Map<string, CompanyAggregate>();
  rows.forEach((row) => {
    if (!map.has(row.Company)) {
      map.set(row.Company, { company: row.Company, orders: 0, customers: 0, soAmount: 0, invAmount: 0 });
    }
    const c = map.get(row.Company)!;
    c.orders += row.Orders;
    c.customers += row.Customers;
    c.soAmount += row.SOAmountNum;
    c.invAmount += row.INVAmountNum;
  });
  return [...map.values()].sort((a, b) => b.soAmount - a.soAmount);
}

export function aggregateByDivision(rows: ProcessedSalesRow[]): DivisionAggregate[] {
  const map = new Map<string, DivisionAggregate>();
  rows.forEach((row) => {
    if (!map.has(row.Division)) {
      map.set(row.Division, { division: row.Division, orders: 0, soAmount: 0, invAmount: 0 });
    }
    const d = map.get(row.Division)!;
    d.orders += row.Orders;
    d.soAmount += row.SOAmountNum;
    d.invAmount += row.INVAmountNum;
  });
  return [...map.values()].sort((a, b) => b.soAmount - a.soAmount);
}

export function buildAiSummary(rows: ProcessedSalesRow[], aggregates: SalesmanAggregate[]) {
  const kpis = buildKpis(rows);
  return {
    rowCount: rows.length,
    kpis: Object.fromEntries(kpis.map((k) => [k.id, k.value])),
    topSalesmenBySO: aggregates.slice(0, 10).map((s) => ({
      name: s.name,
      company: s.company,
      division: s.division,
      soAmount: s.soAmount,
      invAmount: s.invAmount,
      conversionRate: s.conversionRate,
      orders: s.orders,
    })),
    bottomConversion: [...aggregates]
      .filter((s) => s.soAmount > 0)
      .sort((a, b) => a.conversionRate - b.conversionRate)
      .slice(0, 5)
      .map((s) => ({ name: s.name, conversionRate: s.conversionRate, soAmount: s.soAmount })),
  };
}

export function filterOptions(rows: ProcessedSalesRow[]) {
  return {
    companies: ['all', ...uniqueSorted(rows.map((r) => r.Company))],
    divisions: ['all', ...uniqueSorted(rows.map((r) => r.Division))],
    salesmen: ['all', ...uniqueSorted(rows.map((r) => r.SlpName))],
  };
}
