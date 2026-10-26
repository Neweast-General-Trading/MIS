import TextField from '@mui/material/TextField';

import { parseNumericDaysInput } from 'src/sections/bpm/numeric-field.util';

type Props = {
  value: string | number | null | undefined;
  label?: string;
  disabled?: boolean;
  saving?: boolean;
  fullWidth?: boolean;
  size?: 'small' | 'medium';
  onChange: (next: string) => void;
};

/** Duration field: numbers only — unit lives in the label (e.g. TAT (Minutes)). */
export function NumericDaysField({
  value,
  label,
  disabled = false,
  saving = false,
  fullWidth = true,
  size = 'small',
  onChange,
}: Props) {
  const stored = value === undefined || value === null ? '' : String(value);
  const numericOnly = parseNumericDaysInput(stored);

  return (
    <TextField
      size={size}
      fullWidth={fullWidth}
      disabled={disabled || saving}
      label={label}
      type="number"
      inputProps={{ min: 0, step: 'any', inputMode: 'decimal' }}
      value={numericOnly}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(parseNumericDaysInput(event.target.value))}
      sx={{
        minWidth: 110,
        '& .MuiInputBase-root': { fontSize: size === 'small' ? '0.8125rem' : undefined },
      }}
    />
  );
}
