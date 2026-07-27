import {
  AppBar,
  Avatar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { Bell, ChevronRight, LogOut, Menu, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useAuth } from '../lib/auth';
import {
  managementNavigation,
  type AppView,
  type NavigationItem,
  workspaceNavigation,
} from '../navigation';
import { DashboardPage } from '../pages/DashboardPage';
import { ModulePage } from '../pages/ModulePage';

const drawerWidth = 272;

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
    <Box sx={{ px: 1.5, mb: 2.5 }}>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          px: 1.5,
          mb: 0.75,
          color: 'rgba(255,255,255,.42)',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1.4,
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
              selected={selected}
              onClick={() => onSelect(item.id)}
              sx={{
                minHeight: 44,
                px: 1.5,
                mb: 0.5,
                borderRadius: 2,
                color: selected ? '#ffffff' : 'rgba(255,255,255,.68)',
                '&.Mui-selected': {
                  bgcolor: 'rgba(39,194,211,.15)',
                  color: '#ffffff',
                  '&:hover': { bgcolor: 'rgba(39,194,211,.2)' },
                },
                '&:hover': { bgcolor: 'rgba(255,255,255,.06)', color: '#ffffff' },
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
  const [activeView, setActiveView] = useState<AppView>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const permissions = user?.permissions ?? [];
  const workspaceItems = useMemo(
    () => workspaceNavigation.filter((item) => canSeeNavigationItem(item, permissions)),
    [permissions],
  );
  const managementItems = useMemo(
    () => managementNavigation.filter((item) => canSeeNavigationItem(item, permissions)),
    [permissions],
  );
  const allVisibleItems = [...workspaceItems, ...managementItems];
  const activeLabel = allVisibleItems.find((item) => item.id === activeView)?.label ?? 'Overview';

  const selectView = (view: AppView) => {
    setActiveView(view);
    setMobileOpen(false);
  };

  const drawer = (
    <Stack sx={{ height: '100%', bgcolor: '#0c1220', color: '#fff' }}>
      <Stack direction="row" sx={{ px: 2.5, height: 76, alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            width: 38,
            height: 38,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 2.25,
            background: 'linear-gradient(135deg, #31d0de 0%, #138697 100%)',
            boxShadow: '0 8px 24px rgba(25,180,198,.28)',
          }}
        >
          <Sparkles size={20} color="#071217" />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 850, letterSpacing: 1.1, lineHeight: 1.15 }}>
            GNOMON
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.42)', fontSize: 9.5, letterSpacing: 0.7 }}>
            DIGITAL DOMAIN INDIA
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ pt: 1, flex: 1, overflowY: 'auto' }}>
        <NavigationList
          label="Workspace"
          items={workspaceItems}
          activeView={activeView}
          onSelect={selectView}
        />
        <NavigationList
          label="Manage"
          items={managementItems}
          activeView={activeView}
          onSelect={selectView}
        />
      </Box>

      <Box sx={{ p: 1.5 }}>
        <Box
          sx={{
            p: 1.25,
            border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 2.5,
            bgcolor: 'rgba(255,255,255,.035)',
          }}
        >
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25 }}>
            <Avatar
              sx={{
                width: 36,
                height: 36,
                bgcolor: '#1aa7b8',
                color: '#061216',
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
                onClick={() => void logout()}
                sx={{ color: 'rgba(255,255,255,.55)', '&:hover': { color: '#fff' } }}
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
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'rgba(255,255,255,.9)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 66, md: 72 }, px: { xs: 2, md: 3.5 } }}>
          <IconButton
            aria-label="Open navigation"
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ display: { lg: 'none' }, mr: 1.5 }}
          >
            <Menu size={21} />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 17, fontWeight: 800, color: 'text.primary' }}>
              {activeLabel}
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
              DIGITAL DOMAIN INDIA · Workforce operations
            </Typography>
          </Box>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
            <Tooltip title="Notifications">
              <IconButton aria-label="Notifications" sx={{ color: 'text.secondary' }}>
                <Bell size={19} />
              </IconButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.75 }} />
            <Button
              color="inherit"
              onClick={() => selectView('timecard')}
              sx={{ display: { xs: 'none', sm: 'inline-flex' }, color: 'text.secondary' }}
            >
              My timecard
            </Button>
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
          pt: { xs: '90px', md: '100px' },
          px: { xs: 2, sm: 3, xl: 4.5 },
          pb: 5,
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
