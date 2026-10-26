import type { RouteObject } from 'react-router';

import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import LinearProgress, { linearProgressClasses } from '@mui/material/LinearProgress';

import { AuthLayout } from 'src/layouts/auth';
import { DashboardLayout } from 'src/layouts/dashboard';

import { AuthGuard } from 'src/sections/bpm/auth-guard';
import { PermissionGuard } from 'src/sections/bpm/permission-guard';
import { SuperAdminGuard } from 'src/sections/bpm/super-admin-guard';

// ----------------------------------------------------------------------

export const DashboardPage = lazy(() => import('src/pages/dashboard'));
export const ActivitiesMasterPage = lazy(() => import('src/pages/activities-master'));
export const ApplicationMasterPage = lazy(() => import('src/pages/application-master'));
export const BlogPage = lazy(() => import('src/pages/blog'));
export const DepartmentProcessesPage = lazy(() => import('src/pages/department-processes'));
export const DepartmentsPage = lazy(() => import('src/pages/departments'));
export const CompaniesPage = lazy(() => import('src/pages/companies'));
export const CompanySettingsPage = lazy(() => import('src/pages/company-settings'));
export const CompanyDepartmentsPage = lazy(() => import('src/pages/company-departments'));
export const CompanyDashboardPage = lazy(() => import('src/pages/company-dashboard'));
export const ProcessesPage = lazy(() => import('src/pages/processes'));
export const ProcessActivitiesPage = lazy(() => import('src/pages/process-activities'));
export const ProcessActivitiesTablePage = lazy(() => import('src/pages/process-activities-table'));
export const ProcessDocumentationPage = lazy(() => import('src/pages/process-documentation'));
export const AiBpmGeneratePage = lazy(() => import('src/pages/ai-bpm-generate'));
export const UsersPermissionPage = lazy(() => import('src/pages/users-permission'));
export const UsersRolePage = lazy(() => import('src/pages/users-role'));
export const UsersManagementPage = lazy(() => import('src/pages/users-management'));
export const BpmDataResetPage = lazy(() => import('src/pages/bpm-data-reset'));
export const AttachmentsAdminPage = lazy(() => import('src/pages/attachments-admin'));
export const BackupLogsPage = lazy(() => import('src/pages/backup-logs'));
export const UserLogPage = lazy(() => import('src/pages/user-log'));
export const AssistantInquiriesPage = lazy(() => import('src/pages/assistant-inquiries'));
export const MasterDataComparisonPage = lazy(() => import('src/pages/master-data-comparison'));
export const BpmDocxPage = lazy(() => import('src/pages/bpm-docx'));
export const HealthCheckPage = lazy(() => import('src/pages/health-check'));
export const UserPage = lazy(() => import('src/pages/user'));
export const SignInPage = lazy(() => import('src/pages/sign-in'));
export const ProductsPage = lazy(() => import('src/pages/products'));
export const Page404 = lazy(() => import('src/pages/page-not-found'));

