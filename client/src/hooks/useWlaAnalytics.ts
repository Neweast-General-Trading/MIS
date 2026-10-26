import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Lst5yrsRow } from '../types';
import type { DashboardFilters } from '../lib/dashboard';
import {
  buildActiveTransactionsDetail,
  buildActiveTransactionsDetailWeekly,
  buildActiveTransactionsSummary,
  buildActiveTransactionsSummaryWeekly,
  buildCancelTransactionsLines,
  buildCancelTransactionsLinesWeekly,
  buildCancelTransactionsPivot,
  buildCancelTransactionsWeekly,
  buildCompanyTable,
  buildDocTypeAverageTable,
  buildDocTypeAverages,
  buildDocTypeCards,
  buildDocTypeTable,
  buildMonthTable,
  buildYearTable,
} from '../lib/dashboard';

export type WlaAnalytics = {
  docTypeCards: ReturnType<typeof buildDocTypeCards>;
  yearTable: ReturnType<typeof buildYearTable>;
  companyTable: ReturnType<typeof buildCompanyTable>;
  docTypeTable: ReturnType<typeof buildDocTypeTable>;
  docTypeAverages: ReturnType<typeof buildDocTypeAverages>;
  docTypeAverageTable: ReturnType<typeof buildDocTypeAverageTable>;
  monthTable: ReturnType<typeof buildMonthTable>;
  activeSummaryDocs: ReturnType<typeof buildActiveTransactionsDetail>;
  activeSummaryLines: ReturnType<typeof buildActiveTransactionsSummary>;
  activeSummaryWeeklyDocs: ReturnType<typeof buildActiveTransactionsDetailWeekly>;
  activeSummaryWeeklyLines: ReturnType<typeof buildActiveTransactionsSummaryWeekly>;
  activeDetailPivot: ReturnType<typeof buildActiveTransactionsDetail>;
  activeDetailLines: ReturnType<typeof buildActiveTransactionsSummary>;
  activeDetailWeekly: ReturnType<typeof buildActiveTransactionsDetailWeekly>;
  activeDetailWeeklyLines: ReturnType<typeof buildActiveTransactionsSummaryWeekly>;
  cancelDetailPivot: ReturnType<typeof buildCancelTransactionsPivot>;
  cancelDetailLines: ReturnType<typeof buildCancelTransactionsLines>;
  cancelDetailWeekly: ReturnType<typeof buildCancelTransactionsWeekly>;
  cancelDetailWeeklyLines: ReturnType<typeof buildCancelTransactionsLinesWeekly>;
};

const EMPTY_ANALYTICS: WlaAnalytics = {
  docTypeCards: [],
  yearTable: [],
  companyTable: [],
  docTypeTable: [],
  docTypeAverages: [],
  docTypeAverageTable: [],
  monthTable: [],
  activeSummaryDocs: [],
  activeSummaryLines: [],
  activeSummaryWeeklyDocs: [],
  activeSummaryWeeklyLines: [],
  activeDetailPivot: [],
  activeDetailLines: [],
  activeDetailWeekly: [],
  activeDetailWeeklyLines: [],
  cancelDetailPivot: [],
  cancelDetailLines: [],
  cancelDetailWeekly: [],
  cancelDetailWeeklyLines: [],
};

function computeAnalytics(rows: Lst5yrsRow[], filters: DashboardFilters): WlaAnalytics {
  const activeDetail = buildActiveTransactionsDetail(rows);
  const activeSummary = buildActiveTransactionsSummary(rows);
  const activeDetailWeekly = buildActiveTransactionsDetailWeekly(rows);
  const activeSummaryWeekly = buildActiveTransactionsSummaryWeekly(rows);
  const docTypeAverages = buildDocTypeAverages(rows, filters);

  return {
    docTypeCards: buildDocTypeCards(rows),
    yearTable: buildYearTable(rows),
    companyTable: buildCompanyTable(rows),
    docTypeTable: buildDocTypeTable(rows),
    docTypeAverages,
    docTypeAverageTable: buildDocTypeAverageTable(docTypeAverages),
    monthTable: buildMonthTable(rows),
    activeSummaryDocs: activeDetail,
    activeSummaryLines: activeSummary,
    activeSummaryWeeklyDocs: activeDetailWeekly,
    activeSummaryWeeklyLines: activeSummaryWeekly,
    activeDetailPivot: activeDetail,
    activeDetailLines: activeSummary,
    activeDetailWeekly,
    activeDetailWeeklyLines: activeSummaryWeekly,
    cancelDetailPivot: buildCancelTransactionsPivot(rows),
    cancelDetailLines: buildCancelTransactionsLines(rows),
    cancelDetailWeekly: buildCancelTransactionsWeekly(rows),
    cancelDetailWeeklyLines: buildCancelTransactionsLinesWeekly(rows),
  };
}

export function useWlaAnalytics(filtered: Lst5yrsRow[], filters: DashboardFilters) {
  const deferred = useDeferredValue(filtered);
  const [analytics, setAnalytics] = useState<WlaAnalytics>(EMPTY_ANALYTICS);
  const [computing, setComputing] = useState(false);

  const totals = useMemo(() => {
    let docs = 0;
    let cancelled = 0;
    for (const r of filtered) {
      docs += r['Document Count'];
      cancelled += r['Cancelled Document Count'];
    }
    return { docs, cancelled, active: docs - cancelled };
  }, [filtered]);

  useEffect(() => {
    if (!deferred.length) {
      setAnalytics(EMPTY_ANALYTICS);
      setComputing(false);
      return;
    }

    let cancelled = false;
    setComputing(true);

    const run = () => {
      if (cancelled) return;
      setAnalytics(computeAnalytics(deferred, filters));
      setComputing(false);
    };

    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(run, { timeout: 150 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }

    const timer = window.setTimeout(run, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferred, filters]);

  const isStale = computing || deferred !== filtered;

  return { totals, analytics, isStale };
}
