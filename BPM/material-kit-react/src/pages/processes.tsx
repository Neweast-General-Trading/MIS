import { CONFIG } from 'src/config-global';

import { ProcessesOverviewView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`Process - ${CONFIG.appName}`}</title>
      <meta name="description" content="Process details overview by department." />

      <ProcessesOverviewView />
    </>
  );
}
