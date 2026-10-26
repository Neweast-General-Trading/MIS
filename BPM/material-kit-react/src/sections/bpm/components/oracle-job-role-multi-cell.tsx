import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';

import { parseMultiSelectValue, mergeSavedMultiOptions } from 'src/sections/bpm/multi-value-field.util';

type Props = {
  value: string | string[];
  options: readonly string[];
  disabled?: boolean;
  saving?: boolean;
  onChange: (next: string[]) => void;
};

export function OracleJobRoleMultiCell({
  value,
  options,
  disabled = false,
  saving = false,
  onChange,
}: Props) {
  const selected = parseMultiSelectValue(value);
  const selectOptions = mergeSavedMultiOptions(options, selected);
  const readOnly = disabled || saving;

  return (
    <Autocomplete
      multiple
      size="small"
      fullWidth
      disabled={readOnly}
      options={selectOptions}
      value={selected}
      onClick={(event) => event.stopPropagation()}
      onChange={(_event, nextValue) => onChange(nextValue)}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={selected.length ? undefined : 'Select job role(s)'}
        />
      )}
      sx={{
        minWidth: 160,
        '& .MuiInputBase-root': { fontSize: '0.8125rem', alignItems: 'flex-start' },
        '& .MuiChip-root': { height: 'auto', py: 0.25 },
      }}
    />
  );
}
