import { useEffect, useMemo, useState, type ReactNode } from 'react';

export type SelectFilter = {
  id: string;
  label: string;
  options: string[];
};

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 10;

function norm(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase();
}

export function usePagedFilter<T>(
  rows: T[],
  {
    searchIn,
    selectFilters = [],
    getSelectValue,
    pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
    resetKey,
  }: {
    searchIn: (row: T) => string;
    selectFilters?: SelectFilter[];
    getSelectValue?: (row: T, filterId: string) => string;
    pageSize?: number;
    resetKey?: string;
  },
) {
  const [query, setQuery] = useState('');
  const [selects, setSelects] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => {
    setQuery('');
    setSelects({});
    setPage(0);
    setPageSize(initialPageSize);
  }, [resetKey, initialPageSize]);

  const filtered = useMemo(() => {
    const q = norm(query);
    return rows.filter((row) => {
      if (q && !norm(searchIn(row)).includes(q)) return false;
      for (const f of selectFilters) {
        const selected = selects[f.id];
        if (!selected) continue;
        const value = getSelectValue?.(row, f.id) ?? '';
        if (value !== selected) return false;
      }
      return true;
    });
  }, [rows, query, selects, selectFilters, searchIn, getSelectValue]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize) || 1);
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const hasActiveFilters = Boolean(query.trim()) || Object.values(selects).some(Boolean);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function setSelect(id: string, value: string) {
    setSelects((prev) => ({ ...prev, [id]: value }));
    setPage(0);
  }

  function clearFilters() {
    setQuery('');
    setSelects({});
    setPage(0);
  }

  function changePageSize(next: number) {
    setPageSize(next);
    setPage(0);
  }

  return {
    query,
    setQuery: (v: string) => {
      setQuery(v);
      setPage(0);
    },
    selects,
    setSelect,
    page: safePage,
    setPage,
    pageCount,
    pageSize,
    setPageSize: changePageSize,
    filtered,
    pageRows,
    total: rows.length,
    shown: filtered.length,
    hasActiveFilters,
    clearFilters,
    selectFilters,
  };
}

export function TableToolbar({
  query,
  onQuery,
  searchPlaceholder = 'Search…',
  filters = [],
  selects,
  onSelect,
  shown,
  total,
  hasActiveFilters,
  onClear,
  pageSize,
  onPageSize,
}: {
  query: string;
  onQuery: (v: string) => void;
  searchPlaceholder?: string;
  filters?: SelectFilter[];
  selects: Record<string, string>;
  onSelect: (id: string, value: string) => void;
  shown: number;
  total: number;
  hasActiveFilters?: boolean;
  onClear?: () => void;
  pageSize: number;
  onPageSize: (n: number) => void;
}) {
  return (
    <div className="table-toolbar">
      <div className="table-toolbar-main">
        <input
          className="table-search"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label="Search table"
        />
        {filters.map((f) => (
          <label key={f.id} className="table-filter">
            <span>{f.label}</span>
            <select value={selects[f.id] ?? ''} onChange={(e) => onSelect(f.id, e.target.value)}>
              <option value="">All</option>
              {f.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        ))}
        {hasActiveFilters && onClear ? (
          <button type="button" className="table-clear" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      <div className="table-toolbar-meta">
        <label className="table-filter">
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="table-count">
          Showing <strong>{shown}</strong> of <strong>{total}</strong>
        </span>
      </div>
    </div>
  );
}

export function TablePager({
  page,
  pageCount,
  onPage,
  pageSize,
  shown,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  pageSize: number;
  shown: number;
}) {
  if (shown === 0) return null;
  const from = page * pageSize + 1;
  const to = Math.min(shown, (page + 1) * pageSize);
  return (
    <div className="table-pager">
      <span className="table-pager-meta">
        Rows {from}–{to} of {shown}
      </span>
      <div className="table-pager-btns">
        <button type="button" disabled={page <= 0} onClick={() => onPage(0)} title="First page">
          «
        </button>
        <button type="button" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          Prev
        </button>
        <span className="table-pager-page">
          Page <strong>{page + 1}</strong> / {pageCount}
        </span>
        <button type="button" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
          Next
        </button>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(pageCount - 1)}
          title="Last page"
        >
          »
        </button>
      </div>
    </div>
  );
}

export function FilteredBlock({ children }: { children: ReactNode }) {
  return <div className="filtered-block">{children}</div>;
}
