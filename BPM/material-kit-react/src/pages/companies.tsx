import { useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';

import { useRouter } from 'src/routes/hooks';

import { CONFIG } from 'src/config-global';
import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';

import { useCompanies } from 'src/sections/bpm/companies';
import { createCompany, companyBpmCode } from 'src/sections/bpm/api';
import { companyFullName } from 'src/sections/bpm/company-display.util';
import { useAccessProfile, canManageCompanies } from 'src/sections/bpm/access-control';
import { OracleLegalEntitySelectField } from 'src/sections/bpm/components/oracle-legal-entity-select-field';

export default function Page() {
  const router = useRouter();
  const profile = useAccessProfile();
  const canManage = canManageCompanies(profile);
  const { companies, loading, error, usingFallback, reload } = useCompanies();

  const [addOpen, setAddOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newLegalEntityId, setNewLegalEntityId] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAddCompany = async () => {
    const code = newCode.trim().toUpperCase();
    if (code.length < 2) {
      setAddError('Enter a company code (at least 2 characters).');
      return;
    }
    setAdding(true);
    setAddError('');
    try {
      await createCompany({
        code,
        name: newName.trim() || undefined,
        oracleLegalEntityId: newLegalEntityId.trim() || undefined,
      });
      setAddOpen(false);
      setNewCode('');
      setNewName('');
      setNewLegalEntityId('');
      await reload();
    } catch (e) {
      setAddError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <title>{`Companies — ${CONFIG.appName}`}</title>
      <meta name="description" content="Choose a company to open process functions and processes." />

      <DashboardContent maxWidth="lg">
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={1.5}
          >
            <Box>
              <Typography variant="h5">Companies</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                Open a company or adjust Oracle legal entity links for RACI designations.
              </Typography>
            </Box>
            {canManage ? (
              <Button
                size="small"
                variant="contained"
                startIcon={<Iconify icon="mingcute:add-line" width={16} />}
                onClick={() => {
                  setAddError('');
                  setAddOpen(true);
                }}
              >
                Add company
              </Button>
            ) : null}
          </Stack>

          {error ? (
            <Alert severity={usingFallback ? 'warning' : 'error'} sx={{ py: 0.5 }}>
              {error}
              {usingFallback ? ' Showing defaults until the API is up.' : null}
            </Alert>
          ) : null}

          {loading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={28} />
            </Stack>
          ) : (
            <Grid container spacing={1.5}>
              {companies.map((company) => {
                const bpmCode = companyBpmCode(company);
                const legalName =
                  company.oracleLegalEntityName || companyFullName(companies, bpmCode);
                const linked = Boolean(legalName && legalName !== bpmCode);

                return (
                  <Grid key={bpmCode} size={{ xs: 12, sm: 6, md: 4 }}>
                    <Card
                      variant="outlined"
                      sx={{
                        p: 1.75,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                      }}
                    >
                      <Stack spacing={1.25} sx={{ flex: 1 }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.4 }}>
                            {bpmCode}
                          </Typography>
                          <Button
                            size="small"
                            variant="text"
                            color="inherit"
                            sx={{ minWidth: 0, px: 0.75, fontSize: '0.75rem' }}
                            startIcon={<Iconify icon="solar:settings-bold-duotone" width={14} />}
                            onClick={() => router.push(`/companies/${bpmCode}/settings`)}
                          >
                            Details
                          </Button>
                        </Stack>

                        <Typography
                          variant="caption"
                          sx={{
                            color: linked ? 'text.secondary' : 'text.disabled',
                            lineHeight: 1.45,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            minHeight: '2.2em',
                          }}
                        >
                          {linked ? legalName : 'Oracle legal entity not linked'}
                        </Typography>

                        <Box sx={{ flex: 1 }} />

                        <Divider sx={{ borderStyle: 'dashed' }} />

                        <Stack spacing={0.75}>
                          <Button
                            size="small"
                            variant="contained"
                            fullWidth
                            sx={{ py: 0.55, fontSize: '0.8125rem' }}
                            onClick={() => {
                              try {
                                localStorage.setItem('bpm.homeDashboardCompany', bpmCode);
                              } catch {
                                /* ignore */
                              }
                              router.push(`/?company=${encodeURIComponent(bpmCode)}`);
                            }}
                          >
                            Open dashboard
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            fullWidth
                            sx={{ py: 0.5, fontSize: '0.8125rem' }}
                            onClick={() => router.push(`/companies/${bpmCode}/departments`)}
                          >
                            Process functions
                          </Button>
                        </Stack>
                      </Stack>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Stack>
      </DashboardContent>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1, typography: 'subtitle1' }}>Add company</DialogTitle>
        <DialogContent dividers sx={{ pt: 1.5 }}>
          <Stack spacing={1.5}>
            <TextField
              size="small"
              label="Company code"
              placeholder="ISUZU"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              helperText="Example: ISUZU, NEGT"
              autoFocus
            />
            <TextField
              size="small"
              label="Display name (optional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <OracleLegalEntitySelectField
              size="small"
              value={newLegalEntityId}
              onChange={setNewLegalEntityId}
              helperText="Oracle Fusion legal entity."
            />
            {addError ? <Alert severity="error">{addError}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.25 }}>
          <Button size="small" onClick={() => setAddOpen(false)} disabled={adding}>
            Cancel
          </Button>
          <Button size="small" variant="contained" disabled={adding} onClick={() => void handleAddCompany()}>
            {adding ? 'Saving…' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
