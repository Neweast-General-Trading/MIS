import type { CompanyDashboardSummary } from 'src/sections/bpm/api';

import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';

import { RouterLink } from 'src/routes/components';

import { Iconify } from 'src/components/iconify';
import { Chart, useChart } from 'src/components/chart';

import {
  BpmTablePagination,
  useBpmTablePagination,
} from 'src/sections/bpm/components/bpm-table-kit';

// ----------------------------------------------------------------------

const C = {
  ink: '#1C252E',
  soft: '#637381',
  line: 'rgba(145, 158, 171, 0.2)',
  wash: '#F4F6F8',
  paper: '#FFFFFF',
  red: '#ED1C24',
  redSoft: 'rgba(237, 28, 36, 0.06)',
};

type Role = CompanyDashboardSummary['jobRoles'][number];
type PfRow = CompanyDashboardSummary['processFunctionRows'][number];
type SortKey = 'tasks' | 'functions' | 'name';
type Letter = 'R' | 'A' | 'C' | 'I' | 'V' | 'P';

const RACI: Array<{ letter: Letter; title: string; fill: string; ink: string }> = [
  { letter: 'R', title: 'Responsible', fill: '#FDE8E8', ink: '#B31218' },
  { letter: 'A', title: 'Accountable', fill: '#E3EEFB', ink: '#1E4E8C' },
  { letter: 'C', title: 'Consulted', fill: '#FFF1CC', ink: '#8A5A00' },
  { letter: 'I', title: 'Informed', fill: '#EEF0F3', ink: '#4B5563' },
  { letter: 'V', title: 'Verifier', fill: '#D9F2E1', ink: '#1B6B3A' },
  { letter: 'P', title: 'Approver', fill: '#EDE4FA', ink: '#5B33A6' },
];

function cleanPfName(name: string): string {
  return (
    name
      .replace(/^\d{1,3}[-_.\s]+/, '')
      .replace(/^\d{3}(?:-\d{3}){1,3}\s*[-_]?\s*/i, '')
      .trim() || name
  );
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Shows the part of a name that matches the search in bold. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'ig'));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <Box
            key={index}
            component="mark"
            sx={{
              bgcolor: 'rgba(237, 28, 36, 0.14)',
              color: 'inherit',
              px: 0.25,
              borderRadius: 0.5,
            }}
          >
            {part}
          </Box>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <Box sx={{ flex: 1, minWidth: 92, px: 1.5, py: 1, borderRadius: 1.5, bgcolor: C.wash }}>
      <Typography variant="caption" sx={{ color: C.soft, display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ color: C.ink, fontWeight: 700, lineHeight: 1.25 }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Compact "P 3" / "E 2" pill used in rows. */
function MiniBadge({
  tone,
  letter,
  value,
  title,
}: {
  tone: { fill: string; ink: string };
  letter: string;
  value: number;
  title: string;
}) {
  if (!value) return null;
  return (
    <Tooltip title={title}>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: 0.75,
          py: 0.2,
          borderRadius: 99,
          bgcolor: tone.fill,
          color: tone.ink,
          fontSize: 11.5,
          fontWeight: 700,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
        }}
      >
        {letter}
        <Box component="span" sx={{ fontWeight: 800 }}>
          {value}
        </Box>
      </Box>
    </Tooltip>
  );
}

const APPROVER_TONE = { fill: '#EDE4FA', ink: '#5B33A6' };

