import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from 'recharts';
import { colorsByRankDesc } from '../lib/chart-colors';
import type { CycleSegment, CycleTimeReport } from '../lib/cycle-time';
import type { StageId } from '../types';
import { SectionInfo } from './SectionInfo';

type Props = {
  report: CycleTimeReport;
  info: string;
  onStageClick: (stageId: StageId) => void;
};

function fmtDays(v: number | null): string {
  if (v === null) return '—';
  return `${v}d`;
}

type PieRow = CycleSegment & { name: string; value: number; color: string };

function ActiveShape(props: Record<string, unknown>) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props as {
    cx: number;
    cy: number;
    innerRadius: number;
    outerRadius: number;
    startAngle: number;
    endAngle: number;
    fill: string;
  };
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 6}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      stroke="#fff"
      strokeWidth={2}
    />
  );
}

export function CycleTimePanel({ report, info, onStageClick }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const pieData = useMemo<PieRow[]>(() => {
    const palette = colorsByRankDesc(report.segments.map((s) => s.sharePct || s.avgDays));
    return report.segments.map((s, i) => ({
      ...s,
      name: s.short,
      value: s.avgDays,
      color: palette[i] ?? '#60a5fa',
    }));
  }, [report.segments]);

  const active = pieData.find((s) => s.id === activeId) ?? null;
  const activeIndex = active ? pieData.findIndex((s) => s.id === active.id) : -1;
  const n = report.completedCount;
  const hasAny = n > 0 && (pieData.length > 0 || report.fullAvgDays !== null);

  return (
    <section className="panel chart-card cycle-panel">
      <div className="panel-head">
        <h3>
          Cycle time
          <SectionInfo text={info} title="Cycle time" />
        </h3>
      </div>

      <div className="cycle-panel-body">
        {!hasAny ? (
          <p className="cycle-pie-empty muted">
            No fully completed INV → GRPO documents in the current filter.
          </p>
        ) : (
          <>
            <div className="cycle-phase-chips">
              <div className="cycle-chip cycle-chip-inv">
                <span className="cycle-chip-label">Invoicing</span>
                <strong>{fmtDays(report.invoicingAvgDays)}</strong>
                <span className="cycle-chip-hint">INV → EPL1 · {n} completed</span>
              </div>
              <div className="cycle-chip cycle-chip-tr">
                <span className="cycle-chip-label">Transfer & GRPO</span>
                <strong>{fmtDays(report.transferAvgDays)}</strong>
                <span className="cycle-chip-hint">EPL1 → GRPO · {n} completed</span>
              </div>
            </div>

            <div className="cycle-main" onMouseLeave={() => setActiveId(null)}>
              <div className="cycle-donut-wrap">
                {pieData.length ? (
                  <>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={68}
                          outerRadius={96}
                          paddingAngle={3}
                          stroke="#fff"
                          strokeWidth={2}
                          activeIndex={activeIndex >= 0 ? activeIndex : undefined}
                          activeShape={ActiveShape}
                          onMouseEnter={(_, index) => setActiveId(pieData[index]?.id ?? null)}
                          onClick={(d) => onStageClick((d as PieRow).stageId)}
                        >
                          {pieData.map((d) => (
                            <Cell key={d.id} fill={d.color} cursor="pointer" />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="cycle-donut-center">
                      <strong>{fmtDays(report.fullAvgDays)}</strong>
                      <span>avg complete</span>
                      <em>{n} completed</em>
                    </div>
                  </>
                ) : (
                  <div className="cycle-donut-fallback">
                    <strong>{fmtDays(report.fullAvgDays)}</strong>
                    <span>avg complete</span>
                    <em>{n} completed</em>
                  </div>
                )}
              </div>

              <div className="cycle-side">
                {pieData.length > 0 && (
                  <div className={`cycle-hover-card${active ? ' visible' : ''}`}>
                    {active ? (
                      <>
                        <span className="cycle-hover-dot" style={{ background: active.color }} />
                        <div className="cycle-hover-text">
                          <strong>{active.short}</strong>
                          <span>{active.label}</span>
                        </div>
                        <div className="cycle-hover-stats">
                          <strong>{active.avgDays}d</strong>
                          <span>{active.sharePct}%</span>
                        </div>
                      </>
                    ) : (
                      <span className="cycle-hover-hint">Hover a slice</span>
                    )}
                  </div>
                )}

                <ul className="cycle-stage-list" aria-label="Average days by stage">
                  {pieData.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={`cycle-stage-row cycle-stage-row-wide${activeId === s.id ? ' active' : ''}`}
                        onMouseEnter={() => setActiveId(s.id)}
                        onClick={() => onStageClick(s.stageId)}
                        title={s.label}
                      >
                        <span className="cycle-stage-dot" style={{ background: s.color }} />
                        <span className="cycle-stage-name">{s.short}</span>
                        <span className="cycle-stage-bar" aria-hidden="true">
                          <span
                            className="cycle-stage-bar-fill"
                            style={{ width: `${s.sharePct}%`, background: s.color }}
                          />
                        </span>
                        <span className="cycle-stage-days">{s.avgDays}d</span>
                        <span className="cycle-stage-pct">{s.sharePct}%</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
