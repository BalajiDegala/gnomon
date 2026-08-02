import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
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
  | 'team-calendar'
  | 'approvals'
  | 'shows'
  | 'people'
  | 'administration'
  | 'reports';

export const appViewPaths: Record<AppView, string> = {
  overview: '/',
  timecard: '/timecard',
  timesheets: '/timesheets',
  regularisation: '/regularisation',
  leave: '/leave',
  calendar: '/calendar',
  'team-calendar': '/team-calendar',
  approvals: '/approvals',
  shows: '/shows',
  people: '/people',
  administration: '/administration',
  reports: '/reports',
};

const viewByPath = new Map(
  Object.entries(appViewPaths).map(([view, path]) => [path, view as AppView]),
);

export function appViewPath(view: AppView): string {
  return appViewPaths[view];
}

export function appViewFromPath(pathname: string): AppView | null {
  const normalized = pathname === '/' ? pathname : pathname.replace(/\/+$/, '');
  return viewByPath.get(normalized) ?? null;
}

export interface NavigationItem {
  id: AppView;
  label: string;
  icon: LucideIcon;
  requiredPermissions?: string[];
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

const employeeNavigation: NavigationItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  {
    id: 'timecard',
    label: 'My timecard',
    icon: Clock3,
    requiredPermissions: ['attendance:self:read'],
  },
  {
    id: 'timesheets',
    label: 'Timesheets',
    icon: FileClock,
    requiredPermissions: ['timesheet:create'],
  },
  {
    id: 'regularisation',
    label: 'Regularisation',
    icon: Fingerprint,
    requiredPermissions: ['regularisation:create'],
  },
  {
    id: 'leave',
    label: 'Leave',
    icon: Gauge,
    requiredPermissions: ['leave:create'],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: CalendarDays,
    requiredPermissions: ['attendance:self:read'],
  },
];

const managerNavigation: NavigationItem[] = [
  {
    id: 'team-calendar',
    label: 'Team calendar',
    icon: CalendarDays,
    requiredPermissions: ['attendance:team:read'],
  },
  {
    id: 'approvals',
    label: 'Approvals',
    icon: ShieldCheck,
    requiredPermissions: ['regularisation:approve', 'leave:approve'],
  },
  {
    id: 'shows',
    label: 'Shows',
    icon: FileClock,
    requiredPermissions: ['show:manage'],
  },
];

const administrationNavigation: NavigationItem[] = [
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
    requiredPermissions: ['policy:manage', 'imports:create', 'employee:update', 'audit:read'],
  },
];

const reportingNavigation: NavigationItem[] = [
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    requiredPermissions: ['attendance:team:read', 'attendance:all:read', 'audit:read'],
  },
];

export const navigationGroups: NavigationGroup[] = [
  { label: 'Employee', items: employeeNavigation },
  { label: 'Manager', items: managerNavigation },
  { label: 'HR & Admin', items: administrationNavigation },
  { label: 'Reporting', items: reportingNavigation },
];
