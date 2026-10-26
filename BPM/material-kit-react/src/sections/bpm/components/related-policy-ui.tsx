import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { Iconify } from 'src/components/iconify';

import { type ActivityItem, type RelatedPolicyLink } from 'src/sections/bpm/storage';
import {
  fetchHanaBranches,
  type HanaDepartment,
  fetchHanaDepartments,
  fetchPolicyCreatorPolicies,
  type PolicyCreatorCatalogItem,
  type AddActivityPolicyLinkPayload,
} from 'src/sections/bpm/api';

function formatPolicyHint(link: RelatedPolicyLink): string {
  const parts = [
    link.companyName || link.companyCode || '',
    link.departmentName || '',
    link.processName || link.processCode || '',
    link.activityCode || '',
  ].filter(Boolean);
  return parts.join(' / ');
}

export function RelatedPolicyLinksCell({
  links,
  onOpenLink,
  onRemoveLink,
}: {
  links: RelatedPolicyLink[] | undefined;
  onOpenLink: (link: RelatedPolicyLink) => void;
  /** When provided, each policy chip shows a remove (x) button. */
  onRemoveLink?: (link: RelatedPolicyLink) => void;
}) {
  const items = links ?? [];
  if (!items.length) {
    return (
      <Typography variant="body2" color="text.disabled">
        —
      </Typography>
    );
  }

  return (
    <Stack spacing={0.5} sx={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
      {items.map((link) => {
        const name = link.policyName?.trim() || 'Policy';

        return (
          <Tooltip
            key={link.id}
            title={
              <Box component="span" sx={{ display: 'block', whiteSpace: 'pre-line', lineHeight: 1.4 }}>
                {name}
                {link.policyVersion != null ? `\nVersion ${link.policyVersion}` : ''}
                {'\n'}
                {formatPolicyHint(link)}
              </Box>
            }
            arrow
            placement="top"
            enterDelay={300}
          >
            <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
              <Chip
                size="small"
                variant="outlined"
                color="default"
                clickable
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenLink(link);
                }}
                icon={<Iconify icon="solar:document-bold" width={12} />}
                label={name}
                onDelete={
                  onRemoveLink
                    ? (event) => {
                        event.stopPropagation();
                        onRemoveLink(link);
                      }
                    : undefined
                }
                deleteIcon={
                  <Tooltip title="Remove this policy link">
                    <Box component="span" sx={{ display: 'inline-flex' }}>
                      <Iconify icon="mingcute:close-line" width={14} />
                    </Box>
                  </Tooltip>
                }
                sx={{
                  width: '100%',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  height: 22,
                  justifyContent: 'flex-start',
                  '& .MuiChip-label': {
                    display: 'block',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.2,
                    py: 0,
                    px: 0.25,
                    fontSize: '0.6875rem',
                  },
                  '& .MuiChip-icon': {
                    ml: 0.5,
                    mr: -0.25,
                  },
                }}
              />
            </Box>
          </Tooltip>
        );
      })}
    </Stack>
  );
}

type LinkPickerProps = {
  open: boolean;
  sourceActivity: ActivityItem;
  defaultCompanyCode?: string;
  defaultDepartmentCode?: number | null;
  defaultDepartmentName?: string;
  onClose: () => void;
  onSave: (payload: AddActivityPolicyLinkPayload) => Promise<void>;
};

