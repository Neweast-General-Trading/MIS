import { openActivityPdfInNewTab } from 'src/sections/bpm/api';

function collectCss(): string {
  const chunks: string[] = [];
  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      Array.from(sheet.cssRules).forEach((rule) => chunks.push(rule.cssText));
    } catch {
      // Cross-origin sheet (e.g. fonts CDN) – the server page can load it by URL instead.
      if (sheet.href) chunks.push(`@import url("${sheet.href}");`);
    }
  });
  return chunks.join('\n');
}

/**
 * Clones the rendered sub-process details (same cards, same order), drops interactive bits
 * (comment icons) and asks the server for a PDF with a "Draft" watermark.
 */
export async function printActivityToPdf(args: {
  source: HTMLElement;
  title: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: string }>;
  filename?: string;
}): Promise<void> {
  const clone = args.source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-print-hide]').forEach((node) => node.remove());
  clone.querySelectorAll('[data-print-only]').forEach((node) => node.removeAttribute('hidden'));
  clone.querySelectorAll('[data-print-card]').forEach((node) => node.classList.add('print-card'));

  const htmlAttrs: Record<string, string> = {};
  Array.from(document.documentElement.attributes).forEach((attr) => {
    if (attr.name === 'class' || attr.name.startsWith('data-')) htmlAttrs[attr.name] = attr.value;
  });

  await openActivityPdfInNewTab({
    title: args.title,
    subtitle: args.subtitle,
    meta: args.meta,
    bodyHtml: clone.outerHTML,
    css: collectCss(),
    htmlAttrs,
    fontFamily: getComputedStyle(document.body).fontFamily,
    watermark: 'Draft',
    filename: args.filename,
  });
}
