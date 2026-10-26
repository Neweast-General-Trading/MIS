import type { ReactNode } from 'react';
import type { CompanyDashboardSummary } from 'src/sections/bpm/api';

import { useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';

import { RouterLink } from 'src/routes/components';

import { Iconify } from 'src/components/iconify';
import { Chart, useChart } from 'src/components/chart';

import { openPolicyPdfInNewTab } from 'src/sections/bpm/api';

// ----------------------------------------------------------------------

const C = {
  ink: '#1C252E',
  soft: '#637381',
  line: 'rgba(145, 158, 171, 0.2)',
  wash: '#F4F6F8',
  paper: '#FFFFFF',
  red: '#ED1C24',
};

/** One stable colour per process function, used by every view in the dialog. */
const FN_COLORS = [
  '#ED1C24',
  '#1C252E',
  '#1E4E8C',
  '#F5A524',
  '#1B6B3A',
  '#8E33FF',
  '#00A8B5',
  '#B45309',
];
const OTHER = '#C4CDD5';

const SCROLL_SX = {
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  scrollbarWidth: 'thin',
  scrollbarColor: 'rgba(145,158,171,0.5) transparent',
  '&::-webkit-scrollbar': { width: 8 },
  '&::-webkit-scrollbar-track': { background: 'transparent' },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: 'rgba(145,158,171,0.4)',
    borderRadius: 8,
    border: '2px solid transparent',
    backgroundClip: 'content-box',
  },
  '&::-webkit-scrollbar-thumb:hover': {
    backgroundColor: 'rgba(237,28,36,0.55)',
    backgroundClip: 'content-box',
  },
} as const;

export type KpiKind = 'functions' | 'processes' | 'subs' | 'roles' | 'policies' | 'tat';

type Summary = CompanyDashboardSummary;
type PfRow = Summary['processFunctionRows'][number];
type Role = Summary['jobRoles'][number];
type ProcRow = Summary['processRows'][number];
type PolicyRow = Summary['policyRows'][number];

function cleanName(name: string): string {
  return (
    name
      .replace(/^\d{1,3}[-_.\s]+/, '')
      .replace(/^\d{3}(?:-\d{3}){1,3}\s*[-_]?\s*/i, '')
      .trim() || name
  );
}

const round = (value: number, decimals = 0) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

// ----------------------------------------------------------------------

type Props = {
  kind: KpiKind | null;
  onClose: () => void;
  companyCode: string;
  pfRows: PfRow[];
  roles: Role[];
  processRows: ProcRow[];
  policyRows: PolicyRow[];
  totals: {
    functions: number;
    processes: number;
    subs: number;
    roles: number;
    policies: number;
    tat: number | null;
  };
};

const META: Record<KpiKind, { title: string; blurb: string }> = {
  functions: {
    title: 'Process functions',
    blurb: 'Each function at a glance. Click one to open it.',
  },
  processes: { title: 'Processes', blurb: 'Every process, grouped by the function that owns it.' },
  subs: { title: 'Sub-processes', blurb: 'How big the processes are, and which are the largest.' },
  roles: { title: 'Impacted job roles', blurb: 'Who is involved, and which roles span functions.' },
  policies: { title: 'Policies', blurb: 'Every policy and the process functions it belongs to.' },
  tat: {
    title: 'TAT (days)',
    blurb: 'Where the turnaround time is, and how reliable each number is.',
  },
};

