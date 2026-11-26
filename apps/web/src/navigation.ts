import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  CalendarCheck,
  CircleDot,
  ClipboardList,
  History,
  ListTodo,
  CalendarDays,
  Clock3,
  FileClock,
  Fingerprint,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  Settings2,
  UsersRound,
} from 'lucide-react';

export type AppView =
  | 'overview'
  | 'availability'
  | 'help'
  | 'timecard'
  | 'timesheets'
  | 'catch-up'
  | 'regularisation'
  | 'leave'
  | 'calendar'
  | 'team-calendar'
  | 'team-timesheets'
  | 'attendance-details'
  | 'system-events'
  | 'leave-approvals'
  | 'regularisation-approvals'
  | 'shows'
  | 'people'
  | 'administration';

export const appViewPaths: Record<AppView, string> = {
  overview: '/',
  availability: '/availability',
  help: '/help',
  timecard: '/timecard',
  timesheets: '/timesheets',
  'catch-up': '/catch-up',
  regularisation: '/regularisation',
  leave: '/leave',
  calendar: '/calendar',
  'team-calendar': '/team-calendar',
  'team-timesheets': '/team-timesheets',
  'attendance-details': '/attendance-details',
  'system-events': '/system-events',
  'leave-approvals': '/leave-approvals',
  'regularisation-approvals': '/regularisation-approvals',
  shows: '/shows',
  people: '/people',
  administration: '/administration',
};

const viewByPath = new Map(
  Object.entries(appViewPaths).map(([view, path]) => [path, view as AppView]),
);

export function appViewPath(view: AppView): string {
  return appViewPaths[view];
}

export function appViewFromPath(pathname: string): AppView | null {
  const normalized = pathname === '/' ? pathname : pathname.replace(/\/+$/, '');
  // Older links (e.g. saved notifications) pointed at the combined approvals page.
  if (normalized === '/approvals') return 'leave-approvals';
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
    id: 'catch-up',
    label: 'Catch-up',
    icon: ListTodo,
    requiredPermissions: ['attendance:self:read'],
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
  { id: 'availability', label: 'Availability', icon: CircleDot },
  { id: 'help', label: 'Help & guides', icon: LifeBuoy },
];

const managerNavigation: NavigationItem[] = [
  {
    id: 'team-calendar',
    label: 'Team calendar',
    icon: CalendarDays,
    requiredPermissions: ['attendance:team:read'],
  },
  {
    id: 'team-timesheets',
    label: 'Team timesheets',
    icon: ClipboardList,
    requiredPermissions: [
      'attendance:team:read',
      'attendance:all:read',
      'audit:read',
      'show:manage',
    ],
  },
  {
    id: 'leave-approvals',
    label: 'Leave approvals',
    icon: CalendarCheck,
    requiredPermissions: ['leave:approve'],
  },
  {
    id: 'regularisation-approvals',
    label: 'Regularisation approvals',
    icon: History,
    requiredPermissions: ['regularisation:approve'],
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
    id: 'attendance-details',
    label: 'Attendance details',
    icon: Fingerprint,
    requiredPermissions: ['attendance:team:read', 'attendance:all:read', 'audit:read'],
  },
  {
    id: 'system-events',
    label: 'System events',
    icon: Activity,
    requiredPermissions: ['system:events:read'],
  },
];

export const navigationGroups: NavigationGroup[] = [
  { label: 'Employee', items: employeeNavigation },
  { label: 'Manager', items: managerNavigation },
  { label: 'HR & Admin', items: administrationNavigation },
  { label: 'Reporting', items: reportingNavigation },
];
