import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { exportFullWorkbook } from './export';
import type { ApiResponse, VehicleSalesRow } from './types';

const API = import.meta.env.PROD
  ? 'https://misapi.neweast.cloud/api/vehicle-sales-track'
  : '/api/vehicle-sales-track';

const tipStyle = {
  background: '#0f172a',
  border: 'none',
  borderRadius: 10,
  color: '#fff',
  fontSize: 12,
  padding: '8px 10px',
};

const STOCK_OPTIONS = [
  { id: 'all', label: 'All stock' },
  { id: 'in', label: 'In stock' },
  { id: 'out', label: 'Out of stock' },
  { id: 'avail', label: 'Available to release' },
  { id: 'pipe', label: 'PO or SD inbound' },
] as const;

const AGE_OPTIONS = [
  { id: 'all', label: 'All ages' },
  { id: 'd030', label: 'Aged 0–30' },
  { id: 'd3160', label: 'Aged 31–60' },
  { id: 'd6190', label: 'Aged 61–90' },
  { id: 'd91120', label: 'Aged 91–120' },
  { id: 'd121', label: 'Aged 121+' },
] as const;

type StockId = (typeof STOCK_OPTIONS)[number]['id'];
type AgeId = (typeof AGE_OPTIONS)[number]['id'];
type SortKey = keyof VehicleSalesRow;