export function KpiInsightDialog({
  kind,
  onClose,
  companyCode,
  pfRows,
  roles,
  processRows,
  policyRows,
  totals,
}: Props) {
  const ctx = useMemo(() => {
    const colorById = new Map<string, string>();
    const sortedByCode = [...pfRows].sort((a, b) => a.code.localeCompare(b.code));
    sortedByCode.forEach((pf, index) => colorById.set(pf.id, FN_COLORS[index % FN_COLORS.length]));
    const pfById = new Map(pfRows.map((pf) => [pf.id, pf]));
    const scope = new Set(pfRows.map((pf) => pf.id));
    return {
      pfById,
      colorOf: (id: string) => colorById.get(id) ?? OTHER,
      nameOf: (id: string) => {
        const pf = pfById.get(id);
        return pf ? cleanName(pf.name) : 'Process function';
      },
      procs: processRows.filter((row) => scope.has(row.departmentId)),
      companyCode,
    };
  }, [pfRows, processRows, companyCode]);

  const meta = kind ? META[kind] : null;
  const headline = kind ? (totals[kind === 'tat' ? 'tat' : kind] ?? '—') : '';

  return (
    <Dialog
      open={Boolean(kind)}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      scroll="paper"
      slotProps={{ paper: { sx: { borderRadius: 2, maxHeight: 'min(780px, 90vh)' } } }}
    >
      {kind && meta ? (
        <>
          <Stack
            direction="row"
            alignItems="flex-start"
            justifyContent="space-between"
            sx={{ px: 2.75, pt: 2.25, pb: 1.75, borderBottom: `1px solid ${C.line}` }}
          >
            <Box>
              <Typography variant="overline" sx={{ color: C.soft, letterSpacing: 1 }}>
                {meta.title}
              </Typography>
              <Stack direction="row" alignItems="baseline" spacing={1.25} flexWrap="wrap">
                <Typography sx={{ color: C.ink, fontWeight: 800, fontSize: 34, lineHeight: 1.1 }}>
                  {headline}
                </Typography>
                <Typography variant="body2" sx={{ color: C.soft }}>
                  {meta.blurb}
                </Typography>
              </Stack>
            </Box>
            <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ mt: -0.5, mr: -1 }}>
              <Iconify icon="mingcute:close-line" width={20} />
            </IconButton>
          </Stack>

          <Box sx={{ ...SCROLL_SX, flex: 1, px: 2.75, py: 2 }}>
            <Stack spacing={2.25}>
              {kind === 'functions' ? (
                <FunctionsView pfRows={pfRows} roles={roles} ctx={ctx} />
              ) : null}
              {kind === 'processes' ? <ProcessesView pfRows={pfRows} ctx={ctx} /> : null}
              {kind === 'subs' ? <SubsView ctx={ctx} /> : null}
              {kind === 'roles' ? <RolesView pfRows={pfRows} roles={roles} ctx={ctx} /> : null}
              {kind === 'policies' ? (
                <PoliciesView pfRows={pfRows} policyRows={policyRows} ctx={ctx} />
              ) : null}
              {kind === 'tat' ? <TatView pfRows={pfRows} totalTat={totals.tat} ctx={ctx} /> : null}
            </Stack>
          </Box>
        </>
      ) : null}
    </Dialog>
  );
}

type Ctx = {
  pfById: Map<string, PfRow>;
  colorOf: (id: string) => string;
  nameOf: (id: string) => string;
  procs: ProcRow[];
  companyCode: string;
};

const pfHref = (id: string, companyCode: string) =>
  `/departments/${id}/processes?company=${encodeURIComponent(companyCode)}`;
const procHref = (deptId: string, procId: string) =>
  `/departments/${deptId}/processes/${procId}/activities-table`;

// ----------------------------------------------------------------------
// Shared building blocks
// ----------------------------------------------------------------------

function Card({
  title,
  subtitle,
  aside,
  children,
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={{ border: `1px solid ${C.line}`, borderRadius: 2, p: { xs: 1.5, md: 2 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1" sx={{ color: C.ink, fontWeight: 700 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="caption" sx={{ color: C.soft, display: 'block' }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {aside}
      </Stack>
      {children}
    </Box>
  );
}

function Dot({ color }: { color: string }) {
  return <Box sx={{ width: 10, height: 10, borderRadius: '3px', flexShrink: 0, bgcolor: color }} />;
}

function FnTag({ name, color, extra }: { name: string; color: string; extra?: string }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.6,
        px: 0.9,
        py: 0.3,
        borderRadius: 99,
        bgcolor: C.wash,
        fontSize: 12,
        fontWeight: 600,
        color: C.ink,
        lineHeight: 1.2,
        maxWidth: '100%',
      }}
    >
      <Dot color={color} />
      <Box
        component="span"
        sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {name}
      </Box>
      {extra ? (
        <Box component="span" sx={{ color: C.soft, fontWeight: 500 }}>
          · {extra}
        </Box>
      ) : null}
    </Box>
  );
}

