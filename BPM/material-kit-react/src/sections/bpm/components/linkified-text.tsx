import type { ReactNode } from 'react';

import Link from '@mui/material/Link';

const URL_RE = /(https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?])/g;

/** Plain text where every http(s) URL becomes a real link (also clickable in the printed PDF). */
export function LinkifiedText({ text }: { text: string }) {
  if (!text) return null;
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
   
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const url = match[0];
    parts.push(
      <Link key={`${match.index}-${url}`} href={url} target="_blank" rel="noopener noreferrer" underline="always">
        {url}
      </Link>,
    );
    last = match.index + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
