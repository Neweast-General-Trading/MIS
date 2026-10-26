import type { PolicyCreatorPolicyDocument } from 'src/sections/bpm/api';

const POLICY_CREATOR_ORIGIN = 'https://policycreator.neweast.cloud';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rewritePolicyAssetUrls(html: string) {
  return html
    .replace(/(src|href)=(["'])\/(?!\/)/gi, `$1=$2${POLICY_CREATOR_ORIGIN}/`)
    .replace(/(src|href)=(["'])\.\.\//gi, `$1=$2${POLICY_CREATOR_ORIGIN}/`);
}

export function openPolicyPdfPage(policy: PolicyCreatorPolicyDocument) {
  const businessRole = policy.businessRole?.trim()
    ? `
      <section class="block">
        <h2>Business Role</h2>
        <p class="role">${escapeHtml(policy.businessRole.trim())}</p>
      </section>
    `
    : '';

  const sections = (policy.sections ?? [])
    .map(
      (section, index) => `
      <section class="block">
        <h2><span class="num">${String(index + 1).padStart(2, '0')}</span> ${escapeHtml(section.title)}</h2>
        <div class="policy-body">${rewritePolicyAssetUrls(section.content || '')}</div>
      </section>
    `,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(policy.name)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #e8e8e8; font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
    .sheet {
      width: 210mm;
      min-height: 297mm;
      margin: 16px auto;
      padding: 22mm 18mm;
      background: #fff;
      box-shadow: 0 8px 28px rgba(15, 23, 42, 0.18);
    }
    .header { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 14px; border-bottom: 1px solid #e2e8f0; margin-bottom: 18px; }
    h1 { font-size: 18px; margin: 0; line-height: 1.35; }
    .meta { font-size: 11px; color: #64748b; margin-top: 8px; }
    .block { margin-bottom: 18px; }
    h2 { font-size: 13px; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
    .num { color: #ed1c24; font-size: 11px; }
    .role, .policy-body { font-size: 13px; line-height: 1.6; color: #334155; }
    .role { white-space: pre-wrap; margin: 0; }
    .policy-body img { max-height: 48px; max-width: 160px; object-fit: contain; margin: 8px 0; }
    .policy-body p { margin: 0 0 8px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 10px; color: #94a3b8; }
    @media print {
      body { background: #fff; }
      .sheet { box-shadow: none; margin: 0; width: auto; min-height: auto; padding: 0; }
    }
  </style>
</head>
<body>
  <article class="sheet">
    <div class="header">
      <div>
        <h1>${escapeHtml(policy.name)}</h1>
        <p class="meta">${escapeHtml([policy.companyName, policy.departmentName, policy.version != null ? `Version ${policy.version}` : ''].filter(Boolean).join(' · '))}</p>
      </div>
    </div>
    ${businessRole}
    ${sections}
    <div class="footer">Confidential Policy Document · © NEWEAST</div>
  </article>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 350);
    });
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
