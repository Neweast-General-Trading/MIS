import { CONFIG } from 'src/config-global';

import { ActivitiesMasterView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`Sub-process Template Master - ${CONFIG.appName}`}</title>
      <meta name="description" content="Manage reusable sub-process templates." />

      <ActivitiesMasterView />
    </>
  );
}
