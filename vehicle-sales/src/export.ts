import * as XLSX from 'xlsx';
import type { VehicleSalesRow } from './types';

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function excelCell(v: unknown): string | number {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(n)) return n;
  return String(v);
}

export function exportFullWorkbook(rows: VehicleSalesRow[]) {
  const wb = XLSX.utils.book_new();
  const rawRows = rows.map((r) => {
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(r.raw)) out[k] = excelCell(v);
    return out;
  });
  const detail = XLSX.utils.json_to_sheet(
    rawRows.length ? rawRows : [{ Note: 'No rows' }],
  );
  detail['!cols'] = Object.keys(rawRows[0] ?? { Note: '' }).map((key) => ({
    wch: Math.min(36, Math.max(14, key.length + 2)),
  }));
  XLSX.utils.book_append_sheet(wb, detail, 'Vehicle Sales Track');

  const byBrand: Record<string, { Brand: string; Models: number; Stock: number; SalesQty: number; SalesSAR: number; GrossProfit: number; Available: number }> = {};
  for (const r of rows) {
    const b = byBrand[r.brand] ?? {
      Brand: r.brand, Models: 0, Stock: 0, SalesQty: 0, SalesSAR: 0, GrossProfit: 0, Available: 0,
    };
    b.Models += 1;
    b.Stock += r.inStock;
    b.SalesQty += r.salesQtyYtd;
    b.SalesSAR += r.salesAmtYtd;
    b.GrossProfit += r.grossProfit;
    b.Available += r.available;
    byBrand[r.brand] = b;
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(Object.values(byBrand)),
    'By brand',
  );

  XLSX.writeFile(wb, `vehicle-sales-track-${stamp()}.xlsx`);
}
