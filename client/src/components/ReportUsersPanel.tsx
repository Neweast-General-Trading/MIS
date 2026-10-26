import { useCallback, useEffect, useMemo, useState } from 'react';
import { exportSheet } from '../lib/excel';

const USERS_API_BASE =
  import.meta.env.VITE_API_BASE?.replace('/api/dashboard/lst5yrs', '/api/dashboard/report-users') ??
  'https://misapi.neweast.cloud/api/dashboard/report-users';

const ACCESS_API =
  import.meta.env.VITE_API_BASE?.replace('/api/dashboard/lst5yrs', '/api/dashboard/report-access') ??
  'https://misapi.neweast.cloud/api/dashboard/report-access';

const PAGE_SIZE = 20;

export type MergedReportUser = {
  USER_ID: string;
  USER_NAME: string;
  USER_EMAIL: string;
  EMP_FULLNAME: string;
  hasViewed: boolean;
  viewCount: number;
  lastViewedAt: string | null;
};

type ReportUsersResponse = {
  companyFilter: string | null;
  totalActiveUsers: number;
  totalViews: number;
  uniqueViewers: number;
  users: MergedReportUser[];
};

type Props = {
  viewer?: { userId: string; userName: string; userEmail: string };
  onRegisterViewer?: () => void;
  /** When set (e.g. dashboard Company filter), only users with access to that company are shown */
  companyFilter?: string;
};

export function recordReportAccess(viewer: { userId: string; userName: string; userEmail: string }) {
  return fetch(ACCESS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(viewer),
  });
}

export default function ReportUsersPanel({ viewer, onRegisterViewer, companyFilter = '' }: Props) {
  const [data, setData] = useState<ReportUsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyViewed, setOnlyViewed] = useState(false);
  const [page, setPage] = useState(0);

  const usersUrl = useMemo(() => {
    const url = new URL(USERS_API_BASE);
    if (companyFilter.trim()) url.searchParams.set('company', companyFilter.trim());
    return url.toString();
  }, [companyFilter]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(usersUrl)
      .then((r) => r.json())
      .then((json) => {
        if (json.users) setData(json as ReportUsersResponse);
      })
      .finally(() => setLoading(false));
  }, [usersUrl]);

  useEffect(() => {
    setPage(0);
    load();
  }, [load]);

  useEffect(() => {
    if (!viewer?.userEmail && !viewer?.userName) return;
    recordReportAccess(viewer).then(() => load());
    onRegisterViewer?.();
  }, [viewer?.userEmail, viewer?.userName, viewer?.userId, load, onRegisterViewer]);

  const filtered = useMemo(() => {
    if (!data?.users) return [];
    const q = search.trim().toLowerCase();
    return data.users.filter((u) => {
      if (onlyViewed && !u.hasViewed) return false;
      if (!q) return true;
      return (
        u.USER_NAME?.toLowerCase().includes(q) ||
        u.USER_EMAIL?.toLowerCase().includes(q) ||
        u.USER_ID?.toLowerCase().includes(q) ||
        u.EMP_FULLNAME?.toLowerCase().includes(q)
      );
    });
  }, [data, search, onlyViewed]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const exportUsers = () => {
    const rows = filtered.length ? filtered : data?.users ?? [];
    if (!rows.length) return;
    exportSheet(
      rows.map((u) => ({
        'User ID': u.USER_ID,
        Name: u.USER_NAME || u.EMP_FULLNAME,
        Email: u.USER_EMAIL,
        'Full Name': u.EMP_FULLNAME,
        'Viewed Report': u.hasViewed ? 'Yes' : 'No',
        'View Count': u.viewCount,
        'Last Viewed': u.lastViewedAt ? new Date(u.lastViewedAt).toLocaleString() : '',
      })),
      companyFilter ? `MIS_Report_Users_${companyFilter}` : 'MIS_Report_Users',
    );
  };

  if (loading && !data) {
    return (
      <div className="panel">
        <div className="panel-body meta">Loading report users…</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>
          Report users & access
          {companyFilter ? ` — ${companyFilter}` : ''}
        </h3>
        <button type="button" className="btn btn-sm" onClick={exportUsers}>
          Export Excel
        </button>
      </div>

      <div className="kpi-grid" style={{ padding: '1rem 1.1rem 0' }}>
        <div className="kpi-card blue">
          <label>Active users{companyFilter ? ` (${companyFilter})` : ''}</label>
          <strong>{data.totalActiveUsers.toLocaleString()}</strong>
        </div>
        <div className="kpi-card green">
          <label>Viewed this report</label>
          <strong>{data.uniqueViewers.toLocaleString()}</strong>
        </div>
        <div className="kpi-card amber">
          <label>Total views</label>
          <strong>{data.totalViews.toLocaleString()}</strong>
        </div>
        <div className="kpi-card red">
          <label>Not viewed yet</label>
          <strong>{(data.totalActiveUsers - data.uniqueViewers).toLocaleString()}</strong>
        </div>
      </div>

      <div className="filters filters-grid" style={{ paddingTop: 0 }}>
        <label>
          Search users
          <input
            className="filter-input"
            placeholder="Name, email, user ID…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </label>
        <label style={{ justifyContent: 'flex-end' }}>
          <span className="meta" style={{ marginBottom: '0.35rem' }}>Filter</span>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={onlyViewed}
              onChange={(e) => { setOnlyViewed(e.target.checked); setPage(0); }}
            />
            Only users who viewed report
          </label>
        </label>
      </div>

      <div className="table-scroll table-scroll-sm">
        <table>
          <thead>
            <tr>
              <th>User ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Viewed</th>
              <th>Views</th>
              <th>Last viewed</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((u) => (
              <tr key={u.USER_ID}>
                <td>{u.USER_ID}</td>
                <td>{u.EMP_FULLNAME || u.USER_NAME}</td>
                <td>{u.USER_EMAIL}</td>
                <td>{u.hasViewed ? 'Yes' : '—'}</td>
                <td>{u.viewCount || '—'}</td>
                <td>{u.lastViewedAt ? new Date(u.lastViewedAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button type="button" className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span className="meta">
          {filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
        </span>
        <button type="button" className="btn" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}
