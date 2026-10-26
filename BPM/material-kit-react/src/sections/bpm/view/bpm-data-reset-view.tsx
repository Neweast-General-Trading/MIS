import { useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import FormControlLabel from '@mui/material/FormControlLabel';

import { DashboardContent } from 'src/layouts/dashboard';

import { useAccessProfile, isSuperAdminProfile } from 'src/sections/bpm/access-control';
import { getBpmApiBaseUrl, purgeBpmOperationalData, bpmApiUsesDefaultHostPort } from 'src/sections/bpm/api';

export function BpmDataResetView() {
  const accessProfile = useAccessProfile();
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeDialogError, setPurgeDialogError] = useState('');
  const [purgeReseedNewEast, setPurgeReseedNewEast] = useState(false);
  const [purgeKeepTemplates, setPurgeKeepTemplates] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');

  const onConfirmPurge = async () => {
    setPurgeDialogError('');
    setSuccessMessage('');
    setPurgeBusy(true);
    try {
      await purgeBpmOperationalData({
        confirm: 'DELETE_ALL',
        reseedNewEast: purgeReseedNewEast,
        keepActivityTemplates: purgeKeepTemplates,
      });
      setPurgeDialogOpen(false);
      setPurgeReseedNewEast(false);
      setPurgeKeepTemplates(true);
      setSuccessMessage(
        purgeReseedNewEast
          ? 'Operational data was cleared and default New East process-function folders were recreated (no users added).'
          : purgeKeepTemplates
            ? 'Process functions, processes, and sub-processes were removed. Activity templates were kept.'
            : 'All operational BPM data was cleared (including templates). You can enter fresh data from Process Functions.',
      );
    } catch (err) {
      setPurgeDialogError((err as Error).message);
    } finally {
      setPurgeBusy(false);
    }
  };

  if (!isSuperAdminProfile(accessProfile)) {
    return (
      <DashboardContent>
        <Alert severity="info">This page is only available to Super Admin accounts.</Alert>
      </DashboardContent>
    );
  }

  return (
    <DashboardContent>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4">Administration — BPM data reset</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            Remove process functions, processes, and sub-processes (activities) from the server. You can keep activity
            templates (recommended) or wipe everything including templates. User accounts and roles are kept.
          </Typography>
        </Box>

        {successMessage ? (
          <Alert severity="success" onClose={() => setSuccessMessage('')}>
            {successMessage}
          </Alert>
        ) : null}

        <Card sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Alert severity="warning">
              من النافذة التالية يمكنك اختيار <strong>الإبقاء على قوالب الـ sub-process</strong> (Activity templates)
              وحذف العمليات فقط، أو حذف كل شيء بما فيها القوالب. ما يمسح المستخدمين. مسموح فقط لحساب{' '}
              <strong>Full access</strong>. عنوان الطلبات: <strong>{getBpmApiBaseUrl()}</strong>
              {bpmApiUsesDefaultHostPort()
                ? ' — بدون VITE_API_BASE_URL المنفذ الافتراضي هو 3000 على نفس اسم المضيف؛ إذا الـ API مو هون، عيّن VITE_API_BASE_URL وأعد بناء الواجهة.'
                : ''}
            </Alert>
            <Box>
              <Button
                variant="outlined"
                color="warning"
                onClick={() => {
                  setPurgeDialogError('');
                  setPurgeKeepTemplates(true);
                  setPurgeDialogOpen(true);
                }}
              >
                Clear all BPM data…
              </Button>
            </Box>
          </Stack>
        </Card>
      </Stack>

      <Dialog
        open={purgeDialogOpen}
        onClose={() => {
          if (!purgeBusy) setPurgeDialogOpen(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Clear BPM operational data</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Deletes all process functions, processes, sub-processes (activities), and activity comments. Users and
            roles are not removed.
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            API: {getBpmApiBaseUrl()}
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={purgeKeepTemplates}
                onChange={(event) => setPurgeKeepTemplates(event.target.checked)}
                disabled={purgeBusy}
              />
            }
            label="Keep activity / sub-process templates (do not delete template master rows)"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={purgeReseedNewEast}
                onChange={(event) => setPurgeReseedNewEast(event.target.checked)}
                disabled={purgeBusy}
              />
            }
            label="After purge, recreate default New East process-function folders (010–014) only"
          />
          {purgeDialogError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {purgeDialogError}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPurgeDialogOpen(false)} disabled={purgeBusy} color="inherit">
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={purgeBusy}
            onClick={() => void onConfirmPurge()}
          >
            {purgeBusy ? 'Working…' : purgeKeepTemplates ? 'Delete processes (keep templates)' : 'Delete everything'}
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardContent>
  );
}
