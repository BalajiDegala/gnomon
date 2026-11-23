import type { SystemEventCategory } from '@gnomon/shared';

/**
 * Names for API routes in the system event log. Routes not listed still get an
 * event (when recorded) named after their method and path.
 */
interface CatalogEntry {
  method: string;
  /** Path under /api/v1 with :params. */
  pattern: string;
  category: SystemEventCategory;
  action: string;
  message: string;
  /** Subject type for the route's first :param. */
  subject?: string;
  /** Do not record successful calls (high-volume, low-value). */
  quietOnSuccess?: boolean;
  /** Top-level request body fields copied into the event metadata (never secrets). */
  capture?: string[];
}

const entries: CatalogEntry[] = [
  // Authentication
  {
    method: 'POST',
    pattern: '/auth/login',
    category: 'auth',
    action: 'auth.login',
    message: 'Signed in',
    capture: ['userId'],
  },
  {
    method: 'POST',
    pattern: '/auth/logout',
    category: 'auth',
    action: 'auth.logout',
    message: 'Signed out',
  },
  {
    method: 'POST',
    pattern: '/auth/refresh',
    category: 'auth',
    action: 'auth.refresh',
    message: 'Refreshed session',
    quietOnSuccess: true,
  },
  // Timecard and timesheets
  {
    method: 'POST',
    pattern: '/timecard/start',
    category: 'timecard',
    action: 'timecard.start',
    message: 'Started workday',
    capture: ['workMode', 'shiftId'],
  },
  {
    method: 'POST',
    pattern: '/timecard/stop',
    category: 'timecard',
    action: 'timecard.stop',
    message: 'Stopped workday',
  },
  {
    method: 'POST',
    pattern: '/timesheets/entries',
    category: 'timesheet',
    action: 'timesheet.entry_created',
    message: 'Added timesheet entry',
  },
  {
    method: 'PATCH',
    pattern: '/timesheets/entries/:entryId',
    category: 'timesheet',
    action: 'timesheet.entry_updated',
    message: 'Updated timesheet entry',
    subject: 'timesheet_entry',
  },
  {
    method: 'DELETE',
    pattern: '/timesheets/entries/:entryId',
    category: 'timesheet',
    action: 'timesheet.entry_deleted',
    message: 'Deleted timesheet entry',
    subject: 'timesheet_entry',
  },
  // Leave
  {
    method: 'POST',
    pattern: '/leaves',
    category: 'leave',
    action: 'leave.requested',
    message: 'Applied for leave',
    capture: ['leaveType', 'startDate', 'endDate', 'dayPart'],
  },
  {
    method: 'POST',
    pattern: '/leaves/:requestId/cancel',
    category: 'leave',
    action: 'leave.cancelled',
    message: 'Cancelled leave request',
    subject: 'leave_request',
  },
  {
    method: 'POST',
    pattern: '/approvals/leaves/:requestId/decision',
    category: 'leave',
    action: 'leave.decided',
    message: 'Decided leave request',
    subject: 'leave_request',
    capture: ['decision'],
  },
  // Regularisation
  {
    method: 'POST',
    pattern: '/regularisations',
    category: 'regularisation',
    action: 'regularisation.requested',
    message: 'Requested regularisation',
    capture: ['workDate', 'source', 'missingEvent'],
  },
  {
    method: 'POST',
    pattern: '/regularisations/:requestId/cancel',
    category: 'regularisation',
    action: 'regularisation.cancelled',
    message: 'Cancelled regularisation request',
    subject: 'regularisation_request',
  },
  {
    method: 'POST',
    pattern: '/approvals/regularisations/:requestId/decision',
    category: 'regularisation',
    action: 'regularisation.decided',
    message: 'Decided regularisation request',
    subject: 'regularisation_request',
    capture: ['decision'],
  },
  // Imports
  {
    method: 'POST',
    pattern: '/imports/users/csv',
    category: 'import',
    action: 'import.users',
    message: 'Imported user directory',
  },
  {
    method: 'POST',
    pattern: '/imports/timecards/json',
    category: 'import',
    action: 'import.timecards',
    message: 'Imported timecard data',
  },
  {
    method: 'POST',
    pattern: '/imports/approval-routes/csv',
    category: 'import',
    action: 'import.approval_routes',
    message: 'Imported approval routes',
  },
  {
    method: 'POST',
    pattern: '/imports/leave-balances/workbook',
    category: 'import',
    action: 'import.leave_balances',
    message: 'Imported leave balances',
  },
  {
    method: 'POST',
    pattern: '/imports/attendance/access-card/door-workbook',
    category: 'import',
    action: 'import.attendance_door_workbook',
    message: 'Imported door attendance workbook',
  },
  {
    method: 'POST',
    pattern: '/imports/attendance/:source/csv',
    category: 'import',
    action: 'import.attendance_csv',
    message: 'Imported attendance CSV',
    subject: 'attendance_source',
  },
  {
    method: 'DELETE',
    pattern: '/imports/:batchId',
    category: 'import',
    action: 'import.deleted',
    message: 'Deleted attendance import',
    subject: 'import_batch',
  },
  // Employees and access
  {
    method: 'POST',
    pattern: '/employees',
    category: 'employee',
    action: 'employee.created',
    message: 'Created employee',
  },
  {
    method: 'PATCH',
    pattern: '/employees/:employeeId',
    category: 'employee',
    action: 'employee.updated',
    message: 'Updated employee',
    subject: 'employee',
  },
  {
    method: 'POST',
    pattern: '/administration/security/accounts',
    category: 'security',
    action: 'security.account_provisioned',
    message: 'Provisioned user account',
  },
  {
    method: 'PATCH',
    pattern: '/administration/security/accounts/:userId',
    category: 'security',
    action: 'security.account_updated',
    message: 'Updated user account',
    subject: 'user',
  },
  {
    method: 'PUT',
    pattern: '/administration/security/accounts/:userId/roles',
    category: 'security',
    action: 'security.role_assigned',
    message: 'Assigned role',
    subject: 'user',
    capture: ['roleCode', 'scopeType'],
  },
  {
    method: 'POST',
    pattern: '/administration/security/accounts/:userId/roles/:assignmentId/revoke',
    category: 'security',
    action: 'security.role_revoked',
    message: 'Revoked role',
    subject: 'user',
  },
  // Administration
  {
    method: 'PUT',
    pattern: '/administration/approval-policies/:policyId',
    category: 'administration',
    action: 'admin.approval_policy_updated',
    message: 'Updated department approval route',
    subject: 'approval_policy',
  },
  {
    method: 'PUT',
    pattern: '/administration/holidays',
    category: 'administration',
    action: 'admin.holiday_saved',
    message: 'Saved holiday',
  },
  {
    method: 'POST',
    pattern: '/administration/holidays/:holidayId/archive',
    category: 'administration',
    action: 'admin.holiday_archived',
    message: 'Archived holiday',
    subject: 'holiday',
  },
  {
    method: 'POST',
    pattern: '/administration/locations',
    category: 'administration',
    action: 'admin.location_created',
    message: 'Created location',
  },
  {
    method: 'PUT',
    pattern: '/administration/employee-locations/:employeeCode',
    category: 'administration',
    action: 'admin.employee_location_updated',
    message: 'Changed employee location',
    subject: 'employee',
  },
  {
    method: 'PUT',
    pattern: '/administration/leave-balances/:employeeCode',
    category: 'administration',
    action: 'admin.leave_balance_updated',
    message: 'Changed leave balance',
    subject: 'employee',
    capture: ['leaveType', 'year', 'entitledDays', 'adjustedDays'],
  },
  {
    method: 'POST',
    pattern: '/administration/shifts',
    category: 'administration',
    action: 'admin.shift_created',
    message: 'Created shift',
  },
  {
    method: 'PUT',
    pattern: '/administration/shifts/:shiftId',
    category: 'administration',
    action: 'admin.shift_updated',
    message: 'Updated shift',
    subject: 'shift',
  },
  {
    method: 'PUT',
    pattern: '/administration/smtp',
    category: 'administration',
    action: 'admin.smtp_updated',
    message: 'Updated email (SMTP) settings',
  },
  {
    method: 'POST',
    pattern: '/administration/smtp/test',
    category: 'administration',
    action: 'admin.smtp_tested',
    message: 'Sent SMTP test email',
  },
  {
    method: 'PUT',
    pattern: '/administration/ldap',
    category: 'administration',
    action: 'admin.ldap_updated',
    message: 'Updated directory (LDAP) settings',
  },
  {
    method: 'POST',
    pattern: '/administration/ldap/test',
    category: 'administration',
    action: 'admin.ldap_tested',
    message: 'Tested directory (LDAP) connection',
  },
  {
    method: 'PUT',
    pattern: '/administration/tips',
    category: 'administration',
    action: 'admin.tips_updated',
    message: 'Updated tips settings',
  },
  {
    method: 'POST',
    pattern: '/shows',
    category: 'administration',
    action: 'show.created',
    message: 'Created show',
  },
  {
    method: 'PATCH',
    pattern: '/shows/:showId',
    category: 'administration',
    action: 'show.updated',
    message: 'Updated show',
    subject: 'show',
  },
  // Notifications: marking as read is routine.
  {
    method: 'POST',
    pattern: '/notifications/read-all',
    category: 'notification',
    action: 'notification.read_all',
    message: 'Marked notifications read',
    quietOnSuccess: true,
  },
  {
    method: 'POST',
    pattern: '/notifications/:notificationId/read',
    category: 'notification',
    action: 'notification.read',
    message: 'Marked notification read',
    subject: 'notification',
    quietOnSuccess: true,
  },
];

