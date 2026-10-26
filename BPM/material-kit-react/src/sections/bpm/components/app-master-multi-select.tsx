import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';

import { useApplicationOptions } from 'src/sections/bpm/use-application-options';
import { parseMultiSelectValue, mergeSavedMultiOptions } from 'src/sections/bpm/multi-value-field.util';

type Props = {
  value: string | string[];
  onChange: (next: string[]) => void;
  label?: string;
  disabled?: boolean;
  compact?: boolean;
};

/** Multi-select limited to the applications defined in Administration → Application Master. */
export function AppMasterMultiSelect({ value, onChange, label, disabled = false, compact = false }: Props) {
  const applications = useApplicationOptions();
  const selected = parseMultiSelectValue(value);
  const options = mergeSavedMultiOptions(applications, selected);

  return (
    <Autocomplete
      multiple
      fullWidth
      size={compact ? 'small' : 'medium'}
      disabled={disabled}
      options={options}
      value={selected}
      onClick={(event) => event.stopPropagation()}
      onChange={(_event, next) => onChange(next)}
      noOptionsText="No applications — add them in Administration → Application master"
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={selected.length ? undefined : 'Select application(s)'}
        />
      )}
      sx={
        compact
          ? {
              minWidth: 160,
              '& .MuiInputBase-root': { fontSize: '0.8125rem', alignItems: 'flex-start' },
              '& .MuiChip-root': { height: 'auto', py: 0.25 },
            }
          : undefined
      }
    />
  );
}
