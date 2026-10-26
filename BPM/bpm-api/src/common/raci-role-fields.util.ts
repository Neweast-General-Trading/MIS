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
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
}

export function isRaciRoleToken(token: string): boolean {
  return RACI_ROLE_TOKENS.has(token);
}

/** Template fields that map to SAP/HANA employee designations (RACI roles). */
export function isRaciRoleFieldKeyOrLabel(key: string, label: string): boolean {
  const keyToken = normalizeRaciFieldToken(key);
  const labelToken = normalizeRaciFieldToken(label);
  return isRaciRoleToken(keyToken) || isRaciRoleToken(labelToken);
}
