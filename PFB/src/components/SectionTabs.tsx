export type DashboardSection = 'overview' | 'analytics' | 'details';

type Props = {
  active: DashboardSection;
  onChange: (section: DashboardSection) => void;
};

const TABS: { id: DashboardSection; label: string; desc: string }[] = [
  { id: 'overview', label: 'Overview', desc: 'KPIs & highlights' },
  { id: 'analytics', label: 'Analytics', desc: 'Charts & trends' },
  { id: 'details', label: 'Details', desc: 'Full table' },
];

export function SectionTabs({ active, onChange }: Props) {
  return (
    <nav className="section-tabs" aria-label="Dashboard sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`section-tab ${active === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="section-tab-label">{tab.label}</span>
          <span className="section-tab-desc">{tab.desc}</span>
        </button>
      ))}
    </nav>
  );
}
