import { CONFIG } from 'src/config-global';

import { DepartmentProcessesView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`Process Functions — Processes - ${CONFIG.appName}`}</title>
      <meta
        name="description"
        content="Process list for selected BPM department."
      />

      <DepartmentProcessesView />
    </>
  );
}
