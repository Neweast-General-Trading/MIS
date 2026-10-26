import { CONFIG } from 'src/config-global';

import { BackupLogsView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`Backup Logs - ${CONFIG.appName}`}</title>
      <meta name="description" content="Administration: database backup and email delivery logs." />

      <BackupLogsView />
    </>
  );
}
