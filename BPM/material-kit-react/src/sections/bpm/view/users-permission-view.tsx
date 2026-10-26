import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import Dialog from '@mui/material/Dialog';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import Autocomplete from '@mui/material/Autocomplete';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import TableContainer from '@mui/material/TableContainer';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';

import { DashboardContent } from 'src/layouts/dashboard';

import { type PermissionKey } from 'src/sections/bpm/access-control';
import { matchesTableSearch } from 'src/sections/bpm/table-search.util';
import {
  type AccessRole,
  type AccessUser,
  createAccessRole,
  fetchAccessRoles,
  fetchAccessUsers,
  fetchDepartments,
  updateAccessRole,
  updateAccessUser,
} from 'src/sections/bpm/api';

const permissionLabels: Array<{ key: PermissionKey; label: string }> = [
  { key: 'departments', label: 'Process functions' },
  { key: 'processes', label: 'Process' },
  { key: 'activities', label: 'Sub-processes' },
  { key: 'usersPermissions', label: 'Users permission' },
  { key: 'usersRoles', label: 'Users role' },
  { key: 'activitiesTemplateMaster', label: 'Sub-process template master' },
  { key: 'applicationMaster', label: 'Application master' },
  { key: 'vendorVersions', label: 'Vendor versions' },
];

const ALL_KEYS = permissionLabels.map((p) => p.key);

function personalRoleName(email: string) {
  return `Access — ${email.trim().toLowerCase()}`;
}

function isPersonalRoleName(name: string) {
  return name.startsWith('Access — ');
}

type DepartmentOption = { id: string; name: string };

