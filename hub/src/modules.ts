export type AnalysisModule = {
  id: string;
  /** Tag shown top-right opposite the icon */
  cornerTag: string;
  title: string;
  description: string;
  href: string;
  accent: string;
  accentSoft: string;
};

export const ANALYSIS_MODULES: AnalysisModule[] = [
  {
    id: 'work-load',
    cornerTag: 'MIS',
    title: 'Work Load Analysis',
    description: 'Document activity and workload analytics across all companies and databases.',
    href: '/WorkLoadAnalysis/',
    accent: '#C8102E',
    accentSoft: '#FEF2F2',
  },
  {
    id: 'attendance-discrepancy',
    cornerTag: 'MIS · HR',
    title: 'Attendance Discrepancy',
    description: 'Payroll attendance discrepancies across UAE, Oman, KSA and Bahrain — SP_AttDiscrepancy.',
    href: '/AttendanceDiscrepancy/',
    accent: '#0D9488',
    accentSoft: '#F0FDFA',
  },
  {
    id: 'hq-attendance',
    cornerTag: 'HQ · Access',
    title: 'HQ Access & Attendance',
    description: 'HQ door punches, who is on site, devices and daily presence from HCP_Access.',
    href: '/hq-attendance/',
    accent: '#0F766E',
    accentSoft: '#F0FDFA',
  },
  {
    id: 'eorder-analysis',
    cornerTag: 'MIS · eOrder',
    title: 'eOrder Analysis',
    description: 'Sales order summary, combined sales, and price comparison from SAP HANA BI_EOA procedures.',
    href: '/PFB/',
    accent: '#2563EB',
    accentSoft: '#EFF6FF',
  },
  {
    id: 'vehicle-sales-track',
    cornerTag: 'KSA · ISUZU',
    title: 'Vehicle Sales Track',
    description: 'KSA vehicle stock, YTD sales, aging, list prices and inbound ETA — BI_VEHICLESALESTRACK.',
    href: '/ksa/vehicle-sales/',
    accent: '#E60012',
    accentSoft: '#FFF0F0',
  },
  {
    id: 'ksa-intercompany',
    cornerTag: 'KSA · ISUZU / Parts',
    title: 'Intercompany Tracking',
    description: 'KSA intercompany pipeline from invoice to GRPO — ISUZU & Parts.',
    href: '/ksa/intercompany/',
    accent: '#2563EB',
    accentSoft: '#EFF6FF',
  },
  {
    id: 'ne02-approval',
    cornerTag: 'Sales · NE02',
    title: 'NE02 Approval Requirements',
    description: 'Brand performance, financial status, SQ item evaluation, backorders, and aged allocated stock.',
    href: '/ne02-approval/',
    accent: '#5B8DEF',
    accentSoft: '#EEF4FF',
  },
  {
    id: 'audit-log',
    cornerTag: 'MIS · Control',
    title: 'Audit Log',
    description: 'Unified trail for all MIS modules — classifies Data (end user) vs Code (development) with full details.',
    href: '/audit-log/',
    accent: '#4AA8B8',
    accentSoft: '#EAF7FA',
  },
  {
    id: 'delivery-tracking',
    cornerTag: 'Warehouse · FZCO',
    title: 'Delivery Tracking',
    description: 'Delivery notes, dispatch and POD tracking for FZCO — BI_DTS_10001.',
    href: '/warehouse/dts/',
    accent: '#4B6B82',
    accentSoft: '#EEF3F6',
  },
  {
    id: 'sales-spare-parts',
    cornerTag: 'Sales Insights',
    title: 'KSA - SP',
    description: 'KSA spare parts sales performance, regions, and salesperson insights.',
    href: 'https://intranet.neweast.cloud/sales-dashboard',
    accent: '#1A1A1A',
    accentSoft: '#F5F5F5',
  },
  {
    id: 'sales-isuzu',
    cornerTag: 'Sales Insights',
    title: 'KSA - ISUZU',
    description: 'ISUZU sales orders, yearly trends, and detailed order breakdowns.',
    href: 'https://intranet.neweast.cloud/sales-dashboard/isuzu-sales',
    accent: '#E60012',
    accentSoft: '#FFF0F0',
  },
];
