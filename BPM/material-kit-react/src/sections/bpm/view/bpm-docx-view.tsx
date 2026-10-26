import { useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import Accordion from '@mui/material/Accordion';
import Typography from '@mui/material/Typography';
import TableContainer from '@mui/material/TableContainer';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';

import { useAccessProfile, isSuperAdminProfile } from 'src/sections/bpm/access-control';
import {
  DAILY_INBOUND_DOCX_FILENAME,
  buildDailyInboundPlanDocxBlob,
} from 'src/sections/bpm/bpm-docx/build-daily-inbound-plan-docx';
import {
  RACI_ROLES,
  PROCESS_SCOPE,
  SUB_PROCESSES,
  PROCESS_PURPOSE,
  SWIMLANE_MATRIX,
  SWIMLANE_PHASES,
  MASTER_RACI_ROWS,
  RACI_ROLE_SHORT_LABELS,
  DAILY_INBOUND_PROCESS_CODE,
  DAILY_INBOUND_PROCESS_NAME,
} from 'src/sections/bpm/bpm-docx/daily-inbound-plan.content';

export function BpmDocxView() {
  const profile = useAccessProfile();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      const blob = await buildDailyInboundPlanDocxBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = DAILY_INBOUND_DOCX_FILENAME;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError((e as Error).message);
    } finally {
      setDownloading(false);
    }
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
          <Typography variant="h4">BPM DOCX</Typography>
          <Typography variant="body2" color="text.secondary">
            Packaged business process document (Word) — static content, no database reads. Super Admin
            can preview and download.
          </Typography>
        </div>

        <Card sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
            <div>
              <Typography variant="subtitle1">
                {DAILY_INBOUND_PROCESS_CODE} — {DAILY_INBOUND_PROCESS_NAME}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Includes swimlane-style BPMN table, master RACI, and five sub-processes with full RACI
                per step.
              </Typography>
            </div>
            <Button variant="contained" onClick={() => void handleDownload()} disabled={downloading}>
              {downloading ? 'Preparing…' : 'Download Word (.docx)'}
            </Button>
          </Stack>
          {downloadError ? <Alert severity="error" sx={{ mt: 2 }}>{downloadError}</Alert> : null}
        </Card>

        <Alert severity="info">
          Purpose: {PROCESS_PURPOSE}
        </Alert>
        <Typography variant="body2" color="text.secondary">
          Scope: {PROCESS_SCOPE}
        </Typography>

        <Typography variant="h6">BPMN swimlane grid (preview)</Typography>
        <TableContainer component={Card} variant="outlined" sx={{ maxWidth: 1, overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell>Lane</TableCell>
                {SWIMLANE_PHASES.map((ph) => (
                  <TableCell key={ph}>{ph}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {SWIMLANE_MATRIX.map((row) => (
                <TableRow key={row.lane}>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.lane}</TableCell>
                  {row.cells.map((c, idx) => (
                    <TableCell key={idx} sx={{ verticalAlign: 'top', maxWidth: 220 }}>
                      <Typography variant="caption" component="pre" sx={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', m: 0 }}>
                        {c}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="h6">Master RACI (preview)</Typography>
        <TableContainer component={Card} variant="outlined" sx={{ maxWidth: 1, overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Step</TableCell>
                {RACI_ROLE_SHORT_LABELS.map((lab, i) => (
                  <TableCell key={lab} align="center" title={RACI_ROLES[i]}>
                    {lab}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {MASTER_RACI_ROWS.map((row) => (
                <TableRow key={row.stepId}>
                  <TableCell>{row.stepId}</TableCell>
                  <TableCell>{row.stepName}</TableCell>
                  {RACI_ROLES.map((role) => (
                    <TableCell key={role} align="center">
                      {row.raci[role]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="h6">Sub-processes</Typography>
        <Stack spacing={1}>
          {SUB_PROCESSES.map((sp) => (
            <Accordion key={sp.code} defaultExpanded={false} disableGutters variant="outlined">
              <AccordionSummary expandIcon={<Iconify icon="eva:arrow-ios-downward-fill" />}>
                <Typography variant="subtitle2">
                  {sp.code} — {sp.title}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <Typography variant="body2">{sp.objective}</Typography>
                  <Box>
                    <Typography variant="subtitle2">Steps</Typography>
                    <ul style={{ marginTop: 8, marginBottom: 0 }}>
                      {sp.steps.map((s) => (
                        <li key={s.id}>
                          <Typography variant="body2" component="span">
                            {s.id}: {s.text}
                          </Typography>
                        </li>
                      ))}
                    </ul>
                  </Box>
                  <TableContainer sx={{ overflowX: 'auto' }}>
                    <Table size="small" sx={{ minWidth: 800 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>ID</TableCell>
                          <TableCell>Step</TableCell>
                          {RACI_ROLE_SHORT_LABELS.map((lab, i) => (
                            <TableCell key={lab} align="center" title={RACI_ROLES[i]}>
                              {lab}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sp.raci.map((r) => (
                          <TableRow key={r.stepId}>
                            <TableCell>{r.stepId}</TableCell>
                            <TableCell>{r.stepName}</TableCell>
                            {RACI_ROLES.map((role) => (
                              <TableCell key={role} align="center">
                                {r.raci[role]}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </Stack>
      </Stack>
    </DashboardContent>
  );
}
