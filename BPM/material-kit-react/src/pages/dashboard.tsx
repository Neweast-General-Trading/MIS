import { CONFIG } from 'src/config-global';

import { BpmDashboardView as DashboardView } from 'src/sections/bpm/view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <title>{`Dashboard - ${CONFIG.appName}`}</title>
      <meta
        name="description"
        content="Home BPM dashboard — process functions, job roles, policies, TAT, and reports."
      />

      <DashboardView />
    </>
  );
}
