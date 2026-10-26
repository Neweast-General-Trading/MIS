import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

import { useRouter } from 'src/routes/hooks';

import { Iconify } from 'src/components/iconify';

import { useCompanies } from 'src/sections/bpm/companies';
import { companyFullName } from 'src/sections/bpm/company-display.util';
import { useAccessProfile, canManageCompanies } from 'src/sections/bpm/access-control';
import {
  companyBpmCode,
  fetchHanaBranches,
  updateCompanySettings,
} from 'src/sections/bpm/api';
import { OracleLegalEntitySelectField } from 'src/sections/bpm/components/oracle-legal-entity-select-field';

export type CompanySettingsViewProps = {
  companyCode: string;
};

export function CompanySettingsView({ companyCode }: CompanySettingsViewProps) {
  const router = useRouter();
  const profile = useAccessProfile();
  const canEdit = canManageCompanies(profile);
  const { companies, loading, reload } = useCompanies();

  const company = useMemo(
    () => companies.find((item) => companyBpmCode(item) === companyCode.trim().toUpperCase()) ?? null,
    [companies, companyCode],
  );

  const [legalEntityId, setLegalEntityId] = useState('');
  const [hanaBranchCode, setHanaBranchCode] = useState('');
  const [hanaBranches, setHanaBranches] = useState<Array<{ branch: string; name: string }>>([]);
  const [hanaBranchesLoading, setHanaBranchesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (company) {
      setLegalEntityId(company.oracleLegalEntityId ?? '');
      setHanaBranchCode(company.hanaBranch ?? '');
    }
  }, [company]);

  useEffect(() => {
    let cancelled = false;
    setHanaBranchesLoading(true);
    fetchHanaBranches()
      .then((rows) => {
        if (!cancelled) setHanaBranches(rows);
      })
      .catch(() => {
        if (!cancelled) setHanaBranches([]);
      })
      .finally(() => {
        if (!cancelled) setHanaBranchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (!company) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateCompanySettings(companyBpmCode(company), {
        oracleLegalEntityId: legalEntityId.trim() || '',
        hanaBranchCode: hanaBranchCode.trim() || '',
      });
      setSuccess('Saved.');
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Stack alignItems="center" py={4}>
        <CircularProgress size={28} />
      </Stack>
    );
  }

  if (!company) {
    return (
      <Alert severity="warning" sx={{ py: 0.5 }}>
        Company &quot;{companyCode}&quot; was not found.{' '}
        <Button size="small" variant="text" onClick={() => router.push('/companies')}>
          Back
        </Button>
      </Alert>
    );
  }

  const bpmCode = companyBpmCode(company);
  const legalName = company.oracleLegalEntityName || companyFullName(companies, bpmCode);
  const hanaLabel =
    hanaBranches.find((item) => item.branch === (company.hanaBranch ?? ''))?.name ||
    company.hanaBranch ||
    'Not linked';

  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
        <Box>
          <Button
            size="small"
            variant="text"
            color="inherit"
            sx={{ minWidth: 0, px: 0, mb: 0.5, fontSize: '0.75rem' }}
            startIcon={<Iconify icon="solar:restart-bold" width={14} />}
            onClick={() => router.push('/companies')}
          >
            Companies
          </Button>
          <Typography variant="h5">{bpmCode}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
            Oracle legal entity and SAP HANA company
          </Typography>
        </Box>
      </Stack>

      {!canEdit ? (
        <Alert severity="info" sx={{ py: 0.5 }}>
          View only — administrators can edit this link.
        </Alert>
      ) : null}

      {error ? <Alert severity="error" sx={{ py: 0.5 }}>{error}</Alert> : null}
      {success ? <Alert severity="success" sx={{ py: 0.5 }}>{success}</Alert> : null}

      <Card variant="outlined" sx={{ p: 2, borderColor: 'divider' }}>
        <Stack spacing={1.75}>
          <Stack spacing={0.5}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              BPM code
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {bpmCode}
            </Typography>
          </Stack>

          <Divider sx={{ borderStyle: 'dashed' }} />

          <Stack spacing={0.5}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Current Oracle link
            </Typography>
            <Typography variant="body2">
              {legalName && legalName !== bpmCode ? legalName : 'Not linked'}
            </Typography>
          </Stack>

          <OracleLegalEntitySelectField
            size="small"
            value={legalEntityId}
            onChange={setLegalEntityId}
            disabled={!canEdit || saving}
            label="Oracle legal entity"
            helperText="Used for RACI designation dropdowns."
          />

          <Divider sx={{ borderStyle: 'dashed' }} />

          <Stack spacing={0.5}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Current HANA company
            </Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
              {hanaLabel}
            </Typography>
          </Stack>

          <TextField
            select
            fullWidth
            size="small"
            label="SAP HANA company / branch"
            value={hanaBranchCode}
            onChange={(event) => setHanaBranchCode(event.target.value)}
            disabled={!canEdit || saving || hanaBranchesLoading}
            helperText="Departments for Process Functions come from this HANA company (e.g. BI_NEGT = FZCO)."
            SelectProps={{
              renderValue: (selected) => {
                const code = String(selected ?? '');
                if (!code) return 'Not linked';
                const match = hanaBranches.find((item) => item.branch === code);
                return match ? `${match.branch} — ${match.name}` : code;
              },
            }}
          >
            <MenuItem value="">
              <em>Not linked</em>
            </MenuItem>
            {hanaBranches.map((item) => (
              <MenuItem key={item.branch} value={item.branch} sx={{ whiteSpace: 'normal' }}>
                <Stack spacing={0.15}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {item.branch}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.name}
                  </Typography>
                </Stack>
              </MenuItem>
            ))}
          </TextField>

          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ pt: 0.5 }}>
            <Button
              size="small"
              variant="contained"
              disabled={!canEdit || saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button
              size="small"
              variant="text"
              color="inherit"
              onClick={() => router.push(`/companies/${bpmCode}/departments`)}
            >
              Process functions
            </Button>
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}
