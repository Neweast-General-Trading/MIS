import { Navigate, useParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

import { CONFIG } from 'src/config-global';

import { useCompanies } from 'src/sections/bpm/companies';
import { DepartmentFoldersView } from 'src/sections/bpm/view';
import { companyDisplayLabel } from 'src/sections/bpm/company-display.util';

export default function Page() {
  const { companyCode = '' } = useParams();
  const { isCompanyCode, loading, companies } = useCompanies();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isCompanyCode(companyCode)) {
    return <Navigate to="/companies" replace />;
  }

  return (
    <>
      <title>{`${companyDisplayLabel(companies, companyCode)} — Process Functions — ${CONFIG.appName}`}</title>
      <meta name="description" content="Process functions scoped to a company." />

      <DepartmentFoldersView companyHubCode={companyCode} />
    </>
  );
}
