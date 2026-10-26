import type { IconifyName } from 'src/components/iconify';

import { hasPermission, type AccessProfile, canManageCompanies, isSuperAdminProfile } from 'src/sections/bpm/access-control';

// ----------------------------------------------------------------------

export type NavItem = {
  title: string;
  path: string;
  icon: IconifyName;
  info?: React.ReactNode;
  disabled?: boolean;
  /** When `prefix`, item is active if pathname equals path or starts with `${path}/`. */
  pathMatch?: 'exact' | 'prefix';
};

export type NavSection = {
  subheader: string;
  items: NavItem[];
};

export const getNavSections = (profile: AccessProfile): NavSection[] => {
  const sections: NavSection[] = [];
  const showCompanySetup = canManageCompanies(profile);

  const workspace: NavItem[] = [];
  if (hasPermission(profile, 'departments')) {
    workspace.push({
      title: 'Companies',
      path: '/companies',
      icon: 'solar:home-angle-bold-duotone',
      pathMatch: 'prefix',
    });
    workspace.push({
      title: 'Process Functions',
      path: '/departments',
      icon: 'solar:cart-3-bold',
    });
  }
  if (hasPermission(profile, 'processes')) {
    workspace.push({
      title: 'Processes',
      path: '/processes',
      icon: 'solar:share-bold',
    });
  }
  if (hasPermission(profile, 'activities')) {
    workspace.push({
      title: 'Sub-processes',
      path: '/departments',
      icon: 'ic:round-filter-list',
    });
  }
  if (workspace.length) {
    sections.push({ subheader: 'BPM workspace', items: workspace });
  }

  if (isSuperAdminProfile(profile)) {
    sections.push({
      subheader: 'Documentation & automation',
      items: [
        {
          title: 'Process documentation',
          path: '/process-documentation',
          icon: 'solar:eye-bold',
        },
        {
          title: 'Automation BPM',
          path: '/ai-bpm-generate',
          icon: 'solar:restart-bold',
        },
      ],
    });

    sections.push({
      subheader: 'Administration',
      items: [
        ...(showCompanySetup
          ? [{ title: 'Companies setup', path: '/companies', icon: 'solar:home-angle-bold-duotone' as IconifyName, pathMatch: 'prefix' as const }]
          : []),
        { title: 'Users', path: '/users-management', icon: 'solar:shield-keyhole-bold-duotone' },
        {
          title: 'Users permission',
          path: '/users-permission',
          icon: 'solar:settings-bold-duotone',
        },
        { title: 'Roles', path: '/users-role', icon: 'solar:bell-bing-bold-duotone' },
        {
          title: 'Sub-process templates',
          path: '/activities-master',
          icon: 'custom:menu-duotone',
        },
        {
          title: 'Application master',
          path: '/administration/application-master',
          icon: 'custom:apps-bold',
        },
        { title: 'Attachments', path: '/administration/attachments', icon: 'solar:share-bold' },
        { title: 'BPM DOCX', path: '/administration/bpm-docx', icon: 'solar:pen-bold' },
        {
          title: 'Backup logs',
          path: '/administration/backup-logs',
          icon: 'solar:clock-circle-outline',
        },
        {
          title: 'Health check',
          path: '/administration/health-check',
          icon: 'solar:check-circle-bold',
        },
        {
          title: 'BPM data reset',
          path: '/administration/bpm-data-reset',
          icon: 'solar:trash-bin-trash-bold',
        },
      ],
    });

    sections.push({
      subheader: 'Logs',
      items: [
        {
          title: 'User activity',
          path: '/administration/user-log',
          icon: 'solar:shield-keyhole-bold-duotone',
        },
        {
          title: 'Assistant inquiries',
          path: '/administration/assistant-inquiries',
          icon: 'solar:chat-round-dots-bold',
        },
        {
          title: 'BPM vs SQL',
          path: '/administration/master-data-comparison',
          icon: 'solar:document-bold',
        },
      ],
    });
  }

  return sections;
};

/** Flat list for search or legacy use. */
export const getNavData = (profile: AccessProfile): NavItem[] =>
  getNavSections(profile).flatMap((section) => section.items);