function RaciChips({ raci }: { raci: Record<Letter, number> }) {
  const items = [
    ...RACI.map((item) => ({ ...item, count: raci[item.letter], tip: `${item.title} in` })),
  ].filter((item) => item.count > 0);
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
      {items.map((item) => (
        <Tooltip
          key={item.letter}
          title={`${item.tip} ${item.count} sub-process${item.count === 1 ? '' : 'es'}`}
        >
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.6,
              pl: 0.4,
              pr: 0.9,
              py: 0.3,
              borderRadius: 99,
              bgcolor: item.fill,
              color: item.ink,
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            <Box
              sx={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                bgcolor: item.ink,
                color: '#fff',
                fontSize: 10.5,
                fontWeight: 800,
              }}
            >
              {item.letter}
            </Box>
            {item.title}
            <Box component="span" sx={{ fontWeight: 800 }}>
              {item.count}
            </Box>
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}

type Dept = Role['departments'][number];

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

type DialogBodyProps = {
  role: Role;
  dept: Dept;
  pf: PfRow | undefined;
  companyCode: string;
  query: string;
  onQuery: (value: string) => void;
  onClose: () => void;
};

function DeptDialogBody({ role, dept, pf, companyCode, query, onQuery, onClose }: DialogBodyProps) {
  const q = query.trim().toLowerCase();
  const processes = useMemo(
    () =>
      [...dept.processes]
        .filter((proc) => !q || `${proc.code} ${proc.name}`.toLowerCase().includes(q))
        .sort((a, b) => b.taskCount - a.taskCount || a.name.localeCompare(b.name)),
    [dept.processes, q]
  );
  const topCount = dept.processes.reduce((max, proc) => Math.max(max, proc.taskCount), 1);

  return (
    <>
      <Box sx={{ px: 2.5, pt: 2.25, pb: 1.75, borderBottom: `1px solid ${C.line}` }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: C.soft, letterSpacing: 1 }}>
              {role.name}
            </Typography>
            <Typography variant="h6" sx={{ color: C.ink, fontWeight: 700, lineHeight: 1.25 }}>
              {pf ? cleanPfName(pf.name) : 'Process function'}
            </Typography>
            {pf ? (
              <Typography variant="caption" sx={{ color: C.soft, fontFamily: 'monospace' }}>
                {pf.code}
              </Typography>
            ) : null}
          </Box>
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="Close"
            sx={{ mt: -0.5, mr: -0.75 }}
          >
            <Iconify icon="mingcute:close-line" width={20} />
          </IconButton>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
          <Fact label="Processes" value={dept.processCount} />
          <Fact label="Sub-processes" value={dept.taskCount} />
          <Fact label="Avg TAT (days)" value={dept.tatDaysAvg ?? '—'} />
          <Fact label="Approver in" value={dept.raci.P} />
        </Stack>
        <Box sx={{ mt: 1.25 }}>
          <RaciChips raci={dept.raci} />
        </Box>
      </Box>

      {dept.processes.length > 6 ? (
        <Box sx={{ px: 2.5, pt: 1.5 }}>
          <TextField
            size="small"
            fullWidth
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search a process…"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Iconify icon="eva:search-fill" width={18} sx={{ color: C.soft }} />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
      ) : null}

      <Box sx={{ ...SCROLL_SX, flex: 1, minHeight: 120, px: 1.5, py: 1.25 }}>
        {processes.length ? (
          <Stack spacing={0.25}>
            {processes.map((proc) => (
              <Box
                key={proc.id}
                component={RouterLink}
                href={`/departments/${dept.departmentId}/processes/${proc.id}/activities-table`}
                sx={{
                  display: 'block',
                  px: 1,
                  py: 0.9,
                  borderRadius: 1,
                  textDecoration: 'none',
                  color: 'inherit',
                  '&:hover': { bgcolor: C.wash },
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <Typography
                    variant="caption"
                    sx={{ color: C.soft, fontFamily: 'monospace', minWidth: 84 }}
                  >
                    {proc.code}
                  </Typography>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0, color: C.ink }}>
                    {proc.name}
                  </Typography>
                  <MiniBadge
                    tone={APPROVER_TONE}
                    letter="P"
                    value={proc.approvalCount}
                    title={`Approver in ${proc.approvalCount} sub-process(es) of this process`}
                  />
                  <Typography variant="caption" sx={{ color: C.soft, whiteSpace: 'nowrap' }}>
                    {proc.taskCount} sub
                  </Typography>
                  <Iconify icon="eva:arrow-ios-forward-fill" width={16} sx={{ color: C.soft }} />
                </Stack>
                <Box sx={{ mt: 0.6, ml: '96px', height: 3, borderRadius: 99, bgcolor: C.wash }}>
                  <Box
                    sx={{
                      width: `${Math.max(6, Math.round((proc.taskCount / topCount) * 100))}%`,
                      height: 1,
                      borderRadius: 99,
                      bgcolor: C.red,
                      opacity: 0.7,
                    }}
                  />
                </Box>
              </Box>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ color: C.soft, textAlign: 'center', py: 4 }}>
            No process matches “{query}”.
          </Typography>
        )}
      </Box>

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2.5, py: 1.25, borderTop: `1px solid ${C.line}` }}
      >
        <Typography variant="caption" sx={{ color: C.soft }}>
          {processes.length} of {dept.processes.length} process
          {dept.processes.length === 1 ? '' : 'es'}
        </Typography>
        <Typography
          component={RouterLink}
          href={`/departments/${dept.departmentId}/processes?company=${encodeURIComponent(companyCode)}`}
          variant="subtitle2"
          sx={{
            color: C.red,
            fontWeight: 700,
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          Open process function →
        </Typography>
      </Stack>
    </>
  );
}

const PIE_COLORS = ['#ED1C24', '#1C252E', '#1E4E8C', '#F5A524', '#1B6B3A', '#8E33FF', '#00A8B5'];
const PIE_OTHER = '#C4CDD5';

type OverviewMode = 'workload' | 'approvals' | 'reach' | 'function';
type Slice = { label: string; value: number; roleName?: string; hint?: string };

type OverviewProps = {
  roles: Role[];
  pfById: Map<string, PfRow>;
  onPick: (name: string) => void;
  onShared: () => void;
};

function RolesOverview({ roles, pfById, onPick, onShared }: OverviewProps) {
  const [mode, setMode] = useState<OverviewMode>('workload');

  const slices = useMemo<Slice[]>(() => {
    if (mode === 'reach') {
      const one = roles.filter((r) => r.departments.length === 1).length;
      const two = roles.filter((r) => r.departments.length === 2).length;
      const many = roles.filter((r) => r.departments.length > 2).length;
      return [
        { label: 'One function', value: one },
        { label: 'Two functions', value: two, hint: 'shared' },
        { label: '3+ functions', value: many, hint: 'shared' },
      ].filter((item) => item.value > 0);
    }
    if (mode === 'function') {
      const counts = new Map<string, number>();
      roles.forEach((role) =>
        role.departments.forEach((dept) =>
          counts.set(dept.departmentId, (counts.get(dept.departmentId) ?? 0) + 1)
        )
      );
      return [...counts.entries()]
        .map(([id, value]) => {
          const pf = pfById.get(id);
          return { label: pf ? cleanPfName(pf.name) : 'Process function', value };
        })
        .sort((a, b) => b.value - a.value);
    }
    const valueOf = (role: Role) =>
      mode === 'approvals' ? role.approvalCount : role.taskCount;
    const sorted = roles.filter((role) => valueOf(role) > 0).sort((a, b) => valueOf(b) - valueOf(a));
    const top = sorted.slice(0, 6).map((role) => ({
      label: role.name,
      value: valueOf(role),
      roleName: role.name,
    }));
    const rest = sorted.slice(6).reduce((sum, role) => sum + valueOf(role), 0);
    return rest > 0 ? [...top, { label: 'All other roles', value: rest }] : top;
  }, [mode, roles, pfById]);

  const total = slices.reduce((sum, item) => sum + item.value, 0);
  const colorOf = (item: Slice, index: number) =>
    item.label === 'All other roles' ? PIE_OTHER : PIE_COLORS[index % PIE_COLORS.length];

  const handleSlice = (item: Slice | undefined) => {
    if (!item) return;
    if (item.roleName) onPick(item.roleName);
    else if (item.hint === 'shared') onShared();
  };

  const options = useChart({
    colors: slices.map(colorOf),
    labels: slices.map((item) => item.label),
    stroke: { width: 3, colors: ['#FFFFFF'] },
    legend: { show: false },
    dataLabels: { enabled: false },
    chart: {
      events: {
        dataPointSelection: (_event: unknown, _ctx: unknown, config: { dataPointIndex: number }) =>
          handleSlice(slices[config.dataPointIndex]),
      },
    },
    tooltip: {
      y: { formatter: (value: number) => `${value}`, title: { formatter: () => '' } },
    },
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
              fontSize: '26px',
              fontWeight: 700,
              formatter: (value: string) => value,
            },
            total: {
              show: true,
              showAlways: true,
              label:
                mode === 'workload'
                  ? 'sub-processes'
                  : mode === 'approvals'
                    ? 'approvals'
                    : mode === 'reach'
                      ? 'job roles'
                      : 'role links',
              color: C.soft,
              fontSize: '12px',
              formatter: () => String(total),
            },
          },
        },
      },
    },
  });

  const MODES: Array<{ id: OverviewMode; label: string; note: string }> = [
    { id: 'workload', label: 'Workload', note: 'Top roles by sub-processes they take part in' },
    { id: 'approvals', label: 'Approvals', note: 'Top roles by sub-processes they approve' },
    { id: 'reach', label: 'Reach', note: 'How many process functions each role works in' },
    { id: 'function', label: 'By function', note: 'Job roles found in each process function' },
  ];

  return (
    <Stack spacing={1.5} sx={{ minHeight: 280 }}>
      <Box>
        <Typography variant="subtitle1" sx={{ color: C.ink, fontWeight: 700 }}>
          Pick a job role
        </Typography>
        <Typography variant="body2" sx={{ color: C.soft }}>
          Search on the left, or click a slice or a legend row below to jump straight to a role.
        </Typography>
      </Box>

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {MODES.map((item) => (
          <Tooltip key={item.id} title={item.note}>
            <Chip
              size="small"
              clickable
              label={item.label}
              onClick={() => setMode(item.id)}
              sx={{
                fontWeight: 600,
                bgcolor: mode === item.id ? C.ink : C.wash,
                color: mode === item.id ? '#fff' : C.ink,
                '&:hover': { bgcolor: mode === item.id ? C.ink : 'rgba(145,158,171,0.24)' },
              }}
            />
          </Tooltip>
        ))}
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '230px minmax(0, 1fr)' },
          gap: 2,
          alignItems: 'center',
        }}
      >
        <Chart
          key={mode}
          type="donut"
          series={slices.map((item) => item.value)}
          options={options}
          sx={{ mx: 'auto', width: 230, height: 230 }}
        />
        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
          {slices.map((item, index) => {
            const clickable = Boolean(item.roleName) || item.hint === 'shared';
            return (
              <Box
                key={item.label}
                onClick={clickable ? () => handleSlice(item) : undefined}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  py: 0.6,
                  borderRadius: 1,
                  cursor: clickable ? 'pointer' : 'default',
                  '&:hover': clickable ? { bgcolor: C.wash } : undefined,
                }}
              >
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '3px',
                    flexShrink: 0,
                    bgcolor: colorOf(item, index),
                  }}
                />
                <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, color: C.ink }}>
                  {item.label}
                </Typography>
                <Typography variant="body2" sx={{ color: C.ink, fontWeight: 700 }}>
                  {item.value}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: C.soft, minWidth: 36, textAlign: 'right' }}
                >
                  {total ? Math.round((item.value / total) * 100) : 0}%
                </Typography>
              </Box>
            );
          })}
        </Stack>
      </Box>
    </Stack>
  );
}

