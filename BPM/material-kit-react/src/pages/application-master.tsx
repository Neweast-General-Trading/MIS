import { CONFIG } from 'src/config-global';

import { ApplicationMasterView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`Application Master - ${CONFIG.appName}`}</title>
      <meta name="description" content="Applications used across the company." />

      <ApplicationMasterView />
    </>
  );
}
