import { useMemo, useState, useEffect, useCallback } from 'react';

import { fetchCompanies, companyBpmCode, type BpmCompany } from 'src/sections/bpm/api';

export type CompanyCode = string;

export type { BpmCompany };

/** Shown if the API is unreachable — matches DB seed so the hub stays usable. */
export const FALLBACK_COMPANIES: BpmCompany[] = [
  { code: 'FZCO', name: 'FZCO', sortOrder: 0, bpmCode: 'FZCO', source: 'local' },
  { code: 'NESA', name: 'NESA', sortOrder: 1, bpmCode: 'NESA', source: 'local' },
  { code: 'LLC', name: 'LLC', sortOrder: 2, bpmCode: 'LLC', source: 'local' },
  { code: 'ISUZU', name: 'ISUZU', sortOrder: 3, bpmCode: 'ISUZU', source: 'local' },
];

export function useCompanies() {
  const [companies, setCompanies] = useState<BpmCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    setUsingFallback(false);
    try {
      const list = await fetchCompanies();
      setCompanies(list.length > 0 ? list : FALLBACK_COMPANIES);
      if (list.length === 0) {
        setUsingFallback(true);
        setError('No companies returned from API — showing defaults.');
      }
    } catch (e) {
      setError((e as Error).message);
      setCompanies(FALLBACK_COMPANIES);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const codes = useMemo(
    () => companies.map((c) => companyBpmCode(c)),
    [companies],
  );

  const isCompanyCode = useCallback(
    (value: string): value is CompanyCode => codes.includes(value),
    [codes],
  );

  return { companies, codes, loading, error, usingFallback, reload, isCompanyCode };
}