/** One horizontal bar split by function: a quick read of "who has how much". */
function SegmentBar({
  parts,
  unit,
}: {
  parts: Array<{ label: string; value: number; color: string }>;
  unit: string;
}) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (!total) return null;
  return (
    <Box>
      <Box
        sx={{ display: 'flex', height: 16, borderRadius: 99, overflow: 'hidden', bgcolor: C.wash }}
      >
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <Tooltip
              key={p.label}
              title={`${p.label}: ${p.value} ${unit} (${Math.round((p.value / total) * 100)}%)`}
            >
              <Box
                sx={{
                  width: `${(p.value / total) * 100}%`,
                  bgcolor: p.color,
                  borderRight: '2px solid #fff',
                  '&:last-of-type': { borderRight: 0 },
                }}
              />
            </Tooltip>
          ))}
      </Box>
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.5} sx={{ mt: 1 }}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <Stack key={p.label} direction="row" alignItems="center" spacing={0.6}>
              <Dot color={p.color} />
              <Typography variant="caption" sx={{ color: C.ink }}>
                {p.label}{' '}
                <Box component="span" sx={{ fontWeight: 700 }}>
                  {p.value}
                </Box>
              </Typography>
            </Stack>
          ))}
      </Stack>
    </Box>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <TextField
      size="small"
      fullWidth
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Iconify icon="eva:search-fill" width={18} sx={{ color: C.soft }} />
            </InputAdornment>
          ),
        },
      }}
      sx={{ mb: 1.25, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
    />
  );
}

function ScrollList({ children, max = 330 }: { children: ReactNode; max?: number }) {
  return <Box sx={{ ...SCROLL_SX, maxHeight: max, pr: 0.5, mr: -0.5 }}>{children}</Box>;
}

function Empty({ text }: { text: string }) {
  return (
    <Typography variant="body2" sx={{ color: C.soft, textAlign: 'center', py: 3 }}>
      {text}
    </Typography>
  );
}

type BarItem = { label: string; value: number; color?: string; note?: string };

function BarChart({
  items,
  unit,
  decimals = 0,
}: {
  items: BarItem[];
  unit: string;
  decimals?: number;
}) {
  const options = useChart({
    colors: items.map((item) => item.color ?? C.red),
    plotOptions: {
      bar: {
        horizontal: true,
        distributed: true,
        barHeight: '58%',
        borderRadius: 4,
        borderRadiusApplication: 'end',
        dataLabels: { position: 'top' },
      },
    },
    legend: { show: false },
    dataLabels: {
      enabled: true,
      textAnchor: 'start',
      offsetX: 6,
      style: { fontSize: '12px', fontWeight: 700, colors: [C.ink] },
      formatter: (value: number, opts: { dataPointIndex: number }) => {
        const note = items[opts.dataPointIndex]?.note;
        return `${round(value, decimals)}${note ? `  ${note}` : ''}`;
      },
    },
    grid: {
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: false } },
      padding: { right: 90 },
    },
    xaxis: {
      max: Math.max(...items.map((item) => item.value), 1) * 1.3,
      categories: items.map((item) => item.label),
      labels: { show: false },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { maxWidth: 210, style: { colors: C.ink, fontSize: '12px', fontWeight: 500 } },
    },
    tooltip: {
      y: {
        formatter: (value: number) => `${round(value, decimals)} ${unit}`,
        title: { formatter: () => '' },
      },
    },
  });
  if (!items.length) return <Empty text="Nothing to chart yet." />;
  return (
    <Chart
      type="bar"
      series={[{ name: unit, data: items.map((item) => item.value) }]}
      options={options}
      sx={{ width: 1, height: Math.max(110, items.length * 36 + 20) }}
    />
  );
}

type Slice = { label: string; value: number; color: string };

function Donut({ slices, unit, size = 210 }: { slices: Slice[]; unit: string; size?: number }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const options = useChart({
    colors: slices.map((s) => s.color),
    labels: slices.map((s) => s.label),
    stroke: { width: 3, colors: ['#FFFFFF'] },
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (value: number) => `${value}`, title: { formatter: () => '' } } },
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: {
          size: '72%',
          labels: {
            show: true,
            name: { show: true, offsetY: 18, color: C.soft, fontSize: '12px' },
            value: {
              show: true,
              offsetY: -14,
              color: C.ink,
              fontSize: '24px',
              fontWeight: 700,
              formatter: (value: string) => value,
            },
            total: {
              show: true,
              showAlways: true,
              label: unit,
              color: C.soft,
              fontSize: '12px',
              formatter: () => String(total),
            },
          },
        },
      },
    },
  });
  return (
    <Chart
      type="donut"
      series={slices.map((s) => s.value)}
      options={options}
      sx={{ mx: 'auto', width: size, height: size }}
    />
  );
}

