import { useState, useEffect } from 'react';

import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import Typography from '@mui/material/Typography';
import TableContainer from '@mui/material/TableContainer';

import { DashboardContent } from 'src/layouts/dashboard';

import { fetchBackupHistory, type BackupHistoryRow } from 'src/sections/bpm/api';
import { useAccessProfile, isSuperAdminProfile } from 'src/sections/bpm/access-control';

const formatBytes = (value?: number | null): string => {
  if (!value || value <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = value;
  let idx = 0;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx += 1;
  }
  return `${v.toFixed(v >= 100 || idx === 0 ? 0 : 1)} ${units[idx]}`;
};

export function BackupLogsView() {
  const profile = useAccessProfile();
  const [rows, setRows] = useState<BackupHistoryRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchBackupHistory(300);
      setRows(result.rows ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <div>
            <Typography variant="h4">Administration - Backup logs</Typography>
            <Typography variant="body2" color="text.secondary">
              Database backup and email-delivery activity history.
            </Typography>
          </div>
          <Button variant="outlined" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Stack>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Backup file</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Message</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!loading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>No backup logs found yet.</TableCell>
                  </TableRow>
                ) : null}
                {rows.map((row, idx) => (
                  <TableRow key={`${row.timestamp ?? 'ts'}-${idx}`}>
                    <TableCell>{row.timestamp ? new Date(row.timestamp).toLocaleString() : '-'}</TableCell>
                    <TableCell>{row.status ?? '-'}</TableCell>
                    <TableCell>{row.backupFile ?? '-'}</TableCell>
                    <TableCell>{formatBytes(row.backupSizeBytes)}</TableCell>
                    <TableCell>{row.message ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Stack>
    </DashboardContent>
  );
}
