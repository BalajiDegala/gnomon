import type { AuthUser } from '@gnomon/shared';
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Employee } from '../src/modules/employees/employee.model.js';
import { DailyTimecard } from '../src/modules/reconciliation/daily-timecard.model.js';
import {
  attendanceReportDepartment,
  attendanceReportEmployees,
} from '../src/modules/reporting/attendance-report-identity.js';
import { buildAttendanceDetails } from '../src/modules/reporting/reporting.service.js';

function employee({
  employeeCode = 'DDIH516',
  profileSource = 'users_csv',
  personnelId = '9516',
  cardNumber = 'CARD-516',
  firstName = 'Amar',
  lastName = 'Balaji Kamble',
  departmentName = 'Integration',
} = {}) {
  return new Employee({
    employeeCode,
    firstName,
    lastName,
    profileSource,
    attendanceIdentity: {
      source: 'door_workbook',
      personnelId,
      cardNumber,
      departmentName: 'Department Name',
      lastSeenAt: new Date('2026-09-22T12:00:00Z'),
    },
    hrProfile:
      profileSource === 'users_csv'
        ? { source: 'users_csv', fullName: `${firstName} ${lastName}`, departmentName }
        : null,
  }).toObject();
}

function door(overrides: Parameters<typeof employee>[0] = {}) {
  return employee({
    employeeCode: '516',
    personnelId: '516',
    profileSource: 'door_workbook',
    ...overrides,
  });
}

function queryResult<T>(value: T) {
  const query = {
    select: vi.fn(),
    sort: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn().mockResolvedValue(value),
  };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  return query;
}

afterEach(() => vi.restoreAllMocks());

describe('attendance report employee identity', () => {
  it('uses the HR identity and department for an older controller code with the same card', () => {
    const master = employee();
    const alias = door();
    const resolved = attendanceReportEmployees([master, alias]);

    expect(resolved.get(String(alias._id))).toBe(master);
    expect(attendanceReportDepartment(resolved.get(String(alias._id)))).toBe('Integration');
    expect(alias.employeeCode).toBe('516');
    expect(alias.attendanceIdentity?.departmentName).toBe('Department Name');
  });

  it('resolves both controller code formats independently of input order', () => {
    const master = employee({ personnelId: '516' });
    const alias = door({ employeeCode: '9516', personnelId: '9516' });
    expect(attendanceReportEmployees([alias, master]).get(String(alias._id))).toBe(master);
  });

  it('allows a unique matching card and full name for codes without a directory convention', () => {
    const master = employee({ employeeCode: 'HR-AMAR' });
    const alias = door({ employeeCode: 'DOOR-AMAR', personnelId: 'DOOR-AMAR' });
    expect(attendanceReportEmployees([master, alias]).get(String(alias._id))).toBe(master);
  });

  it('normalizes 556 and 9556 to DDIH556 even when cards change or are missing', () => {
    const master = employee({ employeeCode: 'DDIH556', personnelId: '9556' });
    for (const personnelId of ['556', '9556', '00556']) {
      for (const cardNumber of ['ANOTHER-CARD', '']) {
        const alias = door({ employeeCode: personnelId, personnelId, cardNumber });
        expect(attendanceReportEmployees([master, alias]).get(String(alias._id))).toBe(master);
      }
    }
  });

  it('does not resolve ambiguous directory codes or a master outside the supplied scope', () => {
    const master = employee();
    const alias = door();
    const otherMaster = employee({ employeeCode: 'DDIH0516', firstName: 'Different' });
    expect(attendanceReportEmployees([master, otherMaster, alias]).get(String(alias._id))).toBe(
      alias,
    );
    expect(attendanceReportEmployees([alias]).get(String(alias._id))).toBe(alias);
  });

  it('does not strip arbitrary numeric prefixes or match people by name alone', () => {
    const master = employee();
    for (const personnelId of ['10516', '11516']) {
      const alias = door({ employeeCode: personnelId, personnelId, cardNumber: '' });
      expect(attendanceReportEmployees([master, alias]).get(String(alias._id))).toBe(alias);
    }
    const unrelated = door({ employeeCode: '888', personnelId: '888', firstName: 'Different' });
    expect(attendanceReportEmployees([master, unrelated]).get(String(unrelated._id))).toBe(
      unrelated,
    );
  });

  it('does not use an ambiguous shared card as a fallback for an unknown code', () => {
    const first = employee({ employeeCode: 'HR-AMAR' });
    const second = employee({ employeeCode: 'HR-OTHER', firstName: 'Different' });
    const alias = door({ employeeCode: 'DOOR-AMAR', personnelId: 'DOOR-AMAR' });
    expect(attendanceReportEmployees([first, second, alias]).get(String(alias._id))).toBe(alias);
  });

  it('does not relabel a second HR employee or use a system identity as a master', () => {
    const first = employee();
    const second = employee({ employeeCode: '516' });
    expect(attendanceReportEmployees([first, second]).get(String(second._id))).toBe(second);
    const system = employee({ profileSource: 'system' });
    const alias = door();
    expect(attendanceReportEmployees([system, alias]).get(String(alias._id))).toBe(alias);
  });

  it('treats the controller department placeholder as missing and uses meaningful source metadata', () => {
    const alias = door();
    expect(attendanceReportDepartment(alias)).toBeNull();
    alias.attendanceIdentity!.departmentName = ' department NAME ';
    expect(attendanceReportDepartment(alias)).toBeNull();
    alias.attendanceIdentity!.departmentName = ' Paint ';
    expect(attendanceReportDepartment(alias)).toBe('Paint');
    alias.biometricProfile = {
      fullName: 'Amar Balaji Kamble',
      departmentName: 'Integration',
      designation: null,
      companyName: null,
      importedAt: new Date(),
    };
    expect(attendanceReportDepartment(alias)).toBe('Integration');
  });
});

