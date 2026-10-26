import { CONFIG } from 'src/config-global';

import { ProcessDocumentationView } from 'src/sections/bpm/view/process-documentation-view';

export default function Page() {
  return (
    <>
      <title>{`Process Function Documentation - ${CONFIG.appName}`}</title>
      <meta
        name="description"
        content="Upload and download process function and process documentation files."
      />
      <ProcessDocumentationView />
    </>
  );
}
