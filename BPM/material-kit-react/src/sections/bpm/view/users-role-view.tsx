import type { DepartmentFolder } from 'src/sections/bpm/storage';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Switch from '@mui/material/Switch';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import Autocomplete from '@mui/material/Autocomplete';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import FormControlLabel from '@mui/material/FormControlLabel';

import { DashboardContent } from 'src/layouts/dashboard';

import { type PermissionKey } from 'src/sections/bpm/access-control';
import {
  type AccessRole,
  createAccessRole,
  deleteAccessRole,
  fetchAccessRoles,
  fetchDepartments,
  updateAccessRole,
} from 'src/sections/bpm/api';

const permissionLabels: Array<{ key: PermissionKey; label: string }> = [
  { key: 'departments', label: 'Process functions' },
  { key: 'processes', label: 'Processes' },
  { key: 'activities', label: 'Sub-processes' },
  { key: 'usersPermissions', label: 'Users' },
  { key: 'usersRoles', label: 'Roles' },
  { key: 'activitiesTemplateMaster', label: 'Sub-process template master' },
  { key: 'applicationMaster', label: 'Application master' },
  { key: 'vendorVersions', label: 'Vendor versions' },
];

const BUILTIN_ROLE_NAMES = new Set([
  'Super Admin',
  'Admin',
  'Department Manager',
  'Viewer',
]);

type ProcessOption = { id: string; label: string };

type RoleFormState = {
  name: string;
  enabled: boolean;
  permissionKeys: PermissionKey[];
  allowedProcessIds: string[];
};

function roleToForm(role: AccessRole): RoleFormState {
  const keys = (role.permissions ?? []).filter((k): k is PermissionKey =>
    permissionLabels.some((p) => p.key === k),
  );
  return {
    name: role.name,
    enabled: role.enabled !== false,
    permissionKeys: keys,
    allowedProcessIds: [...(role.allowedProcessIds ?? [])],
  };
}

const defaultNewRolePermissions: PermissionKey[] = [
  'departments',
  'processes',
  'activities',
];

