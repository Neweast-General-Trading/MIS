import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import Dialog from '@mui/material/Dialog';
import TableRow from '@mui/material/TableRow';
import MenuItem from '@mui/material/MenuItem';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import Autocomplete from '@mui/material/Autocomplete';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import TableContainer from '@mui/material/TableContainer';
import FormControlLabel from '@mui/material/FormControlLabel';

import { DashboardContent } from 'src/layouts/dashboard';

import { matchesTableSearch } from 'src/sections/bpm/table-search.util';
import {
  type AccessRole,
  type AccessUser,
  createAccessUser,
  fetchAccessRoles,
  fetchAccessUsers,
  fetchDepartments,
  updateAccessUser,
} from 'src/sections/bpm/api';

type DepartmentOption = { id: string; name: string };

/** Explorer folder scope shown in the table: explicit department assignments override role-level full access. */
function explorerScopeLabel(user: AccessUser, departmentMap: Map<string, string>): string {
  const ids = user.departmentIds ?? [];
  if (ids.length > 0) {
    return ids.map((id) => departmentMap.get(id) ?? id).join(', ');
  }
  if (user.fullAccess || (user.roleFullAccess ?? false)) {
    return 'All modules';
  }
  return '-';
}

export function UsersManagementView() {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [fullAccess, setFullAccess] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [saveError, setSaveError] = useState('');
  const [tableSearch, setTableSearch] = useState('');

  const departmentMap = useMemo(() => new Map(departments.map((item) => [item.id, item.name])), [departments]);

  const selectedRoleFullAccess = useMemo(
    () => roles.find((r) => r.id === roleId)?.fullAccess ?? false,
    [roles, roleId],
  );

  const filteredUsers = useMemo(() => {
    if (!tableSearch.trim()) return users;
    return users.filter((user) => {
      const scope = explorerScopeLabel(user, departmentMap).toLowerCase();
      return matchesTableSearch(
        tableSearch,
        user.displayName,
        user.email,
        user.roleName,
        scope,
      );
    });
  }, [users, tableSearch, departmentMap]);

  const loadAll = () => {
    setLoading(true);
    Promise.all([fetchAccessUsers(), fetchAccessRoles(), fetchDepartments()])
      .then(([usersData, rolesData, departmentsData]) => {
        setUsers(usersData);
        setRoles(rolesData);
        setDepartments(departmentsData.map((item) => ({ id: item.id, name: item.name })));
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openCreate = () => {
    setEditUserId(null);
    setDisplayName('');
    setEmail('');
    setRoleId(roles[0]?.id ?? '');
    setFullAccess(false);
    setEnabled(true);
    setDepartmentIds([]);
    setPassword('');
    setSaveError('');
    setDialogOpen(true);
  };

  const openEdit = (user: AccessUser) => {
    setEditUserId(user.id);
    setDisplayName(user.displayName);
    setEmail(user.email);
    setRoleId(user.roleId);
    setFullAccess(user.fullAccess);
    setEnabled(user.enabled !== false);
    setDepartmentIds(user.departmentIds ?? []);
    setPassword('');
    setSaveError('');
    setDialogOpen(true);
  };

  const onSave = async () => {
    if (!displayName.trim() || !email.trim() || !roleId) {
      setSaveError('Display name, email, and role are required.');
      return;
    }
    if (!editUserId && password.trim().length < 6) {
      setSaveError('Password is required and must be at least 6 characters.');
      return;
    }
    try {
      const payload = {
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        roleId,
        fullAccess,
        enabled,
        departmentIds: fullAccess ? [] : departmentIds,
        ...(password.trim() ? { password: password.trim() } : {}),
      };
      if (editUserId) {
        await updateAccessUser(editUserId, payload);
      } else {
        await createAccessUser(payload);
      }
      setDialogOpen(false);
      loadAll();
    } catch (err) {
      setSaveError((err as Error).message);
    }
  };

  const toggleEnabled = async (user: AccessUser, nextEnabled: boolean) => {
    try {
      await updateAccessUser(user.id, {
        email: user.email,
        displayName: user.displayName,
        roleId: user.roleId,
        fullAccess: user.fullAccess,
        departmentIds: user.departmentIds ?? [],
        enabled: nextEnabled,
      });
      setUsers((prev) =>
        prev.map((item) => (item.id === user.id ? { ...item, enabled: nextEnabled } : item))
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <DashboardContent maxWidth={false}>
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h4">Users</Typography>
          <Button variant="contained" onClick={openCreate}>
            New User
          </Button>
        </Box>

        <Card>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2, alignItems: 'center' }}>
            <TextField
              size="small"
              label="Search users"
              placeholder="Name, email, role, scope…"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 220 }}
            />
            <Typography variant="caption" color="text.secondary">
              {filteredUsers.length} user(s)
            </Typography>
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Access Scope</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 4, textAlign: 'center' }}>
                      Loading users...
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  filteredUsers.map((user) => (
                    <TableRow key={user.id} hover>
                      <TableCell>{user.displayName}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.roleName}</TableCell>
                      <TableCell>
                        <FormControlLabel
                          control={
                            <Switch
                              size="small"
                              checked={user.enabled !== false}
                              onChange={(_e, checked) => void toggleEnabled(user, checked)}
                            />
                          }
                          label={user.enabled !== false ? 'Active' : 'Disabled'}
                        />
                      </TableCell>
                      <TableCell>{explorerScopeLabel(user, departmentMap)}</TableCell>
                      <TableCell align="right">
                        <Button size="small" variant="outlined" onClick={() => openEdit(user)}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                {!loading && !filteredUsers.length && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 4, textAlign: 'center' }}>
                      {users.length ? 'No users match your search.' : 'No users defined yet.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>

        {error && <Alert severity="error">{error}</Alert>}

        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
          <DialogTitle>{editUserId ? 'Edit User' : 'Create User'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                fullWidth
                label="Display Name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
              <TextField fullWidth label="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
              <TextField
                select
                fullWidth
                label="Role"
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
              >
                {roles
                  .filter((role) => role.enabled !== false)
                  .map((role) => (
                    <MenuItem key={role.id} value={role.id}>
                      {role.name}
                    </MenuItem>
                  ))}
              </TextField>
              <FormControlLabel
                control={<Switch checked={fullAccess} onChange={(_e, checked) => setFullAccess(checked)} />}
                label="Full access on all modules (user override)"
              />
              {selectedRoleFullAccess && (
                <Alert severity="info">
                  This role has broad permissions. Assign process functions below to restrict which folders this user sees
                  in the explorer — assignments apply even when the role is Admin.
                </Alert>
              )}
              <FormControlLabel
                control={<Switch checked={enabled} onChange={(_e, checked) => setEnabled(checked)} />}
                label={enabled ? 'Account active' : 'Account disabled'}
              />
              <Autocomplete
                multiple
                options={departments}
                getOptionLabel={(option) => option.name}
                value={departments.filter((item) => departmentIds.includes(item.id))}
                disabled={fullAccess}
                onChange={(_event, value) => setDepartmentIds(value.map((item) => item.id))}
                renderInput={(params) => (
                  <TextField {...params} label="Process function assignments" placeholder="Assign process functions" />
                )}
              />
              <TextField
                fullWidth
                label={editUserId ? 'New Password (optional)' : 'Password'}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                helperText={
                  editUserId
                    ? 'Leave empty to keep current password.'
                    : 'Set an initial password (minimum 6 characters).'
                }
              />
              {saveError && <Alert severity="error">{saveError}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button variant="contained" onClick={onSave}>
              Save
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </DashboardContent>
  );
}
