import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  Footer,
  Header,
  ImageRun,
  Paragraph,
  SimpleField,
  TextRun,
  AlignmentType,
} from 'docx';

const LOGO_RELATIVE = 'docx/logo/red_logo_new.png';

export function resolveCompanyLogoPath(): string | null {
  const candidates = [
    join(__dirname, '..', LOGO_RELATIVE),
    join(__dirname, '..', '..', LOGO_RELATIVE),
    join(process.cwd(), LOGO_RELATIVE),
    join(process.cwd(), 'bpm-api', LOGO_RELATIVE),
    join(process.cwd(), 'logo/red_logo_new.png'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export async function loadCompanyLogoBuffer(): Promise<Buffer | null> {
  const path = resolveCompanyLogoPath();
  if (!path) return null;
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

/** Height that keeps the logo's real proportions for a given width (never stretched). */
function logoHeightForWidth(data: Buffer, width: number): number {
  if (data.length >= 24 && data.toString('ascii', 1, 4) === 'PNG') {
    const w = data.readUInt32BE(16);
    const h = data.readUInt32BE(20);
    if (w > 0 && h > 0) return Math.round((width * h) / w);
  }
  return Math.round(width / 3);
}

function logoImageRun(data: Buffer, width: number): ImageRun {
  return new ImageRun({
    data,
    type: 'png',
    transformation: { width, height: logoHeightForWidth(data, width) },
  });
}

export async function companyLogoParagraph(): Promise<Paragraph | null> {
  const data = await loadCompanyLogoBuffer();
  if (!data) return null;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600, after: 280 },
    children: [logoImageRun(data, 250)],
  });
}

export async function buildDocumentHeader(): Promise<Header> {
  const data = await loadCompanyLogoBuffer();
  if (!data) {
    return new Header({ children: [new Paragraph({ children: [] })] });
  }
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 80 },
        children: [logoImageRun(data, 140)],
      }),
    ],
  });
}

export function emptyFirstPageHeader(): Header {
  return new Header({ children: [new Paragraph({ children: [] })] });
}

export function formatDocFooterDate(isoOrDate: string): string {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return (
    d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

export function buildDocumentFooter(
  docxFilename: string,
  generatedAt: string,
): Footer {
  const created = formatDocFooterDate(generatedAt);
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 80 },
        children: [
          new TextRun({
            text: docxFilename,
            size: 18,
            color: '505050',
            bold: true,
          }),
          new TextRun({ text: '   ·   ', size: 18, color: '808080' }),
          new TextRun({
            text: `Created: ${created}`,
            size: 18,
            color: '505050',
          }),
          new TextRun({ text: '   ·   ', size: 18, color: '808080' }),
          new TextRun({ text: 'Page ', size: 18, color: '505050' }),
          new SimpleField('PAGE'),
        ],
      }),
    ],
  });
}

export function buildCoverPageFooter(
  docxFilename: string,
  generatedAt: string,
): Footer {
  const created = formatDocFooterDate(generatedAt);
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 80 },
        children: [
          new TextRun({
            text: docxFilename,
            size: 18,
            color: '505050',
            bold: true,
          }),
          new TextRun({ text: '   ·   ', size: 18, color: '808080' }),
          new TextRun({
            text: `Created: ${created}`,
            size: 18,
            color: '505050',
          }),
        ],
      }),
    ],
  });
}
