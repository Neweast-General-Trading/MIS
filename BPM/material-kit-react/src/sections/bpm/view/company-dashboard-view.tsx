import type { ReactNode } from 'react';

import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';

import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';

import { useCompanies } from 'src/sections/bpm/companies';
import { JobRolesWiseSection } from 'src/sections/bpm/components/job-roles-wise-section';
import { companyFullName, companyDisplayLabel } from 'src/sections/bpm/company-display.util';
import { type KpiKind, KpiInsightDialog } from 'src/sections/bpm/components/kpi-insight-dialog';
import {
  BpmTablePagination,
  useBpmTablePagination,
} from 'src/sections/bpm/components/bpm-table-kit';
import {
  companyBpmCode,
  fetchCompanyDashboardSummary,
  type CompanyDashboardSummary,
} from 'src/sections/bpm/api';

const C = {
  ink: '#1C252E',
  soft: '#637381',
  line: 'rgba(145, 158, 171, 0.2)',
  wash: '#F4F6F8',
  paper: '#FFFFFF',
  red: '#ED1C24',
  redSoft: 'rgba(237, 28, 36, 0.06)',
};

type MetricTone = 'rose' | 'slate' | 'sky' | 'mint' | 'sand' | 'lilac';

const METRIC_TONES: Record<
  MetricTone,
  { bg: string; border: string; accent: string; value: string }
> = {
  rose: {
    bg: 'linear-gradient(160deg, #FFF7F7 0%, #FFFFFF 70%)',
    border: 'rgba(237, 28, 36, 0.14)',
    accent: '#ED1C24',
    value: '#B31218',
  },
  slate: {
    bg: 'linear-gradient(160deg, #F5F7FA 0%, #FFFFFF 70%)',
    border: 'rgba(99, 115, 129, 0.18)',
    accent: '#637381',
    value: '#1C252E',
  },
  sky: {
    bg: 'linear-gradient(160deg, #F3F9FC 0%, #FFFFFF 70%)',
    border: 'rgba(14, 116, 144, 0.16)',
    accent: '#0E7490',
    value: '#155E75',
  },
  mint: {
    bg: 'linear-gradient(160deg, #F3FAF6 0%, #FFFFFF 70%)',
    border: 'rgba(22, 130, 90, 0.16)',
    accent: '#16825A',
    value: '#166534',
  },
  sand: {
    bg: 'linear-gradient(160deg, #FBF7F1 0%, #FFFFFF 70%)',
    border: 'rgba(180, 130, 70, 0.18)',
    accent: '#B45309',
    value: '#92400E',
  },
  lilac: {
    bg: 'linear-gradient(160deg, #F7F5FB 0%, #FFFFFF 70%)',
    border: 'rgba(110, 90, 160, 0.16)',
    accent: '#6D5A9A',
    value: '#4C3D7A',
  },
};

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: C.paper,
    borderRadius: 1.5,
    '& fieldset': { borderColor: C.line },
  },
} as const;

type Props = {
  companyCode: string;
  onCompanyChange?: (companyCode: string) => void;
};

