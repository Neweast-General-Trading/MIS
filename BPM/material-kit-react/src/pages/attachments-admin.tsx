import { CONFIG } from 'src/config-global';

import { AttachmentsAdminView } from 'src/sections/bpm/view';

export default function Page() {
  return (
    <>
      <title>{`Attachments - ${CONFIG.appName}`}</title>
      <meta name="description" content="Administration: uploaded comment attachments." />

      <AttachmentsAdminView />
    </>
  );
}
