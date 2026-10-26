import type { ReactNode } from 'react';
import type { ActivityTemplateField } from 'src/sections/bpm/storage';

import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';

import { formatApprovalFlow } from 'src/sections/bpm/approval-flow.util';
import { formatNumericDaysDisplay } from 'src/sections/bpm/numeric-field.util';
import { NumberOnlyField } from 'src/sections/bpm/components/number-only-field';
import { NumericDaysField } from 'src/sections/bpm/components/numeric-days-field';
import { ApprovalFlowField } from 'src/sections/bpm/components/approval-flow-field';
import { templateFieldIsRaciRoleField } from 'src/sections/bpm/raci-role-fields.util';
import { AppMasterMultiSelect } from 'src/sections/bpm/components/app-master-multi-select';
import { mergeRaciDesignationOptions } from 'src/sections/bpm/raci-designation-options.util';
import {
  parseMultiSelectValue,
  mergeSavedMultiOptions,
  formatMultiSelectDisplay,
} from 'src/sections/bpm/multi-value-field.util';

export type TemplateControlOptions = {
  ownersOptions: string[];
  jobTitles: readonly string[];
  designations?: readonly string[];
  jobRoles?: readonly string[];
  disabled?: boolean;
};

function str(v: string | string[]): string {
  return Array.isArray(v) ? v.join(', ') : String(v ?? '');
}

export function detailValueAsString(field: ActivityTemplateField, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (
    field.type === 'oracle_job_role_multi' ||
    field.type === 'person_multi' ||
    field.type === 'app_master'
  ) {
    return formatMultiSelectDisplay(value);
  }
  if (field.type === 'numeric_days') {
    return formatNumericDaysDisplay(value);
  }
  if (field.type === 'approval_flow') {
    return formatApprovalFlow(value);
  }
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/** Renders edit/add controls for one template-driven `details` field (matches Add Sub-process behaviour). */
export function renderTemplateDetailFieldInput(
  field: ActivityTemplateField,
  value: string | string[],
  onChange: (next: string | string[]) => void,
  opts: TemplateControlOptions,
): ReactNode {
  const { ownersOptions, jobTitles, designations = [], jobRoles = [], disabled } = opts;
  const stringValue = typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : '';

  if (field.type === 'oracle_job_role_multi') {
    const selected = parseMultiSelectValue(value);
    const options = mergeSavedMultiOptions(jobRoles, selected);
    return (
      <Autocomplete
        key={field.key}
        multiple
        fullWidth
        disabled={disabled}
        options={options}
        value={selected}
        onChange={(_event, nextValue) => onChange(nextValue)}
        renderInput={(params) => (
          <TextField
            {...params}
            label={field.label}
            placeholder={selected.length ? undefined : 'Select job role(s)'}
          />
        )}
      />
    );
  }

  if (field.type === 'approval_flow') {
    return (
      <ApprovalFlowField
        key={field.key}
        label={field.label}
        value={value}
        disabled={disabled}
        jobRoles={jobRoles}
        onChange={onChange}
      />
    );
  }

  if (field.type === 'numeric_days') {
    return (
      <NumericDaysField
        key={field.key}
        label={field.label}
        value={stringValue}
        disabled={disabled}
        size="medium"
        onChange={(next) => onChange(next)}
      />
    );
  }

  if (field.type === 'number') {
    return (
      <NumberOnlyField
        key={field.key}
        label={field.label}
        value={stringValue}
        disabled={disabled}
        size="medium"
        integerOnly
        onChange={(next) => onChange(next)}
      />
    );
  }

  // Legacy RACI → designation (single) — used by older templates without oracle_job_role_multi.
  if (templateFieldIsRaciRoleField(field)) {
    const options = mergeRaciDesignationOptions(designations, stringValue);

    return (
      <TextField
        key={field.key}
        fullWidth
        select
        disabled={disabled}
        label={field.label}
        value={stringValue}
        onChange={(event) => onChange(event.target.value)}
      >
        <MenuItem value="">
          <em>Select designation</em>
        </MenuItem>
        {options.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  if (field.type === 'app_master') {
    return (
      <AppMasterMultiSelect
        key={field.key}
        label={field.label}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  if (field.type === 'dropdown' || field.type === 'dropdown_multiselect') {
    const current = typeof value === 'string' ? value : '';
    const dropdownOptions = (field.options ?? []).includes(current) || !current
      ? (field.options ?? [])
      : [...(field.options ?? []), current];
    return (
      <TextField
        key={field.key}
        fullWidth
        select
        disabled={disabled}
        label={field.label}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <MenuItem value="">
          <em>—</em>
        </MenuItem>
        {dropdownOptions.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  if (field.type === 'person_multi' || field.type === 'dropdown_person_name') {
    return (
      <Autocomplete
        key={field.key}
        multiple
        fullWidth
        disabled={disabled}
        options={ownersOptions}
        value={Array.isArray(value) ? value : []}
        onChange={(_event, nextValue) => onChange(nextValue)}
        renderInput={(params) => <TextField {...params} label={field.label} />}
      />
    );
  }

  if (field.type === 'boolean' || field.type === 'yes_no') {
    return (
      <TextField
        key={field.key}
        fullWidth
        select
        disabled={disabled}
        label={field.label}
        value={typeof value === 'string' ? value : 'No'}
        onChange={(event) => onChange(event.target.value)}
      >
        <MenuItem value="Yes">Yes</MenuItem>
        <MenuItem value="No">No</MenuItem>
      </TextField>
    );
  }

  if (field.type === 'job_title' || field.type === 'dropdown_job_title') {
    return (
      <TextField
        key={field.key}
        fullWidth
        select
        disabled={disabled}
        label={field.label}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      >
        {jobTitles.map((title) => (
          <MenuItem key={title} value={title}>
            {title}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  return (
    <TextField
      key={field.key}
      fullWidth
      disabled={disabled}
      multiline={field.type === 'textarea'}
      minRows={field.type === 'textarea' ? 3 : undefined}
      label={field.label}
      value={str(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function renderTemplateDetailFieldView(
  field: ActivityTemplateField,
  display: string,
  opts?: Pick<TemplateControlOptions, 'designations' | 'jobRoles'>,
): ReactNode {
  if (field.type === 'oracle_job_role_multi') {
    return (
      <TextField
        key={field.key}
        fullWidth
        disabled
        label={field.label}
        value={display || '—'}
        InputProps={{ readOnly: true }}
      />
    );
  }

  if (field.type === 'numeric_days') {
    return (
      <TextField
        key={field.key}
        fullWidth
        disabled
        label={field.label}
        value={formatNumericDaysDisplay(display) || '—'}
        InputProps={{ readOnly: true }}
      />
    );
  }

  if (templateFieldIsRaciRoleField(field)) {
    const options = mergeRaciDesignationOptions(opts?.designations ?? [], display);
    return (
      <TextField
        key={field.key}
        fullWidth
        select
        disabled
        label={field.label}
        value={display}
        SelectProps={{
          displayEmpty: true,
          renderValue: (selected) => {
            const text = String(selected ?? '').trim();
            return text || '—';
          },
        }}
      >
        {!display.trim() ? (
          <MenuItem value="">
            <em>—</em>
          </MenuItem>
        ) : null}
        {options.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  return (
    <TextField
      key={field.key}
      fullWidth
      label={field.label}
      value={display}
      multiline={field.type === 'textarea'}
      minRows={field.type === 'textarea' ? 2 : 1}
      InputProps={{ readOnly: true }}
    />
  );
}
