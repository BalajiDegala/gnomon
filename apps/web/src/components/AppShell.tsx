import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu as MuiMenu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Bell,
  ChevronRight,
  Clock3,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useAppNavigation } from '../lib/app-navigation';
import { useAuth } from '../lib/auth';
import { useNotifications } from '../lib/notifications';
import { GnomonLogo } from './GnomonLogo';
import { TipsCompanion } from './TipsCompanion';
import { ThemeSwitcher } from './ThemeSwitcher';
import { confirmDiscardChanges } from '../lib/unsaved-changes';
import {
  type AppView,
  appViewFromPath,
  appViewPath,
  navigationGroups,
  type NavigationItem,
} from '../navigation';
import { DashboardPage } from '../pages/DashboardPage';
import { ModulePage } from '../pages/ModulePage';

const drawerWidth = 272;
const NAV_OPEN_STORAGE_KEY = 'gnomon:navigation:open';
const slideTransition = 'width 220ms ease, margin 220ms ease, transform 220ms ease';

function readNavigationOpenPreference(): boolean {
  try {
    return localStorage.getItem(NAV_OPEN_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function canSeeNavigationItem(item: NavigationItem, permissions: string[]): boolean {
  if (!item.requiredPermissions) return true;
  return item.requiredPermissions.some((permission) => permissions.includes(permission));
}

interface NavigationListProps {
  activeView: AppView;
  items: NavigationItem[];
  label: string;
  onSelect: (view: AppView) => void;
}

function NavigationList({ activeView, items, label, onSelect }: NavigationListProps) {
  if (items.length === 0) return null;

  return (
    <Box sx={{ px: 1.25, mb: 2.25 }}>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          px: 1.75,
          mb: 0.75,
          color: 'var(--g-faint)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Typography>
      <List disablePadding>
        {items.map((item) => {
          const Icon = item.icon;
          const selected = item.id === activeView;
          return (
            <ListItemButton
              key={item.id}
              component="a"
              href={appViewPath(item.id)}
              selected={selected}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                onSelect(item.id);
              }}
              sx={{
                minHeight: 42,
                px: 1.5,
                mb: 0.75,
                borderRadius: '12px',
                color: selected ? 'var(--g-fg)' : 'var(--g-muted)',
                transition: 'box-shadow 150ms ease, color 150ms ease',
                '& svg': { color: selected ? 'var(--g-accent)' : 'inherit' },
                '&.Mui-selected, &.Mui-selected:hover': {
                  bgcolor: 'var(--g-base)',
                  boxShadow: 'var(--g-inset-sm)',
                },
                '&:hover': { bgcolor: 'transparent', color: 'var(--g-fg)' },
              }}
            >
              <Icon size={18} strokeWidth={selected ? 2.4 : 1.9} />
              <Typography sx={{ ml: 1.5, flex: 1, fontSize: 14, fontWeight: selected ? 600 : 500 }}>
                {item.label}
              </Typography>
              {selected && <ChevronRight size={15} />}
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const notifications = useNotifications();
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  // Desktop sidebar can be closed completely; the header button reopens it.
  const [desktopOpen, setDesktopOpen] = useState(readNavigationOpenPreference);
  const desktopWidth = desktopOpen ? drawerWidth : 0;

  useEffect(() => {
    try {
      localStorage.setItem(NAV_OPEN_STORAGE_KEY, String(desktopOpen));
    } catch {
      // The preference is a convenience; ignore blocked storage.
    }
  }, [desktopOpen]);

  const toggleNavigation = () => {
    if (isDesktop) setDesktopOpen((open) => !open);
    else setMobileOpen(true);
  };
  const navigationButtonLabel = !isDesktop
    ? 'Open navigation'
    : desktopOpen
      ? 'Close navigation'
      : 'Open navigation';
  const [notificationAnchor, setNotificationAnchor] = useState<HTMLElement | null>(null);
  const permissions = user?.permissions ?? [];
  const visibleGroups = useMemo(
    () =>
      navigationGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => canSeeNavigationItem(item, permissions)),
        }))
        .filter((group) => group.items.length > 0),
    [permissions],
  );
  const allVisibleItems = useMemo(
    () => visibleGroups.flatMap((group) => group.items),
    [visibleGroups],
  );
  const allowedViews = useMemo(
    () => new Set<AppView>(['overview', ...allVisibleItems.map((item) => item.id)]),
    [allVisibleItems],
  );
  const { activeView, navigate } = useAppNavigation(allowedViews, confirmDiscardChanges);
  const activeLabel = allVisibleItems.find((item) => item.id === activeView)?.label ?? 'Overview';
  const todayLabel = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());

  const selectView = (view: AppView) => {
    navigate(view);
    setMobileOpen(false);
  };

  useEffect(() => {
    document.title = `${activeLabel} | Gnomon`;
  }, [activeLabel]);

  const drawer = (
    <Stack
      sx={{ height: '100%', overflow: 'hidden', color: 'var(--g-fg)', bgcolor: 'var(--g-base)' }}
    >
      <Stack direction="row" sx={{ px: 2.5, height: 82, alignItems: 'center', gap: 1.4 }}>
        <Box
          component="a"
          href={appViewPath('overview')}
          aria-label="Gnomon home: go to Overview"
          onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
            // Let modified clicks open a new tab as normal links do.
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            event.preventDefault();
            selectView('overview');
          }}
          sx={{
            display: 'inline-flex',
            color: 'inherit',
            textDecoration: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            '&:focus-visible': { outline: '2px solid var(--g-accent)', outlineOffset: 4 },
          }}
        >
          <GnomonLogo size={42} />
        </Box>
      </Stack>

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          pt: 0.75,
          px: 0.5,
          flex: 1,
          overflowY: 'auto',
        }}
      >
        {visibleGroups.map((group) => (
          <NavigationList
            key={group.label}
            label={group.label}
            items={group.items}
            activeView={activeView}
            onSelect={selectView}
          />
        ))}
      </Box>
    </Stack>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          ml: { lg: `${desktopWidth}px` },
          width: { lg: `calc(100% - ${desktopWidth}px)` },
          transition: slideTransition,
          bgcolor: 'var(--g-base)',
          boxShadow: 'none',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 68, md: 76 }, px: { xs: 2, md: 3.5 } }}>
          <Tooltip title={isDesktop ? navigationButtonLabel : ''}>
            <IconButton
              aria-label={navigationButtonLabel}
              aria-expanded={isDesktop ? desktopOpen : mobileOpen}
              edge="start"
              onClick={toggleNavigation}
              sx={{ mr: 1.5, color: 'text.secondary' }}
            >
              {!isDesktop ? (
                <Menu size={21} />
              ) : desktopOpen ? (
                <PanelLeftClose size={20} />
              ) : (
                <PanelLeftOpen size={20} />
              )}
            </IconButton>
          </Tooltip>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography noWrap sx={{ fontSize: 17, fontWeight: 600, color: 'text.primary' }}>
              {activeLabel}
            </Typography>
            <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary' }}>
              {todayLabel} · Workforce operations
            </Typography>
          </Box>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25 }}>
            <ThemeSwitcher />
            <Tooltip title="Notifications">
              <IconButton
                aria-label="Notifications"
                onClick={(event) => setNotificationAnchor(event.currentTarget)}
                sx={{ color: 'text.secondary' }}
              >
                <Badge
                  color="error"
                  badgeContent={notifications.notifications.unreadCount}
                  max={99}
                >
                  <Bell size={19} />
                </Badge>
              </IconButton>
            </Tooltip>
            <MuiMenu
              anchorEl={notificationAnchor}
              open={Boolean(notificationAnchor)}
              onClose={() => setNotificationAnchor(null)}
              slotProps={{ paper: { sx: { width: 360, maxWidth: 'calc(100vw - 24px)' } } }}
            >
              <Stack
                direction="row"
                sx={{ px: 2, py: 1, alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Notifications</Typography>
                {notifications.notifications.unreadCount > 0 && (
                  <Button
                    size="small"
                    onClick={() => void notifications.markAllRead()}
                    sx={{ fontSize: 11.5 }}
                  >
                    Mark all read
                  </Button>
                )}
              </Stack>
              <Divider />
              {notifications.notifications.items.length === 0 ? (
                <MenuItem disabled>No notifications yet</MenuItem>
              ) : (
                notifications.notifications.items.map((notification) => (
                  <MenuItem
                    key={notification.id}
                    selected={!notification.readAt}
                    onClick={() => {
                      setNotificationAnchor(null);
                      if (!notification.readAt) void notifications.markRead(notification.id);
                      const [path = ''] = notification.href.split('?');
                      const view = appViewFromPath(path);
                      if (!view) return;
                      if (notification.href.includes('?')) {
                        // Keep the link's filters (e.g. a People search for the new user).
                        window.history.pushState({ view }, '', notification.href);
                        window.dispatchEvent(new PopStateEvent('popstate'));
                      } else selectView(view);
                    }}
                    sx={{ alignItems: 'flex-start', whiteSpace: 'normal', py: 1.25 }}
                  >
                    <ListItemText
                      primary={notification.title}
                      secondary={`${notification.message} · ${new Date(notification.createdAt).toLocaleString('en-IN')}`}
                      slotProps={{
                        primary: {
                          sx: { fontSize: 12.5, fontWeight: notification.readAt ? 500 : 650 },
                        },
                        secondary: { sx: { mt: 0.35, fontSize: 11.5, lineHeight: 1.45 } },
                      }}
                    />
                  </MenuItem>
                ))
              )}
            </MuiMenu>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<Clock3 size={16} />}
              onClick={() => selectView('timecard')}
              sx={{ display: { xs: 'none', sm: 'inline-flex' }, px: 1.5, color: 'text.secondary' }}
            >
              My timecard
            </Button>
            <Stack
              direction="row"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                pl: 0.75,
                pr: 0.5,
                py: 0.65,
                borderRadius: '14px',
                bgcolor: 'var(--g-base)',
                boxShadow: 'var(--g-raised-sm)',
              }}
            >
              <Avatar
                sx={{
                  width: 34,
                  height: 34,
                  bgcolor: 'var(--g-base)',
                  boxShadow: 'var(--g-inset-sm)',
                  color: 'var(--g-accent-text)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {user?.displayName.at(0)}
              </Avatar>
              <Box sx={{ maxWidth: 150, display: { xs: 'none', md: 'block' } }}>
                <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2 }}>
                  {user?.displayName}
                </Typography>
                <Typography noWrap sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                  {user?.employeeCode}
                </Typography>
              </Box>
              <Tooltip title="Sign out">
                <IconButton
                  aria-label="Sign out"
                  size="small"
                  onClick={() => {
                    if (confirmDiscardChanges()) void logout();
                  }}
                  sx={{ color: 'var(--g-muted)', '&:hover': { color: 'var(--g-fg)' } }}
                >
                  <LogOut size={17} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { lg: desktopWidth }, flexShrink: { lg: 0 }, transition: slideTransition }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', lg: 'none' },
            '& .MuiDrawer-paper': { width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          aria-hidden={!desktopOpen}
          inert={!desktopOpen}
          sx={{
            display: { xs: 'none', lg: 'block' },
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              transform: desktopOpen ? 'none' : `translateX(-${drawerWidth}px)`,
              visibility: desktopOpen ? 'visible' : 'hidden',
              transition: `${slideTransition}, visibility 220ms`,
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          pt: { xs: '92px', md: '104px' },
          px: { xs: 1.5, sm: 3, xl: 4.5 },
          pb: 7,
        }}
      >
        {activeView === 'overview' ? (
          <DashboardPage onNavigate={selectView} />
        ) : (
          <ModulePage view={activeView} onNavigate={selectView} />
        )}
      </Box>
      <TipsCompanion />
    </Box>
  );
}