export function UsersRoleView() {
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [departments, setDepartments] = useState<DepartmentFolder[]>([]);
  const [forms, setForms] = useState<Record<string, RoleFormState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createFullAccess, setCreateFullAccess] = useState(false);
  const [createPerms, setCreatePerms] = useState<PermissionKey[]>([...defaultNewRolePermissions]);
  const [createError, setCreateError] = useState('');
  const [createSaving, setCreateSaving] = useState(false);

  const processOptions: ProcessOption[] = useMemo(
    () =>
      departments.flatMap((dept) =>
        (dept.processes ?? []).map((proc) => ({
          id: proc.id,
          label: `${dept.name} — ${proc.processName} (${proc.code})`,
        })),
      ),
    [departments],
  );

  const processById = useMemo(() => new Map(processOptions.map((o) => [o.id, o])), [processOptions]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([fetchAccessRoles(), fetchDepartments()])
      .then(([rolesData, deptData]) => {
        setRoles(rolesData);
        setDepartments(deptData);
        const next: Record<string, RoleFormState> = {};
        for (const r of rolesData) {
          next[r.id] = roleToForm(r);
        }
        setForms(next);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setForm = (roleId: string, patch: Partial<RoleFormState>) => {
    setForms((prev) => ({
      ...prev,
      [roleId]: { ...prev[roleId]!, ...patch },
    }));
  };

  const togglePermission = (roleId: string, key: PermissionKey, checked: boolean) => {
    const form = forms[roleId];
    if (!form) return;
    const next = new Set(form.permissionKeys);
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    setForm(roleId, { permissionKeys: [...next] });
  };

  const saveRole = async (role: AccessRole) => {
    const form = forms[role.id];
    if (!form) return;
    setRowError((prev) => ({ ...prev, [role.id]: '' }));
    setRowSaving((prev) => ({ ...prev, [role.id]: true }));
    try {
      const payload: {
        name?: string;
        enabled: boolean;
        permissionKeys: PermissionKey[];
        allowedProcessIds: string[];
      } = {
        enabled: form.enabled,
        permissionKeys: form.permissionKeys,
        allowedProcessIds: form.allowedProcessIds,
      };
      if (form.name.trim() !== role.name) {
        payload.name = form.name.trim();
      }
      const updated = await updateAccessRole(role.id, payload);
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setForms((prev) => ({ ...prev, [updated.id]: roleToForm(updated) }));
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [role.id]: (err as Error).message,
      }));
    } finally {
      setRowSaving((prev) => ({ ...prev, [role.id]: false }));
    }
  };

  const dirty = (role: AccessRole) => {
    const form = forms[role.id];
    if (!form) return false;
    const orig = roleToForm(role);
    if (form.name.trim() !== orig.name.trim()) return true;
    if (form.enabled !== orig.enabled) return true;
    if (form.allowedProcessIds.join(',') !== orig.allowedProcessIds.join(',')) return true;
    const a = new Set(form.permissionKeys);
    const b = new Set(orig.permissionKeys);
    if (a.size !== b.size) return true;
    for (const k of a) {
      if (!b.has(k)) return true;
    }
    return false;
  };

  const openCreate = () => {
    setCreateName('');
    setCreateFullAccess(false);
    setCreatePerms([...defaultNewRolePermissions]);
    setCreateError('');
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const name = createName.trim();
    if (name.length < 2) {
      setCreateError('Role name must be at least 2 characters.');
      return;
    }
    const permissionKeys = createFullAccess
      ? permissionLabels.map((p) => p.key)
      : createPerms;
    if (!permissionKeys.length) {
      setCreateError('Select at least one permission.');
      return;
    }
    setCreateSaving(true);
    setCreateError('');
    try {
      await createAccessRole({
        name,
        fullAccess: createFullAccess,
        enabled: true,
        permissionKeys,
        allowedProcessIds: [],
      });
      setCreateOpen(false);
      await load();
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreateSaving(false);
    }
  };

  const onDeleteRole = async (role: AccessRole) => {
    if (BUILTIN_ROLE_NAMES.has(role.name)) {
      return;
    }
    const ok = window.confirm(`Delete role "${role.name}"? Users must be reassigned first.`);
    if (!ok) return;
    setRowError((prev) => ({ ...prev, [role.id]: '' }));
    setRowSaving((prev) => ({ ...prev, [role.id]: true }));
    try {
      await deleteAccessRole(role.id);
      await load();
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [role.id]: (err as Error).message,
      }));
    } finally {
      setRowSaving((prev) => ({ ...prev, [role.id]: false }));
    }
  };

  const toggleCreatePerm = (key: PermissionKey, checked: boolean) => {
    setCreatePerms((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return [...next];
    });
  };

  return (
    <DashboardContent maxWidth={false}>
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h4">Roles</Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" size="small" onClick={load} disabled={loading}>
              Refresh
            </Button>
            <Button variant="contained" size="small" onClick={openCreate} disabled={loading}>
              New role
            </Button>
          </Stack>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Create roles, rename them (except Super Admin), enable or disable them, set permissions, and optionally limit
          which processes users on that role may open. An empty process list means all processes in their assigned
          process functions.
        </Typography>

        {error && <Alert severity="error">{error}</Alert>}
        {loading && <Typography variant="body2">Loading roles…</Typography>}

        <Dialog open={createOpen} onClose={() => !createSaving && setCreateOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>New role</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                label="Role name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                fullWidth
                autoFocus
              />
              <FormControlLabel
                control={
                  <Switch checked={createFullAccess} onChange={(_e, v) => setCreateFullAccess(v)} />
                }
                label="Full access (all modules; process allow-list ignored)"
              />
              <Typography variant="subtitle2" color="text.secondary">
                Permissions
              </Typography>
              <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
                {permissionLabels.map(({ key, label }) => (
                  <FormControlLabel
                    key={key}
                    control={
                      <Checkbox
                        size="small"
                        checked={createPerms.includes(key)}
                        onChange={(_e, checked) => toggleCreatePerm(key, checked)}
                        disabled={createFullAccess}
                      />
                    }
                    label={label}
                  />
                ))}
              </Stack>
              {createError && <Alert severity="error">{createError}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)} disabled={createSaving} color="inherit">
              Cancel
            </Button>
            <Button variant="contained" onClick={() => void submitCreate()} disabled={createSaving}>
              {createSaving ? 'Creating…' : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>

        {!loading &&
          roles.map((role) => {
            const form = forms[role.id];
            if (!form) return null;
            const isSuperAdmin = role.name === 'Super Admin';
            const processScopeIrrelevant = role.fullAccess;
            const canDelete = !BUILTIN_ROLE_NAMES.has(role.name);

            return (
              <Card key={role.id} sx={{ p: 2 }}>
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} flexWrap="wrap">
                    <TextField
                      size="small"
                      label="Role name"
                      value={form.name}
                      onChange={(e) => setForm(role.id, { name: e.target.value })}
                      disabled={isSuperAdmin}
                      sx={{ minWidth: 200, maxWidth: 360 }}
                    />
                    {role.fullAccess && <Chip size="small" color="primary" label="Full access" />}
                    <FormControlLabel
                      control={
                        <Switch
                          checked={form.enabled}
                          onChange={(_e, checked) => setForm(role.id, { enabled: checked })}
                          disabled={isSuperAdmin}
                        />
                      }
                      label="Role enabled"
                    />
                    <Box sx={{ flex: 1 }} />
                    {canDelete && (
                      <Button
                        color="error"
                        variant="outlined"
                        size="small"
                        disabled={rowSaving[role.id]}
                        onClick={() => void onDeleteRole(role)}
                      >
                        Delete
                      </Button>
                    )}
                    <Button
                      variant="contained"
                      size="small"
                      disabled={!dirty(role) || rowSaving[role.id] || !form.name.trim()}
                      onClick={() => saveRole(role)}
                    >
                      {rowSaving[role.id] ? 'Saving…' : 'Save changes'}
                    </Button>
                  </Stack>

                  {processScopeIrrelevant && (
                    <Alert severity="info" sx={{ py: 0.5 }}>
                      This role grants full access, so the process allow-list is not enforced for its users.
                    </Alert>
                  )}

                  <Typography variant="subtitle2" color="text.secondary">
                    Permissions
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
                    {permissionLabels.map(({ key, label }) => (
                      <FormControlLabel
                        key={key}
                        control={
                          <Checkbox
                            size="small"
                            checked={form.permissionKeys.includes(key)}
                            onChange={(_e, checked) => togglePermission(role.id, key, checked)}
                          />
                        }
                        label={label}
                      />
                    ))}
                  </Stack>

                  <Typography variant="subtitle2" color="text.secondary">
                    Allowed processes (optional)
                  </Typography>
                  <Autocomplete
                    multiple
                    options={processOptions}
                    getOptionLabel={(o) => o.label}
                    value={form.allowedProcessIds
                      .map((id) => processById.get(id))
                      .filter((o): o is ProcessOption => !!o)}
                    onChange={(_e, value) =>
                      setForm(role.id, { allowedProcessIds: value.map((v) => v.id) })
                    }
                    disabled={processScopeIrrelevant}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Process allow-list"
                        placeholder="Leave empty for all processes in assigned folders"
                        helperText={
                          form.allowedProcessIds.length === 0
                            ? 'No restriction by process (only by user folder assignments).'
                            : `${form.allowedProcessIds.length} process(es) selected.`
                        }
                      />
                    )}
                  />

                  {rowError[role.id] && <Alert severity="error">{rowError[role.id]}</Alert>}
                </Stack>
              </Card>
            );
          })}
      </Stack>
    </DashboardContent>
  );
}
