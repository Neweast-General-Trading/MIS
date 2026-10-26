import type { SalesmanAggregate } from '../types';
import { formatMoney, formatPct } from '../lib/format';

type Insight = { type: 'success' | 'warning' | 'info' | 'danger'; title: string; detail: string };

type Props = {
  salesmanData: SalesmanAggregate[];
  conversionRate: number;
  totalSO: number;
  totalINV: number;
};

export function InsightsStrip({ salesmanData, conversionRate, totalSO, totalINV }: Props) {
  const insights: Insight[] = [];

  if (salesmanData.length === 0) return null;

  const top = salesmanData[0];
  const withSO = salesmanData.filter((s) => s.soAmount > 0);
  const lowestConv = [...withSO].sort((a, b) => a.conversionRate - b.conversionRate)[0];
  const gap = totalSO - totalINV;

  insights.push({
    type: 'success',
    title: 'Top performer',
    detail: `${top.name} — ${formatMoney(top.soAmount)} SO · ${formatPct(top.conversionRate)} conversion`,
  });

  if (lowestConv && lowestConv.conversionRate < 70) {
    insights.push({
      type: 'warning',
      title: 'Low conversion',
      detail: `${lowestConv.name} at ${formatPct(lowestConv.conversionRate)} — review open SO vs invoicing`,
    });
  }

  insights.push({
    type: conversionRate >= 70 ? 'info' : 'danger',
    title: 'Revenue gap (SO − Invoice)',
    detail: `${formatMoney(gap)} unconverted in current filters (${formatPct(conversionRate)} invoiced)`,
  });

  const multiDivision = new Set(salesmanData.map((s) => s.division)).size;
  insights.push({
    type: 'info',
    title: 'Coverage',
    detail: `${salesmanData.length} salesperson rows across ${multiDivision} division(s)`,
  });

  return (
    <section className="insights-strip">
      {insights.map((item, i) => (
        <article key={i} className={`insight-tile ${item.type}`}>
          <span className="insight-tile-label">{item.title}</span>
          <p>{item.detail}</p>
        </article>
      ))}
    </section>
  );
}
