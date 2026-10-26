import { CONFIG } from 'src/config-global';

import { ProcessActivitiesView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`Process Sub-processes - ${CONFIG.appName}`}</title>
      <meta name="description" content="Sub-process list for the selected process." />

      <ProcessActivitiesView />
    </>
  );
}
