import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import type { EmployeeOption } from '../lib/dashboard';

const MAX_VISIBLE = 40;

type Props = {
  employees: EmployeeOption[];
  value: string;
  onChange: (userId: string) => void;
  onSearch: () => void;
  searching?: boolean;
};

function matchEmployee(e: EmployeeOption, q: string) {
  return (
    e.name.toLowerCase().includes(q) ||
    e.email.toLowerCase().includes(q) ||
    e.userId.toLowerCase().includes(q) ||
    e.companies.some((c) => c.toLowerCase().includes(q))
  );
}

export function EmployeeCombobox({ employees, value, onChange, onSearch, searching }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [, startSearchTransition] = useTransition();

  const selected = useMemo(
    () => employees.find((e) => e.userId === value),
    [employees, value],
  );

  const displayLabel = selected
    ? `${selected.name} (${selected.userId})`
    : 'All — full statistics';

  const matches = useMemo(() => {
    const sorted = [...employees].sort((a, b) => a.name.localeCompare(b.name));
    if (!deferredQuery) return sorted.slice(0, MAX_VISIBLE);
    return sorted.filter((e) => matchEmployee(e, deferredQuery)).slice(0, MAX_VISIBLE);
  }, [employees, deferredQuery]);

  const totalMatches = useMemo(() => {
    if (!deferredQuery) return employees.length;
    return employees.filter((e) => matchEmployee(e, deferredQuery)).length;
  }, [employees, deferredQuery]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (userId: string) => {
    onChange(userId);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="employee-combobox" ref={rootRef}>
      <span className="employee-combobox-label">User</span>
      <div className={`employee-combobox-control${open ? ' open' : ''}`}>
        <button
          type="button"
          className="employee-combobox-trigger"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            setOpen((o) => !o);
            if (!open) window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          <span className="employee-combobox-value">{displayLabel}</span>
          <span className="employee-combobox-chevron" aria-hidden />
        </button>

        {open && (
          <div className="employee-combobox-panel" id={listId} role="listbox">
            <div className="employee-combobox-search-wrap">
              <input
                ref={inputRef}
                type="search"
                className="employee-combobox-search"
                placeholder="Search by name, code, email…"
                value={query}
                onChange={(e) => {
                  startSearchTransition(() => setQuery(e.target.value));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false);
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSearch();
                    setOpen(false);
                  }
                }}
              />
            </div>
            <ul className="employee-combobox-list">
              <li>
                <button
                  type="button"
                  className={`employee-combobox-option${!value ? ' selected' : ''}`}
                  onClick={() => pick('')}
                >
                  <strong>All — full statistics</strong>
                  <small>Every company &amp; employee</small>
                </button>
              </li>
              {matches.map((e) => (
                <li key={e.userId}>
                  <button
                    type="button"
                    className={`employee-combobox-option${value === e.userId ? ' selected' : ''}`}
                    onClick={() => pick(e.userId)}
                  >
                    <strong>{e.name}</strong>
                    <small>
                      {e.userId}
                      {e.email ? ` · ${e.email}` : ''}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
            {totalMatches > MAX_VISIBLE && (
              <p className="employee-combobox-more">
                Showing {MAX_VISIBLE} of {totalMatches} — type more to narrow
              </p>
            )}
            {!matches.length && deferredQuery && (
              <p className="employee-combobox-empty">No users match &quot;{query}&quot;</p>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn btn-primary employee-combobox-apply"
        onClick={onSearch}
        disabled={searching}
      >
        {searching ? '…' : 'Search'}
      </button>
    </div>
  );
}
