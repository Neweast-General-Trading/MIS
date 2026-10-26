import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import Autocomplete from '@mui/material/Autocomplete';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';

import { useCompanies } from 'src/sections/bpm/companies';
import { matchesTableSearch } from 'src/sections/bpm/table-search.util';
import { invalidateApplicationOptionsCache } from 'src/sections/bpm/use-application-options';
import {
  BpmTableCard,
  BpmTablePagination,
  useBpmTablePagination,
} from 'src/sections/bpm/components/bpm-table-kit';
import {
  APPLICATION_HOSTING,
  APPLICATION_STATUSES,
  APPLICATION_CATEGORIES,
  APPLICATION_STATUS_TONE,
} from 'src/sections/bpm/application-master.constants';
import {
  createApplication,
  deleteApplication,
  fetchApplications,
  updateApplication,
  type ApplicationRecord,
  type ApplicationPayload,
} from 'src/sections/bpm/api';

// ----------------------------------------------------------------------

const C = {
  ink: '#1C252E',
  soft: '#637381',
  line: 'rgba(145, 158, 171, 0.2)',
  red: '#ED1C24',
};

type FormState = {
  name: string;
  vendor: string;
  category: string;
  hosting: string;
  status: string;
  description: string;
  businessOwner: string;
  itOwner: string;
  url: string;
  companyCodes: string[];
};

const EMPTY_FORM: FormState = {
  name: '',
  vendor: '',
  category: 'Other',
  hosting: 'Cloud',
  status: 'Active',
  description: '',
  businessOwner: '',
  itOwner: '',
  url: '',
  companyCodes: [],
};

