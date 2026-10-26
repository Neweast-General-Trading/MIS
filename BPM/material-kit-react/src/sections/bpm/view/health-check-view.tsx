import type { ReactNode } from 'react';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import Typography from '@mui/material/Typography';
import CardHeader from '@mui/material/CardHeader';
import TableContainer from '@mui/material/TableContainer';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useTheme, alpha as hexAlpha } from '@mui/material/styles';

import { fNumber } from 'src/utils/format-number';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';
import { Chart, useChart } from 'src/components/chart';

import { fetchSystemHealth, type SystemHealthResponse } from 'src/sections/bpm/api';
import { useAccessProfile, isSuperAdminProfile } from 'src/sections/bpm/access-control';

const REFRESH_MS = 15000;

function bytesToMb(n: number) {
  return Math.round((n / 1024 / 1024) * 100) / 100;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function MetricCard({
  title,
  children,
  icon,
  sx,
}: {
  title: string;
  children: ReactNode;
  icon: ReactNode;
  sx?: object;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        p: 2,
        height: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        ...sx,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} justifyContent="space-between">
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {title}
        </Typography>
        <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
      </Stack>
      <Box sx={{ flex: 1 }}>{children}</Box>
    </Card>
  );
}

export function HealthCheckView() {
  const theme = useTheme();
  const profile = useAccessProfile();
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<{ label: string; ms: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchSystemHealth();
      setHealth(data);
      const label = new Date(data.timestamp).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const ms = data.database.latencyMs ?? 0;
      setLatencyHistory((prev) => {
        const next = [...prev, { label, ms }];
        return next.slice(-20);
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, load]);

  const memoryPieSeries = useMemo(() => {
    if (!health) return [];
    return [bytesToMb(health.api.memory.heapUsed), bytesToMb(health.api.memory.heapFree)];
  }, [health]);

  const memoryPieOptions = useChart({
    labels: ['Heap in use (MB)', 'Heap available (MB)'],
    stroke: { width: 0 },
    dataLabels: { enabled: true, style: { fontSize: '11px' } },
    legend: { position: 'bottom', fontSize: '12px' },
    tooltip: { y: { formatter: (v: number) => `${fNumber(v)} MB` } },
    plotOptions: { pie: { donut: { labels: { show: false } } } },
  });

  const scoresDonutSeries = useMemo(() => {
    if (!health) return [];
    return [health.scores.database, health.scores.memory, health.scores.availability];
  }, [health]);

  const scoresDonutOptions = useChart({
    labels: ['Database', 'Memory', 'Availability'],
    stroke: { width: 0 },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            name: { offsetY: -6 },
            value: { offsetY: 6 },
            total: {
              show: true,
              label: 'Overall',
              formatter: () => (health ? `${health.scores.overall}` : '—'),
              color: theme.vars.palette.text.secondary,
            },
          },
        },
      },
    },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v: number) => `${v} / 100` } },
  });

  const radialOptions = useChart({
    chart: { sparkline: { enabled: false } },
    plotOptions: {
      radialBar: {
        hollow: { size: '68%' },
        track: { background: hexAlpha(theme.palette.grey[500], 0.16) },
        dataLabels: {
          name: { show: false },
          value: {
            fontSize: '28px',
            fontWeight: 700,
            offsetY: 8,
            formatter: (val: number) => `${Math.round(val)}`,
          },
        },
      },
    },
    labels: ['Health'],
    colors: [theme.palette.primary.main],
  });

  const dataBarSeries = useMemo(() => {
    if (!health) return [{ name: 'Rows', data: [] as number[] }];
    const { dataCounts: d } = health;
    return [{ name: 'Rows', data: [d.departments, d.processes, d.activities, d.accessUsers, d.roles] }];
  }, [health]);

  const dataBarOptions = useChart({
    colors: [hexAlpha(theme.palette.primary.main, 0.88)],
    chart: { stacked: false },
    plotOptions: { bar: { borderRadius: 6, columnWidth: '55%', distributed: true } },
    xaxis: {
      categories: ['Process fn.', 'Processes', 'Sub-proc.', 'Users', 'Roles'],
      labels: { style: { fontSize: '11px' } },
    },
    tooltip: { y: { formatter: (v: number) => fNumber(v) } },
    legend: { show: false },
  });

  const latencyAreaOptions = useChart({
    colors: [hexAlpha(theme.palette.info.main, 0.9)],
    stroke: { width: 2, curve: 'smooth' },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [0, 90, 100],
      },
    },
    chart: { toolbar: { show: false }, zoom: { enabled: false } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: latencyHistory.map((p) => p.label),
      labels: { rotate: -35, rotateAlways: latencyHistory.length > 6, style: { fontSize: '10px' } },
    },
    yaxis: { title: { text: 'ms' }, labels: { formatter: (v: number) => `${fNumber(v)}` } },
    tooltip: { y: { formatter: (v: number) => `${fNumber(v)} ms` } },
    markers: { size: 4, strokeWidth: 2 },
  });

  if (!isSuperAdminProfile(profile)) {
    return (
      <DashboardContent>
        <Alert severity="info">This page is only available to Super Admin accounts.</Alert>
      </DashboardContent>
    );
  }

  const heapRatio =
    health && health.api.memory.heapTotal > 0
      ? health.api.memory.heapUsed / health.api.memory.heapTotal
      : 0;

  return (
    <DashboardContent maxWidth={false}>
      <Stack spacing={3}>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2, md: 2.5 },
            borderRadius: 2,
            background: (t) =>
              `linear-gradient(135deg, ${hexAlpha(t.palette.primary.main, 0.06)} 0%, transparent 55%)`,
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ md: 'center' }}
          >
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: hexAlpha(theme.palette.primary.main, 0.12),
                  color: 'primary.main',
                }}
              >
                <Iconify icon="solar:shield-keyhole-bold-duotone" width={28} />
              </Box>
              <div>
                <Typography variant="h4">System health</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 560 }}>
                  Node.js runtime, PostgreSQL, and BPM table counts. Auto-refresh every {REFRESH_MS / 1000}s when enabled.
                </Typography>
              </div>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <FormControlLabel
                control={<Switch checked={autoRefresh} onChange={(_, v) => setAutoRefresh(v)} color="primary" />}
                label={<Typography variant="body2">Auto-refresh</Typography>}
              />
              <Button variant="contained" size="medium" onClick={() => void load()} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh now'}
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {error ? (
          <Alert severity="error" variant="outlined" onClose={() => setError('')}>
            {error}
          </Alert>
        ) : null}

        {loading && !health ? (
          <Grid container spacing={2}>
            {[1, 2, 3, 4].map((k) => (
              <Grid key={k} size={{ xs: 12, sm: 6, md: 3 }}>
                <Skeleton variant="rounded" height={120} sx={{ borderRadius: 2 }} />
              </Grid>
            ))}
            <Grid size={{ xs: 12 }}>
              <Skeleton variant="rounded" height={320} sx={{ borderRadius: 2 }} />
            </Grid>
          </Grid>
        ) : null}

        {health ? (
          <>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card
                  sx={{
                    p: 2,
                    height: 1,
                    background: (t) =>
                      `linear-gradient(145deg, ${hexAlpha(t.palette.primary.main, 0.12)} 0%, ${hexAlpha(t.palette.background.paper, 1)} 45%)`,
                    border: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="overline" color="primary">
                    Composite index
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                    <Box sx={{ width: 200, flexShrink: 0 }}>
                      <Chart
                        type="radialBar"
                        series={[health.scores.overall]}
                        options={radialOptions}
                        sx={{ height: 220 }}
                      />
                    </Box>
                    <Stack spacing={1}>
                      <Typography variant="h6">Overall {health.scores.overall}/100</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Weighted mix of DB latency, heap pressure, and DB reachability. Indicative only.
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip size="small" label={`DB score ${health.scores.database}`} variant="outlined" />
                        <Chip size="small" label={`MEM score ${health.scores.memory}`} variant="outlined" />
                        <Chip size="small" label={`Up ${health.scores.availability}`} variant="outlined" />
                      </Stack>
                    </Stack>
                  </Stack>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <MetricCard title="Database ping" icon={<Iconify icon="solar:check-circle-bold" width={22} />}>
                  <Typography variant="h4" component="div">
                    {health.database.ok ? `${health.database.latencyMs ?? '—'}` : '—'}
                    <Typography component="span" variant="body1" color="text.secondary">
                      {' '}
                      ms
                    </Typography>
                  </Typography>
                  <Chip
                    size="small"
                    label={health.database.ok ? 'Online' : 'Offline'}
                    color={health.database.ok ? 'success' : 'error'}
                  />
                </MetricCard>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <MetricCard title="API uptime" icon={<Iconify icon="solar:clock-circle-outline" width={22} />}>
                  <Typography variant="h5">{formatUptime(health.api.uptimeSeconds)}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {health.api.nodeVersion} · pid {health.api.pid}
                  </Typography>
                </MetricCard>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <MetricCard title="Heap usage" icon={<Iconify icon="solar:settings-bold-duotone" width={22} />}>
                  <Typography variant="h5">{Math.round(heapRatio * 100)}%</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {bytesToMb(health.api.memory.heapUsed)} / {bytesToMb(health.api.memory.heapTotal)} MB
                  </Typography>
                  <Chip
                    size="small"
                    sx={{ mt: 1 }}
                    label={health.checks.memoryPressureOk ? 'Comfortable' : 'Tight'}
                    color={health.checks.memoryPressureOk ? 'success' : 'warning'}
                  />
                </MetricCard>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <MetricCard title="Quick checks" icon={<Iconify icon="eva:done-all-fill" width={22} />}>
                  <Stack spacing={0.75}>
                    <Chip size="small" label="Process up" color="success" variant="outlined" />
                    <Chip
                      size="small"
                      label="PostgreSQL"
                      color={health.checks.databaseReachable ? 'success' : 'error'}
                      variant="outlined"
                    />
                  </Stack>
                </MetricCard>
              </Grid>
            </Grid>

            <Typography variant="overline" color="text.secondary" sx={{ px: 0.5 }}>
              Charts
            </Typography>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, lg: 4 }}>
                <Card variant="outlined" sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
                  <CardHeader title="Memory mix" subheader="V8 heap (MB)" />
                  <Chart
                    type="pie"
                    series={memoryPieSeries}
                    options={memoryPieOptions}
                    sx={{ flex: 1, minHeight: 280, mx: 'auto', maxWidth: 340, py: 1 }}
                  />
                </Card>
              </Grid>
              <Grid size={{ xs: 12, lg: 4 }}>
                <Card variant="outlined" sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
                  <CardHeader title="Score pillars" subheader="Donut — centre shows overall" />
                  <Chart
                    type="donut"
                    series={scoresDonutSeries}
                    options={scoresDonutOptions}
                    sx={{ flex: 1, minHeight: 280, mx: 'auto', maxWidth: 340, py: 1 }}
                  />
                </Card>
              </Grid>
              <Grid size={{ xs: 12, lg: 4 }}>
                <Card variant="outlined" sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
                  <CardHeader title="BPM data volume" subheader="Row counts in key tables" />
                  <Chart
                    type="bar"
                    series={dataBarSeries}
                    options={dataBarOptions}
                    sx={{ flex: 1, minHeight: 280, px: 1, py: 1 }}
                  />
                </Card>
              </Grid>
            </Grid>

            <Card variant="outlined">
              <CardHeader
                title="Database latency (area)"
                subheader="Last samples from each refresh — smoother view of spikes"
              />
              {latencyHistory.length < 2 ? (
                <Typography sx={{ px: 3, pb: 3 }} color="text.secondary">
                  Collecting history… run one more refresh or wait for auto-refresh.
                </Typography>
              ) : (
                <Chart
                  type="area"
                  series={[{ name: 'Latency', data: latencyHistory.map((p) => p.ms) }]}
                  options={latencyAreaOptions}
                  sx={{ height: 320, px: 2, pb: 2 }}
                />
              )}
            </Card>

            <Card variant="outlined">
              <CardHeader title="Diagnostics" subheader="Raw fields for support / audits" />
              <Divider />
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Field</TableCell>
                      <TableCell align="right">Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>Snapshot (UTC)</TableCell>
                      <TableCell align="right">{health.timestamp}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Platform</TableCell>
                      <TableCell align="right">{health.api.platform}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>RSS</TableCell>
                      <TableCell align="right">{bytesToMb(health.api.memory.rss)} MB</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>External heap</TableCell>
                      <TableCell align="right">{bytesToMb(health.api.memory.external)} MB</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>DB error (if any)</TableCell>
                      <TableCell align="right">{health.database.error ?? '—'}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover' }}>
                <Typography variant="caption" color="text.secondary">
                  Public monitor (no auth): <Typography component="span" variant="caption" fontFamily="monospace">GET /health</Typography>
                </Typography>
              </Box>
            </Card>
          </>
        ) : (
          !error &&
          !loading && (
            <Alert severity="info">No snapshot loaded yet.</Alert>
          )
        )}
      </Stack>
    </DashboardContent>
  );
}
