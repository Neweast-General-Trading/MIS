import { useState, useEffect, useCallback } from 'react';

import { type HanaDepartment, fetchHanaDepartments } from 'src/sections/bpm/api';

export function useHanaDepartments(bpmCode: string) {
  const [hanaDepartments, setHanaDepartments] = useState<HanaDepartment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const code = bpmCode.trim();
    if (!code) {
      setHanaDepartments([]);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const rows = await fetchHanaDepartments({ bpmCode: code });
      setHanaDepartments(rows);
    } catch (e) {
      setError((e as Error).message);
      setHanaDepartments([]);
    } finally {
      setLoading(false);
    }
  }, [bpmCode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { hanaDepartments, loading, error, reload };
}
