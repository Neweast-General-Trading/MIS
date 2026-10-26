import { CONFIG } from 'src/config-global';

import { BpmDataResetView } from 'src/sections/bpm/view/bpm-data-reset-view';

export default function Page() {
  return (
    <>
      <title>{`BPM data reset - ${CONFIG.appName}`}</title>
      <meta name="description" content="Administrator: clear all operational BPM data on the server." />

      <BpmDataResetView />
    </>
  );
}
