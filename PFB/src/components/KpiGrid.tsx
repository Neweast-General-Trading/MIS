import type { KpiCard, KpiDrilldownId } from '../types';

const ICONS: Record<string, string> = {
  orders: '📋',
  customers: '👥',
  'so-amount': '💰',
  'inv-amount': '🧾',
  deliveries: '🚚',
  conversion: '📈',
  'dn-amount': '📦',
  invoices: '✅',
};

const TONE_CLASS: Record<KpiCard['tone'], string> = {
  blue: 'blue',
  green: 'green',
  amber: 'amber',
  teal: 'teal',
  red: 'red',
  indigo: 'indigo',
};

type Props = {
  kpis: KpiCard[];
  onKpiClick: (id: KpiDrilldownId) => void;
};

export function KpiGrid({ kpis, onKpiClick }: Props) {
  return (
    <section className="kpi-section kpi-section-clean">
      <header className="kpi-section-head">
        <h2>Key metrics</h2>
        <p>Click any card to open its detail tables</p>
      </header>
      <div className="kpi-grid kpi-grid-clickable">
        {kpis.map((kpi) => (
          <button
            key={kpi.id}
            type="button"
            className={`kpi-card-v2 kpi-card-btn ${TONE_CLASS[kpi.tone]}`}
            onClick={() => onKpiClick(kpi.id as KpiDrilldownId)}
            title={kpi.hint}
          >
            <div className="kpi-card-top">
              <span className="kpi-icon" aria-hidden>
                {ICONS[kpi.id] ?? '◆'}
              </span>
              <span className="kpi-title">{kpi.label}</span>
            </div>
            <strong className="kpi-value">{kpi.value}</strong>
            <span className="kpi-tap-hint">View details →</span>
          </button>
        ))}
      </div>
    </section>
  );
}
