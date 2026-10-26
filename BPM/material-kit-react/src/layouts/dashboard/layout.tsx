import type { Breakpoint } from '@mui/material/styles';

import { merge } from 'es-toolkit';
import { varAlpha } from 'minimal-shared/utils';
import { useBoolean } from 'minimal-shared/hooks';
import { useMemo, useState, useCallback } from 'react';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';

import { _langs } from 'src/_mock';

import { Iconify } from 'src/components/iconify';

import { useAccessProfile } from 'src/sections/bpm/access-control';
import { BpmAssistantPanel } from 'src/sections/bpm/components/bpm-assistant-panel';

import { NavMobile, NavDesktop } from './nav';
import { layoutClasses } from '../core/classes';
import { _account } from '../nav-config-account';
import { dashboardLayoutVars } from './css-vars';
import { MainSection } from '../core/main-section';
import { BpmSidebarTree } from './bpm-sidebar-tree';
import { Searchbar } from '../components/searchbar';
import { MenuButton } from '../components/menu-button';
import { HeaderSection } from '../core/header-section';
import { LayoutSection } from '../core/layout-section';
import { getNavSections } from '../nav-config-dashboard';
import { AccountPopover } from '../components/account-popover';
import { LanguagePopover } from '../components/language-popover';
import { MaintenanceBanner } from '../components/maintenance-banner';

import type { MainSectionProps } from '../core/main-section';
import type { HeaderSectionProps } from '../core/header-section';
import type { LayoutSectionProps } from '../core/layout-section';

// ----------------------------------------------------------------------

const NAV_VISIBLE_STORAGE_KEY = 'bpm-desktop-nav-expanded';

function readNavExpandedPreference(): boolean {
  try {
    const raw = localStorage.getItem(NAV_VISIBLE_STORAGE_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch {
    /* ignore */
  }
  return true;
}

type LayoutBaseProps = Pick<LayoutSectionProps, 'sx' | 'children' | 'cssVars'>;

export type DashboardLayoutProps = LayoutBaseProps & {
  layoutQuery?: Breakpoint;
  slotProps?: {
    header?: HeaderSectionProps;
    main?: MainSectionProps;
  };
};

export function DashboardLayout({
  sx,
  cssVars,
  children,
  slotProps,
  layoutQuery = 'lg',
}: DashboardLayoutProps) {
  const theme = useTheme();
  const accessProfile = useAccessProfile();
  const navSections = getNavSections(accessProfile);

  const { value: open, onFalse: onClose, onTrue: onOpen } = useBoolean();

  const [desktopNavExpanded, setDesktopNavExpanded] = useState(readNavExpandedPreference);

  const toggleDesktopNav = useCallback(() => {
    setDesktopNavExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(NAV_VISIBLE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const navSlots = useMemo(
    () => ({
      bottomArea: <BpmSidebarTree placement="top" />,
    }),
    [],
  );

  const renderHeader = () => {
    const headerSlotProps: HeaderSectionProps['slotProps'] = {
      container: {
        maxWidth: false,
      },
    };

    const headerSlots: HeaderSectionProps['slots'] = {
      topArea: <MaintenanceBanner />,
      leftArea: (
        <>
          {/** @slot Nav mobile */}
          <MenuButton
            onClick={onOpen}
            sx={{ mr: 1, ml: -1, [theme.breakpoints.up(layoutQuery)]: { display: 'none' } }}
          />
          <Tooltip title={desktopNavExpanded ? 'Hide sidebar' : 'Show sidebar'}>
            <IconButton
              aria-label={desktopNavExpanded ? 'Hide sidebar' : 'Show sidebar'}
              onClick={toggleDesktopNav}
              sx={(t) => ({
                display: { xs: 'none', [t.breakpoints.up(layoutQuery)]: 'inline-flex' },
                mr: 0.5,
                border: `1px solid ${varAlpha(t.vars.palette.grey['500Channel'], 0.24)}`,
                borderRadius: 1,
                bgcolor: varAlpha(t.vars.palette.grey['500Channel'], 0.06),
              })}
            >
              <Iconify
                icon={desktopNavExpanded ? 'eva:arrow-ios-forward-fill' : 'custom:menu-duotone'}
                width={22}
                sx={desktopNavExpanded ? { transform: 'scaleX(-1)' } : undefined}
              />
            </IconButton>
          </Tooltip>
          <NavMobile sections={navSections} open={open} onClose={onClose} slots={navSlots} />
        </>
      ),
      rightArea: (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0, sm: 0.75 } }}>
          {/** @slot Searchbar */}
          <Searchbar />

          {/** @slot Language popover */}
          <LanguagePopover data={_langs} />

          {/** @slot Account drawer */}
          <AccountPopover data={_account} />
        </Box>
      ),
    };

    return (
      <HeaderSection
        disableElevation
        layoutQuery={layoutQuery}
        {...slotProps?.header}
        slots={{ ...headerSlots, ...slotProps?.header?.slots }}
        slotProps={merge(headerSlotProps, slotProps?.header?.slotProps ?? {})}
        sx={slotProps?.header?.sx}
      />
    );
  };

  const renderFooter = () => null;

  const renderMain = () => <MainSection {...slotProps?.main}>{children}</MainSection>;

  return (
    <LayoutSection
      headerSection={renderHeader()}
      sidebarSection={
        <NavDesktop
          sections={navSections}
          layoutQuery={layoutQuery}
          slots={navSlots}
          collapsed={!desktopNavExpanded}
          onToggleNav={toggleDesktopNav}
        />
      }
      footerSection={renderFooter()}
      cssVars={{ ...dashboardLayoutVars(theme), ...cssVars }}
      sx={[
        {
          [`& .${layoutClasses.sidebarContainer}`]: {
            [theme.breakpoints.up(layoutQuery)]: {
              pl: desktopNavExpanded
                ? 'var(--layout-nav-vertical-width)'
                : 'var(--layout-nav-collapsed-width)',
              transition: theme.transitions.create(['padding-left'], {
                easing: 'var(--layout-transition-easing)',
                duration: 'var(--layout-transition-duration)',
              }),
            },
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {renderMain()}
      <BpmAssistantPanel />
    </LayoutSection>
  );
}