/** Adds https:// when the user typed a bare domain; returns null when it is not a usable URL. */
function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return '';
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.hostname.includes('.') ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Box
      sx={{
        flex: '1 1 160px',
        px: 2,
        py: 1.5,
        borderRadius: 2,
        bgcolor: 'background.paper',
        border: `1px solid ${C.line}`,
      }}
    >
      <Typography variant="caption" sx={{ color: C.soft, fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography sx={{ color: C.ink, fontWeight: 800, fontSize: 26, lineHeight: 1.15, mt: 0.25 }}>
        {value}
      </Typography>
      {hint ? (
        <Typography variant="caption" sx={{ color: C.soft }}>
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone = APPLICATION_STATUS_TONE[status] ?? APPLICATION_STATUS_TONE.Retired;
  return (
    <Chip
      size="small"
      label={status}
      sx={{ bgcolor: tone.bg, color: tone.fg, fontWeight: 700, height: 22 }}
    />
  );
}

export function ApplicationMasterView() {
  const { companies } = useCompanies();
  const [apps, setApps] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApplicationRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const companyOptions = useMemo(
    () =>
      companies.map((company) => ({
        code: (company.bpmCode ?? company.code).trim().toUpperCase(),
        label: company.name?.trim() || company.code,
      })),
    [companies]
  );
  const labelOfCompany = (code: string) =>
    companyOptions.find((item) => item.code === code)?.label ?? code;

  useEffect(() => {
    fetchApplications()
      .then(setApps)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      apps.filter(
        (app) =>
          (categoryFilter === 'all' || app.category === categoryFilter) &&
          (statusFilter === 'all' || app.status === statusFilter) &&
          (companyFilter === 'all' || app.companyCodes.includes(companyFilter)) &&
          matchesTableSearch(
            search,
            app.name,
            app.vendor,
            app.category,
            app.description,
            app.businessOwner,
            app.itOwner,
            app.companyCodes.join(' ')
          )
      ),
    [apps, categoryFilter, statusFilter, companyFilter, search]
  );
  const pagination = useBpmTablePagination(filtered, 10);

  const stats = useMemo(
    () => ({
      total: apps.length,
      active: apps.filter((a) => a.status === 'Active').length,
      cloud: apps.filter((a) => a.hosting === 'Cloud').length,
      categories: new Set(apps.map((a) => a.category)).size,
    }),
    [apps]
  );

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (app: ApplicationRecord) => {
    setEditing(app);
    setForm({
      name: app.name,
      vendor: app.vendor ?? '',
      category: app.category,
      hosting: app.hosting,
      status: app.status,
      description: app.description ?? '',
      businessOwner: app.businessOwner ?? '',
      itOwner: app.itOwner ?? '',
      url: app.url ?? '',
      companyCodes: app.companyCodes,
    });
    setFormError('');
    setDialogOpen(true);
  };

  const patch = (change: Partial<FormState>) => setForm((prev) => ({ ...prev, ...change }));

  const onSave = async () => {
    const name = form.name.trim();
    if (name.length < 2) {
      setFormError('Application name is required.');
      return;
    }
    const url = normalizeUrl(form.url);
    if (url === null) {
      setFormError('The link does not look like a valid web address.');
      return;
    }
    const payload: ApplicationPayload = {
      name,
      vendor: form.vendor.trim(),
      category: form.category,
      hosting: form.hosting,
      status: form.status,
      description: form.description.trim(),
      businessOwner: form.businessOwner.trim(),
      itOwner: form.itOwner.trim(),
      url,
      companyCodes: form.companyCodes,
    };
    setSaving(true);
    try {
      const saved = editing
        ? await updateApplication(editing.id, payload)
        : await createApplication(payload);
      invalidateApplicationOptionsCache();
      setApps((prev) =>
        editing
          ? prev.map((item) => (item.id === saved.id ? saved : item))
          : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
      );
      setDialogOpen(false);
      setError('');
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (app: ApplicationRecord) => {
    if (!window.confirm(`Delete the application "${app.name}"?`)) return;
    try {
      await deleteApplication(app.id);
      invalidateApplicationOptionsCache();
      setApps((prev) => prev.filter((item) => item.id !== app.id));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <DashboardContent>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ sm: 'center' }}
          spacing={2}
        >
          <Box>
            <Typography variant="h4">Application Master</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              The applications and systems used across the company: who owns them, where they are
              hosted, and which companies use them.
            </Typography>
          </Box>
          <Button
            variant="contained"
            onClick={openCreate}
            startIcon={<Iconify icon="mingcute:add-line" width={18} />}
          >
            Add application
          </Button>
        </Stack>

        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.5}>
          <Kpi label="Applications" value={stats.total} />
          <Kpi
            label="Active"
            value={stats.active}
            hint={`${stats.total - stats.active} not active`}
          />
          <Kpi label="Cloud-hosted" value={stats.cloud} />
          <Kpi label="Categories in use" value={stats.categories} />
        </Stack>

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
          <TextField
            select
            size="small"
            label="Category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="all">All categories</MenuItem>
            {APPLICATION_CATEGORIES.map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="all">All statuses</MenuItem>
            {APPLICATION_STATUSES.map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Company"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">All companies</MenuItem>
            {companyOptions.map((item) => (
              <MenuItem key={item.code} value={item.code}>
                {item.code}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <BpmTableCard
          searchLabel="Search applications"
          searchPlaceholder="Name, vendor, owner, company…"
          searchValue={search}
          onSearchChange={setSearch}
          totalLabel={`${filtered.length} application(s)`}
          footer={
            <BpmTablePagination
              page={pagination.page}
              rowsPerPage={pagination.rowsPerPage}
              total={pagination.total}
              onPageChange={pagination.setPage}
              onRowsPerPageChange={pagination.setRowsPerPage}
            />
          }
        >
          <TableHead>
            <TableRow>
              <TableCell>Application</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Hosting</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Used by</TableCell>
              <TableCell>Owners</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagination.pageRows.map((app) => (
              <TableRow key={app.id} hover>
                <TableCell sx={{ minWidth: 220 }}>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <Typography variant="subtitle2" sx={{ color: C.ink, fontWeight: 700 }}>
                      {app.name}
                    </Typography>
                    {app.url ? (
                      <Tooltip title={`Open ${app.url}`}>
                        <IconButton
                          size="small"
                          component="a"
                          href={app.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${app.name}`}
                          sx={{ p: 0.25 }}
                        >
                          <Iconify icon="eva:arrow-ios-forward-fill" width={16} />
                        </IconButton>
                      </Tooltip>
                    ) : null}
                  </Stack>
                  {app.vendor ? (
                    <Typography variant="caption" sx={{ color: C.soft }}>
                      {app.vendor}
                    </Typography>
                  ) : null}
                  {app.description ? (
                    <Typography
                      variant="caption"
                      sx={{
                        color: C.soft,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        maxWidth: 360,
                      }}
                    >
                      {app.description}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell>{app.category}</TableCell>
                <TableCell>{app.hosting}</TableCell>
                <TableCell>
                  <StatusChip status={app.status} />
                </TableCell>
                <TableCell sx={{ minWidth: 150 }}>
                  {app.companyCodes.length ? (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {app.companyCodes.slice(0, 3).map((code) => (
                        <Tooltip key={code} title={labelOfCompany(code)}>
                          <Chip size="small" variant="outlined" label={code} sx={{ height: 22 }} />
                        </Tooltip>
                      ))}
                      {app.companyCodes.length > 3 ? (
                        <Tooltip title={app.companyCodes.slice(3).join(', ')}>
                          <Chip
                            size="small"
                            label={`+${app.companyCodes.length - 3}`}
                            sx={{ height: 22 }}
                          />
                        </Tooltip>
                      ) : null}
                    </Stack>
                  ) : (
                    <Typography variant="caption" sx={{ color: C.soft }}>
                      Not set
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ minWidth: 150 }}>
                  {app.businessOwner || app.itOwner ? (
                    <Stack spacing={0.25}>
                      {app.businessOwner ? (
                        <Typography variant="caption" sx={{ color: C.ink }}>
                          <Box component="span" sx={{ color: C.soft }}>
                            Business:{' '}
                          </Box>
                          {app.businessOwner}
                        </Typography>
                      ) : null}
                      {app.itOwner ? (
                        <Typography variant="caption" sx={{ color: C.ink }}>
                          <Box component="span" sx={{ color: C.soft }}>
                            IT:{' '}
                          </Box>
                          {app.itOwner}
                        </Typography>
                      ) : null}
                    </Stack>
                  ) : (
                    <Typography variant="caption" sx={{ color: C.soft }}>
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => openEdit(app)}>
                        <Iconify icon="solar:pen-bold" width={18} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => void onDelete(app)}>
                        <Iconify icon="solar:trash-bin-trash-bold" width={18} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!pagination.total ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                  {loading
                    ? 'Loading applications…'
                    : apps.length
                      ? 'No application matches these filters.'
                      : 'No applications yet. Add the first application your company uses.'}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </BpmTableCard>
      </Stack>

      <Dialog
        open={dialogOpen}
        onClose={() => (saving ? undefined : setDialogOpen(false))}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{editing ? 'Edit application' : 'Add application'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {formError ? <Alert severity="error">{formError}</Alert> : null}
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              }}
            >
              <TextField
                label="Application name"
                required
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                autoFocus
              />
              <TextField
                label="Vendor"
                placeholder="e.g. SAP, Microsoft, Oracle"
                value={form.vendor}
                onChange={(e) => patch({ vendor: e.target.value })}
              />
              <TextField
                select
                label="Category"
                value={form.category}
                onChange={(e) => patch({ category: e.target.value })}
              >
                {APPLICATION_CATEGORIES.map((item) => (
                  <MenuItem key={item} value={item}>
                    {item}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row" spacing={2}>
                <TextField
                  select
                  fullWidth
                  label="Hosting"
                  value={form.hosting}
                  onChange={(e) => patch({ hosting: e.target.value })}
                >
                  {APPLICATION_HOSTING.map((item) => (
                    <MenuItem key={item} value={item}>
                      {item}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  fullWidth
                  label="Status"
                  value={form.status}
                  onChange={(e) => patch({ status: e.target.value })}
                >
                  {APPLICATION_STATUSES.map((item) => (
                    <MenuItem key={item} value={item}>
                      {item}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              <TextField
                label="Business owner"
                placeholder="Person or team accountable for the business use"
                value={form.businessOwner}
                onChange={(e) => patch({ businessOwner: e.target.value })}
              />
              <TextField
                label="IT owner"
                placeholder="Person or team that supports it"
                value={form.itOwner}
                onChange={(e) => patch({ itOwner: e.target.value })}
              />
            </Box>
            <Autocomplete
              multiple
              options={companyOptions.map((item) => item.code)}
              value={form.companyCodes}
              onChange={(_, value) => patch({ companyCodes: value })}
              getOptionLabel={(code) =>
                labelOfCompany(code) === code ? code : `${code} — ${labelOfCompany(code)}`
              }
              renderTags={(value, getTagProps) =>
                value.map((code, index) => (
                  <Chip size="small" label={code} {...getTagProps({ index })} key={code} />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Used by companies"
                  placeholder={form.companyCodes.length ? '' : 'Select the companies that use it'}
                />
              )}
            />
            <TextField
              label="Link"
              placeholder="https://…"
              value={form.url}
              onChange={(e) => patch({ url: e.target.value })}
            />
            <TextField
              label="Description"
              multiline
              minRows={3}
              placeholder="What the company uses it for"
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void onSave()} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add application'}
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardContent>
  );
}
