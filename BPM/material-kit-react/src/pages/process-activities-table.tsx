import { CONFIG } from 'src/config-global';

import { ProcessActivitiesTableView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`Sub-processes Table - ${CONFIG.appName}`}</title>
      <meta name="description" content="Excel-like detailed sub-process table for a process." />

      <ProcessActivitiesTableView />
    </>
  );
}
