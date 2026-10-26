import { useMemo, Fragment, useState, useEffect, useCallback } from 'react';

import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Tabs from '@mui/material/Tabs';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import InputLabel from '@mui/material/InputLabel';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import ListItemText from '@mui/material/ListItemText';
import Autocomplete from '@mui/material/Autocomplete';
import ListItemButton from '@mui/material/ListItemButton';
import TableContainer from '@mui/material/TableContainer';
import TablePagination from '@mui/material/TablePagination';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';

import { UserLogAnalyticsTab } from 'src/sections/bpm/view/user-log-analytics-tab';
import { useAccessProfile, isSuperAdminProfile } from 'src/sections/bpm/access-control';
import {
  fetchUserLog,
  type UserLogRow,
  type UserLogGroup,
  type UserLogResponse,
  type UserLogActorCatalogEntry,
} from 'src/sections/bpm/api';

type AppliedFilters = {
  status: string;
  user: string;
  q: string;
};

function formatActorLabel(entry: UserLogActorCatalogEntry): string {
  const name = entry.displayName?.trim();
  if (name && name.toLowerCase() !== entry.actor.toLowerCase()) {
    return `${name} (${entry.actor})`;
  }
  return entry.actor;
}

function formatGroupLabel(group: UserLogGroup): string {
  const name = group.displayName?.trim();
  if (name && name.toLowerCase() !== group.actor.toLowerCase()) {
    return `${name} (${group.actor})`;
  }
  return group.actor;
}

