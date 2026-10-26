import { useMemo, useState, useEffect, useCallback } from 'react';

import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import Typography from '@mui/material/Typography';

import { DashboardContent } from 'src/layouts/dashboard';

import { useAccessProfile, isSuperAdminProfile } from 'src/sections/bpm/access-control';
import { fetchAssistantInquiries, type AssistantInquiryRow } from 'src/sections/bpm/api';
import {
  BpmTableCard,
  BpmTablePagination,
} from 'src/sections/bpm/components/bpm-table-kit';

export function AssistantInquiryLogView() {
  const profile = useAccessProfile();
  const isAdmin = isSuperAdminProfile(profile);

  const [rows, setRows] = useState<AssistantInquiryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const loadRows = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetchAssistantInquiries({
        page: page + 1,
        pageSize: rowsPerPage,
        q: search.trim() || undefined,
      });
      setRows(response.rows);
      setTotal(response.meta.total);
    } catch (err) {
      setError((err as Error).message);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page, rowsPerPage, search]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    setPage(0);
  }, [search, rowsPerPage]);

  const pageRows = useMemo(() => rows, [rows]);

  if (!isAdmin) {
    return (
      <DashboardContent>
        <Alert severity="warning">Only administration can view assistant inquiry logs.</Alert>
      </DashboardContent>
    );
  }

  return (
    <DashboardContent maxWidth={false}>
      <Stack spacing={3}>
        <Stack spacing={0.5}>
          <Typography variant="h4">Assistant inquiries</Typography>
          <Typography variant="body2" color="text.secondary">
            Questions submitted through the BPM assistant. Answers are not stored here.
          </Typography>
        </Stack>

        <BpmTableCard
          searchLabel="Search inquiries"
          searchPlaceholder="Question text or page path…"
          searchValue={search}
          onSearchChange={setSearch}
          totalLabel={loading ? 'Loading…' : `${total} inquiry(ies)`}
          footer={
            <BpmTablePagination
              page={page}
              rowsPerPage={rowsPerPage}
              total={total}
              onPageChange={setPage}
              onRowsPerPageChange={setRowsPerPage}
            />
          }
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 180 }}>When</TableCell>
              <TableCell sx={{ width: 220 }}>User</TableCell>
              <TableCell>Question</TableCell>
              <TableCell sx={{ width: 200 }}>Page</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={4} sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
                  Loading inquiries…
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              pageRows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(row.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{row.userEmail}</TableCell>
                  <TableCell sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {row.question}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {row.pagePath || '—'}
                  </TableCell>
                </TableRow>
              ))}
            {!loading && !pageRows.length && (
              <TableRow>
                <TableCell colSpan={4} sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
                  {search.trim() ? 'No inquiries match your search.' : 'No inquiries recorded yet.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </BpmTableCard>

        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </DashboardContent>
  );
}
