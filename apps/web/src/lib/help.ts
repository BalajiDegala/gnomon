import type { HelpGuideId } from '../content/help';
import { useAnnouncements } from './announcements';
import { useAuth } from './auth';

const managerPermissions = [
  'attendance:team:read',
  'leave:approve',
  'regularisation:approve',
  'show:manage',
];
const adminPermissions = [
  'policy:manage',
  'imports:create',
  'employee:update',
  'audit:read',
  'system:events:read',
];

/** Guides the signed-in person may read: everyone, managers, admins. */
export function useVisibleHelpGuides(): HelpGuideId[] {
  const { user } = useAuth();
  const { canSend } = useAnnouncements();
  const permissions = user?.permissions ?? [];
  const isManager =
    canSend || managerPermissions.some((permission) => permissions.includes(permission as never));
  const isAdmin =
    adminPermissions.some((permission) => permissions.includes(permission as never)) ||
    (user?.grants.some((grant) => grant.roleCode === 'SYSTEM_ADMIN') ?? false);
  return [
    'employee',
    ...(isManager ? (['manager'] as const) : []),
    ...(isAdmin ? (['admin'] as const) : []),
  ];
}