function money(n: number) {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'K';
  return s + a.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function qty(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function sar(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' SAR';
}
function shortBrand(brand: string) {
  return brand
    .replace(/^ISUZU\s+/i, '')
    .replace('VEHICLE', 'Vehicle')
    .replace('Unspecified', 'Other');
}
function matchesStock(r: VehicleSalesRow, stock: StockId) {
  if (stock === 'in') return r.inStock > 0;
  if (stock === 'out') return r.inStock <= 0;
  if (stock === 'avail') return r.available > 0;
  if (stock === 'pipe') return r.poQty > 0 || r.sdQty > 0;
  return true;
}
function matchesAge(r: VehicleSalesRow, age: AgeId) {
  if (age === 'd030') return r.aged030 > 0;
  if (age === 'd3160') return r.aged3160 > 0;
  if (age === 'd6190') return r.aged6190 > 0;
  if (age === 'd91120') return r.aged91120 > 0;
  if (age === 'd121') return r.aged121 > 0;
  return true;
}

const TABLE_COLS: [SortKey, string, boolean][] = [
  ['itemCode', 'Item', false],
  ['model', 'Model', false],
  ['brand', 'Group', false],
  ['inStock', 'Stock', true],
  ['salesQtyYtd', 'Qty YTD', true],
  ['salesAmtYtd', 'Sales YTD', true],
  ['grossProfit', 'GP', true],
  ['available', 'Available', true],
  ['poQty', 'PO', true],
  ['sdQty', 'SD', true],
];

export default function App() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState('ALL');
  const [stock, setStock] = useState<StockId>('all');
  const [age, setAge] = useState<AgeId>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'salesAmtYtd', dir: -1 });
  const [open, setOpen] = useState<VehicleSalesRow | null>(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 720px)').matches);

  async function load(bust = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(bust ? `${API}?_=${Date.now()}` : API);
      if (!res.ok) throw new Error('Could not read vehicle sales');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('lock', Boolean(open));
    return () => document.body.classList.remove('lock');
  }, [open]);

  const brands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of data?.rows ?? []) counts.set(r.brand, (counts.get(r.brand) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (data?.rows ?? []).filter((r) => {
      if (brand !== 'ALL' && r.brand !== brand) return false;
      if (!matchesStock(r, stock)) return false;
      if (!matchesAge(r, age)) return false;
      if (!s) return true;
      return `${r.itemCode} ${r.model} ${r.itemName} ${r.brand}`.toLowerCase().includes(s);
    });
    const { key, dir } = sort;
    return [...list].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [data, brand, stock, age, q, sort]);

  const filtered = brand !== 'ALL' || stock !== 'all' || age !== 'all' || q.trim() !== '';

  const kpis = useMemo(() => ({
    models: rows.length,
    stock: rows.reduce((a, r) => a + r.inStock, 0),
    salesQty: rows.reduce((a, r) => a + r.salesQtyYtd, 0),
    sales: rows.reduce((a, r) => a + r.salesAmtYtd, 0),
    gp: rows.reduce((a, r) => a + r.grossProfit, 0),
    avail: rows.reduce((a, r) => a + r.available, 0),
  }), [rows]);

  const brandChart = useMemo(() => {
    const map = new Map<string, { name: string; full: string; sales: number }>();
    for (const r of rows) {
      const cur = map.get(r.brand) ?? { name: shortBrand(r.brand), full: r.brand, sales: 0 };
      cur.sales += r.salesAmtYtd;
      map.set(r.brand, cur);
    }
    return [...map.values()].sort((a, b) => b.sales - a.sales);
  }, [rows]);

  const agingBars = useMemo(() => [
    { name: '0–30', qty: rows.reduce((a, r) => a + r.aged030, 0), id: 'd030' as AgeId },
    { name: '31–60', qty: rows.reduce((a, r) => a + r.aged3160, 0), id: 'd3160' as AgeId },
    { name: '61–90', qty: rows.reduce((a, r) => a + r.aged6190, 0), id: 'd6190' as AgeId },
    { name: '91–120', qty: rows.reduce((a, r) => a + r.aged91120, 0), id: 'd91120' as AgeId },
    { name: '121+', qty: rows.reduce((a, r) => a + r.aged121, 0), id: 'd121' as AgeId },
  ], [rows]);

  const eta = useMemo(() => {
    const map = new Map<string, { label: string; qty: number }>();
    for (const r of rows) {
      for (const p of r.eta) {
        const cur = map.get(p.month) ?? { label: narrow ? p.label.replace(' 26', '') : p.label, qty: 0 };
        cur.qty += p.qty;
        map.set(p.month, cur);
      }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [rows, narrow]);

  const top = useMemo(
    () => [...rows].sort((a, b) => b.salesAmtYtd - a.salesAmtYtd).slice(0, narrow ? 6 : 8),
    [rows, narrow],
  );

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: -1 }));
  }
  function clearFilters() {
    setBrand('ALL');
    setStock('all');
    setAge('all');
    setQ('');
  }

  if (loading && !data) {
    return <div className="loading">Loading vehicle sales…</div>;
  }

  return (
    <div className="app">
      <header className="top-bar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="NEWEAST" />
          <div>
            <p className="eyebrow">KSA · ISUZU</p>
            <h1>Vehicle Sales Track</h1>
          </div>
        </div>
        <div className="header-actions">
          {data && (
            <span className="badge">
              Updated {new Date(data.cachedAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}
            </span>
          )}
          <button className="btn" type="button" onClick={() => void load(true)} disabled={loading}>
            Refresh
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!data?.rows.length}
            onClick={() => data && exportFullWorkbook(data.rows)}
          >
            <span className="hide-narrow">Download full Excel</span>
            <span className="hide-wide">Excel</span>
          </button>
        </div>
      </header>

      {loading && <div className="busy"><span className="dot" />Reading SAP…</div>}
      {error && <div className="busy">{error}</div>}

      <section className="filters">
        <div className="filters-head">
          <h2>Filters</h2>
          {filtered && (
            <button className="btn btn-ghost" type="button" onClick={clearFilters}>Clear</button>
          )}
        </div>
        <div className="filters-grid">
          <label className="field">
            <span>Group</span>
            <select value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="ALL">All groups</option>
              {brands.map(([name, count]) => (
                <option key={name} value={name}>{name} ({count})</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Stock</span>
            <select value={stock} onChange={(e) => setStock(e.target.value as StockId)}>
              {STOCK_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Aging</span>
            <select value={age} onChange={(e) => setAge(e.target.value as AgeId)}>
              {AGE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Search</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Item, model or name"
              inputMode="search"
              autoComplete="off"
            />
          </label>
        </div>
        <div className="chips">
          <button className={`chip${brand === 'ALL' ? ' on' : ''}`} type="button" onClick={() => setBrand('ALL')}>
            All <b>{data?.rows.length ?? 0}</b>
          </button>
          {brands.map(([name, count]) => (
            <button
              key={name}
              className={`chip${brand === name ? ' on' : ''}`}
              type="button"
              onClick={() => setBrand(brand === name ? 'ALL' : name)}
            >
              {shortBrand(name)} <b>{count}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="kpis">
        <article className="kpi"><span>Models</span><strong>{kpis.models}</strong><em>in this view</em></article>
        <article className="kpi green"><span>In stock</span><strong>{qty(kpis.stock)}</strong><em>units on hand</em></article>
        <article className="kpi blue"><span>YTD qty</span><strong>{qty(kpis.salesQty)}</strong><em>units invoiced</em></article>
        <article className="kpi red"><span>YTD sales</span><strong>{money(kpis.sales)}</strong><em>SAR</em></article>
        <article className="kpi amber"><span>Gross profit</span><strong>{money(kpis.gp)}</strong><em>YTD</em></article>
        <article className="kpi green"><span>Available</span><strong>{qty(kpis.avail)}</strong><em>ready to release</em></article>
      </section>

      <div className="charts">
        <section className="panel">
          <div className="panel-head"><h3>Sales by group</h3></div>
          <div className="panel-body chart-box">
            <ResponsiveContainer>
              <BarChart data={brandChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                <YAxis tickFormatter={money} tick={{ fontSize: 11 }} width={narrow ? 42 : 56} />
                <Tooltip contentStyle={tipStyle} formatter={(v: number) => [sar(v), 'YTD sales']} />
                <Bar dataKey="sales" radius={[6, 6, 0, 0]} cursor="pointer" onClick={(d) => d?.full && setBrand(d.full)}>
                  {brandChart.map((row) => (
                    <Cell key={row.full} fill={row.full.includes('PICKUP') ? '#0f766e' : '#e00410'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h3>Stock aging</h3></div>
          <div className="panel-body chart-box">
            <ResponsiveContainer>
              <BarChart data={agingBars}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={narrow ? 32 : 48} />
                <Tooltip contentStyle={tipStyle} formatter={(v: number, _n, item) => [`${qty(v)} units aged ${item.payload.name} days`, 'Stock']} />
                <Bar dataKey="qty" fill="#e00410" radius={[6, 6, 0, 0]} cursor="pointer" onClick={(d) => d?.id && setAge(d.id)} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h3>Inbound ETA 2026</h3></div>
          <div className="panel-body chart-box">
            <ResponsiveContainer>
              <LineChart data={eta}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={narrow ? 1 : 0} />
                <YAxis tick={{ fontSize: 11 }} width={narrow ? 32 : 48} />
                <Tooltip contentStyle={tipStyle} formatter={(v: number, _n, item) => [`${qty(v)} units expected in ${item.payload.label}`, 'ETA']} />
                <Line type="monotone" dataKey="qty" stroke="#e00410" strokeWidth={2.4} dot={{ r: 3.5, fill: '#e00410' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h3>Top models YTD</h3></div>
          <div className="panel-body chart-box">
            <ResponsiveContainer>
              <BarChart data={top} layout="vertical" margin={{ left: narrow ? 8 : 18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={money} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="model" width={narrow ? 72 : 88} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tipStyle} formatter={(v: number, _n, item) => [sar(v), item.payload.itemName]} />
                <Bar dataKey="salesAmtYtd" fill="#111827" radius={[0, 6, 6, 0]} cursor="pointer" onClick={(d) => d && setOpen(d as VehicleSalesRow)} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>All vehicles</h3>
          <span className="note">{rows.length} models · tap a line for prices</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {TABLE_COLS.map(([key, label, num]) => (
                  <th key={key} className={num ? 'num' : ''} onClick={() => toggleSort(key)}>
                    {label}{sort.key === key ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemCode + r.model} className={open?.itemCode === r.itemCode ? 'active' : ''} onClick={() => setOpen(r)}>
                  <td>{r.itemCode}</td>
                  <td>{r.model}</td>
                  <td>{r.brand}</td>
                  <td className="num">{qty(r.inStock)}</td>
                  <td className="num">{qty(r.salesQtyYtd)}</td>
                  <td className="num">{money(r.salesAmtYtd)}</td>
                  <td className="num">{money(r.grossProfit)}</td>
                  <td className="num">{qty(r.available)}</td>
                  <td className="num">{qty(r.poQty)}</td>
                  <td className="num">{qty(r.sdQty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cards">
          {rows.map((r) => (
            <button
              key={r.itemCode + r.model}
              className={`vcard${open?.itemCode === r.itemCode ? ' on' : ''}`}
              type="button"
              onClick={() => setOpen(r)}
            >
              <div className="vcard-top">
                <div>
                  <h4>{r.model || r.itemCode}</h4>
                  <div className="meta">{r.brand} · {r.itemCode}</div>
                </div>
                <div className="meta">{money(r.salesAmtYtd)}</div>
              </div>
              <div className="vcard-grid">
                <div><span>Stock</span><b>{qty(r.inStock)}</b></div>
                <div><span>Available</span><b>{qty(r.available)}</b></div>
                <div><span>Qty YTD</span><b>{qty(r.salesQtyYtd)}</b></div>
              </div>
            </button>
          ))}
        </div>
        {!rows.length && <div className="empty">No models match these filters.</div>}
      </section>

      {open && (
        <>
          <div className="drawer-mask" onClick={() => setOpen(null)} />
          <aside className="drawer">
            <div className="drawer-head">
              <div>
                <p className="eyebrow">{open.brand}</p>
                <h2>{open.model}</h2>
                <p className="note">{open.itemName}</p>
              </div>
              <button className="btn" type="button" onClick={() => setOpen(null)}>Close</button>
            </div>
            <div className="prices">
              <div className="price"><span>Retail</span><b>{sar(open.retail)}</b></div>
              <div className="price"><span>Broker 1</span><b>{sar(open.broker1)}</b></div>
              <div className="price"><span>Broker 2</span><b>{sar(open.broker2)}</b></div>
              <div className="price"><span>Broker 3</span><b>{sar(open.broker3)}</b></div>
              <div className="price"><span>Fleets</span><b>{sar(open.fleet1)}</b></div>
              <div className="price"><span>Fleet SME</span><b>{sar(open.fleetSme)}</b></div>
            </div>
            <div className="age">
              <p className="note">Aging of stock on this model</p>
              {[
                ['0–30 days', open.aged030],
                ['31–60', open.aged3160],
                ['61–90', open.aged6190],
                ['91–120', open.aged91120],
                ['121+', open.aged121],
              ].map(([label, v]) => {
                const n = Number(v);
                const max = Math.max(open.inStock, 1);
                return (
                  <div className="age-row" key={String(label)}>
                    <span>{label}</span>
                    <div className="track"><i style={{ width: `${Math.round((n / max) * 100)}%` }} /></div>
                    <b>{qty(n)}</b>
                  </div>
                );
              })}
              <p className="note">Committed {qty(open.committed)} · PO {qty(open.poQty)} · SD {qty(open.sdQty)} · Available {qty(open.available)}</p>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
