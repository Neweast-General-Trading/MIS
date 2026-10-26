import type { ReactNode } from 'react';

export type MobileTab = 'home' | 'analysis' | 'data';

type Props = {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  onOpenFilters: () => void;
  filterCount: number;
};

function NavIcon({ children }: { children: ReactNode }) {
  return <span className="mobile-nav-icon" aria-hidden>{children}</span>;
}

export function MobileBottomNav({ activeTab, onTabChange, onOpenFilters, filterCount }: Props) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Dashboard navigation">
      <button
        type="button"
        className={`mobile-nav-item${activeTab === 'home' ? ' active' : ''}`}
        onClick={() => onTabChange('home')}
      >
        <NavIcon>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z" />
          </svg>
        </NavIcon>
        <span>Home</span>
      </button>
      <button
        type="button"
        className={`mobile-nav-item${activeTab === 'analysis' ? ' active' : ''}`}
        onClick={() => onTabChange('analysis')}
      >
        <NavIcon>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19V5M10 19V9M16 19V13M22 19V3" />
          </svg>
        </NavIcon>
        <span>Analysis</span>
      </button>
      <button
        type="button"
        className={`mobile-nav-item${activeTab === 'data' ? ' active' : ''}`}
        onClick={() => onTabChange('data')}
      >
        <NavIcon>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 4v16" />
          </svg>
        </NavIcon>
        <span>Data</span>
      </button>
      <button type="button" className="mobile-nav-item mobile-nav-filter" onClick={onOpenFilters}>
        <NavIcon>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          {filterCount > 0 && <span className="mobile-nav-badge">{filterCount}</span>}
        </NavIcon>
        <span>Filters</span>
      </button>
    </nav>
  );
}
