import { useState, useEffect, useCallback } from 'react';

import { type OrgDepartment, fetchOrgDepartments } from 'src/sections/bpm/api';

export function useOrgDepartments() {
  const [orgDepartments, setOrgDepartments] = useState<OrgDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOrgDepartments(await fetchOrgDepartments());
    } catch (e) {
      setError((e as Error).message);
      setOrgDepartments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { orgDepartments, loading, error, reload };
}
