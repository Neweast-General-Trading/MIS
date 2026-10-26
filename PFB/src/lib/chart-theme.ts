export const CHART_COLORS = [
  '#2563eb',
  '#0d9488',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#ef4444',
  '#84cc16',
  '#6366f1',
  '#14b8a6',
];

export const tooltipStyle = {
  background: 'rgba(255,255,255,0.98)',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  boxShadow: '0 12px 32px rgba(15,23,42,0.12)',
  fontSize: 12,
  padding: '10px 12px',
};

export function conversionColor(rate: number): string {
  if (rate >= 85) return '#16a34a';
  if (rate >= 60) return '#2563eb';
  if (rate >= 40) return '#d97706';
  return '#dc2626';
}
