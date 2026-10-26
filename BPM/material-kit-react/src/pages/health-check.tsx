import { CONFIG } from 'src/config-global';

import { HealthCheckView } from 'src/sections/bpm/view/health-check-view';

export default function Page() {
  return (
    <>
      <title>{`Health check - ${CONFIG.appName}`}</title>
      <meta name="description" content="System health, database latency, and resource usage." />

      <HealthCheckView />
    </>
  );
}
