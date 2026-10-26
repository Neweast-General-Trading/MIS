import { useState, useEffect, useCallback } from 'react';

import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';

import { type OracleLegalEntity, fetchOracleLegalEntities } from 'src/sections/bpm/api';

const NONE_VALUE = '';

type Props = {
  value: string;
  onChange: (legalEntityId: string) => void;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  size?: 'small' | 'medium';
};

export function OracleLegalEntitySelectField({
  value,
  onChange,
  disabled = false,
  label = 'Oracle legal entity',
  helperText,
  allowEmpty = true,
  emptyLabel = 'Not linked',
  size = 'medium',
}: Props) {
  const [options, setOptions] = useState<OracleLegalEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchOracleLegalEntities();
      setOptions(rows);
    } catch (e) {
      setError((e as Error).message);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <TextField
      select
      fullWidth
      size={size}
      disabled={disabled || loading}
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      helperText={error || helperText || (loading ? 'Loading Oracle legal entities…' : undefined)}
    >
      {allowEmpty ? (
        <MenuItem value={NONE_VALUE}>
          <em>{emptyLabel}</em>
        </MenuItem>
      ) : null}
      {options.map((option) => (
        <MenuItem key={option.legalEntityId} value={option.legalEntityId}>
          {option.legalEntityName}
          {option.organizationCode ? ` (${option.organizationCode})` : ''}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function resolveOracleLegalEntityLabel(
  options: readonly OracleLegalEntity[],
  legalEntityId?: string | null,
  fallbackName?: string | null,
) {
  const id = legalEntityId?.trim() ?? '';
  if (!id) return fallbackName?.trim() || '';
  return options.find((item) => item.legalEntityId === id)?.legalEntityName || fallbackName?.trim() || id;
}
