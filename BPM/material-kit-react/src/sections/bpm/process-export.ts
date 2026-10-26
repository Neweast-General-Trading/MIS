import * as XLSX from 'xlsx';

import type { BpmProcess, ActivityItem } from './storage';

const sanitizeSheetName = (name: string) =>
  name
    .replace(/[\\/?*[\]:]/g, ' ')
    .trim()
    .slice(0, 31) || 'Sub-process';

type DepartmentExportStub = { orgDepartmentName?: string | null; name?: string };

export function downloadProcessWorkbook(processItem: BpmProcess, department: DepartmentExportStub) {
  const deptLabel = department.orgDepartmentName?.trim() || department.name?.trim() || '-';
  const workbook = XLSX.utils.book_new();
  const activities = [...(processItem.activities ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const summaryRows = [
    ['PROCESS FILE'],
    ['Dept', deptLabel],
    ['Process ID', processItem.code],
    ['Process Name', processItem.processName ?? processItem.name],
    ['Process Description', processItem.processDescription ?? processItem.description ?? '-'],
    ['# Sub-processes', activities.length],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), 'Process Summary');

  activities.forEach((activity, index) => {
    const rows: Array<Array<string | number>> = [
      ['Process Description', processItem.processDescription ?? processItem.description ?? '-'],
      ['Dept', deptLabel],
      ['Process Owners', (processItem.processOwners ?? []).join(' | ') || '-'],
      ['Process ID', processItem.code],
      ['Process Name', processItem.processName ?? processItem.name],
      ['Process Description', processItem.processDescription ?? '-'],
      [],
      ['SL.No', 'Sub-process ID', 'Sub-process Name', 'Sub-process Description'],
      [activity.sln, activity.code, activity.activityName, activity.activityDescription ?? '-'],
    ];

    const detailEntries = Object.entries(activity.details ?? {});
    if (detailEntries.length) {
      rows.push([], ['Field', 'Value']);
      detailEntries.forEach(([key, value]) => {
        rows.push([key, Array.isArray(value) ? value.join(', ') : String(value ?? '-')]);
      });
    }

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      sanitizeSheetName(`${index + 1}-${activity.code}`)
    );
  });

  XLSX.writeFile(workbook, `${processItem.code}-process-file.xlsx`);
}

/** Flat export of the sub-process table — every detail column is a real Excel column. */
export function downloadActivitiesTableXlsx(
  processCode: string,
  departmentName: string,
  activities: ActivityItem[],
) {
  const detailKeys: string[] = [];
  const seen = new Set<string>();
  activities.forEach((a) => {
    Object.keys(a.details ?? {}).forEach((key) => {
      if (seen.has(key)) return;
      seen.add(key);
      detailKeys.push(key);
    });
  });
  const flatten = (value: unknown) =>
    String(value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\n+/g, ' · ');

  const data: Array<Array<string | number>> = [
    ['Department', departmentName],
    ['Process code', processCode],
    ['Sub-process rows', activities.length],
    [],
    [
      'Sub-process code',
      'Name',
      'Description',
      'Status',
      'Owners',
      'Created (ISO)',
      ...detailKeys,
    ],
    ...activities.map((a) => [
      a.code,
      a.activityName,
      a.activityDescription ?? '',
      a.status ?? '',
      (a.owners ?? []).join('; '),
      new Date(a.createdAt).toISOString(),
      ...detailKeys.map((key) => {
        const value = a.details?.[key];
        return flatten(Array.isArray(value) ? value.join(', ') : value);
      }),
    ]),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Sub-processes');
  XLSX.writeFile(wb, `${processCode}-sub-processes-table.xlsx`);
}
