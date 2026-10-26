import { CONFIG } from 'src/config-global';

import { BpmDocxView } from 'src/sections/bpm/view/bpm-docx-view';

export default function Page() {
  return (
    <>
      <title>{`BPM DOCX - ${CONFIG.appName}`}</title>
      <meta name="description" content="BPM Word documentation package (Super Admin)." />

      <BpmDocxView />
    </>
  );
}
