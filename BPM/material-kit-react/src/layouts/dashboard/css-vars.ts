import type { Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

export function dashboardLayoutVars(theme: Theme) {
  return {
    '--layout-transition-easing': 'linear',
    '--layout-transition-duration': '120ms',
    '--layout-nav-vertical-width': '300px',
    '--layout-nav-collapsed-width': '56px',
    '--layout-dashboard-content-pt': theme.spacing(1),
    '--layout-dashboard-content-pb': theme.spacing(8),
    '--layout-dashboard-content-px': theme.spacing(5),
    // Laptop-size screens: narrower sidebar and tighter side padding
    [theme.breakpoints.between('lg', 1600)]: {
      '--layout-nav-vertical-width': '250px',
      '--layout-dashboard-content-px': theme.spacing(3),
    },
  };
}
