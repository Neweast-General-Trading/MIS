import { CONFIG } from 'src/config-global';

import { UserLogView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`User_LOG - ${CONFIG.appName}`}</title>
      <meta name="description" content="Confidential user activity log with pass/fail status and errors." />

      <UserLogView />
    </>
  );
}

