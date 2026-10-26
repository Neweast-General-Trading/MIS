import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import FormControlLabel from '@mui/material/FormControlLabel';

import { Iconify } from 'src/components/iconify';

import { mergeSavedMultiOptions } from 'src/sections/bpm/multi-value-field.util';
import { parseApprovalFlow, serializeApprovalFlow } from 'src/sections/bpm/approval-flow.util';

type Props = {
  label: string;
  value: unknown;
  onChange: (next: string[]) => void;
  jobRoles: readonly string[];
  disabled?: boolean;
};

/** "Approval flow Y/N" checkbox + ordered approval levels (Level 1, Level 2, …), one job role each. */
export function ApprovalFlowField({ label, value, onChange, jobRoles, disabled = false }: Props) {
  const parsed = parseApprovalFlow(value);
  const [enabled, setEnabled] = useState(parsed.enabled);
  const [rows, setRows] = useState<string[]>(parsed.levels);

  // Re-sync when the value is replaced from outside (e.g. switching activity).
  const external = JSON.stringify(serializeApprovalFlow(parsed.enabled, parsed.levels));
  useEffect(() => {
    const local = JSON.stringify(serializeApprovalFlow(enabled, rows));
    if (local !== external) {
      setEnabled(parsed.enabled);
      setRows(parsed.levels);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external]);

  const emit = (nextEnabled: boolean, nextRows: string[]) => {
    setEnabled(nextEnabled);
    setRows(nextRows);
    onChange(serializeApprovalFlow(nextEnabled, nextRows));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    emit(enabled, next);
  };

  return (
    <Box>
      <FormControlLabel
        control={
          <Checkbox
            checked={enabled}
            disabled={disabled}
            onChange={(event) => emit(event.target.checked, rows)}
          />
        }
        label={`${label} required (Yes / No)`}
      />
      {enabled ? (
        <Stack spacing={1} sx={{ mt: 1 }}>
          {rows.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              No approval levels yet — add Level 1.
            </Typography>
          ) : null}
          {rows.map((role, index) => (
             
            <Stack key={index} direction="row" spacing={1} alignItems="center">
              <Chip size="small" color="primary" label={`Level ${index + 1}`} sx={{ minWidth: 72 }} />
              <Autocomplete
                fullWidth
                freeSolo
                autoSelect
                size="small"
                disabled={disabled}
                options={mergeSavedMultiOptions(jobRoles, role ? [role] : [])}
                value={role || null}
                onChange={(_event, next) => {
                  const copy = [...rows];
                  // freeSolo: a typed job role that is not in the list is kept as entered.
                  copy[index] = (next ?? '').replace(/\s+/g, ' ').trim();
                  emit(enabled, copy);
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Select a job role, or type a new one and press Enter"
                  />
                )}
              />
              <IconButton
                size="small"
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
                aria-label="Move up"
              >
                <Iconify icon="eva:arrow-ios-upward-fill" width={18} />
              </IconButton>
              <IconButton
                size="small"
                disabled={disabled || index === rows.length - 1}
                onClick={() => move(index, 1)}
                aria-label="Move down"
              >
                <Iconify icon="eva:arrow-ios-downward-fill" width={18} />
              </IconButton>
              <IconButton
                size="small"
                color="error"
                disabled={disabled}
                onClick={() =>
                  emit(
                    enabled,
                    rows.filter((_, i) => i !== index),
                  )
                }
                aria-label="Remove level"
              >
                <Iconify icon="solar:trash-bin-trash-bold" width={18} />
              </IconButton>
            </Stack>
          ))}
          <Box>
            <Button
              size="small"
              disabled={disabled}
              startIcon={<Iconify icon="mingcute:add-line" width={16} />}
              onClick={() => emit(enabled, [...rows, ''])}
            >
              Add level
            </Button>
          </Box>
        </Stack>
      ) : null}
    </Box>
  );
}

/** Read-only: Level 1 → Level 2 → … as a row of chips. */
export function ApprovalFlowView({ value }: { value: unknown }) {
  const { enabled, levels } = parseApprovalFlow(value);
  const filled = Array.isArray(value) ? value.length > 0 : String(value ?? '').trim().length > 0;
  if (!filled) {
    return (
      <Typography variant="body2" sx={{ color: 'text.disabled' }}>
        —
      </Typography>
    );
  }
  if (!enabled) {
    return (
      <Typography variant="body2" sx={{ fontWeight: 300 }}>
        No approval flow
      </Typography>
    );
  }
  return (
    <Stack direction="row" flexWrap="wrap" alignItems="center" useFlexGap sx={{ gap: 0.75 }}>
      {levels.length === 0 ? (
        <Typography variant="body2" sx={{ fontWeight: 300 }}>
          Yes
        </Typography>
      ) : null}
      {levels.map((role, index) => (
         
        <Stack key={index} direction="row" alignItems="center" spacing={0.75}>
          {index > 0 ? (
            <Iconify icon="eva:arrow-ios-forward-fill" width={16} sx={{ color: 'text.disabled' }} />
          ) : null}
          <Chip
            size="small"
            variant="outlined"
            label={
              <>
                <b>L{index + 1}</b> {role}
              </>
            }
            sx={{ fontWeight: 400 }}
          />
        </Stack>
      ))}
    </Stack>
  );
}