function Legend({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return (
    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
      {slices.map((s) => (
        <Stack
          key={s.label}
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ px: 1, py: 0.6 }}
        >
          <Dot color={s.color} />
          <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, color: C.ink }}>
            {s.label}
          </Typography>
          <Typography variant="body2" sx={{ color: C.ink, fontWeight: 700 }}>
            {s.value}
          </Typography>
          <Typography variant="caption" sx={{ color: C.soft, minWidth: 36, textAlign: 'right' }}>
            {total ? Math.round((s.value / total) * 100) : 0}%
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function DonutWithLegend({ slices, unit }: { slices: Slice[]; unit: string }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '210px minmax(0, 1fr)' },
        gap: 2,
        alignItems: 'center',
      }}
    >
      <Donut slices={slices} unit={unit} />
      <Legend slices={slices} />
    </Box>
  );
}

/** A thin proportional bar used inside list rows. */
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <Box sx={{ height: 5, borderRadius: 99, bgcolor: C.wash, overflow: 'hidden' }}>
      <Box
        sx={{
          width: `${Math.max(3, Math.round((value / Math.max(max, 1)) * 100))}%`,
          height: 1,
          borderRadius: 99,
          bgcolor: color,
        }}
      />
    </Box>
  );
}

// ----------------------------------------------------------------------
// 1. Process functions
// ----------------------------------------------------------------------

