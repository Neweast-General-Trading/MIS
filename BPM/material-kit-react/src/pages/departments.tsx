import { CONFIG } from 'src/config-global';

import { DepartmentFoldersView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`Process Functions - ${CONFIG.appName}`}</title>
      <meta
        name="description"
        content="Process function setup for BPM process mapping and documentation."
      />

      <DepartmentFoldersView />
    </>
  );
}
