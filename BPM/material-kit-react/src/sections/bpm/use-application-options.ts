import { useState, useEffect } from 'react';

import { fetchApplicationOptions } from 'src/sections/bpm/api';

let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;

/** Call after Application Master changes so forms pick up the new list. */
export function invalidateApplicationOptionsCache() {
  cache = null;
  inflight = null;
}

function load(): Promise<string[]> {
  if (cache) return Promise.resolve(cache);
  inflight ??= fetchApplicationOptions()
    .then((rows) => {
      cache = rows;
      return rows;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useApplicationOptions() {
  const [options, setOptions] = useState<string[]>(cache ?? []);

  useEffect(() => {
    let alive = true;
    load()
      .then((rows) => alive && setOptions(rows))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return options;
}
