import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { RouterLink } from 'src/routes/components';

import { Iconify } from 'src/components/iconify';

export type BpmTrailSegment = {
  key: string;
  label: string;
  href?: string;
  /** Current page — shown stronger, not linked. */
  current?: boolean;
};

type BpmLocationTrailProps = {
  segments: BpmTrailSegment[];
};

/**
 * Compact hierarchy trail (chevrons like the workspace control), aligned to the end for LTR
 * so it sits opposite the title / company chip block.
 */
export function BpmLocationTrail({ segments }: BpmLocationTrailProps) {
  if (!segments.length) {
    return null;
  }

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="flex-end"
      flexWrap="wrap"
      sx={{ rowGap: 0.25, columnGap: 0.25, maxWidth: { xs: 1, sm: 520 } }}
    >
      {segments.map((seg, i) => (
        <Box key={seg.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {i > 0 ? (
            <Iconify icon="eva:arrow-ios-forward-fill" width={14} sx={{ color: 'text.disabled', flexShrink: 0 }} />
          ) : null}
          {seg.href && !seg.current ? (
            <Box
              component={RouterLink}
              href={seg.href}
              sx={{
                typography: 'caption',
                color: 'text.secondary',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                '&:hover': { textDecoration: 'underline', color: 'text.primary' },
              }}
            >
              {seg.label}
            </Box>
          ) : (
            <Typography
              variant="caption"
              sx={{
                fontWeight: seg.current ? 700 : 500,
                color: seg.current ? 'text.primary' : 'text.secondary',
                whiteSpace: 'nowrap',
                maxWidth: 220,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {seg.label}
            </Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
}
