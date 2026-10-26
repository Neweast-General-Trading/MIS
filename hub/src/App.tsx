import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ANALYSIS_MODULES, type AnalysisModule } from './modules';

/** SHA-256 hashes — never store/display plaintext passwords. */
const GATE_HASH_DEFAULT =
  '5a6b6a96af08f239f50cd948f0e0fb61af77035c64b865291268a1bbdc386fc6'; // logmein@2026
const GATE_HASH_NE02 =
  'b8465e1ab5ed0a972ece15038bbd8f8bcafdc46120398c5baa2da506b4ac75df'; // IT@mis@2026

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function gateHashFor(moduleId: string): string {
  return moduleId === 'ne02-approval' ? GATE_HASH_NE02 : GATE_HASH_DEFAULT;
}

const AUDIT_INGEST =
  import.meta.env.VITE_AUDIT_INGEST ?? 'https://mis.neweast.cloud/audit-log/api/ingest';

/** Map hub cards → application_log catalog ids (sources.yaml). */
function auditApplicationId(module: AnalysisModule): string | null {
  const map: Record<string, string> = {
    'work-load': 'work_load',
    'attendance-discrepancy': 'attendance_discrepancy',
    'eorder-analysis': 'eorder_analysis',
    'ksa-intercompany': 'ksa_intercompany',
    'ne02-approval': 'ne02_approval',
    'delivery-tracking': 'delivery_tracking_mis',
    'sales-spare-parts': 'sales_spare_parts',
    'sales-isuzu': 'sales_isuzu',
  };
  return map[module.id] ?? null;
}

