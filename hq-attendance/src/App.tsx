import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PanelHead } from './components/PanelHead';
import { exportAttendance } from './excel';
import type { ApiResponse, Direction, HqAccessEvent, PresenceDay } from './types';

const API = import.meta.env.PROD
  ? 'https://misapi.neweast.cloud/api/hq-attendance'
  : '/api/hq-attendance';

const PAGE = 15;
const tooltipStyle = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(15,23,42,0.1)',
  fontSize: 12,
};

type Tab = 'overview' | 'people' | 'devices' | 'presence' | 'timeline';
type Filters = {
  from: string;
  to: string;
  q: string;
  emp: string;
  dept: string;
  building: string;
  device: string;
  dir: 'all' | Direction;
};

const emptyFilters = (): Filters => ({
  from: '',
  to: '',
  q: '',
  emp: 'all',
  dept: 'all',
  building: 'all',
  device: 'all',
  dir: 'all',
});

function unique(list: string[]) {
  return [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
function minutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function hoursBetween(a: string, b: string) {
  const d = minutes(b) - minutes(a);
  return d > 0 ? d / 60 : 0;
}
function todayISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function presenceFrom(events: HqAccessEvent[]): PresenceDay[] {
  const map = new Map<string, HqAccessEvent[]>();
  for (const e of events) {
    if (!e.accessDate) continue;
    const k = `${e.employeeId}|${e.accessDate}`;
    const arr = map.get(k) ?? [];
    arr.push(e);
    map.set(k, arr);
  }
  const out: PresenceDay[] = [];
  for (const arr of map.values()) {
    const sorted = [...arr].sort((a, b) => a.ts.localeCompare(b.ts));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    out.push({
      employeeId: first.employeeId,
      name: first.name,
      department: first.department,
      date: first.accessDate,
      weekday: first.weekday,
      first: first.accessTime,
      last: last.accessTime,
      punches: sorted.length,
      hours: hoursBetween(first.accessTime, last.accessTime),
      firstDir: first.direction,
      lastDir: last.direction,
      late: minutes(first.accessTime) > 9 * 60 + 15,
      earlyOut: minutes(last.accessTime) < 17 * 60 && sorted.length > 1,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

export default function App() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters());
  const [draft, setDraft] = useState<Filters>(emptyFilters());
  const [tab, setTab] = useState<Tab>('overview');
  const [page, setPage] = useState(0);
  const [kpiFocus, setKpiFocus] = useState<'late' | 'early' | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const res = await fetch(API, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const next = json as ApiResponse;
      setData(next);
      if (!filters.from && next.events.length) {
        const dates = next.events.map((e) => e.accessDate).filter(Boolean).sort();
        const seeded = { ...emptyFilters(), from: dates[0], to: dates[dates.length - 1] };
        setFilters(seeded);
        setDraft(seeded);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const events = data?.events ?? [];
  const people = useMemo(() => unique(events.map((e) => `${e.employeeId}||${e.name}`)), [events]);
  const depts = useMemo(() => unique(events.map((e) => e.department)), [events]);
  const buildings = useMemo(() => unique(events.map((e) => e.building)), [events]);
  const devices = useMemo(() => unique(events.map((e) => e.deviceName)), [events]);

  const filtered = useMemo(() => {
    const qq = filters.q.trim().toLowerCase();
    return events.filter((e) => {
      if (filters.from && e.accessDate && e.accessDate < filters.from) return false;
      if (filters.to && e.accessDate && e.accessDate > filters.to) return false;
      if (filters.emp !== 'all' && e.employeeId !== filters.emp) return false;
      if (filters.dept !== 'all' && e.department !== filters.dept) return false;
      if (filters.building !== 'all' && e.building !== filters.building) return false;
      if (filters.device !== 'all' && e.deviceName !== filters.device) return false;
      if (filters.dir !== 'all' && e.direction !== filters.dir) return false;
      if (qq) {
        const blob = `${e.name} ${e.employeeId} ${e.department} ${e.jobTitle} ${e.deviceName} ${e.building}`.toLowerCase();
        if (!blob.includes(qq)) return false;
      }
      return true;
    });
  }, [events, filters]);

  const daysAll = useMemo(() => presenceFrom(filtered), [filtered]);
  const days = useMemo(() => {
    if (kpiFocus === 'late') return daysAll.filter((d) => d.late);
    if (kpiFocus === 'early') return daysAll.filter((d) => d.earlyOut);
    return daysAll;
  }, [daysAll, kpiFocus]);

  const today = todayISO();
  const todayEvents = filtered.filter((e) => e.accessDate === today);
  const onSite = useMemo(() => {
    const last = new Map<string, HqAccessEvent>();
    for (const e of [...todayEvents].sort((a, b) => a.ts.localeCompare(b.ts))) last.set(e.employeeId, e);
    return [...last.values()].filter((e) => e.direction !== 'OUT');
  }, [todayEvents]);

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filtered) m.set(e.accessDate, (m.get(e.accessDate) ?? 0) + 1);
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, punches]) => ({ date, punches }));
  }, [filtered]);
  const byHour = useMemo(() => {
    return Array.from({ length: 24 }, (_, h) => ({
      hour: String(h).padStart(2, '0'),
      n: filtered.filter((e) => e.hour === h).length,
    }));
  }, [filtered]);
  const dirSlices = useMemo(() => {
    const m = { IN: 0, OUT: 0, UNKNOWN: 0 };
    for (const e of filtered) m[e.direction] += 1;
    return [
      { id: 'IN' as const, name: 'In', value: m.IN, color: '#10b981' },
      { id: 'OUT' as const, name: 'Out', value: m.OUT, color: '#60a5fa' },
      { id: 'UNKNOWN' as const, name: 'Door / room', value: m.UNKNOWN, color: '#94a3b8' },
    ].filter((s) => s.value > 0);
  }, [filtered]);
  const dirTotal = dirSlices.reduce((s, x) => s + x.value, 0) || 1;
  const byBuilding = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filtered) m.set(e.building, (m.get(e.building) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  }, [filtered]);
  const topPeople = useMemo(() => {
    const m = new Map<string, { name: string; id: string; n: number; dept: string; job: string }>();
    for (const e of filtered) {
      const cur = m.get(e.employeeId) ?? { name: e.name, id: e.employeeId, n: 0, dept: e.department, job: e.jobTitle };
      cur.n += 1;
      if (e.department && e.department !== 'Unspecified') cur.dept = e.department;
      if (e.jobTitle) cur.job = e.jobTitle;
      if (e.name && e.name !== e.employeeId) cur.name = e.name;
      m.set(e.employeeId, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [filtered]);
  const topDevices = useMemo(() => {
    const m = new Map<string, { name: string; n: number; building: string }>();
    for (const e of filtered) {
      const cur = m.get(e.deviceName) ?? { name: e.deviceName, n: 0, building: e.building };
      cur.n += 1;
      m.set(e.deviceName, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const applyFilters = () => {
    startTransition(() => {
      setFilters({ ...draft });
      setPage(0);
      setKpiFocus(null);
    });
  };
  const clearAll = () => {
    const dates = events.map((e) => e.accessDate).filter(Boolean).sort();
    const empty = { ...emptyFilters(), from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' };
    setDraft(empty);
    startTransition(() => {
      setFilters(empty);
      setPage(0);
      setKpiFocus(null);
    });
  };
  const setQuick = (patch: Partial<Filters>, focus: 'late' | 'early' | null = null) => {
    const next = { ...filters, ...patch };
    setDraft(next);
    startTransition(() => {
      setFilters(next);
      setPage(0);
      setKpiFocus(focus);
    });
  };

  const activeFilterCount = [
    draft.emp !== 'all',
    draft.dept !== 'all',
    draft.building !== 'all',
    draft.device !== 'all',
    draft.dir !== 'all',
    Boolean(draft.q.trim()),
  ].filter(Boolean).length;

  useEffect(() => setPage(0), [filters, tab, kpiFocus]);

  if (loading && !data) {
    return (
      <div className="app app-loading">
        <div className="loader-ring" />
        <p>Loading HQ access…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top-bar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="NEWEAST" />
          <div>
            <p className="eyebrow">HQ · Access control</p>
            <h1>HQ Access & Attendance</h1>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" className="btn" onClick={() => exportAttendance(filtered, days)} disabled={!filtered.length}>
            Excel Export
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void load(true)} disabled={refreshing}>
            {refreshing ? '…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}
      {(refreshing || isPending) && (
        <div className="busy-banner" role="status">
          <span className="busy-dot" />
          {refreshing ? 'Syncing from HQ access…' : 'Applying filters…'}
        </div>
      )}

      <section className="panel filters-panel">
        <PanelHead
          title={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}`}
          info="Narrow punches by date, person, department, building or door. Apply to refresh the metrics below."
          actions={
            <>
              <button type="button" className="btn btn-sm" onClick={clearAll}>
                Clear
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={applyFilters}>
                Apply
              </button>
            </>
          }
        />
        <div className="filters-grid">
          <label>
            <span className="filter-label">From</span>
            <input type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
          </label>
          <label>
            <span className="filter-label">To</span>
            <input type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
          </label>
          <label>
            <span className="filter-label">Person</span>
            <select value={draft.emp} onChange={(e) => setDraft((d) => ({ ...d, emp: e.target.value }))}>
              <option value="all">Everyone</option>
              {people.map((p) => {
                const [id, name] = p.split('||');
                return (
                  <option key={p} value={id}>
                    {name} ({id})
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            <span className="filter-label">Department</span>
            <select value={draft.dept} onChange={(e) => setDraft((d) => ({ ...d, dept: e.target.value }))}>
              <option value="all">All departments</option>
              {depts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">Building</span>
            <select value={draft.building} onChange={(e) => setDraft((d) => ({ ...d, building: e.target.value }))}>
              <option value="all">All buildings</option>
              {buildings.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">Device</span>
            <select value={draft.device} onChange={(e) => setDraft((d) => ({ ...d, device: e.target.value }))}>
              <option value="all">All devices</option>
              {devices.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">Direction</span>
            <select value={draft.dir} onChange={(e) => setDraft((d) => ({ ...d, dir: e.target.value as Filters['dir'] }))}>
              <option value="all">All</option>
              <option value="IN">In</option>
              <option value="OUT">Out</option>
              <option value="UNKNOWN">Door / room</option>
            </select>
          </label>
          <label className="span-2">
            <span className="filter-label">Search</span>
            <input
              type="search"
              placeholder="Name, employee ID, device…"
              value={draft.q}
              onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            />
          </label>
        </div>
        {data?.cachedAt && (
          <p className="meta">
            Cached {new Date(data.cachedAt).toLocaleString()} · {filtered.length} of {events.length} punches
            · department from payroll (HRM ID) when the door system only has All Departments
          </p>
        )}
      </section>

      <div className="kpi-section">
        <div className="kpi-section-head">
          <h2>Key metrics</h2>
        </div>
        <div className="kpi-strip">
          <div className="kpi-rows">
            <div className="kpi-grid">
              <button type="button" className={`kpi slate${!kpiFocus ? ' active' : ''}`} onClick={() => { setKpiFocus(null); setTab('timeline'); }}>
                <label>Punches</label>
                <strong>{filtered.length.toLocaleString()}</strong>
                <span className="kpi-foot">in current filters</span>
              </button>
              <button type="button" className="kpi blue" onClick={() => setTab('people')}>
                <label>People</label>
                <strong>{topPeople.length}</strong>
                <span className="kpi-foot">with at least one punch</span>
              </button>
              <button type="button" className="kpi green" onClick={() => setTab('overview')}>
                <label>On site today</label>
                <strong>{onSite.length}</strong>
                <span className="kpi-foot">last punch is not OUT</span>
              </button>
              <button type="button" className="kpi violet" onClick={() => setTab('devices')}>
                <label>Devices</label>
                <strong>{topDevices.length}</strong>
                <span className="kpi-foot">{buildings.length} buildings</span>
              </button>
            </div>
            <div className="kpi-grid">
              <button
                type="button"
                className={`kpi amber${kpiFocus === 'late' ? ' active' : ''}`}
                onClick={() => {
                  setKpiFocus('late');
                  setTab('presence');
                }}
              >
                <label>Late first punch</label>
                <strong>{daysAll.filter((d) => d.late).length}</strong>
                <span className="kpi-foot">after 09:15</span>
              </button>
              <button
                type="button"
                className={`kpi rose${kpiFocus === 'early' ? ' active' : ''}`}
                onClick={() => {
                  setKpiFocus('early');
                  setTab('presence');
                }}
              >
                <label>Early last punch</label>
                <strong>{daysAll.filter((d) => d.earlyOut).length}</strong>
                <span className="kpi-foot">before 17:00</span>
              </button>
              <button type="button" className="kpi cyan" onClick={() => setQuick({ building: 'Main Building' })}>
                <label>Main Building</label>
                <strong>{filtered.filter((e) => e.building === 'Main Building').length}</strong>
                <span className="kpi-foot">punches</span>
              </button>
              <button type="button" className="kpi teal" onClick={() => setQuick({ building: 'OPB' })}>
                <label>OPB</label>
                <strong>{filtered.filter((e) => e.building === 'OPB').length}</strong>
                <span className="kpi-foot">punches</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <nav className="tabs">
        {(
          [
            ['overview', 'Overview'],
            ['people', 'People'],
            ['devices', 'Devices'],
            ['presence', 'Presence'],
            ['timeline', 'Timeline'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="charts-grid">
          <div className="overview-split span-12">
            <section className="panel chart-card">
              <PanelHead title="Punch volume by day" info="Number of door punches each day in the current filter." />
              <div className="chart-body">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={byDay}>
                    <defs>
                      <linearGradient id="gPunch" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => String(v).slice(5)} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="punches" name="Punches" stroke="#60A5FA" fill="url(#gPunch)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="panel chart-card">
              <PanelHead title="Hour of day" info="When punches happen across a 24-hour clock." />
              <div className="chart-body">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={byHour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748b' }} interval={2} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="n" name="Punches" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="overview-split span-12">
            <section className="panel chart-card">
              <PanelHead title="Direction mix" info="In / Out inferred from the door name when the source field is empty." />
              <div className="insight-body">
                <div className="cycle-donut-wrap">
                  {dirSlices.length ? (
                    <>
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie data={dirSlices} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={68} outerRadius={96} paddingAngle={3} stroke="#fff" strokeWidth={2}>
                            {dirSlices.map((s) => (
                              <Cell key={s.id} fill={s.color} cursor="pointer" onClick={() => setQuick({ dir: s.id })} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="cycle-donut-center">
                        <strong>{filtered.length}</strong>
                        <span>punches</span>
                        <em>{dirSlices.length} types</em>
                      </div>
                    </>
                  ) : (
                    <p className="cycle-pie-empty muted">No punches in the current filter.</p>
                  )}
                </div>
                <ul className="outcome-list">
                  {dirSlices.map((s) => {
                    const pct = Math.round((s.value / dirTotal) * 100);
                    return (
                      <li key={s.id}>
                        <button type="button" className="outcome-row" onClick={() => setQuick({ dir: s.id })}>
                          <div className="outcome-row-top">
                            <span className="outcome-row-label">
                              <span className="outcome-dot" style={{ background: s.color }} />
                              <span>
                                <strong>{s.name}</strong>
                                <em>{s.value} punches</em>
                              </span>
                            </span>
                            <span className="outcome-row-pct" style={{ color: s.color }}>
                              {pct}%
                            </span>
                          </div>
                          <div className="outcome-row-bar" aria-hidden="true">
                            <span style={{ width: `${pct}%`, background: s.color }} />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
            <section className="panel chart-card">
              <PanelHead title="Building activity" info="Click a row to filter the dashboard to that building." />
              <div className="chart-body">
                <ul className="cycle-stage-list">
                  {byBuilding.map((b, i) => {
                    const max = byBuilding[0]?.n || 1;
                    const pct = Math.round((b.n / max) * 100);
                    const color = i === 0 ? '#60a5fa' : '#10b981';
                    return (
                      <li key={b.name}>
                        <button type="button" className="cycle-stage-row" onClick={() => setQuick({ building: b.name })}>
                          <span className="cycle-stage-dot" style={{ background: color }} />
                          <span className="cycle-stage-text">
                            <span className="cycle-stage-name">{b.name}</span>
                            <span className="cycle-stage-phase">building</span>
                          </span>
                          <span className="cycle-stage-bar" aria-hidden="true">
                            <span className="cycle-stage-bar-fill" style={{ width: `${pct}%`, background: color }} />
                          </span>
                          <span className="cycle-stage-days">{b.n}</span>
                          <span className="cycle-stage-pct">{pct}%</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === 'people' && (
        <section className="panel details-panel">
          <PanelHead title="People" info="Click a row to see that person’s punches." />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Employee ID</th>
                  <th>Department</th>
                  <th>Job title</th>
                  <th>Punches</th>
                </tr>
              </thead>
              <tbody>
                {topPeople.map((p) => (
                  <tr
                    key={p.id}
                    className={filters.emp === p.id ? 'selected' : ''}
                    onClick={() => {
                      setQuick({ emp: p.id });
                      setTab('timeline');
                    }}
                  >
                    <td>{p.name}</td>
                    <td className="mono">{p.id}</td>
                    <td>{p.dept}</td>
                    <td>{p.job || '—'}</td>
                    <td>{p.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'devices' && (
        <section className="panel details-panel">
          <PanelHead title="Doors & readers" info="Click a row to filter punches to that device." />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Building</th>
                  <th>Punches</th>
                </tr>
              </thead>
              <tbody>
                {topDevices.map((d) => (
                  <tr
                    key={d.name}
                    className={filters.device === d.name ? 'selected' : ''}
                    onClick={() => {
                      setQuick({ device: d.name });
                      setTab('timeline');
                    }}
                  >
                    <td>{d.name}</td>
                    <td>
                      <span className="pill">{d.building}</span>
                    </td>
                    <td>{d.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'presence' && (
        <section className="panel details-panel">
          <PanelHead
            title="Daily presence"
            info="First and last punch that day. Hours are the span between them. Late = first punch after 09:15."
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>First</th>
                  <th>Last</th>
                  <th>Punches</th>
                  <th>Hours</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {days.slice(0, 80).map((d) => (
                  <tr
                    key={`${d.employeeId}-${d.date}`}
                    onClick={() => {
                      setQuick({ emp: d.employeeId, from: d.date, to: d.date });
                      setTab('timeline');
                    }}
                  >
                    <td>{d.date}</td>
                    <td>
                      {d.name}
                      <div className="muted">{d.employeeId}</div>
                    </td>
                    <td>{d.department}</td>
                    <td className="mono">{d.first}</td>
                    <td className="mono">{d.last}</td>
                    <td>{d.punches}</td>
                    <td>{d.hours.toFixed(1)}</td>
                    <td>
                      {d.late && <span className="pill amber">Late</span>}{' '}
                      {d.earlyOut && <span className="pill">Early</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'timeline' && (
        <section className="panel details-panel">
          <PanelHead title="Punch timeline" info="Raw HQ access events for the current filters." />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Device</th>
                  <th>Building</th>
                  <th>Direction</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((e, i) => (
                  <tr
                    key={`${e.ts}-${e.employeeId}-${i}`}
                    onClick={() => setQuick({ emp: e.employeeId })}
                  >
                    <td>{e.accessDate}</td>
                    <td className="mono">{e.accessTime}</td>
                    <td>
                      {e.name}
                      <div className="muted">{e.employeeId}</div>
                    </td>
                    <td>{e.department}</td>
                    <td>{e.deviceName}</td>
                    <td>
                      <span className="pill">{e.building}</span>
                    </td>
                    <td>
                      <span className={`pill ${e.direction === 'IN' ? 'green' : e.direction === 'OUT' ? 'isuzu' : ''}`}>
                        {e.direction}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Prev
            </button>
            <span>
              Page {page + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
