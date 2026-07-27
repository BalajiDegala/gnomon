import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  Clock3,
  FileClock,
  Fingerprint,
  Gauge,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

export type AppView =
  | 'overview'
  | 'timecard'
  | 'timesheets'
  | 'regularisation'
  | 'leave'
  | 'calendar'
  | 'approvals'
  | 'shows'
  | 'people'
  | 'administration';

export interface NavigationItem {
  id: AppView;
  label: string;
  icon: LucideIcon;
  requiredPermissions?: string[];
}

export const workspaceNavigation: NavigationItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'timecard', label: 'My timecard', icon: Clock3 },
  { id: 'timesheets', label: 'Timesheets', icon: FileClock },
  {
    id: 'regularisation',
    label: 'Regularisation',
    icon: Fingerprint,
    requiredPermissions: ['regularisation:create'],
  },
  { id: 'leave', label: 'Leave', icon: Gauge },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
];

export const managementNavigation: NavigationItem[] = [
  {
    id: 'approvals',
    label: 'Approvals',
    icon: ShieldCheck,
    requiredPermissions: ['regularisation:approve'],
  },
  {
    id: 'shows',
    label: 'Shows & tasks',
    icon: FileClock,
    requiredPermissions: ['show:manage'],
  },
  {
    id: 'people',
    label: 'People',
    icon: UsersRound,
    requiredPermissions: ['employee:read', 'employee:update'],
  },
  {
    id: 'administration',
    label: 'Administration',
    icon: Settings2,
    requiredPermissions: ['policy:manage', 'imports:create', 'audit:read'],
  },
];
