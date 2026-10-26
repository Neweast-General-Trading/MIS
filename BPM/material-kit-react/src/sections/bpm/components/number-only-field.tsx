import TextField from '@mui/material/TextField';

import { parseNumberFieldInput } from 'src/sections/bpm/numeric-field.util';

type Props = {
  value: string | number | null | undefined;
  label?: string;
  disabled?: boolean;
  saving?: boolean;
  fullWidth?: boolean;
  size?: 'small' | 'medium';
  integerOnly?: boolean;
  onChange: (next: string) => void;
};

export function NumberOnlyField({
  value,
  label,
  disabled = false,
  saving = false,
  fullWidth = true,
  size = 'small',
  integerOnly = true,
  onChange,
}: Props) {
  const stored = value === undefined || value === null ? '' : String(value);

  return (
    <TextField
      size={size}
      fullWidth={fullWidth}
      disabled={disabled || saving}
      label={label}
      type="number"
      inputProps={{
        min: 0,
        step: integerOnly ? 1 : 'any',
        inputMode: integerOnly ? 'numeric' : 'decimal',
      }}
      value={stored}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) =>
        onChange(parseNumberFieldInput(event.target.value, { integerOnly }))
      }
      sx={{
        minWidth: 90,
        '& .MuiInputBase-root': { fontSize: size === 'small' ? '0.8125rem' : undefined },
      }}
    />
  );
}
