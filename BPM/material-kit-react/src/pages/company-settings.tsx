import { Navigate, useParams } from 'react-router-dom';

import { CONFIG } from 'src/config-global';
import { DashboardContent } from 'src/layouts/dashboard';

import { useCompanies } from 'src/sections/bpm/companies';
import { CompanySettingsView } from 'src/sections/bpm/view/company-settings-view';

export default function Page() {
  const { companyCode = '' } = useParams();
  const { isCompanyCode, loading } = useCompanies();

  if (!loading && !isCompanyCode(companyCode)) {
    return <Navigate to="/companies" replace />;
  }

  return (
    <>
      <title>{`${companyCode.toUpperCase()} — Company details — ${CONFIG.appName}`}</title>
      <meta name="description" content="Company settings and Oracle legal entity link." />

      <DashboardContent maxWidth="sm">
        <CompanySettingsView companyCode={companyCode} />
      </DashboardContent>
    </>
  );
}
