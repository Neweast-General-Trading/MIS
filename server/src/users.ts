import fs from 'fs';
import path from 'path';
import hana from '@sap/hana-client';
import { getEmployeeCompanies } from './employee-lst5yrs.js';
import { branchesForCompanyCode } from './company-branches.js';

export type EmployeeFilterOption = {
  userId: string;
  name: string;
  email: string;
  companies: string[];
};

export type ReportUser = {
  USER_ID: string;
  USER_NAME: string;
  USER_EMAIL: string;
  EMP_FULLNAME: string;
};

export type AccessEntry = {
  userId: string;
  userName: string;
  userEmail: string;
  viewedAt: string;
};

export type ViewerSummary = {
  userId: string;
  userName: string;
  userEmail: string;
  viewCount: number;
  lastViewedAt: string;
};

const accessFile = path.join(process.cwd(), 'data', 'report-access.json');

function connectConfig() {
  return {
    serverNode: process.env.SERVER_NODE!,
    uid: process.env.SAP_HANA_USER!,
    pwd: process.env.SAP_HANA_PASSWORD!,
    currentSchema: process.env.SAP_HANA_DATABASE ?? 'BI_NEGT',
  };
}

function hanaQuery<T>(sql: string): Promise<T> {
  const conn = hana.createConnection();
  return new Promise((resolve, reject) => {
    conn.connect(connectConfig(), async (err) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        const result = await new Promise<T>((res, rej) => {
          conn.exec(sql, [], (e, rows) => (e ? rej(e) : res(rows as T)));
        });
        resolve(result);
      } catch (e) {
        reject(e);
      } finally {
        conn.disconnect();
      }
    });
  });
}

const userBranchCacheTtl = Number(process.env.USER_BRANCH_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000);
let userBranchCache: { at: number; map: Map<string, string[]> } | null = null;

export async function fetchEmployeesForFilter(): Promise<EmployeeFilterOption[]> {
  const users = await fetchReportUsers();
  return users.map((u) => ({
    userId: u.USER_ID,
    name: u.EMP_FULLNAME || u.USER_NAME,
    email: u.USER_EMAIL,
    companies: [] as string[],
  }));
}

export async function fetchEmployeeCompanies(userId: string): Promise<string[]> {
  return getEmployeeCompanies(userId);
}

export async function fetchReportUsers(): Promise<ReportUser[]> {
  const sql = `
    SELECT USER_ID, USER_NAME, USER_EMAIL, EMP_FULLNAME
    FROM BI_USERMASTER
    WHERE USERTYPE = 'U' AND USER_ACTIVE = 'Y' AND EMP_ID != '0'
    ORDER BY USER_NAME
  `;
  return hanaQuery<ReportUser[]>(sql);
}

export async function warmUserBranchCache(): Promise<void> {
  await fetchUserBranchMap();
}

async function fetchUserBranchMap(): Promise<Map<string, string[]>> {
  const now = Date.now();
  if (userBranchCache && now - userBranchCache.at < userBranchCacheTtl) {
    return userBranchCache.map;
  }

  const users = await hanaQuery<{ USER_EMAIL: string; USER_ID: string }[]>(`
    SELECT USER_EMAIL, USER_ID
    FROM BI_USERMASTER
    WHERE USERTYPE = 'U' AND USER_ACTIVE = 'Y' AND USER_EMAIL IS NOT NULL
  `);

  const map = new Map<string, string[]>();
  for (const u of users) {
    const email = (u.USER_EMAIL || '').replace(/'/g, "''");
    if (!email) continue;
    try {
      const branches = await hanaQuery<{ BRANCH: string }[]>(
        `CALL BI_INTRA_MENU('GETBRANCH','','${email}')`,
      );
      map.set(
        u.USER_ID,
        (branches ?? []).map((b) => b.BRANCH).filter(Boolean),
      );
    } catch {
      map.set(u.USER_ID, []);
    }
  }

  userBranchCache = { at: now, map };
  return map;
}

export async function filterReportUsersByCompany(
  users: ReportUser[],
  companyCode?: string,
): Promise<ReportUser[]> {
  const branches = companyCode ? branchesForCompanyCode(companyCode) : undefined;
  if (!branches?.length) return users;

  const branchMap = await fetchUserBranchMap();
  return users.filter((u) => {
    const userBranches = branchMap.get(u.USER_ID) ?? [];
    return userBranches.some((b) => branches.includes(b));
  });
}

export function accessSummaryForUsers(
  users: ReportUser[],
  viewers: ViewerSummary[],
): {
  totalViews: number;
  uniqueViewers: number;
  viewers: ViewerSummary[];
} {
  const emails = new Set(users.map((u) => (u.USER_EMAIL || '').toLowerCase()).filter(Boolean));
  const ids = new Set(users.map((u) => (u.USER_ID || '').toLowerCase()).filter(Boolean));
  const scoped = viewers.filter(
    (v) =>
      emails.has((v.userEmail || '').toLowerCase()) ||
      ids.has((v.userId || '').toLowerCase()),
  );
  const totalViews = scoped.reduce((s, v) => s + v.viewCount, 0);
  return {
    totalViews,
    uniqueViewers: scoped.length,
    viewers: scoped,
  };
}

function readAccessLog(): AccessEntry[] {
  try {
    if (!fs.existsSync(accessFile)) return [];
    const raw = fs.readFileSync(accessFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAccessLog(entries: AccessEntry[]) {
  const dir = path.dirname(accessFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(accessFile, JSON.stringify(entries, null, 2));
}

export function recordReportAccess(payload: {
  userId: string;
  userName: string;
  userEmail: string;
}) {
  const entries = readAccessLog();
  entries.push({
    userId: payload.userId || payload.userEmail || 'anonymous',
    userName: payload.userName || 'Unknown',
    userEmail: payload.userEmail || '',
    viewedAt: new Date().toISOString(),
  });
  if (entries.length > 5000) entries.splice(0, entries.length - 5000);
  writeAccessLog(entries);
}

export function getAccessSummary(): {
  totalViews: number;
  uniqueViewers: number;
  viewers: ViewerSummary[];
} {
  const entries = readAccessLog();
  const map = new Map<string, ViewerSummary>();

  for (const e of entries) {
    const key = (e.userEmail || e.userId || e.userName).toLowerCase();
    const cur = map.get(key) ?? {
      userId: e.userId,
      userName: e.userName,
      userEmail: e.userEmail,
      viewCount: 0,
      lastViewedAt: e.viewedAt,
    };
    cur.viewCount += 1;
    if (e.viewedAt > cur.lastViewedAt) cur.lastViewedAt = e.viewedAt;
    map.set(key, cur);
  }

  const viewers = [...map.values()].sort(
    (a, b) => new Date(b.lastViewedAt).getTime() - new Date(a.lastViewedAt).getTime(),
  );

  return {
    totalViews: entries.length,
    uniqueViewers: viewers.length,
    viewers,
  };
}

export function mergeUsersWithAccess(
  users: ReportUser[],
  viewers: ViewerSummary[],
) {
  const byEmail = new Map(viewers.map((v) => [v.userEmail.toLowerCase(), v]));
  const byId = new Map(viewers.map((v) => [v.userId.toLowerCase(), v]));

  return users.map((u) => {
    const v =
      byEmail.get((u.USER_EMAIL || '').toLowerCase()) ??
      byId.get((u.USER_ID || '').toLowerCase());
    return {
      ...u,
      hasViewed: !!v,
      viewCount: v?.viewCount ?? 0,
      lastViewedAt: v?.lastViewedAt ?? null,
    };
  });
}
