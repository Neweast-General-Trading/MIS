type FilterDef = {
  key: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  optionLabel?: (value: string) => string;
};

type Props = {
  filters: FilterDef[];
  onClear?: () => void;
  clearLabel?: string;
  onResetToTable?: () => void;
  resetLabel?: string;
};

export function TableInlineFilters({
  filters,
  onClear,
  clearLabel = 'Clear table filters',
  onResetToTable,
  resetLabel = 'Match table filters',
}: Props) {
  return (
    <div className="table-inline-filters">
      {filters.map((f) => (
        <label key={f.key}>
          {f.label}
          <select value={f.value} onChange={(e) => f.onChange(e.target.value)}>
            <option value="">All</option>
            {f.options.map((opt) => (
              <option key={opt} value={opt}>
                {f.optionLabel ? f.optionLabel(opt) : opt}
              </option>
            ))}
          </select>
        </label>
      ))}
      {onResetToTable && (
        <button type="button" className="btn btn-sm btn-soft" onClick={onResetToTable}>
          {resetLabel}
        </button>
      )}
      {onClear && (
        <button type="button" className="btn btn-sm" onClick={onClear}>
          {clearLabel}
        </button>
      )}
    </div>
  );
}
