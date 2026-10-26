import { useParams } from 'react-router-dom';

import { CONFIG } from 'src/config-global';

import { CompanyDashboardView } from 'src/sections/bpm/view/company-dashboard-view';

// ----------------------------------------------------------------------

export default function Page() {
  const { companyCode = '' } = useParams();

  return (
    <>
      <title>{`Dashboard · ${companyCode.toUpperCase()} — ${CONFIG.appName}`}</title>
      <meta
        name="description"
        content="Company BPM dashboard with process functions, job roles, policies, TAT, and reports."
      />

      <CompanyDashboardView companyCode={companyCode} />
    </>
  );
}
