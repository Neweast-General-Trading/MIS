import type { ActivityTemplateField } from 'src/sections/bpm/storage';

/** Normalized RACI role tokens (Responsible, Accountability, Consulting, Inform, …). */
const RACI_ROLE_TOKENS = new Set([
  'responsible',
  'responsiblerole',
  'responsibility',
  'responsbility',
  'accountable',
  'accountability',
  'consulted',
  'consulting',
  'informed',
  'inform',
]);

export function normalizeRaciFieldToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s._-]+/g, '');
}

export function isRaciRoleToken(token: string): boolean {
  return RACI_ROLE_TOKENS.has(token);
}

/** RACI designation fields — standard + Operations template labels. */
export function templateFieldIsRaciRoleField(field: Pick<ActivityTemplateField, 'key' | 'label'>): boolean {
  const keyToken = normalizeRaciFieldToken(field.key);
  const labelToken = normalizeRaciFieldToken(field.label);
  return isRaciRoleToken(keyToken) || isRaciRoleToken(labelToken);
}

export function columnIsRaciRoleField(column: { key: string; label: string }): boolean {
  return templateFieldIsRaciRoleField(column);
}
