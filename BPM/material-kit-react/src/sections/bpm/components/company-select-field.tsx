import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';

import { Iconify } from 'src/components/iconify';

import { type CompanyCode } from 'src/sections/bpm/companies';
import { companyBpmCode, type BpmCompany } from 'src/sections/bpm/api';
import { companyFullName, companyDisplayLabel } from 'src/sections/bpm/company-display.util';

export type CompanySelectFieldProps = {
  companies: BpmCompany[];
  loading?: boolean;
  value: CompanyCode | '';
  onChange: (code: CompanyCode | '') => void;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  onRefresh?: () => void;
  refreshBusy?: boolean;
  /** Minimum width so codes like FZCO-V1 are not clipped in tight toolbars. */
  minWidth?: number | string;
};

export function CompanySelectField({
  companies,
  loading = false,
  value,
  onChange,
  disabled = false,
  label = 'Company',
  helperText,
  onRefresh,
  refreshBusy = false,
  minWidth = 240,
}: CompanySelectFieldProps) {
  const selected =
    companies.find((item) => companyBpmCode(item) === value) ??
    companies.find((item) => item.code === value) ??
    null;
  const defaultHelper = loading
    ? 'Loading companies…'
    : companies.length
      ? `${companies.length} companies available`
      : 'No companies available.';

  return (
    <Autocomplete
      options={companies}
      loading={loading}
      disabled={disabled || loading || !companies.length}
      value={selected}
      onChange={(_event, next) => onChange((next ? companyBpmCode(next) : '') as CompanyCode | '')}
      getOptionLabel={(option) => companyDisplayLabel(companies, companyBpmCode(option))}
      isOptionEqualToValue={(a, b) => companyBpmCode(a) === companyBpmCode(b)}
      sx={{
        minWidth,
        flex: '1 1 240px',
        maxWidth: { md: 360 },
        '& .MuiInputBase-input': {
          overflow: 'visible',
          textOverflow: 'clip',
          whiteSpace: 'nowrap',
        },
      }}
      renderOption={(props, option) => {
        const { key, ...rest } = props;
        const code = companyBpmCode(option);
        const full = companyFullName(companies, code);
        return (
          <Box component="li" key={option.hanaBranch ?? option.code ?? key} {...rest}>
            <Stack spacing={0.15} sx={{ py: 0.25, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                {code}
              </Typography>
              {full && full !== code ? (
                <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                  {full}
                </Typography>
              ) : null}
            </Stack>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          fullWidth
          label={label}
          placeholder="Select company"
          helperText={helperText ?? defaultHelper}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={18} /> : null}
                {onRefresh ? (
                  <IconButton
                    size="small"
                    aria-label="Refresh companies list"
                    disabled={loading || refreshBusy}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRefresh();
                    }}
                  >
                    <Iconify icon="solar:restart-bold" width={18} />
                  </IconButton>
                ) : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
