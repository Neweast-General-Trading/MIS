import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';

/** Set to false when maintenance is finished. */
export const SHOW_MAINTENANCE_BANNER = false;

export function MaintenanceBanner() {
  if (!SHOW_MAINTENANCE_BANNER) {
    return null;
  }

  return (
    <Alert
      severity="warning"
      variant="filled"
      sx={{
        borderRadius: 0,
        py: 0.75,
        alignItems: 'center',
        '& .MuiAlert-message': { width: '100%' },
      }}
    >
      <Typography component="div" variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
        Scheduled maintenance
      </Typography>
      <Typography component="div" variant="body2" sx={{ lineHeight: 1.5 }}>
        The system will be unavailable from <strong>4:00</strong> to <strong>9:30</strong> India time
        (IST) and from <strong>2:30</strong> to <strong>8:00</strong> UAE time (GST). Please do not
        use the system during this window. We are upgrading service quality.
      </Typography>
    </Alert>
  );
}