const renderFallback = () => (
  <Box
    sx={{
      display: 'flex',
      flex: '1 1 auto',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <LinearProgress
      sx={{
        width: 1,
        maxWidth: 320,
        bgcolor: (theme) => varAlpha(theme.vars.palette.text.primaryChannel, 0.16),
        [`& .${linearProgressClasses.bar}`]: { bgcolor: 'text.primary' },
      }}
    />
  </Box>
);

export const routesSection: RouteObject[] = [
  {
    element: (
      <AuthGuard>
        <DashboardLayout>
          <Suspense fallback={renderFallback()}>
            <Outlet />
          </Suspense>
        </DashboardLayout>
      </AuthGuard>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: 'activities-master',
        element: (
          <SuperAdminGuard>
            <PermissionGuard permission="activitiesTemplateMaster">
              <ActivitiesMasterPage />
            </PermissionGuard>
          </SuperAdminGuard>
        ),
      },
      {
        path: 'administration/application-master',
        element: (
          <SuperAdminGuard>
            <PermissionGuard permission="applicationMaster">
              <ApplicationMasterPage />
            </PermissionGuard>
          </SuperAdminGuard>
        ),
      },
      {
        path: 'users-permission',
        element: (
          <SuperAdminGuard>
            <PermissionGuard permission="usersPermissions">
              <UsersPermissionPage />
            </PermissionGuard>
          </SuperAdminGuard>
        ),
      },
      {
        path: 'users-management',
        element: (
          <SuperAdminGuard>
            <PermissionGuard permission="usersPermissions">
              <UsersManagementPage />
            </PermissionGuard>
          </SuperAdminGuard>
        ),
      },
      {
        path: 'administration/bpm-data-reset',
        element: (
          <SuperAdminGuard>
            <PermissionGuard permission="usersPermissions">
              <BpmDataResetPage />
            </PermissionGuard>
          </SuperAdminGuard>
        ),
      },
      {
        path: 'administration/attachments',
        element: (
          <SuperAdminGuard>
            <PermissionGuard permission="usersPermissions">
              <AttachmentsAdminPage />
            </PermissionGuard>
          </SuperAdminGuard>
        ),
      },
      {
        path: 'administration/backup-logs',
        element: (
          <SuperAdminGuard>
            <PermissionGuard permission="usersPermissions">
              <BackupLogsPage />
            </PermissionGuard>
          </SuperAdminGuard>
        ),
      },
      {
        path: 'administration/user-log',
        element: (
          <SuperAdminGuard>
            <PermissionGuard permission="usersPermissions">
              <UserLogPage />
            </PermissionGuard>
          </SuperAdminGuard>
        ),
      },
      {
        path: 'administration/assistant-inquiries',
        element: (
          <SuperAdminGuard>
            <PermissionGuard permission="usersPermissions">
              <AssistantInquiriesPage />
            </PermissionGuard>
          </SuperAdminGuard>
        ),
      },
      {
        path: 'administration/master-data-comparison',
        element: (
          <SuperAdminGuard>
            <MasterDataComparisonPage />
          </SuperAdminGuard>
        ),
      },
      {
        path: 'administration/bpm-docx',
        element: (
          <SuperAdminGuard>
            <PermissionGuard permission="usersPermissions">
              <BpmDocxPage />
            </PermissionGuard>
          </SuperAdminGuard>
        ),
      },
      {
        path: 'administration/health-check',
        element: (
          <SuperAdminGuard>
            <PermissionGuard permission="usersPermissions">
              <HealthCheckPage />
            </PermissionGuard>
          </SuperAdminGuard>
        ),
      },
      {
        path: 'users-role',
        element: (
          <SuperAdminGuard>
            <PermissionGuard permission="usersRoles">
              <UsersRolePage />
            </PermissionGuard>
          </SuperAdminGuard>
        ),
      },
      {
        path: 'departments',
        element: (
          <PermissionGuard permission="departments">
            <DepartmentsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'companies',
        element: (
          <PermissionGuard permission="departments">
            <CompaniesPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'companies/:companyCode/settings',
        element: (
          <PermissionGuard permission="departments">
            <CompanySettingsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'companies/:companyCode/dashboard',
        element: (
          <PermissionGuard permission="departments">
            <CompanyDashboardPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'companies/:companyCode/departments',
        element: (
          <PermissionGuard permission="departments">
            <CompanyDepartmentsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'processes',
        element: (
          <PermissionGuard permission="processes">
            <ProcessesPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'process-documentation',
        element: (
          <SuperAdminGuard>
            <ProcessDocumentationPage />
          </SuperAdminGuard>
        ),
      },
      {
        path: 'ai-bpm-generate',
        element: (
          <SuperAdminGuard>
            <AiBpmGeneratePage />
          </SuperAdminGuard>
        ),
      },
      {
        path: 'departments/:departmentId/processes',
        element: (
          <PermissionGuard permission="processes">
            <DepartmentProcessesPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'departments/:departmentId/processes/:processId/activities',
        element: (
          <PermissionGuard permission={['activities', 'vendorVersions']}>
            <ProcessActivitiesTablePage />
          </PermissionGuard>
        ),
      },
      {
        path: 'departments/:departmentId/processes/:processId/activities-table',
        element: (
          <PermissionGuard permission={['activities', 'vendorVersions']}>
            <ProcessActivitiesTablePage />
          </PermissionGuard>
        ),
      },
      {
        path: 'departments/:departmentId/processes/:processId/activities-editor',
        element: (
          <PermissionGuard permission={['activities', 'vendorVersions']}>
            <ProcessActivitiesPage />
          </PermissionGuard>
        ),
      },
      { path: 'user', element: <UserPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'blog', element: <BlogPage /> },
    ],
  },
  {
    path: 'sign-in',
    element: (
      <AuthLayout>
        <SignInPage />
      </AuthLayout>
    ),
  },
  {
    path: '404',
    element: <Page404 />,
  },
  { path: '*', element: <Page404 /> },
];