describe('attendance details with controller aliases', () => {
  it('uses HR metadata even in a month containing only the older card profile', async () => {
    const master = employee();
    const alias = door();
    const employeeQuery = queryResult([master, alias]);
    vi.spyOn(Employee, 'find').mockReturnValue(employeeQuery as never);
    vi.spyOn(DailyTimecard, 'findOne').mockReturnValue(
      queryResult({ workDate: '2026-08-31' }) as never,
    );
    vi.spyOn(DailyTimecard, 'aggregate').mockReturnValue(queryResult([]) as never);
    const card = new DailyTimecard({
      employeeId: alias._id,
      workDate: '2026-08-31',
      sourceSummary: {
        accessCard: {
          status: 'complete',
          firstAt: new Date('2026-08-31T03:30:00Z'),
          lastAt: new Date('2026-08-31T12:30:00Z'),
          eventCount: 2,
          workedMinutes: 540,
        },
      },
    }).toObject();
    const find = vi.spyOn(DailyTimecard, 'find').mockReturnValue(queryResult([card]) as never);
    const user: AuthUser = {
      id: String(new Types.ObjectId()),
      employeeId: String(master._id),
      employeeCode: 'ADMIN',
      displayName: 'Report admin',
      email: 'admin@example.invalid',
      permissions: ['attendance:all:read'],
      scopes: [{ type: 'company', ids: [] }],
      grants: [
        {
          roleCode: 'SYSTEM_ADMIN',
          permissions: ['attendance:all:read'],
          scope: { type: 'company', ids: [] },
        },
      ],
    };

    const result = await buildAttendanceDetails(user, { month: '2026-08' });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: String(card._id),
      employeeId: String(master._id),
      employeeCode: 'DDIH516',
      employeeDisplayName: 'Amar Balaji Kamble',
      departmentName: 'Integration',
      workDate: '2026-08-31',
      accessCard: {
        firstAt: '2026-08-31T03:30:00.000Z',
        lastAt: '2026-08-31T12:30:00.000Z',
        eventCount: 2,
        workedMinutes: 540,
      },
    });
    expect(result.summary.scopedEmployees).toBe(1);
    expect(result.summary.employeesWithRecords).toBe(1);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: { $in: [master._id, alias._id] } }),
    );
    expect(employeeQuery.select).toHaveBeenCalledWith(
      expect.objectContaining({ profileSource: 1, hrProfile: 1, attendanceIdentity: 1 }),
    );
  });
});
