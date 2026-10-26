import type { BpmProcess, ActivityItem, DepartmentFolder } from 'src/sections/bpm/storage';

import { useLocation } from 'react-router-dom';
import { memo, useMemo, useState, useEffect, useCallback, useDeferredValue } from 'react';

import Box from '@mui/material/Box';
import List from '@mui/material/List';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemButton from '@mui/material/ListItemButton';

import { usePathname } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';

import { useCompanies } from 'src/sections/bpm/companies';
import { toDepartmentDisplayName } from 'src/sections/bpm/storage';
import { companyDisplayLabel } from 'src/sections/bpm/company-display.util';
import { fetchDepartments, fetchDepartmentsExplorerTree } from 'src/sections/bpm/api';
import { hasPermission, useAccessProfile, ACCESS_PROFILE_EVENT } from 'src/sections/bpm/access-control';

// ----------------------------------------------------------------------

// ----------------------------------------------------------------------

const EXPLORER_CACHE_KEY = 'bpm-explorer-tree-v2';

/** Prefer SLN (import/file order), then hierarchy code. */
function compareActivityDisplayOrder(
  a: { code?: string | null; sln?: number | null },
  b: { code?: string | null; sln?: number | null },
): number {
  const slnDiff = (a.sln ?? 0) - (b.sln ?? 0);
  if (slnDiff !== 0) return slnDiff;
  const pa = String(a.code ?? '')
    .split('-')
    .map((s) => Number.parseInt(s, 10));
  const pb = String(b.code ?? '')
    .split('-')
    .map((s) => Number.parseInt(s, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const va = Number.isFinite(pa[i]) ? (pa[i] as number) : 0;
    const vb = Number.isFinite(pb[i]) ? (pb[i] as number) : 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}
const EXPLORER_CACHE_TTL_MS = 5 * 60 * 1000;

function readExplorerCache(): DepartmentFolder[] | null {
  try {
    const raw = sessionStorage.getItem(EXPLORER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: DepartmentFolder[] };
    if (Date.now() - parsed.at > EXPLORER_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeExplorerCache(data: DepartmentFolder[]) {
  try {
    sessionStorage.setItem(
      EXPLORER_CACHE_KEY,
      JSON.stringify({ at: Date.now(), data }),
    );
  } catch {
    /* ignore quota */
  }
}

function toggleId(set: Set<string>, id: string) {
  const next = new Set(set);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

/** Case-insensitive substring match for explorer search. */
function fieldMatches(needle: string, value: string | null | undefined) {
  if (!needle) return true;
  return String(value ?? '').toLowerCase().includes(needle);
}

/**
 * Returns company groups with folders/processes/activities narrowed to rows that match `needle`.
 * When `needle` is empty, returns `byCompany` unchanged.
 */
function filterExplorerTree(
  byCompany: [string, DepartmentFolder[]][],
  needle: string,
  canProcesses: boolean,
  canActivities: boolean,
): [string, DepartmentFolder[]][] {
  const q = needle.trim().toLowerCase();
  if (!q) {
    return byCompany;
  }

  const result: [string, DepartmentFolder[]][] = [];

  for (const [companyCode, folders] of byCompany) {
    const nextFolders: DepartmentFolder[] = [];

    for (const folder of folders) {
      const deptHit =
        fieldMatches(q, companyCode) ||
        fieldMatches(q, folder.code) ||
        fieldMatches(q, folder.name) ||
        fieldMatches(q, toDepartmentDisplayName(folder.code, folder.name));

      if (!canProcesses) {
        if (deptHit) {
          nextFolders.push(folder);
        }
        continue;
      }

      const nextProcesses: BpmProcess[] = [];
      for (const proc of folder.processes ?? []) {
        const procHit =
          deptHit ||
          fieldMatches(q, proc.code) ||
          fieldMatches(q, proc.name) ||
          fieldMatches(q, proc.processName) ||
          fieldMatches(q, proc.companyCode);

        if (!canActivities) {
          if (procHit) {
            nextProcesses.push(proc);
          }
          continue;
        }

        const acts = proc.activities ?? [];
        const matchedActs = acts.filter(
          (a) =>
            fieldMatches(q, a.code) ||
            fieldMatches(q, a.activityName) ||
            fieldMatches(q, a.activityDescription ?? undefined),
        );

        if (matchedActs.length > 0) {
          nextProcesses.push({ ...proc, activities: matchedActs });
        } else if (procHit) {
          nextProcesses.push(proc);
        }
      }

      if (nextProcesses.length > 0) {
        nextFolders.push({ ...folder, processes: nextProcesses });
      } else if (deptHit) {
        nextFolders.push(folder);
      }
    }

    if (nextFolders.length > 0) {
      result.push([companyCode, nextFolders]);
    }
  }

  return result;
}

type BranchRowProps = {
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  label: string;
  active?: boolean;
  /** Optional link to open folder / list in main area (does not toggle). */
  linkHref?: string;
  linkTitle?: string;
};

const BranchRow = memo(function BranchRow({
  depth,
  expanded,
  onToggle,
  label,
  active,
  linkHref,
  linkTitle,
}: BranchRowProps) {
  // Shallower indent so company → PF → process stays readable in a narrow rail.
  const paddingLeft = 0.5 + depth * 0.85;

  return (
    <Box sx={{ display: 'flex', alignItems: 'stretch', pl: paddingLeft, pr: 0.5 }}>
      <ListItemButton
        onClick={onToggle}
        sx={{
          flex: 1,
          minWidth: 0,
          py: 0.55,
          pr: 0.5,
          borderRadius: 0.75,
          minHeight: 32,
          ...(active && {
            bgcolor: (theme) => `${theme.vars.palette.primary.mainChannel} / 0.08`,
          }),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1, minWidth: 0 }}>
          <Iconify
            icon={expanded ? 'eva:arrow-ios-downward-fill' : 'eva:arrow-ios-forward-fill'}
            width={16}
            sx={{ flexShrink: 0, color: 'text.disabled' }}
          />
          <Typography
            variant="caption"
            sx={{
              flex: 1,
              minWidth: 0,
              fontWeight: 600,
              textAlign: 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: active ? 'primary.main' : 'text.secondary',
            }}
          >
            {label}
          </Typography>
        </Box>
      </ListItemButton>
      {linkHref ? (
        <IconButton
          component={RouterLink}
          href={linkHref}
          size="small"
          title={linkTitle ?? 'Open'}
          sx={{ alignSelf: 'center', flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <Iconify icon="solar:share-bold" width={18} />
        </IconButton>
      ) : null}
    </Box>
  );
});

type ActivityLeafProps = {
  depth: number;
  label: string;
  href: string;
  active: boolean;
};

const ActivityLeaf = memo(function ActivityLeaf({ depth, label, href, active }: ActivityLeafProps) {
  const paddingLeft = 0.5 + depth * 0.85;

  return (
    <ListItemButton
      component={RouterLink}
      href={href}
      sx={{
        pl: paddingLeft,
        pr: 1,
        py: 0.4,
        borderRadius: 0.75,
        minHeight: 28,
        ...(active && {
          bgcolor: (theme) => `${theme.vars.palette.primary.mainChannel} / 0.12`,
        }),
      }}
    >
      <Typography
        variant="caption"
        sx={{
          flex: 1,
          minWidth: 0,
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: active ? 'primary.main' : 'text.primary',
          fontWeight: active ? 600 : 400,
        }}
      >
        {label}
      </Typography>
    </ListItemButton>
  );
});

type BpmSidebarTreeProps = {
  /** When `top`, renders as the first block in the nav (no divider above). */
  placement?: 'top' | 'bottom';
};

export function BpmSidebarTree({ placement = 'bottom' }: BpmSidebarTreeProps) {
  const profile = useAccessProfile();
  const { companies } = useCompanies();
  const pathname = usePathname();
  const location = useLocation();
  const activityHighlight = new URLSearchParams(location.search).get('activity');

  const canDepartments = hasPermission(profile, 'departments');
  const canProcesses = hasPermission(profile, 'processes');
  /** Vendors get sub-process navigation through vendorVersions even without activities. */
  const canActivities =
    hasPermission(profile, 'activities') || hasPermission(profile, 'vendorVersions');
  const [departments, setDepartments] = useState<DepartmentFolder[]>(
    () => readExplorerCache() ?? [],
  );
  const [loading, setLoading] = useState(() => !readExplorerCache());
  const [loadError, setLoadError] = useState('');

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [explorerSearch, setExplorerSearch] = useState('');
  const deferredSearch = useDeferredValue(explorerSearch);

  const load = useCallback((background = false) => {
    if (!canDepartments) {
      setDepartments([]);
      return;
    }
    if (!background) {
      setLoading(true);
    }
    setLoadError('');
    fetchDepartmentsExplorerTree()
      .catch(() => fetchDepartments())
      .then((data) => {
        setDepartments(data);
        writeExplorerCache(data);
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [canDepartments]);

  useEffect(() => {
    load(Boolean(readExplorerCache()));
  }, [load]);

  useEffect(() => {
    const onProfile = () => {
      try {
        sessionStorage.removeItem(EXPLORER_CACHE_KEY);
      } catch {
        /* ignore */
      }
      load(false);
    };
    window.addEventListener(ACCESS_PROFILE_EVENT, onProfile);
    return () => window.removeEventListener(ACCESS_PROFILE_EVENT, onProfile);
  }, [load]);

  const byCompany = useMemo(() => {
    const map = new Map<string, DepartmentFolder[]>();
    for (const d of departments) {
      const key = (d.companyCode || '—').trim() || '—';
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(d);
    }
    for (const [key, list] of map.entries()) {
      map.set(
        key,
        [...list]
          .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }))
          .map((folder) => ({
            ...folder,
            processes: [...(folder.processes ?? [])]
              .sort((a, b) =>
                String(a.code).localeCompare(String(b.code), undefined, { numeric: true }),
              )
              .map((proc) => ({
                ...proc,
                activities: [...(proc.activities ?? [])].sort(compareActivityDisplayOrder),
              })),
          })),
      );
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [departments]);

  const explorerSearchActive = deferredSearch.trim().length > 0;

  const displayByCompany = useMemo(
    () => filterExplorerTree(byCompany, deferredSearch, canProcesses, canActivities),
    [byCompany, deferredSearch, canProcesses, canActivities],
  );

  /** Expand tree to match current URL. */
  useEffect(() => {
    const m = pathname.match(/^\/departments\/([^/]+)\/processes\/([^/]+)/);
    if (!m) {
      return;
    }
    const [, deptId, processId] = m;
    const dept = departments.find((d) => d.id === deptId);
    if (!dept) {
      return;
    }
    const companyKey = (dept.companyCode || '—').trim() || '—';
    setExpanded((prev) => {
      const n = new Set(prev);
      n.add(`c:${companyKey}`);
      n.add(`d:${deptId}`);
      n.add(`p:${deptId}:${processId}`);
      return n;
    });
  }, [pathname, departments]);

  if (!canDepartments && !canProcesses && !canActivities) {
    return null;
  }

  if (!canDepartments) {
    return (
      <>
        {placement === 'bottom' ? <Divider sx={{ my: 1.5 }} /> : null}
        <Typography variant="caption" sx={{ px: 2, color: 'text.disabled', display: 'block' }}>
          Explorer needs &quot;Process functions&quot; permission.
        </Typography>
        {placement === 'top' ? <Divider sx={{ my: 1.5 }} /> : null}
      </>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: '0 1 auto',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, pt: 0.5, pb: 1 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 1,
              bgcolor: (theme) => `${theme.vars.palette.info.mainChannel} / 0.12`,
              color: 'info.main',
            }}
          >
            <Iconify icon="ic:round-filter-list" width={20} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ lineHeight: 1.3 }}>
              BPM explorer
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Companies → processes → sub-processes
            </Typography>
          </Box>
        </Box>
        <TextField
          size="small"
          fullWidth
          placeholder="Search code or name…"
          value={explorerSearch}
          onChange={(e) => setExplorerSearch(e.target.value)}
          sx={{ mb: 1 }}
          slotProps={{
            input: {
              sx: { borderRadius: 1.25, fontSize: 13 },
              startAdornment: (
                <InputAdornment position="start">
                  <Iconify icon="eva:search-fill" width={18} sx={{ color: 'text.disabled' }} />
                </InputAdornment>
              ),
              endAdornment: explorerSearch ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear search"
                    onClick={() => setExplorerSearch('')}
                    edge="end"
                  >
                    <Iconify icon="mingcute:close-line" width={18} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
        />
        {loadError ? (
          <Typography variant="caption" color="error" sx={{ px: 2, display: 'block' }}>
            {loadError}
          </Typography>
        ) : null}
        {loading && !departments.length ? (
          <Typography variant="caption" sx={{ px: 2, color: 'text.secondary' }}>
            Loading…
          </Typography>
        ) : null}
        {explorerSearchActive && !displayByCompany.length && !loading ? (
          <Typography variant="caption" sx={{ px: 2, pb: 1, display: 'block', color: 'text.secondary' }}>
            No matches for &quot;{explorerSearch.trim()}&quot;.
          </Typography>
        ) : null}
      </Box>

      <Scrollbar fillContent={false} sx={{ flex: '0 1 auto', minHeight: 0 }}>
        <List dense disablePadding sx={{ py: 0.5, pr: 0.5 }}>
          {displayByCompany.map(([companyCode, folders]) => {
            const cKey = `c:${companyCode}`;
            const cOpen = explorerSearchActive || expanded.has(cKey);

            return (
              <Box key={cKey}>
                <BranchRow
                  depth={0}
                  expanded={cOpen}
                  onToggle={() => setExpanded((s) => toggleId(s, cKey))}
                  label={companyDisplayLabel(companies, companyCode)}
                  linkHref={
                    companyCode?.trim()
                      ? `/companies/${companyCode}/departments`
                      : '/companies'
                  }
                  linkTitle="Open company hub"
                />
                <Collapse in={cOpen} timeout="auto" unmountOnExit={!explorerSearchActive}>
                  {folders.map((folder) => {
                    const dKey = `d:${folder.id}`;
                    const dOpen = explorerSearchActive || expanded.has(dKey);
                    const deptLabel = toDepartmentDisplayName(folder.code, folder.name || '');
                    const deptHref = `/departments/${folder.id}/processes`;
                    const deptActive = pathname === deptHref || pathname.startsWith(`${deptHref}/`);

                    return (
                      <Box key={folder.id}>
                        <BranchRow
                          depth={1}
                          expanded={dOpen}
                          onToggle={() => setExpanded((s) => toggleId(s, dKey))}
                          label={deptLabel}
                          active={deptActive}
                          linkHref={canProcesses ? deptHref : undefined}
                          linkTitle="Process list"
                        />
                        <Collapse in={dOpen} timeout="auto" unmountOnExit={!explorerSearchActive}>
                          {!canProcesses ? (
                            <Typography variant="caption" sx={{ pl: 4, pr: 1, color: 'text.disabled' }}>
                              No process permission
                            </Typography>
                          ) : (
                            (folder.processes ?? []).map((proc: BpmProcess) => {
                              const pKey = `p:${folder.id}:${proc.id}`;
                              const pOpen = explorerSearchActive || expanded.has(pKey);
                              const procLabel = proc.processName?.trim() || proc.name || proc.code;
                              const activities = proc.activities ?? [];
                              const procActive = pathname.includes(
                                `/departments/${folder.id}/processes/${proc.id}/`,
                              );

                              return (
                                <Box key={proc.id}>
                                  <BranchRow
                                    depth={2}
                                    expanded={pOpen}
                                    onToggle={() => setExpanded((s) => toggleId(s, pKey))}
                                    label={procLabel}
                                    active={procActive}
                                  />
                                  <Collapse in={pOpen} timeout="auto" unmountOnExit={!explorerSearchActive}>
                                    {!canActivities ? (
                                      <Typography
                                        variant="caption"
                                        sx={{ pl: 5.5, pr: 1, color: 'text.disabled' }}
                                      >
                                        No sub-process permission
                                      </Typography>
                                    ) : activities.length === 0 ? (
                                      <Typography
                                        variant="caption"
                                        sx={{ pl: 5.5, pr: 1, color: 'text.disabled' }}
                                      >
                                        No sub-processes
                                      </Typography>
                                    ) : (
                                      activities.map((act: ActivityItem) => {
                                        const href = `/departments/${folder.id}/processes/${proc.id}/activities-table?activity=${encodeURIComponent(act.id)}`;
                                        const leafLabel = act.activityName || act.code;
                                        const onTable =
                                          pathname.includes(
                                            `/departments/${folder.id}/processes/${proc.id}/`,
                                          ) && pathname.includes('activities-table');
                                        return (
                                          <ActivityLeaf
                                            key={act.id}
                                            depth={3}
                                            label={leafLabel}
                                            href={href}
                                            active={onTable && activityHighlight === act.id}
                                          />
                                        );
                                      })
                                    )}
                                  </Collapse>
                                </Box>
                              );
                            })
                          )}
                        </Collapse>
                      </Box>
                    );
                  })}
                </Collapse>
              </Box>
            );
          })}
        </List>
      </Scrollbar>
      {placement === 'top' ? <Divider sx={{ mt: 1, mb: 0.5, flexShrink: 0 }} /> : null}
    </Box>
  );
}