function FunctionsView({ pfRows, roles, ctx }: { pfRows: PfRow[]; roles: Role[]; ctx: Ctx }) {
  const rows = useMemo(
    () => [...pfRows].sort((a, b) => b.subProcessCount - a.subProcessCount),
    [pfRows]
  );
  const maxSub = Math.max(...rows.map((r) => r.subProcessCount), 1);
  const rolesIn = (id: string) => roles.filter((role) => role.departmentIds.includes(id)).length;

  return (
    <>
      <Card title="Where the work sits" subtitle="Share of all sub-processes, by process function">
        <SegmentBar
          unit="sub-processes"
          parts={rows.map((pf) => ({
            label: cleanName(pf.name),
            value: pf.subProcessCount,
            color: ctx.colorOf(pf.id),
          }))}
        />
      </Card>
      <Card title="All process functions" subtitle="Sorted by number of sub-processes">
        <ScrollList max={360}>
          <Stack spacing={0.75}>
            {rows.map((pf) => (
              <Box
                key={pf.id}
                component={RouterLink}
                href={pfHref(pf.id, ctx.companyCode)}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'minmax(0,1.5fr) minmax(0,1fr) auto' },
                  gap: { xs: 0.75, sm: 2 },
                  alignItems: 'center',
                  px: 1.5,
                  py: 1.1,
                  borderRadius: 1.5,
                  textDecoration: 'none',
                  color: 'inherit',
                  bgcolor: C.wash,
                  borderLeft: `4px solid ${ctx.colorOf(pf.id)}`,
                  '&:hover': { bgcolor: 'rgba(237,28,36,0.06)' },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap sx={{ color: C.ink, fontWeight: 700 }}>
                    {cleanName(pf.name)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: C.soft, fontFamily: 'monospace' }}>
                    {pf.code}
                  </Typography>
                </Box>
                <Box>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" sx={{ color: C.soft }}>
                      {pf.subProcessCount} sub-processes
                    </Typography>
                  </Stack>
                  <MiniBar value={pf.subProcessCount} max={maxSub} color={ctx.colorOf(pf.id)} />
                </Box>
                <Stack direction="row" spacing={2} sx={{ textAlign: 'center' }}>
                  {[
                    ['Processes', pf.processCount],
                    ['Roles', rolesIn(pf.id)],
                    ['Policies', pf.policies ?? 0],
                  ].map(([label, value]) => (
                    <Box key={label}>
                      <Typography
                        variant="subtitle2"
                        sx={{ color: C.ink, fontWeight: 700, lineHeight: 1.2 }}
                      >
                        {value}
                      </Typography>
                      <Typography variant="caption" sx={{ color: C.soft }}>
                        {label}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </ScrollList>
      </Card>
    </>
  );
}

// ----------------------------------------------------------------------
// 2. Processes
// ----------------------------------------------------------------------

function ProcessesView({ pfRows, ctx }: { pfRows: PfRow[]; ctx: Ctx }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      [...pfRows]
        .sort((a, b) => b.processCount - a.processCount)
        .map((pf) => ({
          pf,
          rows: ctx.procs
            .filter(
              (p) =>
                p.departmentId === pf.id && (!q || `${p.code} ${p.name}`.toLowerCase().includes(q))
            )
            .sort((a, b) => a.code.localeCompare(b.code)),
        }))
        .filter((g) => g.rows.length),
    [pfRows, ctx.procs, q]
  );
  const maxSub = Math.max(...ctx.procs.map((p) => p.subProcessCount), 1);

  return (
    <>
      <Card title="Processes per function" subtitle="Share of all processes">
        <SegmentBar
          unit="processes"
          parts={pfRows.map((pf) => ({
            label: cleanName(pf.name),
            value: pf.processCount,
            color: ctx.colorOf(pf.id),
          }))}
        />
      </Card>
      <Card title="All processes" subtitle="Number beside each is its count of sub-processes">
        <SearchBox value={query} onChange={setQuery} placeholder="Search a process…" />
        <ScrollList max={380}>
          {groups.length ? (
            <Stack spacing={1.5}>
              {groups.map(({ pf, rows }) => (
                <Box key={pf.id}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                      bgcolor: C.paper,
                      py: 0.5,
                    }}
                  >
                    <Dot color={ctx.colorOf(pf.id)} />
                    <Typography variant="subtitle2" sx={{ color: C.ink, fontWeight: 700 }}>
                      {cleanName(pf.name)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: C.soft }}>
                      {rows.length} process{rows.length === 1 ? '' : 'es'}
                    </Typography>
                  </Stack>
                  {rows.map((p) => (
                    <Box
                      key={p.id}
                      component={RouterLink}
                      href={procHref(p.departmentId, p.id)}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '112px minmax(0,1fr) 120px 42px',
                        gap: 1.25,
                        alignItems: 'center',
                        px: 1,
                        py: 0.7,
                        borderRadius: 1,
                        textDecoration: 'none',
                        color: 'inherit',
                        '&:hover': { bgcolor: C.wash },
                      }}
                    >
                      <Typography variant="caption" sx={{ color: C.soft, fontFamily: 'monospace' }}>
                        {p.code}
                      </Typography>
                      <Typography variant="body2" noWrap sx={{ color: C.ink }}>
                        {p.name}
                      </Typography>
                      <MiniBar value={p.subProcessCount} max={maxSub} color={ctx.colorOf(pf.id)} />
                      <Typography
                        variant="caption"
                        sx={{ color: C.ink, fontWeight: 700, textAlign: 'right' }}
                      >
                        {p.subProcessCount}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ))}
            </Stack>
          ) : (
            <Empty text="No process matches this search." />
          )}
        </ScrollList>
      </Card>
    </>
  );
}

// ----------------------------------------------------------------------
// 3. Sub-processes
// ----------------------------------------------------------------------

const SIZE_BUCKETS: Array<{ label: string; min: number; max: number; color: string }> = [
  { label: 'Empty (none yet)', min: 0, max: 0, color: '#EEF0F3' },
  { label: '1 – 5 sub-processes', min: 1, max: 5, color: '#C4CDD5' },
  { label: '6 – 10', min: 6, max: 10, color: '#00A8B5' },
  { label: '11 – 20', min: 11, max: 20, color: '#1E4E8C' },
  { label: '21 – 50', min: 21, max: 50, color: '#F5A524' },
  { label: 'Over 50', min: 51, max: Infinity, color: '#ED1C24' },
];

function SubsView({ ctx }: { ctx: Ctx }) {
  const top = useMemo(
    () => [...ctx.procs].sort((a, b) => b.subProcessCount - a.subProcessCount).slice(0, 10),
    [ctx.procs]
  );
  const slices = SIZE_BUCKETS.map((b) => ({
    label: b.label,
    color: b.color,
    value: ctx.procs.filter((p) => p.subProcessCount >= b.min && p.subProcessCount <= b.max).length,
  })).filter((s) => s.value > 0);
  const avg = ctx.procs.length
    ? round(ctx.procs.reduce((sum, p) => sum + p.subProcessCount, 0) / ctx.procs.length, 1)
    : 0;

  return (
    <>
      <Card
        title="How big are the processes?"
        subtitle={`Processes grouped by their number of sub-processes · average ${avg}`}
      >
        <DonutWithLegend slices={slices} unit="processes" />
      </Card>
      <Card title="Ten largest processes" subtitle="Colour shows the owning process function">
        <BarChart
          unit="sub-processes"
          items={top.map((p) => ({
            label: `${p.code}  ${p.name.length > 30 ? `${p.name.slice(0, 29)}…` : p.name}`,
            value: p.subProcessCount,
            color: ctx.colorOf(p.departmentId),
          }))}
        />
        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75} sx={{ mt: 1 }}>
          {[...new Set(top.map((p) => p.departmentId))].map((id) => (
            <FnTag key={id} name={ctx.nameOf(id)} color={ctx.colorOf(id)} />
          ))}
        </Stack>
      </Card>
    </>
  );
}

