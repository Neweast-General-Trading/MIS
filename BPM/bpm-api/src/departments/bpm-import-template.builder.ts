import * as XLSX from 'xlsx';
import type { ActivityTemplateEntity } from 'src/activity-templates/entities/activity-template.entity';

/**
 * Builds a workbook users can fill and re-upload:
 * - `_README` — instructions (skipped on per-sheet import).
 * - `Process_Example` — process summary (A/B) + header row matching template + blank data rows.
 * - `Index` — optional row-based process list for mode A (skipped on mode B).
 */
export function buildBpmImportTemplateWorkbookBuffer(
  template: ActivityTemplateEntity,
): Buffer {
  const fields = template.fields;
  if (!fields.length) {
    throw new Error('Template has no fields.');
  }

  const wb = XLSX.utils.book_new();

  const readme: string[][] = [
    ['BPM — Excel import template'],
    [''],
    ['[AR]'],
    ['- انسخ بياناتك والصقها في "Process_Example" (أو انسخ الورقة وغيّر اسم التبويب لكل عملية).'],
    ['- فوق الجدول: العمود A تسمية، B قيمة (مثل Process name / Process description).'],
    ['- صف العناوين يجب أن يطابق عناوين القالب المختار في التطبيق.'],
    ['- الوضع B: كل ورقة عمل (ما عدا "Index" وما يبدأ اسمه بـ _) = عملية + أنشطة.'],
    ['- الوضع A: ورقة "Index" — صف عناوين ثم صفوف؛ عمود يحتوي Process ID.'],
    ['- SI.No و Activity ID يملأهما النظام عند الاستيراد.'],
    [''],
    ['[EN]'],
    ['- Mode B: duplicate "Process_Example", rename the sheet tab per process, paste rows.'],
    ['- Mode A: fill "Index" rows (Process ID required in header).'],
    [''],
    [`Template: ${template.name}`],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), '_README');

  const colCount = fields.length;
  const labels = fields.map((f) => f.label);

  const processRows: (string | number)[][] = [
    ['Process name', ''],
    ['Process description', ''],
    ['', ''],
    ['', ''],
    [...labels],
  ];
  for (let i = 0; i < 30; i += 1) {
    processRows.push(Array(colCount).fill(''));
  }

  const processWs = XLSX.utils.aoa_to_sheet(processRows);
  processWs['!cols'] = labels.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, processWs, 'Process_Example');

  const indexMatrix: (string | number)[][] = [
    ['Process ID', 'Level 3', 'Level 0', 'Level 1', 'Level 2', 'Objective', 'Description'],
    ['001-000-000', 'Example process name (replace)', '', '', '', '', ''],
    ['', '', '', '', '', '', ''],
  ];
  const indexWs = XLSX.utils.aoa_to_sheet(indexMatrix);
  indexWs['!cols'] = [{ wch: 14 }, { wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, indexWs, 'Index');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
