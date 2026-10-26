import type { ReactNode } from 'react';
import type { BpmProcess, ActivityItem } from 'src/sections/bpm/storage';

import { useState } from 'react';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';

import { Iconify } from 'src/components/iconify';

import { patchActivityVendorVersion } from 'src/sections/bpm/api';

export const VENDOR_ORIGINAL_BG = (alpha: number) => `rgba(244, 67, 54, ${alpha})`;
export const VENDOR_OVERLAY_BG = (alpha: number) => `rgba(76, 175, 80, ${alpha})`;

export type VendorFieldSource = 'details' | 'activityName' | 'activityDescription';

export type VendorOverlayContext = {
  activity: ActivityItem;
  departmentId: string;
  processId: string;
  currentVendorKey: string;
  canEditOwnVendor: boolean;
  defaultVendorName: string;
  onProcessRefreshed: (next: BpmProcess) => void;
};

type Props = VendorOverlayContext & {
  field: { key: string; source: VendorFieldSource };
  /** Main field control / value — shown as the single clean text block. */
  originalControl: ReactNode;
};

function readVendorRaw(
  activity: ActivityItem,
  vendorKey: string,
  field: Props['field'],
): string {
  const overlay = activity.vendorVersions?.[vendorKey];
  if (!overlay) return '';
  if (field.source === 'activityName') return overlay.activityName ?? '';
  if (field.source === 'activityDescription') return overlay.activityDescription ?? '';
  const raw = overlay.details?.[field.key];
  if (raw === undefined || raw === null) return '';
  return Array.isArray(raw) ? raw.join(', ') : String(raw);
}

/**
 * Field display: one calm text surface (no Original / Vendor chips).
 * Extra versions appear as quiet secondary lines when present.
 */
export function FieldVendorOverlay({
  field,
  originalControl,
  activity,
  departmentId,
  processId,
  currentVendorKey,
  canEditOwnVendor,
  defaultVendorName,
  onProcessRefreshed,
}: Props) {
  const overlays = activity.vendorVersions ?? {};
  const vendorEntries = Object.entries(overlays)
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName));

  const showOverlay = vendorEntries.some((entry) => readVendorRaw(activity, entry.key, field).trim());
  const currentVendor = vendorEntries.find((entry) => entry.key === currentVendorKey);
  const hasCurrentVendorSlot = !!currentVendor;

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!showOverlay) {
    return <>{originalControl}</>;
  }

  const beginEdit = () => {
    if (!canEditOwnVendor) return;
    setError('');
    setEditValue(currentVendor ? readVendorRaw(activity, currentVendorKey, field) : '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditValue('');
    setError('');
  };

  const commitEdit = async () => {
    if (!canEditOwnVendor) return;
    setBusy(true);
    setError('');
    try {
      const trimmed = editValue.trim();
      const payload: Parameters<typeof patchActivityVendorVersion>[3] = {
        vendorName: currentVendor?.vendorName || defaultVendorName,
      };
      if (field.source === 'activityName') {
        payload.activityName = trimmed;
      } else if (field.source === 'activityDescription') {
        payload.activityDescription = trimmed;
      } else {
        payload.details = { [field.key]: trimmed.length ? trimmed : null };
      }
      const refreshed = await patchActivityVendorVersion(
        departmentId,
        processId,
        activity.id,
        payload,
      );
      onProcessRefreshed(refreshed);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const others = vendorEntries.filter((entry) => entry.key !== currentVendorKey);

  return (
    <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
      <Box
        sx={{
          bgcolor: '#FFF7F7',
          border: '1px solid',
          borderColor: '#EED6D6',
          borderRadius: 1.5,
          px: 1.5,
          py: 1.1,
        }}
      >
        {originalControl}
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      {others
        .map((entry) => ({ entry, overlayValue: readVendorRaw(activity, entry.key, field) }))
        .filter((row) => row.overlayValue.trim())
        .map(({ entry, overlayValue }) => (
          <Box
            key={entry.key}
            sx={{
              bgcolor: 'rgba(181, 30, 33, 0.04)',
              border: '1px solid',
              borderColor: 'rgba(181, 30, 33, 0.14)',
              borderRadius: 1.5,
              px: 1.5,
              py: 1,
            }}
          >
            <Typography
              variant="body2"
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'text.primary' }}
            >
              {overlayValue}
            </Typography>
          </Box>
        ))}

      {hasCurrentVendorSlot && readVendorRaw(activity, currentVendorKey, field).trim() ? (
        editing ? (
          <Box
            sx={{
              bgcolor: 'rgba(181, 30, 33, 0.05)',
              border: '1px solid',
              borderColor: 'rgba(181, 30, 33, 0.2)',
              borderRadius: 1.5,
              px: 1.5,
              py: 1.1,
            }}
          >
            <Stack spacing={0.75}>
              <TextField
                size="small"
                multiline
                minRows={field.source === 'activityDescription' ? 3 : 1}
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                autoFocus
                disabled={busy}
              />
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button size="small" color="inherit" onClick={cancelEdit} disabled={busy}>
                  Cancel
                </Button>
                <Button size="small" variant="contained" onClick={() => void commitEdit()} disabled={busy}>
                  Save
                </Button>
              </Stack>
            </Stack>
          </Box>
        ) : (
          <Box
            sx={{
              bgcolor: 'rgba(181, 30, 33, 0.04)',
              border: '1px solid',
              borderColor: 'rgba(181, 30, 33, 0.14)',
              borderRadius: 1.5,
              px: 1.5,
              py: 1,
              cursor: canEditOwnVendor ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
            }}
            onClick={() => (canEditOwnVendor ? beginEdit() : null)}
          >
            <Typography
              variant="body2"
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}
            >
              {readVendorRaw(activity, currentVendorKey, field)}
            </Typography>
            {canEditOwnVendor ? (
              <IconButton size="small" onClick={beginEdit}>
                <Iconify icon="solar:pen-bold" width={14} />
              </IconButton>
            ) : null}
          </Box>
        )
      ) : null}
    </Stack>
  );
}
