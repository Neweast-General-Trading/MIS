import { useState, useEffect, useCallback } from 'react';

import { type OracleJobRole, fetchOracleJobRoles } from 'src/sections/bpm/api';

export function useOracleJobRoles(params: { hanaBranch?: string | null; bpmCode?: string | null }) {
  const hanaBranch = params.hanaBranch?.trim() ?? '';
  const bpmCode = params.bpmCode?.trim() ?? '';
  const [jobRoles, setJobRoles] = useState<OracleJobRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!hanaBranch && !bpmCode) {
      setJobRoles([]);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const rows = await fetchOracleJobRoles({ hanaBranch: hanaBranch || undefined, bpmCode });
      setJobRoles(rows);
    } catch (e) {
      setError((e as Error).message);
      setJobRoles([]);
    } finally {
      setLoading(false);
    }
  }, [bpmCode, hanaBranch]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    jobRoles,
    jobRoleOptions: jobRoles.map((row) => row.name),
    loading,
    error,
    reload,
  };
}
