import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import Typography from '@mui/material/Typography';
import CardHeader from '@mui/material/CardHeader';
import TableContainer from '@mui/material/TableContainer';
import { useTheme, alpha as hexAlpha } from '@mui/material/styles';

import { fNumber } from 'src/utils/format-number';

import { Chart, useChart } from 'src/components/chart';
import { Iconify, type IconifyName } from 'src/components/iconify';

import { fetchUserLogAnalytics, type UserLogAnalytics } from 'src/sections/bpm/api';

function formatActor(actor: string, displayName: string | null) {
  const name = displayName?.trim();
  if (name && name.toLowerCase() !== actor.toLowerCase()) {
    return `${name} (${actor})`;
  }
  return actor;
}

function formatDayLabel(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function KpiCard({
  title,
  value,
  subtitle,
  color = 'primary',
  icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: 'primary' | 'success' | 'error' | 'warning' | 'info';
  icon: IconifyName;
}) {
  const theme = useTheme();
  const palette = theme.palette[color];

  return (
    <Card
      variant="outlined"
      sx={{
        p: 2,
        height: 1,
        borderColor: hexAlpha(palette.main, 0.24),
        bgcolor: hexAlpha(palette.main, 0.06),
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>
            {title}
          </Typography>
          <Typography variant="h4" sx={{ mt: 0.5, color: `${color}.main` }}>
            {typeof value === 'number' ? fNumber(value) : value}
          </Typography>
          {subtitle ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: hexAlpha(palette.main, 0.12),
            color: `${color}.main`,
          }}
        >
          <Iconify icon={icon} width={26} />
        </Box>
      </Stack>
    </Card>
  );
}

export function UserLogAnalyticsTab() {
  const theme = useTheme();
  const [data, setData] = useState<UserLogAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchUserLogAnalytics());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activitySeries = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Pass', data: data.activityByDay.map((d) => d.pass) },
      { name: 'Fail', data: data.activityByDay.map((d) => d.fail) },
    ];
  }, [data]);

  const activityOptions = useChart({
    chart: { stacked: true, toolbar: { show: false } },
    colors: [theme.palette.success.main, theme.palette.error.main],
    plotOptions: { bar: { borderRadius: 4, columnWidth: '62%' } },
    xaxis: {
      categories: data?.activityByDay.map((d) => formatDayLabel(d.date)) ?? [],
      labels: { rotate: -35, style: { fontSize: '10px' } },
    },
    legend: { position: 'top' },
    tooltip: { y: { formatter: (v: number) => fNumber(v) } },
  });

  const topicSeries = useMemo(
    () => (data ? data.topTopics.map((t) => t.count) : []),
    [data],
  );

  const topicOptions = useChart({
    labels: data?.topTopics.map((t) => t.topic) ?? [],
    stroke: { width: 0 },
    legend: { position: 'bottom', fontSize: '11px' },
    dataLabels: { enabled: true, style: { fontSize: '10px' } },
    plotOptions: { pie: { donut: { size: '58%' } } },
  });

  const userBarSeries = useMemo(() => {
    if (!data?.topUsers.length) return [{ name: 'Requests', data: [] as number[] }];
    return [
      {
        name: 'Requests',
        data: data.topUsers.map((u) => u.count),
      },
    ];
  }, [data]);

  const userBarOptions = useChart({
    chart: { toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '70%' } },
    colors: [hexAlpha(theme.palette.primary.main, 0.85)],
    xaxis: {
      categories:
        data?.topUsers.map((u) => {
          const label = u.displayName?.trim() || u.actor;
          return label.length > 28 ? `${label.slice(0, 25)}…` : label;
        }) ?? [],
      labels: { style: { fontSize: '11px' } },
    },
    tooltip: { y: { formatter: (v: number) => fNumber(v) } },
    legend: { show: false },
  });

  if (loading && !data) {
    return (
      <Stack spacing={2}>
        <Grid container spacing={2}>
          {[1, 2, 3, 4].map((k) => (
            <Grid key={k} size={{ xs: 12, sm: 6, md: 3 }}>
              <Skeleton variant="rounded" height={100} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={320} />
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void load()}>
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }

  if (!data) {
    return <Alert severity="info">No analytics data.</Alert>;
  }

  const { overview: o } = data;

  return (
    <Stack spacing={2.5}>
      {data.meta?.truncated ? (
        <Alert severity="warning">
          Analytics use the newest {fNumber(data.meta.linesScanned)} log lines (file has{' '}
          {fNumber(data.meta.totalLinesInFile)} total).
        </Alert>
      ) : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Total requests"
            value={o.totalRequests}
            subtitle={`${fNumber(o.passCount)} pass · ${fNumber(o.failCount)} fail`}
            icon="eva:trending-up-fill"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Active (7 days)"
            value={o.activeLast7Days}
            subtitle={`${fNumber(o.activeLast30Days)} in last 30 days`}
            color="success"
            icon="solar:check-circle-bold"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Low / no usage"
            value={o.inactiveRegisteredUsers}
            subtitle={`${fNumber(o.neverLoggedCount)} never appeared in log`}
            color="warning"
            icon="solar:eye-closed-bold"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Fail rate"
            value={`${o.failRatePercent}%`}
            subtitle={`Avg ${fNumber(o.avgDurationMs)} ms per call`}
            color={o.failRatePercent > 5 ? 'error' : 'info'}
            icon="solar:restart-bold"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card>
            <CardHeader title="Activity (last 14 days)" subheader="Pass vs fail per day (UTC)" />
            <Box sx={{ px: 2, pb: 2 }}>
              <Chart type="bar" series={activitySeries} options={activityOptions} sx={{ height: 300 }} />
            </Box>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ height: 1 }}>
            <CardHeader title="Topics" subheader="What areas of the app are used most" />
            <Box sx={{ px: 2, pb: 2 }}>
              {topicSeries.length ? (
                <Chart type="donut" series={topicSeries} options={topicOptions} sx={{ height: 300 }} />
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No topic data yet.
                </Typography>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card>
            <CardHeader title="Most active users" subheader="By API requests in the log" />
            <Box sx={{ px: 1, pb: 2 }}>
              {data.topUsers.length ? (
                <Chart type="bar" series={userBarSeries} options={userBarOptions} sx={{ height: 320 }} />
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  No user activity recorded.
                </Typography>
              )}
            </Box>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card>
            <CardHeader
              title="Registered but inactive"
              subheader="No activity in 30+ days or never logged"
            />
            <TableContainer sx={{ maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell align="right">Last seen</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!data.inactiveUsers.length ? (
                    <TableRow>
                      <TableCell colSpan={2}>All registered users were active recently.</TableCell>
                    </TableRow>
                  ) : null}
                  {data.inactiveUsers.map((u) => (
                    <TableRow key={u.actor} hover>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 280 }}>
                          {formatActor(u.actor, u.displayName)}
                        </Typography>
                        {!u.lastSeenUtc ? (
                          <Chip label="Never in log" size="small" color="warning" sx={{ mt: 0.5 }} />
                        ) : null}
                      </TableCell>
                      <TableCell align="right">
                        {u.lastSeenUtc
                          ? u.daysSinceActivity != null
                            ? `${fNumber(u.daysSinceActivity)}d ago`
                            : new Date(u.lastSeenUtc).toLocaleDateString()
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardHeader title="Top API paths" subheader="Most frequently called endpoints" />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={56}>#</TableCell>
                    <TableCell>Path</TableCell>
                    <TableCell align="right">Calls</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.topPaths.map((row, idx) => (
                    <TableRow key={row.path} hover>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                        {row.path}
                      </TableCell>
                      <TableCell align="right">{fNumber(row.count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card>
            <CardHeader title="HTTP methods" />
            <Stack spacing={1} sx={{ p: 2, pt: 0 }}>
              {data.httpMethods.map((m) => {
                const pct =
                  o.totalRequests > 0 ? Math.round((m.count / o.totalRequests) * 100) : 0;
                return (
                  <Stack key={m.method} direction="row" alignItems="center" spacing={1}>
                    <Chip label={m.method} size="small" variant="outlined" sx={{ minWidth: 64 }} />
                    <Box sx={{ flex: 1, height: 8, borderRadius: 1, bgcolor: 'action.hover' }}>
                      <Box
                        sx={{
                          width: `${pct}%`,
                          height: 1,
                          borderRadius: 1,
                          bgcolor: 'primary.main',
                        }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ minWidth: 72, textAlign: 'right' }}>
                      {fNumber(m.count)} ({pct}%)
                    </Typography>
                  </Stack>
                );
              })}
            </Stack>
            <CardHeader title="Top users detail" sx={{ pt: 0 }} />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell align="right">Calls</TableCell>
                    <TableCell align="right">Fails</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.topUsers.slice(0, 8).map((u) => (
                    <TableRow key={u.actor} hover>
                      <TableCell sx={{ maxWidth: 200 }}>
                        <Typography variant="body2" noWrap>
                          {formatActor(u.actor, u.displayName)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{fNumber(u.count)}</TableCell>
                      <TableCell align="right">
                        {u.failCount > 0 ? (
                          <Chip label={fNumber(u.failCount)} size="small" color="error" />
                        ) : (
                          '0'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>

      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="outlined"
          startIcon={<Iconify icon="solar:restart-bold" />}
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh analytics'}
        </Button>
      </Stack>
    </Stack>
  );
}
