import * as XLSX from 'xlsx';

export function exportSheet(data: Record<string, unknown>[], filename: string, sheetName = 'Data') {
  if (!data.length) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportWorkbook(
  sheets: { name: string; data: Record<string, unknown>[] }[],
  filename: string,
) {
  const wb = XLSX.utils.book_new();
  for (const { name, data } of sheets) {
    if (!data.length) continue;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), name.slice(0, 31));
  }
  if (wb.SheetNames.length === 0) return;
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