function Metric({
  label,
  value,
  hint,
  tone = 'slate',
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: MetricTone;
  onClick?: () => void;
}) {
  const t = METRIC_TONES[tone];
  return (
    <Box
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${label}: show chart` : undefined}
      sx={{
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform .15s ease, box-shadow .15s ease, border-color .15s ease',
        '&:hover': onClick
          ? {
              transform: 'translateY(-2px)',
              boxShadow: '0 8px 22px rgba(28,37,46,0.10)',
              borderColor: t.accent,
            }
          : undefined,
        '&:focus-visible': { outline: `2px solid ${t.accent}`, outlineOffset: 2 },
        px: { xs: 2, md: 2.25 },
        pt: { xs: 2, md: 2.25 },
        pb: { xs: 2, md: 2.25 },
        borderRadius: 2.25,
        background: t.bg,
        border: `1px solid ${t.border}`,
        minHeight: { xs: 118, md: 128 },
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 14,
          bottom: 14,
          width: 3,
          borderRadius: '0 3px 3px 0',
          bgcolor: t.accent,
          opacity: 0.85,
        }}
      />
      <Typography
        variant="caption"
        sx={{
          pl: 0.75,
          color: C.soft,
          fontWeight: 600,
          letterSpacing: 0.15,
          display: 'block',
          lineHeight: 1.35,
          fontSize: '0.78rem',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          pl: 0.75,
          mt: 1.25,
          mb: hint ? 0.75 : 0,
          color: t.value,
          fontWeight: 700,
          fontSize: { xs: '1.65rem', sm: '1.85rem', md: '2rem' },
          lineHeight: 1,
          letterSpacing: -0.6,
        }}
      >
        {value}
      </Typography>
      {hint ? (
        <Typography
          variant="caption"
          sx={{ pl: 0.75, color: C.soft, display: 'block', lineHeight: 1.3 }}
        >
          {hint}
        </Typography>
      ) : (
        <Box sx={{ height: 16 }} />
      )}
    </Box>
  );
}

function Panel({
  title,
  aside,
  children,
  footer,
  minHeight,
}: {
  title: string;
  aside?: string;
  children: ReactNode;
  footer?: ReactNode;
  minHeight?: number | { xs?: number; md?: number };
}) {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: C.paper,
        border: `1px solid ${C.line}`,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: { xs: 2, md: 2.25 },
          py: 1.5,
          borderBottom: `1px solid ${C.line}`,
          gap: 1,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: C.ink }}>
          {title}
        </Typography>
        {aside ? (
          <Typography variant="caption" sx={{ color: C.soft, whiteSpace: 'nowrap' }}>
            {aside}
          </Typography>
        ) : null}
      </Stack>
      <Box
        sx={{
          p: { xs: 1.25, md: 1.5 },
          flex: 1,
          minHeight,
        }}
      >
        {children}
      </Box>
      {footer || null}
    </Box>
  );
}

function cleanPfName(name: string): string {
  return (
    name
      .replace(/^\d{1,3}[-_.\s]+/, '')
      .replace(/^\d{3}(?:-\d{3}){1,3}\s*[-_]?\s*/i, '')
      .trim() || name
  );
}

export function CompanyDashboardView({ companyCode, onCompanyChange }: Props) {
  const router = useRouter();
  const { companies } = useCompanies();
  const code = companyCode.trim().toUpperCase();
  const companyOptions = useMemo(
    () =>
      companies.map((c) => {
        const bpm = companyBpmCode(c);
        return { code: bpm, label: companyDisplayLabel(companies, bpm) };
      }),
    [companies]
  );
  const [data, setData] = useState<CompanyDashboardSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pfFilter, setPfFilter] = useState('all');
  const [kpiKind, setKpiKind] = useState<KpiKind | null>(null);
  const [roleQuery, setRoleQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [reportQuery, setReportQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    setSelectedRole(null);
    setPfFilter('all');
    fetchCompanyDashboardSummary(code)
      .then((summary) => {
        if (!cancelled) setData(summary);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Failed to load dashboard.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const filteredPfRows = useMemo(() => {
    if (!data) return [];
    if (pfFilter === 'all') return data.processFunctionRows;
    return data.processFunctionRows.filter((r) => r.id === pfFilter);
  }, [data, pfFilter]);

  const pfIds = useMemo(() => new Set(filteredPfRows.map((r) => r.id)), [filteredPfRows]);

  const filteredRoles = useMemo(() => {
    if (!data) return [];
    const q = roleQuery.trim().toLowerCase();
    return data.jobRoles.filter((r) => {
      if (pfFilter !== 'all') {
        const depts = r.departmentIds ?? [];
        if (!depts.some((id) => pfIds.has(id))) return false;
      }
      return !q || r.name.toLowerCase().includes(q);
    });
  }, [data, roleQuery, pfFilter, pfIds]);

  const activeRole = useMemo(() => {
    if (!data || !selectedRole) return null;
    return filteredRoles.find((r) => r.name === selectedRole) ?? null;
  }, [data, selectedRole, filteredRoles]);

  const filteredReports = useMemo(() => {
    if (!data) return [];
    const q = reportQuery.trim().toLowerCase();
    return data.reports.filter((r) => {
      if (pfFilter !== 'all' && !pfIds.has(r.departmentId)) return false;
      if (!q) return true;
      return (
        r.activityName.toLowerCase().includes(q) ||
        r.activityCode.toLowerCase().includes(q) ||
        r.reportText.toLowerCase().includes(q) ||
        r.processName.toLowerCase().includes(q)
      );
    });
  }, [data, reportQuery, pfFilter, pfIds]);

  const pfPagination = useBpmTablePagination(filteredPfRows, 6);
  const rolePagination = useBpmTablePagination(filteredRoles, 8);

  const displayName = companyDisplayLabel(companies, code);
  const fullName = companyFullName(companies, code);
  const processTotal = filteredPfRows.reduce((s, r) => s + r.processCount, 0);
  const subTotal = filteredPfRows.reduce((s, r) => s + r.subProcessCount, 0);
  const policiesTotal =
    pfFilter === 'all'
      ? (data?.policies ?? 0)
      : filteredPfRows.reduce((s, r) => s + (r.policies ?? 0), 0);
  const tatDaysAvg = useMemo(() => {
    if (!data) return null;
    if (pfFilter === 'all') return data.tatDaysAvg;
    if (filteredPfRows.length === 1) return filteredPfRows[0]?.tatDaysAvg ?? null;
    let sum = 0;
    let n = 0;
    for (const row of filteredPfRows) {
      if (row.tatDaysAvg == null || !(row.tatDaysSampleSize > 0)) continue;
      sum += row.tatDaysAvg * row.tatDaysSampleSize;
      n += row.tatDaysSampleSize;
    }
    return n ? Math.round((sum / n) * 10) / 10 : null;
  }, [data, pfFilter, filteredPfRows]);

  useEffect(() => {
    if (selectedRole && !filteredRoles.some((r) => r.name === selectedRole)) {
      setSelectedRole(null);
    }
  }, [filteredRoles, selectedRole]);

  return (
    <DashboardContent maxWidth={false}>
      <Box
        sx={{
          mx: { xs: -1.5, sm: -2.5, md: -3, lg: 'calc(-0.8 * var(--layout-dashboard-content-px))' },
          px: { xs: 1.5, sm: 2.5, md: 3, lg: 'calc(0.8 * var(--layout-dashboard-content-px))' },
          pt: { xs: 0.5, md: 1 },
          pb: { xs: 3, md: 4 },
          minHeight: '100%',
          bgcolor: C.wash,
        }}
      >
        <Stack spacing={{ xs: 2, md: 2.5 }} sx={{ maxWidth: 1400, mx: 'auto', width: 1 }}>
          {/* Header */}
          <Box
            sx={{
              bgcolor: C.paper,
              border: `1px solid ${C.line}`,
              borderRadius: 2,
              px: { xs: 2, md: 2.5 },
              py: { xs: 1.75, md: 2 },
            }}
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={{ xs: 1.75, md: 2 }}
              alignItems={{ xs: 'stretch', md: 'center' }}
              justifyContent="space-between"
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="overline"
                  sx={{ color: C.soft, letterSpacing: 1.1, fontWeight: 700 }}
                >
                  Dashboard
                </Typography>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={{ xs: 1, sm: 1.5 }}
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                  sx={{ mt: 0.5 }}
                >
                  {onCompanyChange ? (
                    <TextField
                      select
                      size="small"
                      value={code}
                      onChange={(e) => onCompanyChange(e.target.value)}
                      sx={{
                        minWidth: { xs: '100%', sm: 200 },
                        maxWidth: { sm: 280 },
                        ...fieldSx,
                        '& .MuiSelect-select': {
                          fontWeight: 700,
                          fontSize: '1.05rem',
                          py: 1,
                        },
                      }}
                    >
                      {companyOptions.map((opt) => (
                        <MenuItem key={opt.code} value={opt.code}>
                          {opt.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <Typography
                      variant="h4"
                      sx={{ fontWeight: 700, color: C.ink, letterSpacing: -0.4 }}
                    >
                      {displayName}
                    </Typography>
                  )}
                  {fullName && fullName !== displayName ? (
                    <Typography
                      variant="body2"
                      sx={{
                        color: C.soft,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: { xs: 'normal', sm: 'nowrap' },
                      }}
                    >
                      {fullName}
                    </Typography>
                  ) : null}
                </Stack>
              </Box>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() => router.push('/companies')}
                  sx={{ borderColor: C.line, color: C.ink, bgcolor: C.paper }}
                >
                  Companies
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => router.push(`/companies/${code}/departments`)}
                  endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={16} />}
                  sx={{
                    bgcolor: C.red,
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#C4161D', boxShadow: 'none' },
                  }}
                >
                  Process functions
                </Button>
              </Stack>
            </Stack>
          </Box>

          {/* Filters */}
          <Grid container spacing={1.25}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Process function"
                value={pfFilter}
                onChange={(e) => setPfFilter(e.target.value)}
                disabled={!data}
                sx={fieldSx}
              >
                <MenuItem value="all">All process functions</MenuItem>
                {(data?.processFunctionRows ?? []).map((pf) => (
                  <MenuItem key={pf.id} value={pf.id}>
                    {pf.code} — {cleanPfName(pf.name)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Job roles"
                placeholder="Search role…"
                value={roleQuery}
                onChange={(e) => setRoleQuery(e.target.value)}
                disabled={!data}
                sx={fieldSx}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Iconify icon="eva:search-fill" width={18} sx={{ color: C.soft }} />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Reports"
                placeholder="Search report…"
                value={reportQuery}
                onChange={(e) => setReportQuery(e.target.value)}
                disabled={!data}
                sx={fieldSx}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Iconify icon="solar:document-bold" width={18} sx={{ color: C.soft }} />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
          </Grid>

          {error ? <Alert severity="error">{error}</Alert> : null}

          {loading ? (
            <Stack spacing={2}>
              <Grid container spacing={1.25}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Grid key={i} size={{ xs: 6, sm: 4, md: 2 }}>
                    <Skeleton variant="rounded" height={92} sx={{ borderRadius: 2 }} />
                  </Grid>
                ))}
              </Grid>
              <Stack alignItems="center" py={5} spacing={1}>
                <CircularProgress size={26} sx={{ color: C.red }} />
                <Typography variant="body2" sx={{ color: C.soft }}>
                  Loading dashboard…
                </Typography>
              </Stack>
            </Stack>
          ) : data ? (
            <>
              {/* KPIs */}
              <Grid container spacing={{ xs: 1.25, md: 1.5 }}>
                <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
                  <Metric
                    label="Process functions"
                    value={pfFilter === 'all' ? data.processFunctions : filteredPfRows.length}
                    tone="rose"
                    onClick={() => setKpiKind('functions')}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
                  <Metric
                    label="Processes"
                    value={processTotal}
                    tone="slate"
                    onClick={() => setKpiKind('processes')}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
                  <Metric
                    label="Sub-processes"
                    value={subTotal}
                    tone="sky"
                    onClick={() => setKpiKind('subs')}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
                  <Metric
                    label="Impacted job roles"
                    value={filteredRoles.length}
                    hint="From RACI"
                    tone="mint"
                    onClick={() => setKpiKind('roles')}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
                  <Metric
                    label="Policies"
                    value={policiesTotal}
                    tone="sand"
                    onClick={() => setKpiKind('policies')}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
                  <Metric
                    label="TAT (days)"
                    value={tatDaysAvg ?? '—'}
                    tone="lilac"
                    onClick={() => setKpiKind('tat')}
                  />
                </Grid>
              </Grid>

              <KpiInsightDialog
                kind={kpiKind}
                onClose={() => setKpiKind(null)}
                companyCode={code}
                pfRows={filteredPfRows}
                roles={filteredRoles}
                processRows={data.processRows}
                policyRows={data.policyRows}
                totals={{
                  functions: pfFilter === 'all' ? data.processFunctions : filteredPfRows.length,
                  processes: processTotal,
                  subs: subTotal,
                  roles: filteredRoles.length,
                  policies: policiesTotal,
                  tat: tatDaysAvg,
                }}
              />

              {/* Job roles, by process function */}
              <JobRolesWiseSection
                roles={data.jobRoles}
                processFunctions={data.processFunctionRows}
                companyCode={code}
                approvalSubProcesses={data.approvalSubProcesses}
              />

              {/* Main boards */}
              <Grid container spacing={1.5} alignItems="stretch">
                <Grid size={{ xs: 12, lg: 7 }}>
                  <Panel
                    title="Process functions"
                    aside={`${pfPagination.total}`}
                    minHeight={{ xs: 220, md: 360 }}
                    footer={
                      <BpmTablePagination
                        page={pfPagination.page}
                        rowsPerPage={pfPagination.rowsPerPage}
                        total={pfPagination.total}
                        onPageChange={pfPagination.setPage}
                        onRowsPerPageChange={pfPagination.setRowsPerPage}
                        rowsPerPageOptions={[6, 10, 25]}
                      />
                    }
                  >
                    <Stack spacing={0.75}>
                      {pfPagination.pageRows.map((pf) => (
                        <Box
                          key={pf.id}
                          component={RouterLink}
                          href={`/departments/${pf.id}/processes?company=${encodeURIComponent(code)}`}
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: {
                              xs: '1fr auto',
                              sm: '1fr auto auto 20px',
                            },
                            alignItems: 'center',
                            gap: { xs: 1, sm: 1.5 },
                            px: 1.5,
                            py: 1.25,
                            borderRadius: 1.5,
                            textDecoration: 'none',
                            color: 'inherit',
                            border: `1px solid transparent`,
                            bgcolor: C.wash,
                            transition: 'background .15s ease, border-color .15s ease',
                            '&:hover': {
                              bgcolor: C.redSoft,
                              borderColor: 'rgba(237,28,36,0.18)',
                            },
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              variant="subtitle2"
                              sx={{ color: C.ink, fontWeight: 700 }}
                              noWrap
                            >
                              {cleanPfName(pf.name)}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ color: C.soft, fontFamily: 'monospace' }}
                            >
                              {pf.code}
                            </Typography>
                          </Box>
                          <Typography
                            variant="caption"
                            sx={{ color: C.soft, fontWeight: 600, whiteSpace: 'nowrap' }}
                          >
                            {pf.processCount} proc
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              color: C.soft,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              display: { xs: 'none', sm: 'block' },
                            }}
                          >
                            {pf.subProcessCount} sub
                          </Typography>
                          <Iconify
                            icon="eva:arrow-ios-forward-fill"
                            width={18}
                            sx={{ color: C.soft, display: { xs: 'none', sm: 'block' } }}
                          />
                        </Box>
                      ))}
                      {!pfPagination.total ? (
                        <Empty text="No process functions for this filter." />
                      ) : null}
                    </Stack>
                  </Panel>
                </Grid>

                <Grid size={{ xs: 12, lg: 5 }}>
                  <Panel
                    title="Impacted job roles"
                    aside={`${rolePagination.total}`}
                    minHeight={{ xs: 220, md: 360 }}
                    footer={
                      <BpmTablePagination
                        page={rolePagination.page}
                        rowsPerPage={rolePagination.rowsPerPage}
                        total={rolePagination.total}
                        onPageChange={rolePagination.setPage}
                        onRowsPerPageChange={rolePagination.setRowsPerPage}
                        rowsPerPageOptions={[8, 15, 25, 50]}
                      />
                    }
                  >
                    {activeRole ? (
                      <Box
                        sx={{
                          mb: 1.25,
                          p: 1.5,
                          borderRadius: 1.5,
                          bgcolor: C.wash,
                          border: `1px solid ${C.line}`,
                        }}
                      >
                        <Typography
                          variant="subtitle2"
                          sx={{ color: C.ink, fontWeight: 700, mb: 1.25 }}
                        >
                          {activeRole.name}
                        </Typography>
                        <Grid container spacing={1}>
                          <Grid size={4}>
                            <RoleStat label="Employees" value={activeRole.employees ?? '—'} />
                          </Grid>
                          <Grid size={4}>
                            <RoleStat label="Tasks" value={activeRole.taskCount} />
                          </Grid>
                          <Grid size={4}>
                            <RoleStat label="TAT days" value={activeRole.tatDaysAvg ?? '—'} />
                          </Grid>
                        </Grid>
                      </Box>
                    ) : (
                      <Typography
                        variant="caption"
                        sx={{ color: C.soft, display: 'block', mb: 1, px: 0.5 }}
                      >
                        Tap a role to see employees, tasks, and TAT.
                      </Typography>
                    )}

                    <Stack spacing={0.5}>
                      {rolePagination.pageRows.map((role) => {
                        const active = role.name === selectedRole;
                        return (
                          <Box
                            key={role.name}
                            onClick={() => setSelectedRole(role.name)}
                            sx={{
                              cursor: 'pointer',
                              px: 1.25,
                              py: 1,
                              borderRadius: 1.25,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              bgcolor: active ? C.redSoft : 'transparent',
                              border: `1px solid ${active ? 'rgba(237,28,36,0.22)' : 'transparent'}`,
                              '&:hover': { bgcolor: active ? C.redSoft : C.wash },
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                flex: 1,
                                minWidth: 0,
                                fontWeight: active ? 700 : 500,
                                color: C.ink,
                              }}
                              noWrap
                            >
                              {role.name}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ color: C.soft, whiteSpace: 'nowrap' }}
                            >
                              {role.taskCount}
                            </Typography>
                          </Box>
                        );
                      })}
                      {!rolePagination.total ? (
                        <Empty text="No job roles match this search." />
                      ) : null}
                    </Stack>
                  </Panel>
                </Grid>
              </Grid>

              {/* Reports */}
              <Panel
                title="Reports"
                aside={`${filteredReports.length}${
                  data.reportsTotal > data.reports.length ? ` / ${data.reportsTotal}+` : ''
                }`}
              >
                <Stack spacing={0.75}>
                  {filteredReports.slice(0, 40).map((rep) => (
                    <Box
                      key={rep.activityId}
                      sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        alignItems: { xs: 'stretch', sm: 'center' },
                        gap: { xs: 1, sm: 2 },
                        px: { xs: 1.25, sm: 1.5 },
                        py: 1.25,
                        borderRadius: 1.5,
                        bgcolor: C.wash,
                      }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{ color: C.ink, fontWeight: 700 }}
                          noWrap
                        >
                          {rep.activityName}
                        </Typography>
                        <Typography variant="caption" sx={{ color: C.soft }} noWrap>
                          {cleanPfName(rep.departmentName)} · {rep.processName}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            color: C.soft,
                            mt: 0.35,
                            display: '-webkit-box',
                            WebkitLineClamp: { xs: 2, md: 1 },
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {rep.reportText}
                        </Typography>
                      </Box>
                      <Link
                        component={RouterLink}
                        href={`/departments/${rep.departmentId}/processes/${rep.processId}/activities-table`}
                        underline="none"
                        sx={{
                          alignSelf: { xs: 'flex-start', sm: 'center' },
                          color: C.red,
                          fontWeight: 700,
                          fontSize: 13,
                          whiteSpace: 'nowrap',
                          '&:hover': { textDecoration: 'underline' },
                        }}
                      >
                        Open →
                      </Link>
                    </Box>
                  ))}
                  {!filteredReports.length ? (
                    <Empty text="No reports for the current filters." />
                  ) : null}
                </Stack>
              </Panel>
            </>
          ) : null}
        </Stack>
      </Box>
    </DashboardContent>
  );
}

function RoleStat({ label, value }: { label: string; value: string | number }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: C.soft, display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="subtitle1" sx={{ color: C.ink, fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </Typography>
    </Box>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Typography variant="body2" sx={{ color: C.soft, py: 4, textAlign: 'center' }}>
      {text}
    </Typography>
  );
}
