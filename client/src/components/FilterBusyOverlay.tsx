type Props = {
  message?: string;
  submessage?: string;
};

export function FilterBusyOverlay({
  message = 'Updating dashboard…',
  submessage = 'Please wait a moment',
}: Props) {
  return (
    <div className="filter-busy-overlay" role="status" aria-live="polite">
      <div className="filter-busy-card">
        <div className="filter-busy-ring" aria-hidden>
          <span />
        </div>
        <div className="filter-busy-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <p className="filter-busy-title">{message}</p>
        <p className="filter-busy-sub">{submessage}</p>
      </div>
    </div>
  );
}