export function UserLogView() {
  const profile = useAccessProfile();
  const [rows, setRows] = useState<UserLogRow[]>([]);
  const [groups, setGroups] = useState<UserLogGroup[]>([]);
  const [actorCatalog, setActorCatalog] = useState<UserLogActorCatalogEntry[]>([]);
  const [logMeta, setLogMeta] = useState<UserLogResponse['meta']>();
  const [summary, setSummary] = useState({ total: 0, pass: 0, fail: 0 });
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [status, setStatus] = useState('');
  const [selectedActor, setSelectedActor] = useState<UserLogActorCatalogEntry | null>(null);
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState<AppliedFilters>({ status: '', user: '', q: '' });

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [tab, setTab] = useState<'entries' | 'analytics'>('analytics');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchUserLog({
        page: page + 1,
        pageSize: rowsPerPage,
        status: applied.status,
        user: applied.user,
        q: applied.q,
      });
      setRows(result.rows ?? []);
      setTotalRows(result.total ?? 0);
      setGroups(result.groups ?? []);
      setActorCatalog(result.actorCatalog ?? []);
      setLogMeta(result.meta);
      setSummary(result.summary ?? { total: 0, pass: 0, fail: 0 });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [applied, page, rowsPerPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const actorOptions = useMemo(() => {
    const byActor = new Map<string, UserLogActorCatalogEntry>();
    for (const entry of actorCatalog) {
      byActor.set(entry.actor, entry);
    }
    return [...byActor.values()].sort((a, b) =>
      formatActorLabel(a).localeCompare(formatActorLabel(b)),
    );
  }, [actorCatalog]);

  const applyFilters = () => {
    setApplied({
      status,
      user: selectedActor?.actor ?? '',
      q: query,
    });
    setPage(0);
  };

  const selectUserGroup = (group: UserLogGroup) => {
    const match =
      actorOptions.find((o) => o.actor === group.actor) ??
      ({
        actor: group.actor,
        displayName: group.displayName ?? null,
        count: group.count,
        lastTimestampUtc: group.lastTimestampUtc ?? null,
      } satisfies UserLogActorCatalogEntry);
    setSelectedActor(match);
    setApplied((prev) => ({ ...prev, user: group.actor }));
    setPage(0);
  };

  const clearUserFilter = () => {
    setSelectedActor(null);
    setApplied((prev) => ({ ...prev, user: '' }));
    setPage(0);
  };

  if (!isSuperAdminProfile(profile)) {
    return (
      <DashboardContent>
        <Alert severity="info">This page is only available to Super Admin accounts.</Alert>
      </DashboardContent>
    );
  }

  return (
    <DashboardContent>
      <Stack spacing={2}>
        <div>
          <Typography variant="h4">Administration — User log</Typography>
          <Typography variant="body2" color="text.secondary">
            Audit trail and usage analytics (Super Admin). Times in UAE (GMT+4) on the log tab.
          </Typography>
        </div>

        <Tabs
          value={tab}
          onChange={(_, value: 'entries' | 'analytics') => setTab(value)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            value="analytics"
            label="Analytics dashboard"
            icon={<Iconify icon="eva:trending-up-fill" width={20} />}
            iconPosition="start"
          />
          <Tab
            value="entries"
            label="Log entries"
            icon={<Iconify icon="solar:chat-round-dots-bold" width={20} />}
            iconPosition="start"
          />
        </Tabs>

        {tab === 'analytics' ? <UserLogAnalyticsTab /> : null}

        {tab === 'entries' ? (
          <>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="user-log-status-label">Status</InputLabel>
            <Select
              labelId="user-log-status-label"
              label="Status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="pass">Pass</MenuItem>
              <MenuItem value="fail">Fail</MenuItem>
            </Select>
          </FormControl>
          <Autocomplete
            size="small"
            sx={{ minWidth: 280, flex: 1 }}
            options={actorOptions}
            value={selectedActor}
            onChange={(_, value) => setSelectedActor(value)}
            getOptionLabel={(option) => formatActorLabel(option)}
            isOptionEqualToValue={(option, value) => option.actor === value.actor}
            renderInput={(params) => (
              <TextField {...params} label="User" placeholder="Select or search by name / email" />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.actor}>
                <ListItemText
                  primary={formatActorLabel(option)}
                  secondary={
                    option.count > 0
                      ? `${option.count} log(s)`
                      : 'No activity in log file yet'
                  }
                />
              </li>
            )}
            noOptionsText="No matching users"
          />
          <TextField
            size="small"
            label="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="path, error, method..."
            sx={{ flex: 1, minWidth: 200 }}
          />
          <Button variant="contained" onClick={() => applyFilters()} disabled={loading}>
            {loading ? 'Loading...' : 'Apply filters'}
          </Button>
          {applied.user ? (
            <Button variant="outlined" onClick={() => clearUserFilter()} disabled={loading}>
              Clear user filter
            </Button>
          ) : null}
        </Stack>

        <Alert severity="info">
          Matching entries: {summary.total} | Pass: {summary.pass} | Fail: {summary.fail} | Page
          size: {rowsPerPage} | Users in sidebar: {groups.length} | Users in catalog:{' '}
          {actorOptions.length}
          {logMeta?.truncated
            ? ` | Showing newest ${logMeta.linesScanned.toLocaleString()} of ${logMeta.totalLinesInFile.toLocaleString()} log lines`
            : logMeta
              ? ` | Scanned ${logMeta.linesScanned.toLocaleString()} log lines`
              : ''}
        </Alert>
        {error ? <Alert severity="error">{error}</Alert> : null}

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card variant="outlined" sx={{ p: 0 }}>
              <Typography variant="subtitle2" sx={{ px: 2, pt: 2, pb: 1 }}>
                By user (same filters)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ px: 2, display: 'block', pb: 1 }}>
                Click a user to show only their logs. Sorted by most recent activity.
              </Typography>
              <Stack sx={{ maxHeight: 420, overflow: 'auto' }}>
                {groups.length === 0 && !loading ? (
                  <Typography variant="body2" sx={{ px: 2, pb: 2 }}>
                    No users in current result set.
                  </Typography>
                ) : null}
                {groups.map((g) => (
                  <ListItemButton
                    key={g.actor}
                    selected={applied.user !== '' && applied.user === g.actor}
                    onClick={() => selectUserGroup(g)}
                    dense
                  >
                    <ListItemText
                      primary={formatGroupLabel(g)}
                      secondary={`${g.count} log(s)`}
                      primaryTypographyProps={{ variant: 'body2' }}
                    />
                  </ListItemButton>
                ))}
              </Stack>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 8 }}>
            <Card>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Time (UAE GMT+4)</TableCell>
                      <TableCell>User</TableCell>
                      <TableCell>Outcome</TableCell>
                      <TableCell>HTTP</TableCell>
                      <TableCell>Action</TableCell>
                      <TableCell>Duration (ms)</TableCell>
                      <TableCell>Error</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {!loading && rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7}>No logs found for current filters.</TableCell>
                      </TableRow>
                    ) : null}
                    {rows.map((row, idx) => {
                      const prev = idx > 0 ? rows[idx - 1] : null;
                      const actor = row.actor ?? '-';
                      const prevActor = prev ? (prev.actor ?? '-') : null;
                      const showGroupHeader = prevActor !== actor;
                      const catalogEntry = actorCatalog.find(
                        (e) => e.actor === actor.trim().toLowerCase(),
                      );
                      const actorLabel = catalogEntry
                        ? formatActorLabel(catalogEntry)
                        : actor;
                      return (
                        <Fragment key={`${row.timestampUtc ?? 'ts'}-${row.path ?? ''}-${idx}`}>
                          {showGroupHeader ? (
                            <TableRow>
                              <TableCell
                                colSpan={7}
                                sx={{
                                  bgcolor: 'action.hover',
                                  fontWeight: 600,
                                  py: 1,
                                  borderTop: (theme) => `1px solid ${theme.palette.divider}`,
                                }}
                              >
                                {actorLabel}
                              </TableCell>
                            </TableRow>
                          ) : null}
                          <TableRow hover>
                            <TableCell>{row.timestampUae ?? '-'}</TableCell>
                            <TableCell>{actorLabel}</TableCell>
                            <TableCell>{row.outcome ?? '-'}</TableCell>
                            <TableCell>{row.statusCode ?? '-'}</TableCell>
                            <TableCell>
                              {row.method ?? '-'} {row.path ?? '-'}
                            </TableCell>
                            <TableCell>{row.durationMs ?? '-'}</TableCell>
                            <TableCell sx={{ maxWidth: 280, wordBreak: 'break-word' }}>
                              {row.error ?? '-'}
                            </TableCell>
                          </TableRow>
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                rowsPerPageOptions={[10, 20, 50, 100]}
                count={totalRows}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={(_, newPage) => setPage(newPage)}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(Number.parseInt(e.target.value, 10));
                  setPage(0);
                }}
              />
            </Card>
          </Grid>
        </Grid>
          </>
        ) : null}
      </Stack>
    </DashboardContent>
  );
}
