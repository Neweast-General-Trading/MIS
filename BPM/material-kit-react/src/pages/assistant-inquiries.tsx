import { CONFIG } from 'src/config-global';

import { AssistantInquiryLogView } from 'src/sections/bpm/view/assistant-inquiry-log-view';

export default function Page() {
  return (
    <>
      <title>{`Assistant inquiries - ${CONFIG.appName}`}</title>
      <meta name="description" content="Administration log of BPM assistant questions." />
      <AssistantInquiryLogView />
    </>
  );
}
