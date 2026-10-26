import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { AuditEvent, AuditListResponse, ModuleCardItem, ModulesCatalog } from './types';
import { actorDisplay, shortWhen } from './types';
import './index.css';

const API =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.PROD ? 'https://misapi.neweast.cloud/api/audit-log' : '/api/audit-log');

const PAGE_SIZE = 20;

type View = 'hub' | 'module' | 'event';

const DATA_CODE_INFO =
  'Data = last end-user business action (open, update, delete…). Code = last development/deploy/config change.';

const EMPLOYEE_INFO =
  'Employee is the person who performed the action (name from hub login, or email when available).';

function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" title={text} tabIndex={0} aria-label={text}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <path d="M12 10.5v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="12" cy="7.5" r="1" fill="currentColor" />
      </svg>
    </span>
  );
}

function fmtParts(iso: string | null) {
  if (!iso) return { day: '—', time: '' };
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-GB', {
      timeZone: 'Asia/Dubai',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Dubai',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function TimeCell({
  iso,
  kind,
  latest,
}: {
  iso: string | null;
  kind: 'data' | 'code';
  latest: string | null;
}) {
  const parts = fmtParts(iso);
  const classes = [
    'module-time',
    `module-time--${kind}`,
    latest === kind ? 'is-latest' : '',
    !iso ? 'is-empty' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      <span className="module-time-k">{kind === 'data' ? 'Data' : 'Code'}</span>
      <strong>{parts.day}</strong>
      <em>{parts.time}</em>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>('hub');
  const [moduleId, setModuleId] = useState('');
  const [eventId, setEventId] = useState('');
  const [catalog, setCatalog] = useState<ModulesCatalog | null>(null);
  const [events, setEvents] = useState<AuditListResponse | null>(null);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [actor, setActor] = useState('');
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const selectedModule: ModuleCardItem | undefined = useMemo(
    () => catalog?.items.find((m) => m.id === moduleId),
    [catalog, moduleId],
  );

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/modules`);
      const json = (await res.json()) as ModulesCatalog & { error?: string };
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setCatalog(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    if (!moduleId) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL(API, window.location.origin);
      url.searchParams.set('module', moduleId);
      url.searchParams.set('limit', String(PAGE_SIZE));
      url.searchParams.set('offset', String(page * PAGE_SIZE));
      if (actor.trim()) url.searchParams.set('actor', actor.trim());
      if (q.trim()) url.searchParams.set('q', q.trim());
      if (dateFrom) url.searchParams.set('from', new Date(dateFrom).toISOString());
      if (dateTo) url.searchParams.set('to', new Date(dateTo).toISOString());
      const res = await fetch(url.toString());
      const json = (await res.json()) as AuditListResponse;
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setEvents(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [moduleId, page, actor, q, dateFrom, dateTo]);

  useEffect(() => {
    if (view === 'hub') void loadCatalog();
  }, [view, loadCatalog]);

  useEffect(() => {
    if (view === 'module') void loadEvents();
  }, [view, loadEvents]);

  useEffect(() => {
    if (view !== 'event' || !eventId) return;
    setLoading(true);
    void fetch(`${API}/${encodeURIComponent(eventId)}`)
      .then(async (res) => {
        const json = (await res.json()) as AuditEvent & { error?: string };
        if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
        setSelected(json);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [view, eventId]);

  function openModule(id: string) {
    setModuleId(id);
    setPage(0);
    setActor('');
    setQ('');
    setDateFrom('');
    setDateTo('');
    setSelected(null);
    setView('module');
  }

  function openEvent(ev: AuditEvent) {
    setEventId(ev.id);
    setSelected(ev);
    setView('event');
  }

  const pageCount = Math.max(1, Math.ceil((events?.total ?? 0) / PAGE_SIZE));
  const liveModules = catalog?.items.filter((m) => m.events > 0).length ?? 0;

  return (
    <div className="app">
      <div className="hub-bg" aria-hidden />

      <header className="hub-header">
        <div className="hub-header-bar">
          <a href="/audit-log/" className="brand-link" onClick={(e) => {
            e.preventDefault();
            setView('hub');
          }}>
            <img src="/logo.png" alt="NEWEAST" className="hub-logo" />
          </a>
          <span className="hub-portal-pill">MIS Audit Portal</span>
        </div>
        <div className="hub-header-hero">
          <div className="hub-header-pattern" aria-hidden />
          <p className="hub-kicker">Application change ledger</p>
          <h1 className="hub-title">
            Audit <span className="hub-title-accent">Log</span>
          </h1>
          <p className="hub-lede">
            Read-only view of who changed what, in which module, and when.
          </p>
          {catalog ? (
            <div className="hub-meta">
              <span className="hub-meta-item hub-meta-item--live">{catalog.items.length} modules</span>
              <span className="hub-meta-item">{catalog.total_events.toLocaleString()} events</span>
              <span className="hub-meta-item">{catalog.actors} employees</span>
            </div>
          ) : null}
        </div>
      </header>

      {error ? <div className="banner-error">{error}</div> : null}

      {view === 'hub' ? (
        <>
          <section className="kpi-grid">
            <article className="kpi-card">
              <span>Events</span>
              <b>{(catalog?.total_events ?? 0).toLocaleString()}</b>
            </article>
            <article className="kpi-card">
              <span>
                Employees <InfoTip text={EMPLOYEE_INFO} />
              </span>
              <b>{catalog?.actors ?? 0}</b>
            </article>
            <article className="kpi-card">
              <span>Active modules</span>
              <b>{liveModules}</b>
            </article>
            <article className="kpi-card">
              <span>All modules</span>
              <b>{catalog?.items.length ?? 0}</b>
            </article>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <h2 className="section-title">
                  Modules <InfoTip text={DATA_CODE_INFO} />
                </h2>
                <p className="section-sub">
                  Data = last recorded action. Code = last programming change. Click a card to open its
                  log.
                </p>
              </div>
              <button type="button" className="btn" onClick={() => void loadCatalog()} disabled={loading}>
                Refresh
              </button>
            </div>

            {loading && !catalog ? (
              <div className="empty">Loading modules…</div>
            ) : (
              <div className="module-grid">
                {(catalog?.items ?? []).map((m) => {
                  const live = m.events > 0;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`module-card${live ? ' is-live' : ' nosource'}`}
                      style={
                        {
                          '--card-accent': m.accent,
                          '--card-accent-soft': m.accentSoft,
                        } as CSSProperties
                      }
                      onClick={() => openModule(m.id)}
                    >
                      <div className="module-card-top" />
                      <div className="module-card-body">
                        <div className="module-card-head">
                          <span className="module-badge">{m.tag}</span>
                          <span className={`module-events${live ? ' has-actions' : ''}`}>
                            {live ? `${m.events.toLocaleString()} actions` : 'No actions'}
                          </span>
                        </div>
                        <h3 className="module-title">{m.name || m.title}</h3>
                        <p className="module-desc">{m.description}</p>
                        <div className="module-times" title={DATA_CODE_INFO}>
                          <TimeCell iso={m.ltc_data} kind="data" latest={m.ltc_kind} />
                          <TimeCell iso={m.ltc_code} kind="code" latest={m.ltc_kind} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}

      {view === 'module' ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <button type="button" className="back-link" onClick={() => setView('hub')}>
                ← All modules
              </button>
              <h2 className="section-title">{selectedModule?.name || moduleId}</h2>
              <p className="section-sub">
                Simple log for this module. Employee shows who performed each action.
              </p>
            </div>
          </div>

          <div className="filters">
            <label>
              From
              <input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <label>
              Employee <InfoTip text={EMPLOYEE_INFO} />
              <input
                type="search"
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                placeholder="Name or email"
              />
            </label>
            <label className="grow">
              Search
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Action, entity, summary"
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setPage(0);
                void loadEvents();
              }}
            >
              Apply
            </button>
          </div>

          <div className="board board-full">
            <div className="list-wrap">
              {loading && !events ? (
                <div className="empty">Loading log…</div>
              ) : (
                <>
                  <table className="grid">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>
                          Employee <InfoTip text={EMPLOYEE_INFO} />
                        </th>
                        <th>What changed</th>
                        <th>Affected</th>
                        <th>
                          Kind <InfoTip text={DATA_CODE_INFO} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {!events?.events.length ? (
                        <tr>
                          <td colSpan={5} className="empty">
                            No events in this window for this module.
                          </td>
                        </tr>
                      ) : (
                        events.events.map((ev) => {
                          const who = actorDisplay(ev);
                          const affected =
                            ev.targetType || ev.targetId
                              ? `${ev.targetType ?? ''}${ev.targetType && ev.targetId ? ' · ' : ''}${ev.targetId ?? ''}`
                              : '—';
                          return (
                            <tr key={ev.id} onClick={() => openEvent(ev)}>
                              <td>{shortWhen(ev.at)}</td>
                              <td className="who">
                                {who.name}
                                {who.sub ? <small>{who.sub}</small> : null}
                              </td>
                              <td>{ev.summary}</td>
                              <td>{affected}</td>
                              <td>
                                <span className={`kind-pill kind-pill--${ev.kind}`}>{ev.kind}</span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  <div className="pager">
                    <button
                      type="button"
                      className="btn"
                      disabled={page <= 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      Previous
                    </button>
                    <span>
                      {page + 1} / {pageCount} · {(events?.total ?? 0).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      className="btn"
                      disabled={page + 1 >= pageCount}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {view === 'event' && selected ? (
        <section className="panel">
          <button type="button" className="back-link" onClick={() => setView('module')}>
            ← Back to module
          </button>
          <div className="event-page">
            <h2>{selected.summary}</h2>
            <p className="muted">{shortWhen(selected.at)}</p>
            <dl className="kv">
              <dt>Module</dt>
              <dd>{selected.module}</dd>
              <dt>
                Employee <InfoTip text={EMPLOYEE_INFO} />
              </dt>
              <dd>
                <strong>{actorDisplay(selected).name}</strong>
                <div className="muted">
                  {[selected.actorEmail || (typeof selected.meta?.actorEmail === 'string' ? selected.meta.actorEmail : ''), selected.actorRole]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </div>
              </dd>
              <dt>Action</dt>
              <dd>{selected.action}</dd>
              <dt>
                Kind <InfoTip text={DATA_CODE_INFO} />
              </dt>
              <dd>
                <span className={`kind-pill kind-pill--${selected.kind}`}>{selected.kind}</span>
                <div className="muted">{selected.classificationReason}</div>
              </dd>
              <dt>Affected</dt>
              <dd>
                {selected.targetType || selected.targetId
                  ? `${selected.targetType ?? ''} · ${selected.targetId ?? ''}`.replace(/^ · | · $/g, '')
                  : '—'}
              </dd>
            </dl>
            {selected.before != null || selected.after != null || selected.meta ? (
              <>
                <h3>Details</h3>
                <pre>
                  {JSON.stringify(
                    {
                      before: selected.before,
                      after: selected.after,
                      meta: selected.meta,
                    },
                    null,
                    2,
                  )}
                </pre>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      <footer className="hub-footer">NEWEAST · Management Information Systems · read-only audit</footer>
    </div>
  );
}