function openModule(href: string) {
  const url = href.startsWith('http') ? href : `${window.location.origin}${href}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Fire-and-forget module open into Audit Log (employee names come from each app's own trail). */
function logModuleOpen(module: AnalysisModule) {
  const applicationId = auditApplicationId(module);
  if (!applicationId) return;
  void fetch(AUDIT_INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      application_id: applicationId,
      action: 'access',
      category: 'access',
      actor_name: 'MIS portal',
      summary: `Opened ${module.title} from MIS hub`,
      entity_type: 'module',
      entity_id: module.href,
      impact: module.title,
      details: { source: 'mis-hub', cornerTag: module.cornerTag },
    }),
  }).catch(() => {
    /* never block open */
  });
}

function ModuleGateModal({
  moduleId,
  moduleTitle,
  onCancel,
  onSuccess,
}: {
  moduleId: string;
  moduleTitle: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const pwdId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const expectedHash = gateHashFor(moduleId);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const hash = await sha256Hex(value);
      if (hash === expectedHash) {
        onSuccess();
        return;
      }
      setError(true);
      setValue('');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate-overlay" role="presentation" onClick={onCancel}>
      <div
        className="gate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="gate-title" className="gate-title">
          Access required
        </h2>
        <p className="gate-sub">Enter the MIS password to open {moduleTitle}.</p>
        <form className="gate-form" onSubmit={handleSubmit}>
          <label className="gate-label" htmlFor={pwdId}>
            Password
          </label>
          <input
            id={pwdId}
            ref={inputRef}
            className={`gate-input${error ? ' is-error' : ''}`}
            type="password"
            autoComplete="current-password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(false);
            }}
            disabled={busy}
          />
          {error ? <p className="gate-error">Incorrect password. Try again.</p> : null}
          <div className="gate-actions">
            <button type="button" className="gate-btn gate-btn--ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="gate-btn gate-btn--primary" disabled={busy || !value}>
              {busy ? 'Checking…' : 'Open module'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModuleIcon({ id, color }: { id: string; color: string }) {
  if (id === 'work-load') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" aria-hidden>
        <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
        <path d="M5 5.5v6c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5v-6" />
        <path d="M5 11.5v6c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5v-6" />
      </svg>
    );
  }
  if (id === 'attendance-discrepancy') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
        <path d="M8 17h8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'audit-log' || id === 'audit-trail') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" aria-hidden>
        <path d="M8 7h8M8 12h8M8 17h5" />
        <rect x="4" y="3" width="16" height="18" rx="2.5" />
      </svg>
    );
  }
  if (id === 'ne02-approval') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" aria-hidden>
        <path d="M9 11l2 2 4-4" />
        <rect x="4" y="3" width="16" height="18" rx="2.5" />
        <path d="M8 7h8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'delivery-tracking') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" aria-hidden>
        <path d="M3 17h11" />
        <path d="M14 17l2.2 3H20l-2.4-5.2" />
        <rect x="2" y="7" width="12" height="7" rx="1.4" />
        <path d="M6 7V5.6A1.6 1.6 0 017.6 4h2.8A1.6 1.6 0 0112 5.6V7" />
        <circle cx="7" cy="17" r="1.4" />
        <circle cx="17.5" cy="17" r="1.4" />
      </svg>
    );
  }
  if (id === 'sales-spare-parts') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" aria-hidden>
        <path d="M21 8.5l-9-5-9 5 9 5 9-5z" />
        <path d="M3 8.5v7l9 5 9-5v-7" />
        <path d="M12 13.5v7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" aria-hidden>
      <path d="M3 17h13" />
      <path d="M16 17l2 3h3l-2.5-5.5" />
      <rect x="2" y="7" width="14" height="7" rx="1.5" />
      <path d="M6 7V5.5A1.5 1.5 0 017.5 4h3A1.5 1.5 0 0112 5.5V7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ModuleCard({
  module,
  onRequestOpen,
}: {
  module: AnalysisModule;
  onRequestOpen: (module: AnalysisModule) => void;
}) {
  return (
    <button
      type="button"
      className="module-card"
      onClick={() => onRequestOpen(module)}
      style={{ '--card-accent': module.accent, '--card-accent-soft': module.accentSoft } as CSSProperties}
    >
      <div className="module-card-top" />
      <div className="module-card-body">
        <div className="module-card-head">
          <div className="module-icon-wrap">
            <ModuleIcon id={module.id} color={module.accent} />
          </div>
          <span className="module-badge">{module.cornerTag}</span>
        </div>
        <div className="module-card-text">
          <h2 className="module-title">{module.title}</h2>
          <p className="module-desc">{module.description}</p>
        </div>
        <div className="module-card-foot">
          <span>Open dashboard</span>
          <ChevronIcon />
        </div>
      </div>
    </button>
  );
}

export default function App() {
  const [pending, setPending] = useState<AnalysisModule | null>(null);

  return (
    <div className="hub">
      <div className="hub-bg" aria-hidden />
      {pending ? (
        <ModuleGateModal
          moduleId={pending.id}
          moduleTitle={pending.title}
          onCancel={() => setPending(null)}
          onSuccess={() => {
            const mod = pending;
            setPending(null);
            logModuleOpen(mod);
            openModule(mod.href);
          }}
        />
      ) : null}
      <header className="hub-header">
        <div className="hub-header-bar">
          <img src="/logo.png" alt="NEWEAST" className="hub-logo" />
          <span className="hub-portal-pill">MIS Analytics Portal</span>
        </div>

        <div className="hub-header-hero">
          <div className="hub-header-pattern" aria-hidden />
          <div className="hub-header-glow hub-header-glow--blue" aria-hidden />
          <div className="hub-header-glow hub-header-glow--violet" aria-hidden />

          <div className="hub-header-body">
            <div className="hub-header-copy">
              <p className="hub-kicker">Business intelligence hub</p>
              <h1 className="hub-title">
                Group <span className="hub-title-accent">Analysis</span>
              </h1>
              <div className="hub-meta">
                <span className="hub-meta-item hub-meta-item--live">
                  {ANALYSIS_MODULES.length} live modules
                </span>
                <span className="hub-meta-item">{ANALYSIS_MODULES.length} dashboards</span>
                <span className="hub-meta-item hub-meta-item--hana">SAP HANA</span>
                <span className="hub-meta-item">SQL Server</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="hub-section" aria-label="Available analysis modules">
        <div className="section-heading">
          <div className="section-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              <path d="M8 7h8M8 11h8M8 15h5" />
            </svg>
          </div>
          <div>
            <h2 className="section-title">Available analyses</h2>
            <p className="section-sub">{ANALYSIS_MODULES.length} modules currently live</p>
          </div>
        </div>

        <div className="module-grid">
          {ANALYSIS_MODULES.map((module) => (
            <ModuleCard key={module.id} module={module} onRequestOpen={setPending} />
          ))}
        </div>
      </section>

      <footer className="hub-footer">
        <span>NEWEAST · Management Information Systems</span>
      </footer>
    </div>
  );
}
