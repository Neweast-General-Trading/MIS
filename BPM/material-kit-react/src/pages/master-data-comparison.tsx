import { CONFIG } from 'src/config-global';

import { MasterDataComparisonView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`BPM vs SQL - ${CONFIG.appName}`}</title>
      <meta
        name="description"
        content="Super Admin comparison of Legal Entity, Department, and Designation from BPM and SQL Server."
      />

      <MasterDataComparisonView />
    </>
  );
}
