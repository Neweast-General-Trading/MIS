import { CONFIG } from 'src/config-global';

import { UsersManagementView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`Users - ${CONFIG.appName}`}</title>
      <meta name="description" content="Manage users, assign departments, and full access." />

      <UsersManagementView />
    </>
  );
}
