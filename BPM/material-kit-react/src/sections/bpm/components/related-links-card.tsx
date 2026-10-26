import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Iconify } from 'src/components/iconify';

import { type RelatedPolicyLink, type RelatedSubProcessLink } from 'src/sections/bpm/storage';

type PoliciesProps = {
  links: RelatedPolicyLink[] | undefined;
  /** Fallback for policies saved without a Policy Creator URL. */
  onOpenPolicy: (link: RelatedPolicyLink) => void;
};

/** "Related policies": every policy is a real link (works on screen and in the printed PDF). */
export function RelatedPoliciesCard({ links, onOpenPolicy }: PoliciesProps) {
  const items = links ?? [];
  if (!items.length) return null;
  return (
    <Card variant="outlined" data-print-card sx={{ p: 2, bgcolor: '#FFF6F6', borderColor: '#E8C8C8' }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
        Related policies
      </Typography>
      <Stack spacing={0.75}>
        {items.map((link) => {
          const name = link.policyName?.trim() || 'Policy';
          const label = `${name}${link.policyVersion != null ? ` (v${link.policyVersion})` : ''}`;
          return (
            <Stack key={link.id} direction="row" spacing={1} alignItems="center">
              <Iconify icon="solar:document-bold" width={16} />
              {link.policyCreatorUrl ? (
                <Link
                  href={link.policyCreatorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="always"
                  variant="body2"
                  sx={{ fontWeight: 300 }}
                >
                  {label}
                </Link>
              ) : (
                <Link
                  component="button"
                  type="button"
                  underline="always"
                  variant="body2"
                  sx={{ fontWeight: 300 }}
                  onClick={() => onOpenPolicy(link)}
                >
                  {label}
                </Link>
              )}
            </Stack>
          );
        })}
      </Stack>
    </Card>
  );
}

/**
 * Hidden on screen. Only the printed PDF shows it: related sub-processes as real links
 * (the on-screen buttons are interactive-only and don't survive printing).
 */
export function RelatedSubProcessPrintList({ links }: { links: RelatedSubProcessLink[] | undefined }) {
  const items = links ?? [];
  if (!items.length) return null;
  const origin = window.location.origin;
  return (
    <div hidden data-print-only>
      <Card variant="outlined" data-print-card sx={{ p: 2, bgcolor: '#FFF6F6', borderColor: '#E8C8C8' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Related sub-processes
        </Typography>
        <Stack spacing={0.75}>
          {items.map((link) => (
            <Box key={link.id} sx={{ fontWeight: 300 }}>
              <Link
                href={`${origin}/departments/${link.departmentId}/processes/${link.processId}/activities-table?activity=${encodeURIComponent(link.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                underline="always"
                variant="body2"
              >
                {link.code} {link.activityName}
              </Link>
              <Typography component="span" variant="caption" color="text.secondary">
                {' '}
                — {link.processName}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Card>
    </div>
  );
}
