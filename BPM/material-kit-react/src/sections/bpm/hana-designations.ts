import { useState, useEffect, useCallback } from 'react';

import { type HanaDesignation, fetchHanaDesignations } from 'src/sections/bpm/api';

export function useHanaDesignations(params: { hanaBranch?: string | null; bpmCode?: string | null }) {
  const hanaBranch = params.hanaBranch?.trim() ?? '';
  const bpmCode = params.bpmCode?.trim() ?? '';
  const [designations, setDesignations] = useState<HanaDesignation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!hanaBranch && !bpmCode) {
      setDesignations([]);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const rows = await fetchHanaDesignations({ hanaBranch: hanaBranch || undefined, bpmCode });
      setDesignations(rows);
    } catch (e) {
      setError((e as Error).message);
      setDesignations([]);
    } finally {
      setLoading(false);
    }
  }, [bpmCode, hanaBranch]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    designations,
    designationOptions: designations.map((row) => row.name),
    loading,
    error,
    reload,
  };
}
