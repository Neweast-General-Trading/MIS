export const APPLICATION_CATEGORIES = [
  'ERP',
  'CRM',
  'Finance & Accounting',
  'HR & Payroll',
  'Supply Chain & Warehouse',
  'Sales & E-commerce',
  'BI & Reporting',
  'Collaboration',
  'Document Management',
  'IT & Security',
  'Other',
] as const;

export const APPLICATION_HOSTING = ['Cloud', 'On-premise', 'Hybrid'] as const;
export const APPLICATION_STATUSES = ['Active', 'Planned', 'Retired'] as const;

export type ApplicationCategory = (typeof APPLICATION_CATEGORIES)[number];
export type ApplicationHosting = (typeof APPLICATION_HOSTING)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
