import { useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CompanyAggregate, DivisionAggregate, SalesmanAggregate } from '../types';
import { CHART_COLORS, conversionColor, tooltipStyle } from '../lib/chart-theme';
import { formatCompact, formatMoney, formatPct } from '../lib/format';

type Props = {
  variant: 'overview' | 'full';
  companyData: CompanyAggregate[];
  divisionData: DivisionAggregate[];
  salesmanData: SalesmanAggregate[];
  totalSO: number;
  totalDN: number;
  totalINV: number;
  conversionRate: number;
};

function ChartCard({
  title,
  subtitle,
  children,
  className = '',
  tall = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
  tall?: boolean;
}) {
  return (
    <article className={`chart-card ${className} ${tall ? 'chart-card-tall' : ''}`}>
      <header className="chart-card-head">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </header>
      <div className="chart-card-body">{children}</div>
    </article>
  );
}

export function SalesCharts({
  variant,
  companyData,
  divisionData,
  salesmanData,
  totalSO,
  totalDN,
  totalINV,
  conversionRate,
}: Props) {
  const [perfMetric, setPerfMetric] = useState<'so' | 'inv' | 'orders'>('so');

  const topSalesmen = useMemo(
    () =>
      salesmanData.slice(0, 12).map((s) => ({
        name: s.name.length > 20 ? `${s.name.slice(0, 18)}…` : s.name,
        fullName: s.name,
        SOAmount: s.soAmount,
        INVAmount: s.invAmount,
        DNAmount: s.dnAmount,
        Orders: s.orders,
        Customers: s.customers,
        Conversion: s.conversionRate,
        gap: s.soAmount - s.invAmount,
      })),
    [salesmanData],
  );

  const conversionRanked = useMemo(
    () =>
      [...salesmanData]
        .filter((s) => s.soAmount > 5000)
        .sort((a, b) => b.conversionRate - a.conversionRate)
        .slice(0, 10)
        .map((s) => ({
          name: s.name.length > 16 ? `${s.name.slice(0, 14)}…` : s.name,
          fullName: s.name,
          rate: s.conversionRate,
          fill: conversionColor(s.conversionRate),
        })),
    [salesmanData],
  );

  const funnelData = useMemo(
    () => [
      { stage: 'Sales Orders', amount: totalSO, fill: '#2563eb' },
      { stage: 'Deliveries', amount: totalDN, fill: '#0d9488' },
      { stage: 'Invoices', amount: totalINV, fill: '#16a34a' },
    ],
    [totalSO, totalDN, totalINV],
  );

  const companyGap = useMemo(
    () =>
      companyData.map((c) => ({
        company: c.company,
        gap: c.soAmount - c.invAmount,
        soAmount: c.soAmount,
        invAmount: c.invAmount,
      })),
    [companyData],
  );

  const perfKey = perfMetric === 'so' ? 'SOAmount' : perfMetric === 'inv' ? 'INVAmount' : 'Orders';
  const perfLabel = perfMetric === 'so' ? 'SO Amount' : perfMetric === 'inv' ? 'Invoice Amount' : 'Orders';

  const pipelineChart = (
    <ChartCard title="Revenue pipeline" subtitle="SO → Delivery → Invoice">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={funnelData} layout="vertical" margin={{ left: 20, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8eef4" horizontal={false} />
          <XAxis type="number" tickFormatter={formatCompact} tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis type="category" dataKey="stage" width={100} tick={{ fontSize: 12, fill: '#334155', fontWeight: 500 }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatMoney(v), 'Amount']} />
          <Bar dataKey="amount" radius={[0, 8, 8, 0]} barSize={36}>
            {funnelData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  const companyChart = (
    <ChartCard title="Company performance" subtitle="SO vs invoice">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={companyData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8eef4" />
          <XAxis dataKey="company" tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fill: '#64748b' }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatMoney(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="soAmount" name="SO Amount" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={28} />
          <Line type="monotone" dataKey="invAmount" name="Invoice" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  const conversionChart = (
    <ChartCard title="Overall conversion" subtitle={`${formatPct(conversionRate)} invoiced`}>
      <ResponsiveContainer width="100%" height={260}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="58%"
          outerRadius="92%"
          data={[{ name: 'Conversion', value: Math.min(conversionRate, 100), fill: conversionColor(conversionRate) }]}
          startAngle={90}
          endAngle={-270}
        >
          <RadialBar dataKey="value" cornerRadius={8} background={{ fill: '#f1f5f9' }} />
          <text x="50%" y="48%" textAnchor="middle" className="radial-label">
            {conversionRate.toFixed(1)}%
          </text>
          <text x="50%" y="58%" textAnchor="middle" className="radial-sublabel">
            invoiced
          </text>
        </RadialBarChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  const overviewCharts = (
    <>
      {pipelineChart}
      {companyChart}
    </>
  );

  const fullCharts = (
    <>
      {pipelineChart}
      {companyChart}
      {conversionChart}

      <ChartCard title="Top salespeople" subtitle={`Ranked by ${perfLabel}`} className="span-2">
        <div className="chart-metric-toggle">
          {(['so', 'inv', 'orders'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`metric-pill ${perfMetric === m ? 'active' : ''}`}
              onClick={() => setPerfMetric(m)}
            >
              {m === 'so' ? 'SO Amount' : m === 'inv' ? 'Invoice' : 'Orders'}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={topSalesmen} layout="vertical" margin={{ left: 4, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8eef4" horizontal={false} />
            <XAxis type="number" tickFormatter={perfMetric === 'orders' ? (v) => String(v) : formatCompact} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={108} tick={{ fontSize: 10, fill: '#475569' }} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => (perfMetric === 'orders' ? v.toLocaleString() : formatMoney(v))}
              labelFormatter={(_, p) => p?.[0]?.payload?.fullName ?? ''}
            />
            <Bar dataKey={perfKey} fill="#6366f1" radius={[0, 6, 6, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Conversion leaders" subtitle="Salespeople with SO &gt; 5K (top 10)">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={conversionRanked} layout="vertical" margin={{ left: 4, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8eef4" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={108} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => [formatPct(v), 'Conversion']}
              labelFormatter={(_, p) => p?.[0]?.payload?.fullName ?? ''}
            />
            <Bar dataKey="rate" radius={[0, 6, 6, 0]} barSize={16}>
              {conversionRanked.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="SO vs Invoice vs Delivery" subtitle="Top 12 salespeople" className="span-2" tall>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={topSalesmen} margin={{ bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8eef4" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} interval={0} angle={-28} textAnchor="end" height={72} />
            <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatMoney(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="SOAmount" name="SO" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="DNAmount" name="Delivery" fill="#14b8a6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="INVAmount" name="Invoice" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Order share by company" subtitle="Distribution of order count">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={companyData}
              dataKey="orders"
              nameKey="company"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={88}
              paddingAngle={3}
              label={({ company, percent }) => `${company} ${(percent * 100).toFixed(0)}%`}
            >
              {companyData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="#fff" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Invoice share by company" subtitle="Revenue mix">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={companyData}
              dataKey="invAmount"
              nameKey="company"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={88}
              paddingAngle={3}
            >
              {companyData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} stroke="#fff" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatMoney(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Uninvoiced gap by company" subtitle="SO not yet invoiced">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={companyGap}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8eef4" />
            <XAxis dataKey="company" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatMoney(v)} />
            <Bar dataKey="gap" name="Gap (SO − INV)" fill="#f59e0b" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Orders & customers" subtitle="Top salespeople activity">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={topSalesmen}>
            <defs>
              <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="custGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8eef4" />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={56} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="Orders" stroke="#f97316" fill="url(#ordersGrad)" strokeWidth={2} />
            <Area type="monotone" dataKey="Customers" stroke="#2563eb" fill="url(#custGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {divisionData.length > 0 && (
        <ChartCard title="Division breakdown" subtitle="SO and invoice by division" className="span-2">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={divisionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8eef4" />
              <XAxis dataKey="division" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="soAmount" name="SO Amount" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              <Bar dataKey="invAmount" name="Invoice Amount" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {divisionData.length > 1 && (
        <ChartCard title="Orders by division" subtitle="Order count distribution">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={divisionData} dataKey="orders" nameKey="division" cx="50%" cy="50%" outerRadius={90} label>
                {divisionData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </>
  );

  return (
    <section className="charts-section">
      {variant === 'full' && (
        <div className="charts-section-head">
          <h2>Analytics</h2>
          <p>Full chart suite for the current filters</p>
        </div>
      )}
      <div className={`charts-grid ${variant === 'overview' ? 'charts-grid-overview' : 'charts-grid-full'}`}>
        {variant === 'overview' ? overviewCharts : fullCharts}
      </div>
    </section>
  );
}
