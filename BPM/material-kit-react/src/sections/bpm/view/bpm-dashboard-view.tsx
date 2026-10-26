import { useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

import { DashboardContent } from 'src/layouts/dashboard';

import { companyBpmCode } from 'src/sections/bpm/api';
import { useCompanies } from 'src/sections/bpm/companies';
import { CompanyDashboardView } from 'src/sections/bpm/view/company-dashboard-view';

const STORAGE_KEY = 'bpm.homeDashboardCompany';

/**
 * Home page = company BPM dashboard (opens immediately with last / first company).
 */
export function BpmDashboardView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { companies, loading, error } = useCompanies();

  const companyCodes = useMemo(
    () => companies.map((c) => companyBpmCode(c)).filter(Boolean),
    [companies]
  );

  const companyCode = useMemo(() => {
    if (!companyCodes.length) return '';
    const fromUrl = (searchParams.get('company') || '').trim().toUpperCase();
    if (fromUrl && companyCodes.includes(fromUrl)) return fromUrl;
    try {
      const saved = (localStorage.getItem(STORAGE_KEY) || '').trim().toUpperCase();
      if (saved && companyCodes.includes(saved)) return saved;
    } catch {
      /* ignore */
    }
    return companyCodes[0] || '';
  }, [companyCodes, searchParams]);

  useEffect(() => {
    if (!companyCode) return;
    try {
      localStorage.setItem(STORAGE_KEY, companyCode);
    } catch {
      /* ignore */
    }
    const current = (searchParams.get('company') || '').trim().toUpperCase();
    if (current !== companyCode) {
      setSearchParams({ company: companyCode }, { replace: true });
    }
  }, [companyCode, searchParams, setSearchParams]);

  const handleCompanyChange = (next: string) => {
    const code = next.trim().toUpperCase();
    if (!code) return;
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
    setSearchParams({ company: code }, { replace: true });
  };

  if (loading) {
    return (
      <DashboardContent maxWidth={false}>
        <Stack alignItems="center" py={8} spacing={1.5}>
          <CircularProgress size={28} />
          <Typography variant="body2" color="text.secondary">
            Opening dashboard…
          </Typography>
          <Skeleton variant="rounded" height={120} width="100%" sx={{ maxWidth: 720, borderRadius: 2 }} />
        </Stack>
      </DashboardContent>
    );
  }

  if (error) {
    return (
      <DashboardContent>
        <Alert severity="error">{error}</Alert>
      </DashboardContent>
    );
  }

  if (!companyCode) {
    return (
      <DashboardContent>
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography variant="h6">No companies available</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Add a company first, then the home dashboard will open here.
          </Typography>
        </Box>
      </DashboardContent>
    );
  }

  return (
    <CompanyDashboardView
      companyCode={companyCode}
      onCompanyChange={handleCompanyChange}
    />
  );
}