type Props = {
  roles: Role[];
  processFunctions: PfRow[];
  companyCode: string;
  approvalSubProcesses?: number;
};

/**
 * Job Roles Wise: pick any job role and see every process function it works in,
 * with how much work it has there, its RACI involvement and the processes behind it.
 */
export function JobRolesWiseSection({
  roles,
  processFunctions,
  companyCode,
  approvalSubProcesses,
}: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('tasks');
  const [sharedOnly, setSharedOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [dialogDept, setDialogDept] = useState<string | null>(null);
  const [procQuery, setProcQuery] = useState('');

  const pfById = useMemo(
    () => new Map(processFunctions.map((row) => [row.id, row])),
    [processFunctions]
  );
  const sharedCount = useMemo(
    () => roles.filter((role) => role.departments.length > 1).length,
    [roles]
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = roles.filter(
      (role) =>
        (!sharedOnly || role.departments.length > 1) &&
        (!q || role.name.toLowerCase().includes(q))
    );
    return rows.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'functions')
        return b.departments.length - a.departments.length || b.taskCount - a.taskCount;
      return b.taskCount - a.taskCount || a.name.localeCompare(b.name);
    });
  }, [roles, query, sort, sharedOnly]);

  const pagination = useBpmTablePagination(list, 8);
  const active = useMemo(
    () => roles.find((role) => role.name === selected) ?? null,
    [roles, selected]
  );

  // Searching jumps to the first match, so the answer is on screen without another click.
  useEffect(() => {
    if (query.trim() && list.length) setSelected(list[0].name);
  }, [query, list]);

  useEffect(() => {
    setDialogDept(null);
  }, [selected]);

  const openDept = (id: string) => {
    setProcQuery('');
    setDialogDept(id);
  };

  const dialogData = useMemo(() => {
    if (!active || !dialogDept) return null;
    const dept = active.departments.find((item) => item.departmentId === dialogDept);
    return dept ? { dept, pf: pfById.get(dept.departmentId) } : null;
  }, [active, dialogDept, pfById]);

  const activeRaci = useMemo(() => {
    const total: Record<Letter, number> = { R: 0, A: 0, C: 0, I: 0, V: 0, P: 0 };
    active?.departments.forEach((dept) =>
      RACI.forEach(({ letter }) => {
        total[letter] += dept.raci[letter];
      })
    );
    return total;
  }, [active]);

  const maxTasks = active ? Math.max(...active.departments.map((d) => d.taskCount), 1) : 1;
  const totalProcesses = active
    ? active.departments.reduce((sum, d) => sum + d.processCount, 0)
    : 0;

  return (
    <Box
      sx={{ bgcolor: C.paper, border: `1px solid ${C.line}`, borderRadius: 2, overflow: 'hidden' }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        spacing={1}
        sx={{ px: { xs: 2, md: 2.25 }, py: 1.5, borderBottom: `1px solid ${C.line}` }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: C.ink }}>
            Job Roles Wise
          </Typography>
          <Typography variant="caption" sx={{ color: C.soft }}>
            Find a job role and see which process functions it works in.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            label={`${roles.length} roles`}
            sx={{ bgcolor: C.wash, fontWeight: 600 }}
          />
          <Chip
            size="small"
            label={`${sharedCount} in more than one function`}
            sx={{ bgcolor: C.redSoft, color: '#B31218', fontWeight: 600 }}
          />
          {approvalSubProcesses ? (
            <Chip
              size="small"
              label={`${approvalSubProcesses} with approval flow`}
              sx={{ bgcolor: APPROVER_TONE.fill, color: APPROVER_TONE.ink, fontWeight: 600 }}
            />
          ) : null}
        </Stack>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 5fr) minmax(0, 7fr)' },
        }}
      >
        {/* Left: search and list */}
        <Box
          sx={{ p: { xs: 1.25, md: 1.5 }, borderRight: { lg: `1px solid ${C.line}` }, minWidth: 0 }}
        >
          <Stack spacing={1.25}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search a job role…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Iconify icon="eva:search-fill" width={18} sx={{ color: C.soft }} />
                  </InputAdornment>
                ),
                endAdornment: query ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setQuery('')} aria-label="Clear search">
                      <Typography
                        component="span"
                        sx={{ fontSize: 18, lineHeight: 1, color: C.soft }}
                      >
                        ×
                      </Typography>
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: C.paper } }}
            />
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                clickable
                label="In several functions"
                onClick={() => setSharedOnly((value) => !value)}
                sx={{
                  fontWeight: 600,
                  bgcolor: sharedOnly ? C.red : C.wash,
                  color: sharedOnly ? '#fff' : C.ink,
                  '&:hover': { bgcolor: sharedOnly ? '#C4161D' : 'rgba(145,158,171,0.24)' },
                }}
              />
              <Box sx={{ flex: 1 }} />
              <TextField
                select
                size="small"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                sx={{ minWidth: 176, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                SelectProps={{ MenuProps: { disableScrollLock: true } }}
              >
                <MenuItem value="tasks">Most sub-processes</MenuItem>
                <MenuItem value="functions">Most functions</MenuItem>
                <MenuItem value="name">A – Z</MenuItem>
              </TextField>
            </Stack>

            <Stack spacing={0.25}>
              {pagination.pageRows.map((role) => {
                const isActive = role.name === selected;
                return (
                  <Box
                    key={role.name}
                    onClick={() => setSelected(role.name)}
                    sx={{
                      cursor: 'pointer',
                      px: 1.25,
                      py: 0.9,
                      borderRadius: 1.25,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      bgcolor: isActive ? C.redSoft : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(237,28,36,0.22)' : 'transparent'}`,
                      '&:hover': { bgcolor: isActive ? C.redSoft : C.wash },
                    }}
                  >
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ flex: 1, minWidth: 0, fontWeight: isActive ? 700 : 500, color: C.ink }}
                    >
                      <Highlight text={role.name} query={query} />
                    </Typography>
                    <Tooltip
                      title={`Works in ${role.departments.length} process function${role.departments.length === 1 ? '' : 's'}`}
                    >
                      <Box
                        sx={{
                          px: 0.9,
                          py: 0.125,
                          borderRadius: 99,
                          fontSize: 12,
                          fontWeight: 700,
                          bgcolor: role.departments.length > 1 ? C.redSoft : C.wash,
                          color: role.departments.length > 1 ? '#B31218' : C.soft,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {role.departments.length} PF
                      </Box>
                    </Tooltip>
                    <Typography
                      variant="caption"
                      sx={{ color: C.soft, minWidth: 28, textAlign: 'right' }}
                    >
                      {role.taskCount}
                    </Typography>
                  </Box>
                );
              })}
              {!pagination.total ? (
                <Typography variant="body2" sx={{ color: C.soft, py: 4, textAlign: 'center' }}>
                  No job role matches this search.
                </Typography>
              ) : null}
            </Stack>
          </Stack>
          <Box sx={{ mx: -1.5, mb: -1.5, mt: 1 }}>
            <BpmTablePagination
              page={pagination.page}
              rowsPerPage={pagination.rowsPerPage}
              total={pagination.total}
              onPageChange={pagination.setPage}
              onRowsPerPageChange={pagination.setRowsPerPage}
              rowsPerPageOptions={[8, 15, 25]}
            />
          </Box>
        </Box>

        {/* Right: where the selected role works */}
        <Box sx={{ p: { xs: 1.25, md: 2 }, minWidth: 0 }}>
          {active ? (
            <Stack spacing={1.75}>
              <Box>
                <Typography variant="overline" sx={{ color: C.soft, letterSpacing: 1 }}>
                  Job role
                </Typography>
                <Typography
                  variant="h5"
                  sx={{ color: C.ink, fontWeight: 700, letterSpacing: -0.3 }}
                >
                  {active.name}
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Fact label="Process functions" value={active.departments.length} />
                <Fact label="Processes" value={totalProcesses} />
                <Fact label="Sub-processes" value={active.taskCount} />
                <Fact label="Avg TAT (days)" value={active.tatDaysAvg ?? '—'} />
                {active.employees != null ? <Fact label="FTE" value={active.employees} /> : null}
              </Stack>

              <Box>
                <Typography variant="caption" sx={{ color: C.soft, display: 'block', mb: 0.75 }}>
                  Involvement across all functions
                </Typography>
                <RaciChips raci={activeRaci} />
              </Box>

              <Typography variant="subtitle2" sx={{ color: C.ink, fontWeight: 700 }}>
                Works in {active.departments.length} process function
                {active.departments.length === 1 ? '' : 's'}
                <Box component="span" sx={{ ml: 1, color: C.soft, fontWeight: 500, fontSize: 12 }}>
                  Click one to see its processes
                </Box>
              </Typography>

              <Stack spacing={0.75}>
                {active.departments.map((dept) => {
                  const pf = pfById.get(dept.departmentId);
                  const share = Math.max(4, Math.round((dept.taskCount / maxTasks) * 100));
                  return (
                    <Box
                      key={dept.departmentId}
                      sx={{
                        border: `1px solid ${C.line}`,
                        transition: 'border-color .15s',
                        borderRadius: 1.5,
                        overflow: 'hidden',
                        '&:hover': { borderColor: 'rgba(237,28,36,0.3)' },
                      }}
                    >
                      <Box
                        onClick={() => openDept(dept.departmentId)}
                        sx={{
                          cursor: 'pointer',
                          px: 1.5,
                          py: 1.1,
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: 1,
                          alignItems: 'center',
                          bgcolor: C.paper,
                          '&:hover': { bgcolor: C.redSoft },
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Stack
                            direction="row"
                            alignItems="baseline"
                            spacing={1}
                            sx={{ minWidth: 0 }}
                          >
                            <Typography
                              variant="subtitle2"
                              noWrap
                              sx={{ color: C.ink, fontWeight: 700 }}
                            >
                              {pf ? cleanPfName(pf.name) : 'Process function'}
                            </Typography>
                            {pf ? (
                              <Typography
                                variant="caption"
                                sx={{ color: C.soft, fontFamily: 'monospace' }}
                              >
                                {pf.code}
                              </Typography>
                            ) : null}
                          </Stack>
                          <Box
                            sx={{
                              mt: 0.75,
                              height: 6,
                              borderRadius: 99,
                              bgcolor: C.wash,
                              overflow: 'hidden',
                            }}
                          >
                            <Box
                              sx={{
                                width: `${share}%`,
                                height: 1,
                                borderRadius: 99,
                                bgcolor: C.red,
                                opacity: 0.85,
                              }}
                            />
                          </Box>
                        </Box>
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                          <MiniBadge
                            tone={APPROVER_TONE}
                            letter="P"
                            value={dept.raci.P}
                            title={`Approver in ${dept.raci.P} sub-process(es)`}
                          />
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography
                              variant="subtitle2"
                              sx={{ color: C.ink, fontWeight: 700, lineHeight: 1.2 }}
                            >
                              {dept.taskCount}
                            </Typography>
                            <Typography variant="caption" sx={{ color: C.soft }}>
                              sub-processes
                            </Typography>
                          </Box>
                          <Iconify
                            icon="eva:arrow-ios-forward-fill"
                            width={18}
                            sx={{ color: C.soft }}
                          />
                        </Stack>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>

              <Typography variant="caption" sx={{ color: C.soft }}>
                A sub-process counts once for every RACI letter the role holds on it. P = approver (approval flow).
              </Typography>
            </Stack>
          ) : (
            <RolesOverview
              roles={roles}
              pfById={pfById}
              onPick={setSelected}
              onShared={() => {
                setSharedOnly(true);
                setSort('functions');
              }}
            />
          )}
        </Box>
      </Box>
      <Dialog
        open={Boolean(dialogData)}
        onClose={() => setDialogDept(null)}
        fullWidth
        maxWidth="sm"
        scroll="paper"
        slotProps={{ paper: { sx: { borderRadius: 2, maxHeight: 'min(680px, 86vh)' } } }}
      >
        {dialogData && active ? (
          <DeptDialogBody
            role={active}
            dept={dialogData.dept}
            pf={dialogData.pf}
            companyCode={companyCode}
            query={procQuery}
            onQuery={setProcQuery}
            onClose={() => setDialogDept(null)}
          />
        ) : null}
      </Dialog>
    </Box>
  );
}
