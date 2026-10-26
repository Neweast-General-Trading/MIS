import { useState } from 'react';
import type { DashboardFilters, EorderSchema, SalesSummaryResponse } from '../types';
import { defaultToDate } from '../lib/format';

type Props = {
  filters: DashboardFilters;
  schemas: EorderSchema[];
  data: SalesSummaryResponse | null;
  filterOptions: { companies: string[]; divisions: string[]; salesmen: string[] };
  onChange: (patch: Partial<DashboardFilters>) => void;
  onClear: () => void;
  onApplyDates: () => void;
  loading: boolean;
};

export function FilterPanel({
  filters,
  schemas,
  data,
  filterOptions,
  onChange,
  onClear,
  onApplyDates,
  loading,
}: Props) {
  const [open, setOpen] = useState(true);

  const activeSlice =
    filters.company !== 'all' ||
    filters.division !== 'all' ||
    filters.salesman !== 'all' ||
    filters.search.trim();

  return (
    <section className={`filter-panel-v2 ${open ? 'is-open' : 'is-collapsed'}`}>
      <div className="filter-panel-v2-head">
        <button type="button" className="filter-toggle" onClick={() => setOpen((v) => !v)}>
          <span className="filter-toggle-icon">{open ? '▾' : '▸'}</span>
          <div className="filter-toggle-text">
            <h2>Filters</h2>
            <p>
              {filters.fromDate} → {filters.toDate}
              {data ? ` · ${data.rowCount.toLocaleString()} rows` : ''}
              {activeSlice ? ' · sliced' : ''}
            </p>
          </div>
        </button>
        <button type="button" className="btn btn-primary btn-load" onClick={onApplyDates} disabled={loading}>
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {open && (
        <>
          <div className="filter-groups">
            <div className="filter-group">
              <span className="filter-group-label">Period & database</span>
              <div className="filter-group-fields">
                <label className="field">
                  <span>Database</span>
                  <select value={filters.co} onChange={(e) => onChange({ co: e.target.value })}>
                    {schemas.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>From</span>
                  <input
                    type="date"
                    value={filters.fromDate}
                    max={filters.toDate || defaultToDate()}
                    onChange={(e) => onChange({ fromDate: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>To</span>
                  <input
                    type="date"
                    value={filters.toDate}
                    min={filters.fromDate}
                    max={defaultToDate()}
                    onChange={(e) => onChange({ toDate: e.target.value })}
                  />
                </label>
              </div>
            </div>

            {data && (
              <div className="filter-group">
                <span className="filter-group-label">Slice & search</span>
                <div className="filter-group-fields">
                  <label className="field">
                    <span>Company</span>
                    <select value={filters.company} onChange={(e) => onChange({ company: e.target.value })}>
                      {filterOptions.companies.map((c) => (
                        <option key={c} value={c}>
                          {c === 'all' ? 'All companies' : c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Division</span>
                    <select value={filters.division} onChange={(e) => onChange({ division: e.target.value })}>
                      {filterOptions.divisions.map((d) => (
                        <option key={d} value={d}>
                          {d === 'all' ? 'All divisions' : d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Salesperson</span>
                    <select value={filters.salesman} onChange={(e) => onChange({ salesman: e.target.value })}>
                      {filterOptions.salesmen.map((s) => (
                        <option key={s} value={s}>
                          {s === 'all' ? 'All salespeople' : s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field field-search">
                    <span>Search</span>
                    <input
                      type="search"
                      placeholder="Name, company, division…"
                      value={filters.search}
                      onChange={(e) => onChange({ search: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {data && (
            <div className="filter-panel-v2-foot">
              <button type="button" className="btn btn-sm" onClick={onClear}>
                Reset table filters
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
