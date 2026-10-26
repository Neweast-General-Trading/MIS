export type CollectionCompany = {
  id: string;
  label: string;
  schema: string;
  country: string;
};

export const COLLECTION_COMPANIES: CollectionCompany[] = [
  { id: 'FZCO', label: 'NEWEAST General Trading (FZCO)', schema: 'NEWEASTGENTRAD', country: 'UAE' },
  { id: 'LLC', label: 'NEWEAST UAE LLC', schema: 'NEWEASTUAELLC', country: 'UAE' },
  { id: 'KSA', label: 'NEWEAST KSA', schema: 'NEWEASTKSA', country: 'KSA' },
  { id: 'KUWAIT', label: 'NEWEAST Kuwait', schema: 'NEGTKUWAIT', country: 'Kuwait' },
  { id: 'BHRN', label: 'NEWEAST Bahrain', schema: 'NEWEASTBHR', country: 'Bahrain' },
  { id: 'JAPAN', label: 'NEWEAST Japan', schema: 'NEJAPAN', country: 'Japan' },
  { id: 'Oman', label: 'NEWEAST Oman', schema: 'OPCLIVE', country: 'Oman' },
  { id: 'NESA', label: 'NEWEAST Logistics', schema: 'NEWEASTLOGISTICS', country: 'UAE' },
];

export function companiesForFilter(companyId?: string): CollectionCompany[] {
  const key = (companyId ?? '').trim();
  if (!key || key === 'ALL') return COLLECTION_COMPANIES;
  const found = COLLECTION_COMPANIES.find((c) => c.id === key);
  return found ? [found] : COLLECTION_COMPANIES;
}

export function schemaForCompany(companyId: string): string | undefined {
  return COLLECTION_COMPANIES.find((c) => c.id === companyId)?.schema;
}
