import {
  AppBar,
  Avatar,
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { ChevronRight, Clock3, LogOut, Menu, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useAppNavigation } from '../lib/app-navigation';
import { useAuth } from '../lib/auth';
import { confirmDiscardChanges } from '../lib/unsaved-changes';
import { type AppView, appViewPath, navigationGroups, type NavigationItem } from '../navigation';
import { DashboardPage } from '../pages/DashboardPage';
import { ModulePage } from '../pages/ModulePage';

const drawerWidth = 264;

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
          color: 'rgba(220,235,241,.48)',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1.5,
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
                position: 'relative',
                minHeight: 43,
                px: 1.75,
                mb: 0.5,
                overflow: 'hidden',
                borderRadius: 2.25,
                color: selected ? '#ffffff' : 'rgba(226,237,242,.68)',
                transition: 'background-color 150ms ease, color 150ms ease, transform 150ms ease',
                '&.Mui-selected': {
                  background: 'linear-gradient(90deg, rgba(37,184,197,.24), rgba(37,184,197,.1))',
                  color: '#ffffff',
                  boxShadow: 'inset 0 0 0 1px rgba(81,211,220,.08)',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: 9,
                    bottom: 9,
                    width: 3,
                    borderRadius: '0 4px 4px 0',
                    bgcolor: '#4bd3dc',
                  },
                  '&:hover': {
                    background:
                      'linear-gradient(90deg, rgba(37,184,197,.29), rgba(37,184,197,.13))',
                  },
                },
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,.055)',
                  color: '#ffffff',
                  transform: 'translateX(2px)',
                },
              }}
            >
              <Icon size={18} strokeWidth={selected ? 2.4 : 1.9} />
              <Typography sx={{ ml: 1.5, flex: 1, fontSize: 14, fontWeight: selected ? 700 : 550 }}>
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
  const [mobileOpen, setMobileOpen] = useState(false);
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
      sx={{
        position: 'relative',
        height: '100%',
        overflow: 'hidden',
        color: '#fff',
        background:
          'radial-gradient(circle at 5% 0%, rgba(29,177,191,.15), transparent 27%), linear-gradient(180deg, #0c1727 0%, #09111f 100%)',
        '&::after': {
          content: '""',
          position: 'absolute',
          width: 180,
          height: 180,
          right: -120,
          bottom: 80,
          borderRadius: '50%',
          bgcolor: 'rgba(82,88,206,.08)',
          filter: 'blur(2px)',
          pointerEvents: 'none',
        },
      }}
    >
      <Stack direction="row" sx={{ px: 2.5, height: 82, alignItems: 'center', gap: 1.4 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 2.5,
            background: 'linear-gradient(135deg, #50d8df 0%, #1694a4 100%)',
            boxShadow: '0 10px 30px rgba(25,180,198,.25)',
          }}
        >
          <Sparkles size={20} color="#071217" strokeWidth={2.3} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 860, letterSpacing: 1.25, lineHeight: 1.15 }}>
            GNOMON
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.42)', fontSize: 9.5, letterSpacing: 0.7 }}>
            DIGITAL DOMAIN INDIA
          </Typography>
        </Box>
      </Stack>

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          pt: 0.75,
          flex: 1,
          overflowY: 'auto',
          '&::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(255,255,255,.18)' },
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

      <Box sx={{ position: 'relative', zIndex: 1, p: 1.5 }}>
        <Box
          sx={{
            p: 1.2,
            border: '1px solid rgba(255,255,255,.09)',
            borderRadius: 2.75,
            bgcolor: 'rgba(255,255,255,.045)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25 }}>
            <Avatar
              sx={{
                width: 36,
                height: 36,
                background: 'linear-gradient(135deg, #3bd1dc, #158896)',
                color: '#041316',
                fontSize: 14,
                fontWeight: 800,
              }}
            >
              {user?.displayName.at(0)}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontSize: 13, fontWeight: 700 }}>
                {user?.displayName}
              </Typography>
              <Typography noWrap sx={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>
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
                sx={{
                  color: 'rgba(255,255,255,.55)',
                  '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,.08)' },
                }}
              >
                <LogOut size={17} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
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
          ml: { lg: `${drawerWidth}px` },
          width: { lg: `calc(100% - ${drawerWidth}px)` },
          borderBottom: '1px solid rgba(218,226,232,.86)',
          bgcolor: 'rgba(250,252,253,.84)',
          backdropFilter: 'blur(18px) saturate(1.4)',
          boxShadow: '0 4px 18px rgba(20,32,51,.035)',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 68, md: 76 }, px: { xs: 2, md: 3.5 } }}>
          <IconButton
            aria-label="Open navigation"
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ display: { lg: 'none' }, mr: 1.5 }}
          >
            <Menu size={21} />
          </IconButton>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography noWrap sx={{ fontSize: 17, fontWeight: 820, color: 'text.primary' }}>
              {activeLabel}
            </Typography>
            <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary' }}>
              {todayLabel} · Workforce operations
            </Typography>
          </Box>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<Clock3 size={16} />}
              onClick={() => selectView('timecard')}
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                px: 1.5,
                borderColor: 'divider',
                bgcolor: 'rgba(255,255,255,.7)',
                color: 'text.secondary',
                '&:hover': { borderColor: '#b7c4cd', bgcolor: '#fff' },
              }}
            >
              My timecard
            </Button>
            <Stack
              direction="row"
              sx={{
                display: { xs: 'none', md: 'flex' },
                alignItems: 'center',
                gap: 1,
                pl: 0.5,
              }}
            >
              <Avatar
                sx={{
                  width: 34,
                  height: 34,
                  bgcolor: 'primary.light',
                  color: 'primary.dark',
                  fontSize: 12,
                  fontWeight: 850,
                }}
              >
                {user?.displayName.at(0)}
              </Avatar>
              <Box sx={{ maxWidth: 150 }}>
                <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 780, lineHeight: 1.2 }}>
                  {user?.displayName}
                </Typography>
                <Typography noWrap sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                  {user?.employeeCode}
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { lg: drawerWidth }, flexShrink: { lg: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', lg: 'none' },
            '& .MuiDrawer-paper': { width: drawerWidth, border: 0 },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: 'none', lg: 'block' },
            '& .MuiDrawer-paper': { width: drawerWidth, border: 0 },
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
          px: { xs: 2, sm: 3, xl: 4.5 },
          pb: 6,
        }}
      >
        {activeView === 'overview' ? (
          <DashboardPage onNavigate={selectView} />
        ) : (
          <ModulePage view={activeView} onNavigate={selectView} />
        )}
      </Box>
    </Box>
  );
}
