import type { AuthUser, AuthorizationGrant } from '@gnomon/shared';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  canApproveTimeEntry,
  validateTimeEntryWindow,
} from '../src/modules/timesheets/timesheet.service.js';

function approvalUser(
  employeeId: string,
  grant: AuthorizationGrant,
  id = new Types.ObjectId().toString(),
): AuthUser {
  return {
    id,
    employeeId,
    employeeCode: 'APPROVER',
    displayName: 'Approval User',
    email: 'approver@digitaldomain.com',
    permissions: grant.permissions,
    scopes: [grant.scope],
    grants: [grant],
  };
}

describe('task time-entry windows', () => {
  it('calculates duration and work date for a normal interval', () => {
    const window = validateTimeEntryWindow(
      '2026-07-27T09:00:00+05:30',
      '2026-07-27T11:15:00+05:30',
      new Date('2026-07-27T12:00:00+05:30'),
    );

    expect(window.workDate).toBe('2026-07-27');
    expect(window.durationMinutes).toBe(135);
  });

  it('keeps cross-midnight work inside the originating work date', () => {
    const window = validateTimeEntryWindow(
      '2026-07-27T20:00:00+05:30',
      '2026-07-28T05:00:00+05:30',
      new Date('2026-07-28T06:00:00+05:30'),
    );

    expect(window.workDate).toBe('2026-07-27');
    expect(window.durationMinutes).toBe(540);
  });

  it('rejects an interval that crosses the 07:00 workday boundary', () => {
    expect(() =>
      validateTimeEntryWindow(
        '2026-07-28T06:30:00+05:30',
        '2026-07-28T07:30:00+05:30',
        new Date('2026-07-28T08:00:00+05:30'),
      ),
    ).toThrow('07:00-to-07:00');
  });

  it('rejects future and over-24-hour entries', () => {
    expect(() =>
      validateTimeEntryWindow(
        '2026-07-27T10:00:00+05:30',
        '2026-07-27T11:00:00+05:30',
        new Date('2026-07-27T09:00:00+05:30'),
      ),
    ).toThrow('future');

    expect(() =>
      validateTimeEntryWindow(
        '2026-07-26T07:00:00+05:30',
        '2026-07-27T07:01:00+05:30',
        new Date('2026-07-28T09:00:00+05:30'),
      ),
    ).toThrow('24 hours');
  });
});

describe('submitted timesheet approval scope', () => {
  const managerEmployeeId = new Types.ObjectId();
  const employeeId = new Types.ObjectId();
  const showId = new Types.ObjectId().toString();
  const employee = { _id: employeeId, reportingManagerId: managerEmployeeId };

  it('allows a Show Manager only for an assigned show scope', () => {
    const user = approvalUser(managerEmployeeId.toString(), {
      roleCode: 'SHOW_MANAGER',
      permissions: ['timesheet:approve'],
      scope: { type: 'show', ids: [showId] },
    });

    expect(canApproveTimeEntry(user, employee, showId)).toBe(true);
    expect(canApproveTimeEntry(user, employee, new Types.ObjectId().toString())).toBe(false);
  });

  it('allows a Reporting Manager only for a scoped direct report', () => {
    const user = approvalUser(managerEmployeeId.toString(), {
      roleCode: 'REPORTING_MANAGER',
      permissions: ['timesheet:approve'],
      scope: { type: 'direct_reports', ids: [employeeId.toString()] },
    });
    const anotherEmployee = {
      _id: new Types.ObjectId(),
      reportingManagerId: managerEmployeeId,
    };

    expect(canApproveTimeEntry(user, employee, showId)).toBe(true);
    expect(canApproveTimeEntry(user, anotherEmployee, showId)).toBe(false);
  });

  it('allows company System Administration but always blocks self approval', () => {
    const user = approvalUser(managerEmployeeId.toString(), {
      roleCode: 'SYSTEM_ADMIN',
      permissions: ['timesheet:approve'],
      scope: { type: 'company', ids: [] },
    });

    expect(canApproveTimeEntry(user, employee, showId)).toBe(true);
    expect(
      canApproveTimeEntry(
        user,
        { _id: managerEmployeeId, reportingManagerId: new Types.ObjectId() },
        showId,
      ),
    ).toBe(false);
  });
});
