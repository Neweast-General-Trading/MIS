import { CONFIG } from 'src/config-global';

import { UsersPermissionView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`Users Permission - ${CONFIG.appName}`}</title>
      <meta name="description" content="Manage user module permissions and access levels." />

      <UsersPermissionView />
    </>
  );
}
