import { useMemo, useState, useEffect } from 'react';

import Card from '@mui/material/Card';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import Typography from '@mui/material/Typography';
import TableContainer from '@mui/material/TableContainer';

import { DashboardContent } from 'src/layouts/dashboard';

import {
  resolveBpmPublicFileUrl,
  fetchUploadedAttachments,
  type UploadedAttachmentItem,
} from 'src/sections/bpm/api';

export function AttachmentsAdminView() {
  const [items, setItems] = useState<UploadedAttachmentItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUploadedAttachments()
      .then((rows) => {
        setItems(rows);
        setError('');
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const displayRows = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        link: item.downloadUrl ? resolveBpmPublicFileUrl(item.downloadUrl) : '',
      })),
    [items],
  );

  return (
    <DashboardContent>
      <Stack spacing={2}>
        <Typography variant="h4">Administration — Attachments</Typography>
        <Typography variant="body2" color="text.secondary">
          Uploaded comment files grouped by sub-process code folder.
        </Typography>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Sub-process code folder</TableCell>
                  <TableCell>Stored file name</TableCell>
                  <TableCell>Original file name</TableCell>
                  <TableCell>Uploaded by</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Download</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6}>Loading attachments...</TableCell>
                  </TableRow>
                ) : null}
                {!loading && !displayRows.length ? (
                  <TableRow>
                    <TableCell colSpan={6}>No attachments found.</TableCell>
                  </TableRow>
                ) : null}
                {displayRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.folderName}</TableCell>
                    <TableCell>{row.storedFileName}</TableCell>
                    <TableCell>{row.originalName}</TableCell>
                    <TableCell>{row.uploadedBy}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(row.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {row.link ? (
                        <Link href={row.link} target="_blank" rel="noopener">
                          Open attachment
                        </Link>
                      ) : (
                        '-'
                      )}
                    </TableCell>
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
