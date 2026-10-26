/**
 * Legacy horizontal-bar Stage completion funnel.
 * Kept for easy rollback if the card layout is not preferred.
 * Usage: <StageFunnelBars stages={funnel} onStageClick={setStagePopup} />
 */
export type FunnelStage = {
  id: string;
  name: string;
  label: string;
  count: number;
  pct: number;
};

type Props = {
  stages: FunnelStage[];
  onStageClick: (stageId: string) => void;
  activeId?: string | null;
};

export function StageFunnelBars({ stages, onStageClick, activeId }: Props) {
  return (
    <div className="funnel funnel-legacy">
      {stages.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`funnel-step${activeId === s.id ? ' active' : ''}`}
          onClick={() => onStageClick(s.id)}
          title={`${s.label}: ${s.count} docs — click to view list`}
        >
          <div className="funnel-bar-wrap">
            <div className="funnel-bar" style={{ width: `${Math.max(s.pct, 4)}%` }} />
          </div>
          <div className="funnel-meta">
            <strong>{s.name}</strong>
            <span>
              {s.count} · {s.pct}%
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