// ----------------------------------------------------------------------
// 4. Job roles
// ----------------------------------------------------------------------

function RolesView({ pfRows, roles, ctx }: { pfRows: PfRow[]; roles: Role[]; ctx: Ctx }) {
  const [query, setQuery] = useState('');
  const scope = useMemo(() => new Set(pfRows.map((pf) => pf.id)), [pfRows]);
  const q = query.trim().toLowerCase();

  const reach = [
    { label: 'One function', color: '#C4CDD5', n: 1 },
    { label: 'Two functions', color: '#1E4E8C', n: 2 },
    { label: 'Three or more', color: '#ED1C24', n: 3 },
  ]
    .map((b) => ({
      label: b.label,
      color: b.color,
      value: roles.filter((r) =>
        b.n === 3 ? r.departmentIds.length >= 3 : r.departmentIds.length === b.n
      ).length,
    }))
    .filter((s) => s.value > 0);

  const perFunction = [...pfRows]
    .map((pf) => ({
      label: cleanName(pf.name),
      value: roles.filter((r) => r.departmentIds.includes(pf.id)).length,
      color: ctx.colorOf(pf.id),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const shared = useMemo(
    () =>
      roles
        .filter((r) => r.departments.filter((d) => scope.has(d.departmentId)).length > 1)
        .filter((r) => !q || r.name.toLowerCase().includes(q))
        .sort((a, b) => b.departments.length - a.departments.length || b.taskCount - a.taskCount),
    [roles, scope, q]
  );

  return (
    <>
      <Card
        title="Do roles stay in one function?"
        subtitle="How many process functions each role works in"
      >
        <DonutWithLegend slices={reach} unit="roles" />
      </Card>
      <Card title="Roles per function" subtitle="Distinct job roles found in each function's RACI">
        <BarChart unit="roles" items={perFunction} />
      </Card>
      <Card
        title="Roles that span functions"
        subtitle={`${shared.length} role${shared.length === 1 ? '' : 's'} work in more than one process function`}
      >
        <SearchBox value={query} onChange={setQuery} placeholder="Search a shared role…" />
        <ScrollList max={320}>
          {shared.length ? (
            <Stack spacing={0.5}>
              {shared.map((role) => (
                <Box
                  key={role.name}
                  sx={{ px: 1, py: 0.9, borderRadius: 1, '&:hover': { bgcolor: C.wash } }}
                >
                  <Stack direction="row" justifyContent="space-between" spacing={1}>
                    <Typography variant="body2" noWrap sx={{ color: C.ink, fontWeight: 600 }}>
                      {role.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: C.soft, whiteSpace: 'nowrap' }}>
                      {role.taskCount} sub-processes
                    </Typography>
                  </Stack>
                  <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5} sx={{ mt: 0.6 }}>
                    {role.departments
                      .filter((d) => scope.has(d.departmentId))
                      .map((d) => (
                        <FnTag
                          key={d.departmentId}
                          name={ctx.nameOf(d.departmentId)}
                          color={ctx.colorOf(d.departmentId)}
                          extra={`${d.taskCount}`}
                        />
                      ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          ) : (
            <Empty text="No shared role matches this search." />
          )}
        </ScrollList>
      </Card>
    </>
  );
}

// ----------------------------------------------------------------------
// 5. Policies
// ----------------------------------------------------------------------

function PoliciesView({
  pfRows,
  policyRows,
  ctx,
}: {
  pfRows: PfRow[];
  policyRows: PolicyRow[];
  ctx: Ctx;
}) {
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState('');
  const scope = useMemo(() => new Set(pfRows.map((pf) => pf.id)), [pfRows]);
  const q = query.trim().toLowerCase();

  const openPdf = (policyId: string) => {
    setPdfError('');
    setBusyId(policyId);
    openPolicyPdfInNewTab(policyId)
      .catch((err: Error) => setPdfError(err.message || 'Could not open the policy PDF.'))
      .finally(() => setBusyId(null));
  };

  const rows = useMemo(
    () =>
      policyRows
        .map((p) => ({ ...p, departments: p.departments.filter((d) => scope.has(d.departmentId)) }))
        .filter((p) => p.departments.length)
        .filter((p) => !q || p.name.toLowerCase().includes(q)),
    [policyRows, scope, q]
  );

  const perFunction = pfRows
    .map((pf) => ({
      label: cleanName(pf.name),
      value: pf.policies ?? 0,
      color: ctx.colorOf(pf.id),
    }))
    .filter((item) => item.value > 0);

  return (
    <>
      <Card title="Policies per function" subtitle="Which process functions carry the policies">
        {perFunction.length ? (
          <SegmentBar unit="policies" parts={perFunction} />
        ) : (
          <Empty text="No policies linked yet." />
        )}
      </Card>
      <Card
        title="All policies"
        subtitle="Click a policy to open its PDF in a new tab · with the process function and processes it is linked to"
      >
        <SearchBox value={query} onChange={setQuery} placeholder="Search a policy…" />
        {pdfError ? (
          <Typography variant="caption" sx={{ color: C.red, display: 'block', mb: 1 }}>
            {pdfError}
          </Typography>
        ) : null}
        <ScrollList max={400}>
          {rows.length ? (
            <Stack spacing={0.75}>
              {rows.map((policy) => (
                <Box key={policy.name} sx={{ p: 1.25, borderRadius: 1.5, bgcolor: C.wash }}>
                  <Stack
                    direction="row"
                    alignItems="flex-start"
                    spacing={1}
                    justifyContent="space-between"
                  >
                    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ minWidth: 0 }}>
                      <Iconify
                        icon="solar:document-bold"
                        width={18}
                        sx={{ color: policy.policyId ? C.red : C.soft, mt: '2px', flexShrink: 0 }}
                      />
                      {policy.policyId ? (
                        <Tooltip title="Open the policy as a PDF in a new tab">
                          <Box
                            component="button"
                            type="button"
                            onClick={() => openPdf(policy.policyId as string)}
                            sx={{
                              all: 'unset',
                              cursor: 'pointer',
                              color: C.ink,
                              fontWeight: 700,
                              fontSize: 14,
                              lineHeight: 1.5,
                              '&:hover': { color: C.red, textDecoration: 'underline' },
                              '&:focus-visible': {
                                outline: `2px solid ${C.red}`,
                                borderRadius: 0.5,
                              },
                            }}
                          >
                            {policy.name}
                          </Box>
                        </Tooltip>
                      ) : (
                        <Typography variant="subtitle2" sx={{ color: C.ink, fontWeight: 700 }}>
                          {policy.name}
                        </Typography>
                      )}
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={1} flexShrink={0}>
                      <Typography variant="caption" sx={{ color: C.soft, whiteSpace: 'nowrap' }}>
                        {policy.processCount} process{policy.processCount === 1 ? '' : 'es'}
                      </Typography>
                      {policy.policyId ? (
                        <Box
                          component="button"
                          type="button"
                          onClick={() => openPdf(policy.policyId as string)}
                          disabled={busyId === policy.policyId}
                          sx={{
                            all: 'unset',
                            cursor: 'pointer',
                            px: 1,
                            py: 0.3,
                            borderRadius: 1,
                            fontSize: 11.5,
                            fontWeight: 800,
                            letterSpacing: 0.4,
                            color: '#fff',
                            bgcolor: C.red,
                            '&:hover': { bgcolor: '#C4161D' },
                            '&[disabled]': { opacity: 0.6, cursor: 'progress' },
                            '&:focus-visible': { outline: `2px solid ${C.ink}`, outlineOffset: 1 },
                          }}
                        >
                          {busyId === policy.policyId ? '…' : 'PDF'}
                        </Box>
                      ) : (
                        <Tooltip title="This policy is typed as text on the sub-process and is not linked to a Policy Creator document.">
                          <Typography
                            variant="caption"
                            sx={{ color: C.soft, whiteSpace: 'nowrap' }}
                          >
                            No document
                          </Typography>
                        </Tooltip>
                      )}
                    </Stack>
                  </Stack>
                  <Stack spacing={0.9} sx={{ mt: 1, ml: 3.25 }}>
                    {policy.departments.map((d) => (
                      <Box key={d.departmentId}>
                        <Box
                          component={RouterLink}
                          href={pfHref(d.departmentId, ctx.companyCode)}
                          sx={{ textDecoration: 'none', display: 'inline-flex', maxWidth: '100%' }}
                        >
                          <FnTag
                            name={ctx.nameOf(d.departmentId)}
                            color={ctx.colorOf(d.departmentId)}
                            extra={`${d.subProcessCount} sub-process${d.subProcessCount === 1 ? '' : 'es'}`}
                          />
                        </Box>
                        <Stack
                          direction="row"
                          flexWrap="wrap"
                          useFlexGap
                          spacing={0.5}
                          sx={{ mt: 0.6 }}
                        >
                          {d.processes.map((proc) => (
                            <Box
                              key={proc.id}
                              component={RouterLink}
                              href={procHref(d.departmentId, proc.id)}
                              sx={{
                                px: 0.9,
                                py: 0.25,
                                borderRadius: 1,
                                bgcolor: C.paper,
                                border: `1px solid ${C.line}`,
                                fontSize: 12,
                                color: C.ink,
                                textDecoration: 'none',
                                '&:hover': { borderColor: C.red, color: C.red },
                              }}
                            >
                              <Box
                                component="span"
                                sx={{ fontFamily: 'monospace', color: C.soft, mr: 0.6 }}
                              >
                                {proc.code}
                              </Box>
                              {proc.name}
                            </Box>
                          ))}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          ) : (
            <Empty text="No policy matches this search." />
          )}
        </ScrollList>
      </Card>
    </>
  );
}

// ----------------------------------------------------------------------
// 6. TAT
// ----------------------------------------------------------------------

function TatView({
  pfRows,
  totalTat,
  ctx,
}: {
  pfRows: PfRow[];
  totalTat: number | null;
  ctx: Ctx;
}) {
  const perFunction = pfRows
    .filter((pf) => pf.tatDaysAvg != null && pf.tatDaysAvg > 0)
    .map((pf) => ({
      label: cleanName(pf.name),
      value: pf.tatDaysAvg as number,
      color: ctx.colorOf(pf.id),
      note: `· ${pf.tatDaysSampleSize} activities`,
    }))
    .sort((a, b) => b.value - a.value);

  const slowest = useMemo(
    () =>
      ctx.procs
        .filter((p) => p.tatDaysAvg != null && p.tatDaysAvg > 0)
        .sort((a, b) => (b.tatDaysAvg ?? 0) - (a.tatDaysAvg ?? 0)),
    [ctx.procs]
  );
  const maxTat = Math.max(...slowest.map((p) => p.tatDaysAvg ?? 0), 1);
  const thin = perFunction.some((item) => parseInt(item.note.replace(/\D/g, ''), 10) < 10);

  return (
    <>
      <Card
        title="Average TAT per function"
        subtitle={`Days · company average ${totalTat ?? '—'} · the number beside each bar is how many activities it is based on`}
      >
        <BarChart unit="days" decimals={1} items={perFunction} />
        {thin ? (
          <Typography variant="caption" sx={{ color: C.soft, display: 'block', mt: 1 }}>
            An average built on only a handful of activities is not very reliable.
          </Typography>
        ) : null}
      </Card>
      <Card
        title="Slowest processes"
        subtitle="Average TAT per process, for processes that have a TAT filled in"
      >
        <ScrollList max={330}>
          {slowest.length ? (
            <Stack spacing={0.25}>
              {slowest.map((p) => (
                <Box
                  key={p.id}
                  component={RouterLink}
                  href={procHref(p.departmentId, p.id)}
                  sx={{
                    px: 1,
                    py: 0.8,
                    borderRadius: 1,
                    textDecoration: 'none',
                    color: 'inherit',
                    '&:hover': { bgcolor: C.wash },
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.25}>
                    <Typography
                      variant="caption"
                      sx={{ color: C.soft, fontFamily: 'monospace', minWidth: 112 }}
                    >
                      {p.code}
                    </Typography>
                    <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, color: C.ink }}>
                      {p.name}
                    </Typography>
                    <FnTag name={ctx.nameOf(p.departmentId)} color={ctx.colorOf(p.departmentId)} />
                    <Typography
                      variant="body2"
                      sx={{ color: C.ink, fontWeight: 700, minWidth: 54, textAlign: 'right' }}
                    >
                      {round(p.tatDaysAvg ?? 0, 1)} d
                    </Typography>
                  </Stack>
                  <Box sx={{ ml: '124px', mt: 0.5 }}>
                    <MiniBar
                      value={p.tatDaysAvg ?? 0}
                      max={maxTat}
                      color={ctx.colorOf(p.departmentId)}
                    />
                  </Box>
                </Box>
              ))}
            </Stack>
          ) : (
            <Empty text="No process has a TAT filled in yet." />
          )}
        </ScrollList>
      </Card>
    </>
  );
}
