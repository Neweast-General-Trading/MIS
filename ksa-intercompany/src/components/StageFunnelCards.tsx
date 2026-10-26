import { chartColors } from '../lib/chart-colors';
import type { FunnelStage } from './StageFunnelBars';

type Props = {
  stages: FunnelStage[];
  onStageClick: (stageId: string) => void;
  activeId?: string | null;
};

export function StageFunnelCards({ stages, onStageClick, activeId }: Props) {
  const palette = chartColors(Math.max(stages.length, 4));

  return (
    <div className="funnel-cards">
      {stages.map((s, i) => {
        const accent = palette[i % palette.length];
        return (
          <button
            key={s.id}
            type="button"
            className={`funnel-card${activeId === s.id ? ' active' : ''}`}
            style={{ ['--funnel-accent' as string]: accent }}
            onClick={() => onStageClick(s.id)}
            title={`${s.label}: ${s.count} docs reached — click to view list`}
          >
            <div className="funnel-card-head">
              <strong className="funnel-card-short">{s.name}</strong>
              <div className="funnel-card-head-right">
                <span className="funnel-card-label">{s.label}</span>
                <span className="funnel-card-stage">Stage {i + 1}</span>
              </div>
            </div>
            <div className="funnel-card-metrics">
              <span className="funnel-card-count">#{s.count}</span>
              <span className="funnel-card-pct">{s.pct}%</span>
            </div>
            <span className="funnel-card-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(s.pct, 3)}%`, background: accent }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
