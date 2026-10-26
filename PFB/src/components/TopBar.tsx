type Props = {
  subtitle: string;
  cachedAt?: string;
  loading: boolean;
  onRefresh: () => void;
  onExport: () => void;
  canExport: boolean;
  onToggleAi: () => void;
  aiOpen: boolean;
};

export function TopBar({
  subtitle,
  cachedAt,
  loading,
  onRefresh,
  onExport,
  canExport,
  onToggleAi,
  aiOpen,
}: Props) {
  return (
    <header className="top-bar">
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="NEWEAST" />
        <div>
          <h1>eOrder Analysis</h1>
          <span className="viewer-badge">{subtitle}</span>
        </div>
      </div>
      <div className="header-actions">
        {cachedAt && (
          <span className="cache-badge">Updated {new Date(cachedAt).toLocaleString()}</span>
        )}
        <a href="/" className="btn" target="_blank" rel="noopener noreferrer">
          Group Analysis
        </a>
        <button type="button" className={`btn ${aiOpen ? 'btn-primary' : ''}`} onClick={onToggleAi}>
          {aiOpen ? 'Hide assistant' : 'Smart assistant'}
        </button>
        <button type="button" className="btn" onClick={onExport} disabled={!canExport}>
          Export Excel
        </button>
        <button type="button" className="btn btn-primary" onClick={onRefresh} disabled={loading}>
          {loading ? 'Loading…' : 'Analyze'}
        </button>
      </div>
    </header>
  );
}