export function UsersPermissionView() {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<AccessUser | null>(null);
  const [roleId, setRoleId] = useState('');
  const [fullAccess, setFullAccess] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [permissionKeys, setPermissionKeys] = useState<PermissionKey[]>([]);
  const [usePersonalRole, setUsePersonalRole] = useState(true);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const loadAll = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([fetchAccessUsers(), fetchAccessRoles(), fetchDepartments()])
      .then(([usersData, rolesData, deptData]) => {
        setUsers(usersData);
        setRoles(rolesData);
        setDepartments(deptData.map((d) => ({ id: d.id, name: d.name })));
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    return users.filter((u) =>
      matchesTableSearch(search, u.displayName, u.email, u.roleName),
    );
  }, [users, search]);

  const openEdit = (user: AccessUser) => {
    const role = roleById.get(user.roleId);
    const keys = (role?.permissions ?? []).filter((k): k is PermissionKey =>
      ALL_KEYS.includes(k as PermissionKey),
    );
    setEditUser(user);
    setRoleId(user.roleId);
    setFullAccess(user.fullAccess);
    setEnabled(user.enabled !== false);
    setDepartmentIds(user.departmentIds ?? []);
    setPermissionKeys(keys.length ? keys : [...ALL_KEYS]);
    setUsePersonalRole(role ? isPersonalRoleName(role.name) : true);
    setSaveError('');
    setDialogOpen(true);
  };

  const onRoleTemplateChange = (nextRoleId: string) => {
    setRoleId(nextRoleId);
    const role = roleById.get(nextRoleId);
    if (!role) return;
    const keys = (role.permissions ?? []).filter((k): k is PermissionKey =>
      ALL_KEYS.includes(k as PermissionKey),
    );
    setPermissionKeys(keys);
    setUsePersonalRole(isPersonalRoleName(role.name));
  };

  const togglePermission = (key: PermissionKey, checked: boolean) => {
    setPermissionKeys((prev) => {
      const set = new Set(prev);
      if (checked) set.add(key);
      else set.delete(key);
      return ALL_KEYS.filter((k) => set.has(k));
    });
  };

  const onSave = async () => {
    if (!editUser) return;
    setSaving(true);
    setSaveError('');
    try {
      let targetRoleId = roleId;

      if (usePersonalRole) {
        const name = personalRoleName(editUser.email);
        let personal = roles.find((r) => r.name === name);
        if (!personal) {
          personal = await createAccessRole({
            name,
            fullAccess: false,
            enabled: true,
            permissionKeys,
            allowedProcessIds: [],
          });
          setRoles((prev) => [...prev, personal!]);
        } else {
          await updateAccessRole(personal.id, { permissionKeys });
        }
        targetRoleId = personal!.id;
      } else if (roleId) {
        const role = roleById.get(roleId);
        const sharedBuiltin =
          role &&
          ['Super Admin', 'Admin', 'Department Manager', 'Viewer', 'Vendor'].includes(
            role.name,
          );
        if (sharedBuiltin) {
          setSaveError(
            'Shared built-in roles cannot be edited here. Enable "Personal access profile" or use Users Role.',
          );
          setSaving(false);
          return;
        }
        await updateAccessRole(roleId, { permissionKeys });
      }

      await updateAccessUser(editUser.id, {
        email: editUser.email,
        displayName: editUser.displayName,
        roleId: targetRoleId,
        fullAccess,
        enabled,
        departmentIds: fullAccess ? [] : departmentIds,
      });

      setDialogOpen(false);
      loadAll();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardContent maxWidth={false}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4">Users permission</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Assign access per user. Changes are saved to the server and are not reset when the
            API restarts. Use a personal access profile so each user keeps their own module
            permissions.
          </Typography>
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Card sx={{ p: 2 }}>
          <TextField
            size="small"
            label="Search users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ maxWidth: 360 }}
          />
        </Card>

        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Full access</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={28} />
                    </TableCell>
                  </TableRow>
                ) : !filteredUsers.length ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        No users found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id} hover>
                      <TableCell>{user.displayName}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.roleName}</TableCell>
                      <TableCell>{user.fullAccess ? 'Yes' : 'No'}</TableCell>
                      <TableCell align="right">
                        <Button size="small" variant="outlined" onClick={() => openEdit(user)}>
                          Edit access
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editUser ? `Access — ${editUser.displayName}` : 'Edit access'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {saveError ? <Alert severity="error">{saveError}</Alert> : null}

            <FormControlLabel
              control={
                <Switch
                  checked={usePersonalRole}
                  onChange={(_e, checked) => setUsePersonalRole(checked)}
                />
              }
              label="Personal access profile (recommended — permissions only for this user)"
            />

            {!usePersonalRole ? (
              <TextField
                select
                fullWidth
                label="Role template"
                value={roleId}
                onChange={(e) => onRoleTemplateChange(e.target.value)}
              >
                {roles.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.name}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}

            <FormControlLabel
              control={
                <Switch
                  checked={fullAccess}
                  onChange={(_e, checked) => setFullAccess(checked)}
                />
              }
              label="Full access (all process functions)"
            />

            <Autocomplete
              multiple
              disabled={fullAccess}
              options={departments}
              getOptionLabel={(o) => o.name}
              value={departments.filter((d) => departmentIds.includes(d.id))}
              onChange={(_e, value) => setDepartmentIds(value.map((v) => v.id))}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Process function scope"
                  helperText={
                    fullAccess
                      ? 'Full access includes all folders'
                      : 'Limit BPM explorer to selected process functions'
                  }
                />
              )}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={enabled}
                  onChange={(_e, checked) => setEnabled(checked)}
                />
              }
              label="Account enabled"
            />

            <Typography variant="subtitle2">Module permissions</Typography>
            {permissionLabels.map((item) => (
              <FormControlLabel
                key={item.key}
                control={
                  <Switch
                    checked={fullAccess || permissionKeys.includes(item.key)}
                    disabled={fullAccess}
                    onChange={(_e, checked) => togglePermission(item.key, checked)}
                  />
                }
                label={item.label}
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void onSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save to server'}
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardContent>
  );
}