export function RelatedPolicyLinkDialog({
  open,
  sourceActivity,
  defaultCompanyCode = '',
  defaultDepartmentCode = null,
  defaultDepartmentName = '',
  onClose,
  onSave,
}: LinkPickerProps) {
  const [companies, setCompanies] = useState<Array<{ branch: string; name: string }>>([]);
  const [departments, setDepartments] = useState<HanaDepartment[]>([]);
  const [policies, setPolicies] = useState<PolicyCreatorCatalogItem[]>([]);
  const [companyCode, setCompanyCode] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setCompanyCode('');
    setDepartmentCode('');
    setPolicyId('');
    setDepartments([]);
    setPolicies([]);
    setError('');
    setLoadingCompanies(true);
    fetchHanaBranches()
      .then((rows) => {
        const list = rows ?? [];
        setCompanies(list);
        const preferred =
          list.find((item) => item.branch === defaultCompanyCode)?.branch ||
          list[0]?.branch ||
          '';
        if (preferred) {
          setCompanyCode(preferred);
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingCompanies(false));
  }, [open, defaultCompanyCode]);

  useEffect(() => {
    if (!open || !companyCode) {
      setDepartments([]);
      setDepartmentCode('');
      return;
    }
    setLoadingDepartments(true);
    setDepartmentCode('');
    setPolicyId('');
    setPolicies([]);
    fetchHanaDepartments({ hanaBranch: companyCode })
      .then((rows) => {
        const list = rows ?? [];
        setDepartments(list);
        const preferred =
          list.find((item) => Number(item.code) === Number(defaultDepartmentCode)) ||
          list.find(
            (item) =>
              item.name.trim().toLowerCase() === defaultDepartmentName.trim().toLowerCase(),
          );
        if (preferred) {
          setDepartmentCode(String(preferred.code));
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingDepartments(false));
  }, [open, companyCode, defaultDepartmentCode, defaultDepartmentName]);

  useEffect(() => {
    if (!open || !companyCode || !departmentCode) {
      setPolicies([]);
      return;
    }
    const dept = departments.find((item) => String(item.code) === departmentCode);
    setLoadingPolicies(true);
    setPolicyId('');
    fetchPolicyCreatorPolicies({
      companyCode,
      departmentCode: Number(departmentCode),
      departmentName: dept?.name,
    })
      .then((rows) => setPolicies(rows ?? []))
      .catch((err: Error) => {
        setError(err.message);
        setPolicies([]);
      })
      .finally(() => setLoadingPolicies(false));
  }, [open, companyCode, departmentCode, departments]);

  const selectedPolicy = useMemo(
    () => policies.find((item) => item.id === policyId) ?? null,
    [policies, policyId],
  );

  const selectablePolicies = useMemo(
    () =>
      policies.filter(
        (item) =>
          !(sourceActivity.relatedPolicies ?? []).some(
            (link) => link.policyCreatorPolicyId === item.id,
          ),
      ),
    [policies, sourceActivity.relatedPolicies],
  );

  const handleSave = async () => {
    if (!selectedPolicy) {
      setError('Select company, department, and a policy.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        policyCreatorPolicyId: selectedPolicy.id,
        policyName: selectedPolicy.name,
        policyVersion: selectedPolicy.version ?? undefined,
        companyCode: selectedPolicy.companyCode,
        companyName: selectedPolicy.companyName,
        departmentName: selectedPolicy.departmentName,
        policyCreatorUrl: selectedPolicy.policyCreatorUrl,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Link to policy</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info" icon={false}>
            Linking from <strong>{sourceActivity.code}</strong> — {sourceActivity.activityName}
          </Alert>
          <TextField
            select
            fullWidth
            label="Company"
            value={companyCode}
            disabled={loadingCompanies}
            onChange={(event) => setCompanyCode(event.target.value)}
          >
            {companies.map((company) => (
              <MenuItem key={company.branch} value={company.branch}>
                {company.name} ({company.branch})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label="Department"
            value={departmentCode}
            disabled={!companyCode || loadingDepartments}
            onChange={(event) => setDepartmentCode(event.target.value)}
          >
            {departments.map((dept) => (
              <MenuItem key={dept.code} value={String(dept.code)}>
                {dept.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label="Policy"
            value={policyId}
            disabled={!departmentCode || loadingPolicies}
            onChange={(event) => setPolicyId(event.target.value)}
            helperText={
              departmentCode && !loadingPolicies && selectablePolicies.length === 0
                ? 'No Policy Creator policies found for this department.'
                : 'Policies are loaded from Policy Creator.'
            }
          >
            {selectablePolicies.map((policy) => (
              <MenuItem key={policy.id} value={policy.id}>
                {policy.name}
                {policy.version != null ? ` (v${policy.version})` : ''}
                {policy.status ? ` — ${policy.status}` : ''}
              </MenuItem>
            ))}
          </TextField>
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save link'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
