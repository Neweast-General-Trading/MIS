import { CONFIG } from 'src/config-global';

import { UsersRoleView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`Roles - ${CONFIG.appName}`}</title>
      <meta name="description" content="Configure role permissions, activation, and process access." />

      <UsersRoleView />
    </>
  );
}
