import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';

import { mergeRaciDesignationOptions } from 'src/sections/bpm/raci-designation-options.util';

type Props = {
  value: string;
  options: readonly string[];
  disabled?: boolean;
  saving?: boolean;
  onChange: (next: string) => void;
};

export function RaciDesignationTableCell({
  value,
  options,
  disabled = false,
  saving = false,
  onChange,
}: Props) {
  const display = value.trim();
  const selectOptions = mergeRaciDesignationOptions(options, display);
  const readOnly = disabled || saving;

  return (
    <TextField
      select
      size="small"
      fullWidth
      disabled={readOnly}
      value={display}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
      SelectProps={{
        displayEmpty: true,
        renderValue: (selected) => {
          const text = String(selected ?? '').trim();
          return text || 'Select role';
        },
      }}
      sx={{
        minWidth: 120,
        '& .MuiInputBase-root': { fontSize: '0.8125rem' },
        '& .MuiSelect-select': { py: 0.75, whiteSpace: 'normal', lineHeight: 1.25 },
      }}
    >
      <MenuItem value="">
        <em>Select role</em>
      </MenuItem>
      {selectOptions.map((option) => (
        <MenuItem key={option} value={option} sx={{ whiteSpace: 'normal' }}>
          {option}
        </MenuItem>
      ))}
    </TextField>
  );
}
