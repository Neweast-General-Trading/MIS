import type { Theme, SxProps, Breakpoint } from '@mui/material/styles';

import { useEffect } from 'react';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import ListItem from '@mui/material/ListItem';
import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ListItemButton from '@mui/material/ListItemButton';
import Drawer, { drawerClasses } from '@mui/material/Drawer';

import { usePathname } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { Logo } from 'src/components/logo';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';

import type { NavItem, NavSection } from '../nav-config-dashboard';

// ----------------------------------------------------------------------

export type NavContentProps = {
  sections: NavSection[];
  slots?: {
    topArea?: React.ReactNode;
    bottomArea?: React.ReactNode;
  };
  sx?: SxProps<Theme>;
  collapsed?: boolean;
  onToggleNav?: () => void;
};

function NavIconBox({
  icon,
  active,
}: {
  icon: NavItem['icon'];
  active: boolean;
}) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        width: 36,
        height: 36,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 1.25,
        transition: theme.transitions.create(['background-color', 'color', 'box-shadow'], {
          duration: theme.transitions.duration.shorter,
        }),
        color: active ? theme.vars.palette.primary.main : theme.vars.palette.text.secondary,
        bgcolor: active
          ? varAlpha(theme.vars.palette.primary.mainChannel, 0.12)
          : varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
        ...(active && {
          boxShadow: `0 0 0 1px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.24)}`,
        }),
      }}
    >
      <Iconify icon={icon} width={22} />
    </Box>
  );
}

function isNavItemActive(pathname: string, item: NavItem) {
  const matchMode = item.pathMatch ?? 'exact';
  return matchMode === 'prefix'
    ? pathname === item.path || pathname.startsWith(`${item.path}/`)
    : pathname === item.path;
}

export function NavDesktop({
  sx,
  sections,
  slots,
  layoutQuery,
  collapsed = false,
  onToggleNav,
}: NavContentProps & { layoutQuery: Breakpoint }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        pt: 2,
        px: collapsed ? 1 : 2,
        top: 0,
        left: 0,
        height: 1,
        display: 'none',
        position: 'fixed',
        flexDirection: 'column',
        zIndex: 'var(--layout-nav-zIndex)',
        width: collapsed
          ? 'var(--layout-nav-collapsed-width)'
          : 'var(--layout-nav-vertical-width)',
        borderRight: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
        bgcolor: 'background.paper',
        transition: theme.transitions.create(['width', 'padding'], {
          duration: 'var(--layout-transition-duration)',
          easing: 'var(--layout-transition-easing)',
        }),
        [theme.breakpoints.up(layoutQuery)]: {
          display: 'flex',
        },
        ...sx,
      }}
    >
      <NavContent
        sections={sections}
        slots={slots}
        collapsed={collapsed}
        onToggleNav={onToggleNav}
      />
    </Box>
  );
}

// ----------------------------------------------------------------------

export function NavMobile({
  sx,
  sections,
  open,
  slots,
  onClose,
}: NavContentProps & { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  useEffect(() => {
    if (open) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      sx={{
        [`& .${drawerClasses.paper}`]: {
          pt: 2,
          px: 2,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          width: 'var(--layout-nav-mobile-width)',
          bgcolor: 'background.paper',
          ...sx,
        },
      }}
    >
      <NavContent sections={sections} slots={slots} />
    </Drawer>
  );
}

// ----------------------------------------------------------------------

export function NavContent({ sections, slots, sx, collapsed = false, onToggleNav }: NavContentProps) {
  const theme = useTheme();
  const pathname = usePathname();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 auto',
        minHeight: 0,
        height: 1,
        width: 1,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 0.75,
          width: 1,
          pb: 1.5,
          flexShrink: 0,
        }}
      >
        {!collapsed ? (
          <Logo isSingle={false} sx={{ width: 200, height: 40, flex: '1 1 auto', minWidth: 0 }} />
        ) : null}
        {onToggleNav ? (
          <Tooltip title={collapsed ? 'Show sidebar' : 'Hide sidebar'}>
            <IconButton
              size="small"
              aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
              onClick={onToggleNav}
              sx={{
                mt: collapsed ? 0.5 : 0.25,
                flexShrink: 0,
                border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.24)}`,
                borderRadius: 1,
                bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.06),
              }}
            >
              <Iconify
                icon="eva:arrow-ios-forward-fill"
                width={20}
                sx={collapsed ? undefined : { transform: 'scaleX(-1)' }}
              />
            </IconButton>
          </Tooltip>
        ) : null}
      </Box>

      {!collapsed ? (
        <>
          {slots?.topArea}

          {slots?.bottomArea ? (
            <Box
              sx={{
                flex: '0 1 auto',
                minHeight: 160,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                mx: -2,
                px: 2,
                pt: 0.5,
                pb: 1,
                mb: 0.5,
                borderBottom: `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
                bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.04),
              }}
            >
              {slots.bottomArea}
            </Box>
          ) : null}

          <Scrollbar fillContent={false} sx={{ flex: '1 1 0', minHeight: 150 }}>
            <Box
              component="nav"
              sx={[
                {
                  display: 'flex',
                  flexDirection: 'column',
                  py: 0.5,
                },
                ...(Array.isArray(sx) ? sx : [sx]),
              ]}
            >
              {sections.map((section, sectionIndex) => (
                <Box key={section.subheader} sx={{ mb: sectionIndex < sections.length - 1 ? 1.5 : 0 }}>
                  <Typography
                    variant="overline"
                    sx={{
                      px: 1.5,
                      py: 0.75,
                      display: 'block',
                      color: 'text.disabled',
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 1.2,
                      lineHeight: 1.6,
                    }}
                  >
                    {section.subheader}
                  </Typography>

                  <Box
                    component="ul"
                    sx={{
                      m: 0,
                      p: 0,
                      listStyle: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                    }}
                  >
                    {section.items.map((item) => {
                      const active = isNavItemActive(pathname, item);

                      return (
                        <ListItem disableGutters disablePadding key={`${item.path}-${item.title}`}>
                          <ListItemButton
                            disableGutters
                            component={RouterLink}
                            href={item.path}
                            disabled={item.disabled}
                            sx={{
                              px: 1,
                              py: 0.75,
                              gap: 1.25,
                              borderRadius: 1.5,
                              typography: 'body2',
                              fontWeight: active ? 600 : 500,
                              color: active ? 'primary.main' : 'text.secondary',
                              minHeight: 48,
                              transition: theme.transitions.create(['background-color', 'color'], {
                                duration: theme.transitions.duration.shorter,
                              }),
                              '&:hover': {
                                bgcolor: varAlpha(
                                  active
                                    ? theme.vars.palette.primary.mainChannel
                                    : theme.vars.palette.grey['500Channel'],
                                  active ? 0.12 : 0.08,
                                ),
                                color: active ? 'primary.main' : 'text.primary',
                              },
                              ...(active && {
                                bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.08),
                              }),
                            }}
                          >
                            <NavIconBox icon={item.icon} active={active} />

                            <Box component="span" sx={{ flexGrow: 1, lineHeight: 1.35 }}>
                              {item.title}
                            </Box>

                            {item.info ? item.info : null}
                          </ListItemButton>
                        </ListItem>
                      );
                    })}
                  </Box>
                </Box>
              ))}
            </Box>
          </Scrollbar>
        </>
      ) : null}
    </Box>
  );
}