interface CompiledEntry extends CatalogEntry {
  regex: RegExp;
}

const API_PREFIX = '/api/v1';

const compiled: CompiledEntry[] = entries.map((entry) => ({
  ...entry,
  regex: new RegExp(`^${API_PREFIX}${entry.pattern.replace(/:[A-Za-z]+/g, '([^/]+)')}/?$`),
}));

/** Category for routes missing from the catalog, from the first path segment. */
const categoryByPrefix: Array<[string, SystemEventCategory]> = [
  ['/auth', 'auth'],
  ['/timecard', 'timecard'],
  ['/timesheets', 'timesheet'],
  ['/leaves', 'leave'],
  ['/approvals/leaves', 'leave'],
  ['/regularisations', 'regularisation'],
  ['/approvals/regularisations', 'regularisation'],
  ['/imports', 'import'],
  ['/employees', 'employee'],
  ['/administration/security', 'security'],
  ['/administration', 'administration'],
  ['/notifications', 'notification'],
  ['/reconciliation', 'timecard'],
];

export interface RouteMatch {
  route: string | null;
  category: SystemEventCategory;
  action: string;
  message: string;
  subject: { type: string; id: string } | null;
  quietOnSuccess: boolean;
  capture: string[];
}

export function matchRoute(method: string, path: string): RouteMatch {
  for (const entry of compiled) {
    if (entry.method !== method) continue;
    const match = entry.regex.exec(path);
    if (!match) continue;
    const firstParam = match[1];
    return {
      route: `${API_PREFIX}${entry.pattern}`,
      category: entry.category,
      action: entry.action,
      message: entry.message,
      subject:
        entry.subject && firstParam ? { type: entry.subject, id: safeDecode(firstParam) } : null,
      quietOnSuccess: entry.quietOnSuccess ?? false,
      capture: entry.capture ?? [],
    };
  }
  const relative = path.startsWith(API_PREFIX) ? path.slice(API_PREFIX.length) : path;
  const category =
    categoryByPrefix.find(
      ([prefix]) => relative === prefix || relative.startsWith(`${prefix}/`),
    )?.[1] ?? 'system';
  return {
    route: null,
    category,
    action: `http.${method.toLowerCase()}`,
    message: `${method} ${path}`,
    subject: null,
    quietOnSuccess: false,
    capture: [],
  };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value).slice(0, 100);
  } catch {
    return value.slice(0, 100);
  }
}
