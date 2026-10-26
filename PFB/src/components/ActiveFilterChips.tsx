import type { DashboardFilters } from '../types';

type Props = {
  filters: DashboardFilters;
  filteredCount: number;
  totalCount: number;
  onClear: () => void;
  onRemove: (key: keyof DashboardFilters) => void;
};

export function ActiveFilterChips({ filters, filteredCount, totalCount, onClear, onRemove }: Props) {
  const chips: { key: keyof DashboardFilters; label: string }[] = [];

  if (filters.company !== 'all') chips.push({ key: 'company', label: `Company: ${filters.company}` });
  if (filters.division !== 'all') chips.push({ key: 'division', label: `Division: ${filters.division}` });
  if (filters.salesman !== 'all') chips.push({ key: 'salesman', label: `Sales: ${filters.salesman}` });
  if (filters.search.trim()) chips.push({ key: 'search', label: `Search: "${filters.search.trim()}"` });

  return (
    <div className="filter-chips-bar">
      <span className="filter-chips-count">
        Showing <strong>{filteredCount.toLocaleString()}</strong> of {totalCount.toLocaleString()} rows
      </span>
      {chips.length > 0 && (
        <div className="filter-chips">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="filter-chip"
              onClick={() =>
                onRemove(
                  chip.key === 'search'
                    ? 'search'
                    : chip.key,
                )
              }
              title="Remove filter"
            >
              {chip.label}
              <span aria-hidden>×</span>
            </button>
          ))}
          <button type="button" className="filter-chip clear-all" onClick={onClear}>
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
