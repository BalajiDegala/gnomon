import { createHash } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { strToU8, zipSync } from 'fflate';
import type { AuthUser } from '@gnomon/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { app } from '../src/app.js';
import { AttendanceEvent } from '../src/modules/attendance/attendance-event.model.js';
import { getAttendanceSignals } from '../src/modules/attendance/attendance.service.js';
import { issueAccessToken } from '../src/modules/auth/auth.service.js';
import { User } from '../src/modules/auth/user.model.js';
import { Employee } from '../src/modules/employees/employee.model.js';
import { EmployeeAuditEvent } from '../src/modules/employees/employee-audit.model.js';
import { listEmployees } from '../src/modules/employees/employee.service.js';
import { EmployeeDirectoryDtoSchema } from '@gnomon/shared';
import { importUserDirectoryCsv } from '../src/modules/imports/user-directory-import.service.js';
import { AttendanceImportChange } from '../src/modules/imports/attendance-import-change.model.js';
import {
  deleteAttendanceImport,
  previewImportDeletion,
  previewAttendanceReplacement,
  replaceAttendancePeriod,
  restoreAttendanceChange,
} from '../src/modules/imports/attendance-import-change.service.js';
import { parseAttendanceCsv } from '../src/modules/imports/attendance-import.parser.js';
import { importAttendanceCsv } from '../src/modules/imports/attendance-import.service.js';
import { ImportBatch } from '../src/modules/imports/import-batch.model.js';
import {
  AttendanceWriteLock,
  withAttendanceWriteLock,
} from '../src/modules/imports/attendance-write-lock.js';
import { DailyTimecard } from '../src/modules/reconciliation/daily-timecard.model.js';
import * as reconciliation from '../src/modules/reconciliation/reconciliation.service.js';
import { RoleAssignment } from '../src/modules/roles/role.model.js';
import { ensureSystemRoles } from '../src/modules/roles/system-roles.js';
import { WorkSession } from '../src/modules/timecard/work-session.model.js';
import {
  buildAttendanceDetails,
  buildWorkforceReport,
} from '../src/modules/reporting/reporting.service.js';
import { RegularisationRequest } from '../src/modules/regularisations/regularisation.model.js';
import { parseDoorAttendanceWorkbook } from '../src/modules/imports/door-attendance-workbook.parser.js';

const uri = process.env.GNOMON_IMPORT_TEST_MONGODB_URI;
const actorId = new Types.ObjectId().toString();
const reportUser: AuthUser = {
  id: actorId,
  employeeId: new Types.ObjectId().toString(),
  employeeCode: 'REPORTADMIN',
  displayName: 'Report Admin',
  email: 'report@example.invalid',
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
const header = 'employee_code,occurred_at,event_type';
const csv = (time = '09:00', code = 'TEST001', date = '2026-06-01') =>
  `${header}\n${code},${date} ${time}:00,in\n${code},${date} 18:00:00,out`;
const period = { from: '2026-06-01', to: '2026-06-01' };
const upload = (csvText = csv(), source: 'biometric' | 'access_card' = 'biometric') =>
  importAttendanceCsv({
    csvText,
    source,
    importedBy: actorId,
    fileName: 'attendance.csv',
  });
const replacement = (fileContent = csv('09:30')) => ({
  fileContent,
  source: 'biometric' as const,
  importType: 'csv' as const,
  fileName: 'corrected.csv',
  importedBy: actorId,
  period,
  parse: () => parseAttendanceCsv(fileContent, 'biometric'),
});
const confirmation = (preview: { previewToken: string }) => ({
  previewToken: preview.previewToken,
  reason: 'Correct source export',
});

describe.skipIf(!uri)('attendance deletion and replacement with MongoDB', () => {
  beforeAll(async () => {
    const database = new URL(uri!).pathname.slice(1);
    if (!/^gnomon_import_changes_[a-z0-9_]*test$/.test(database))
      throw new Error('Use an isolated gnomon_import_changes_*test database');
    await mongoose.connect(uri!);
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  }, 60000);
  beforeEach(async () => {
    await Promise.all(
      Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
    );
    await Employee.create({
      employeeCode: 'TEST001',
      firstName: 'Test',
      lastName: 'One',
      email: 'one@example.invalid',
    });
    await Employee.create({
      employeeCode: 'TEST002',
      firstName: 'Test',
      lastName: 'Two',
      email: 'two@example.invalid',
    });
  }, 30000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const biometricSummary = (code = 'NEW001', name = 'New Employee', department = 'Animation') =>
    `Date,Employee Code,Employee Name,In Time,Out Time,Department,Degination,Company\n2026-06-01,${code},${name},09:00,18:00,${department},Artist,Studio`;

  it('creates visible biometric profiles and audited attendance without granting login access, and skips retries', async () => {
    const content = biometricSummary();
    const result = await upload(content);
    expect(result.batch).toMatchObject({
      status: 'completed',
      successfulRows: 2,
      failedRows: 0,
      provisionedEmployees: 1,
    });
    const employee = await Employee.findOne({ employeeCode: 'NEW001' }).orFail();
    expect(employee).toMatchObject({
      firstName: 'New',
      lastName: 'Employee',
      profileSource: 'biometric_csv',
      status: 'active',
    });
    expect(employee.biometricProfile).toMatchObject({
      fullName: 'New Employee',
      departmentName: 'Animation',
      designation: 'Artist',
      companyName: 'Studio',
    });
    expect(employee.email).toMatch(/@gnomon\.invalid$/);
    expect(await User.countDocuments()).toBe(0);
    expect(await RoleAssignment.countDocuments()).toBe(0);
    expect(
      await EmployeeAuditEvent.countDocuments({ employeeId: employee._id, action: 'created' }),
    ).toBe(1);
    const employeeUser: AuthUser = {
      ...reportUser,
      permissions: ['employee:read'],
      grants: [
        {
          roleCode: 'SYSTEM_ADMIN',
          permissions: ['employee:read'],
          scope: { type: 'company', ids: [] },
        },
      ],
    };
    const directory = EmployeeDirectoryDtoSchema.parse(
      await listEmployees(employeeUser, { search: 'Animation' }),
    );
    expect(directory.employees).toHaveLength(1);
    expect(directory.employees[0]?.biometricProfile?.departmentName).toBe('Animation');
    expect((await upload(content)).replayed).toBe(true);
    const retry = await upload(biometricSummary('NEW001', 'New Employee', 'Changed department'));
    expect(retry.batch).toMatchObject({
      successfulRows: 0,
      duplicateRows: 2,
      provisionedEmployees: 0,
    });
    expect(await Employee.countDocuments()).toBe(3);
    expect(await AttendanceEvent.countDocuments({ removedAt: null })).toBe(2);
    expect((await Employee.findById(employee._id))?.biometricProfile?.departmentName).toBe(
      'Animation',
    );
  });

  it('reuses unique existing employees and keeps directory details intact', async () => {
    const employee = await Employee.findOne({ employeeCode: 'TEST001' }).orFail();
    const result = await upload(biometricSummary('BIO-ALIAS', 'Test One'));
    expect(result.batch).toMatchObject({
      provisionedEmployees: 0,
      failedRows: 0,
      successfulRows: 2,
    });
    expect(await AttendanceEvent.countDocuments({ employeeId: employee._id })).toBe(2);
    expect(await Employee.countDocuments()).toBe(2);
    expect((await Employee.findById(employee._id))?.email).toBe('one@example.invalid');
  });

  it('recovers a previously partial batch and skips its existing punches on the same-file retry', async () => {
    const existing = biometricSummary('TEST001', 'Test One');
    const original = await upload(existing);
    const content =
      existing + '\n2026-06-01,NEW001,New Employee,09:00,18:00,Animation,Artist,Studio';
    await ImportBatch.updateOne(
      { _id: original.batch.id },
      {
        $set: {
          fileHash: createHash('sha256').update(content).digest('hex'),
          status: 'partial',
          failedRows: 2,
        },
      },
    );
    const result = await upload(content);
    expect(result.batch).toMatchObject({
      id: original.batch.id,
      status: 'completed',
      successfulRows: 2,
      duplicateRows: 2,
      failedRows: 0,
      provisionedEmployees: 1,
    });
    expect(
      await AttendanceEvent.countDocuments({ importBatchId: original.batch.id, removedAt: null }),
    ).toBe(4);
    expect(await Employee.countDocuments()).toBe(3);
    expect((await upload(content)).replayed).toBe(true);
  });

  it('enriches an automatically created employee through the HR directory without duplicating attendance', async () => {
    await upload(biometricSummary());
    const before = await Employee.findOne({ employeeCode: 'NEW001' }).orFail();
    const result = await importUserDirectoryCsv({
      fileName: 'users.csv',
      importedBy: actorId,
      csvText:
        'Emp ID,User ID,Mail ID,Emp name,New Designation,Dept,Leave Approver 1,Leave Approver 2,Email Triggers\nNEW001,new.employee,new.employee@example.invalid,New Employee,Senior Artist,Animation,,,',
    });
    expect(result).toMatchObject({ createdEmployees: 0, updatedEmployees: 1, errors: [] });
    const after = await Employee.findOne({ employeeCode: 'NEW001' }).orFail();
    expect(after._id.equals(before._id)).toBe(true);
    expect(after).toMatchObject({
      profileSource: 'users_csv',
      email: 'new.employee@example.invalid',
    });
    expect(await Employee.countDocuments()).toBe(3);
    expect(await AttendanceEvent.countDocuments({ employeeId: after._id })).toBe(2);
    expect(await User.countDocuments()).toBe(0);
  });

  it.each(['inactive', 'ambiguous', 'conflicting', 'missing name', 'invalid times', 'blank times'])(
    'does not create employees from %s input',
    async (kind) => {
      let content = biometricSummary();
      if (kind === 'inactive') {
        await Employee.updateOne({ employeeCode: 'TEST001' }, { $set: { status: 'inactive' } });
        // An active name match must not bypass an inactive exact code.
        content = biometricSummary('TEST001', 'Test Two');
      }
      if (kind === 'ambiguous') {
        await Employee.updateOne({ employeeCode: 'TEST002' }, { $set: { lastName: 'One' } });
        content = biometricSummary('NEW001', 'Test One');
      }
      if (kind === 'conflicting')
        content += '\n2026-06-01,NEW001,Other Employee,09:00,18:00,Animation,Artist,Studio';
      if (kind === 'missing name') content = biometricSummary('NEW001', '');
      if (kind === 'invalid times') content = content.replace('09:00,18:00', 'bad,bad');
      if (kind === 'blank times') content = content.replace('09:00,18:00', ',');
      const result = await upload(content);
      expect(result.batch.provisionedEmployees).toBe(0);
      expect(result.batch.successfulRows).toBe(0);
      expect(await Employee.countDocuments()).toBe(2);
      expect(await User.countDocuments()).toBe(0);
      expect(await EmployeeAuditEvent.countDocuments()).toBe(0);
      if (kind !== 'blank times') {
        expect(result.batch.failedRows).toBeGreaterThan(0);
        await expect(previewAttendanceReplacement(replacement(content))).rejects.toMatchObject({
          code: 'REPLACEMENT_INVALID',
        });
      } else expect(result.batch.ignoredRows).toBe(1);
    },
  );

  it('creates missing biometric employees only when a replacement is committed', async () => {
    await upload();
    const input = replacement(biometricSummary());
    const review = await previewAttendanceReplacement(input);
    expect(review).toMatchObject({ existingEvents: 2, replacementEvents: 2 });
    expect(await Employee.countDocuments()).toBe(2);
    expect(await EmployeeAuditEvent.countDocuments()).toBe(0);
    const result = await replaceAttendancePeriod(input, confirmation(review));
    expect(result.batch).toMatchObject({
      successfulRows: 2,
      provisionedEmployees: 1,
      failedRows: 0,
    });
    expect(await Employee.countDocuments()).toBe(3);
    expect(await AttendanceEvent.countDocuments({ removedAt: null })).toBe(2);
  });

  it('invalidates a biometric replacement preview after employee mappings change', async () => {
    await upload();
    const input = replacement(biometricSummary());
    const review = await previewAttendanceReplacement(input);
    await Employee.create({
      employeeCode: 'NEW001',
      firstName: 'New',
      lastName: 'Employee',
      email: 'new@example.invalid',
    });
    await expect(replaceAttendancePeriod(input, confirmation(review))).rejects.toMatchObject({
      code: 'IMPORT_PREVIEW_STALE',
    });
    expect(await AttendanceEvent.countDocuments({ removedAt: null })).toBe(2);
    expect(await AttendanceImportChange.countDocuments()).toBe(0);
  });

  it('deletes only the selected batch, retains evidence, and allows the same file again', async () => {
    const original = await upload();
    const duplicate = await upload(csv() + '\n');
    await upload(csv(), 'access_card');
    const employee = await Employee.findOne({ employeeCode: 'TEST001' }).orFail();
    const session = await WorkSession.create({
      employeeId: employee._id,
      workDate: period.from,
      startedAt: new Date('2026-06-01T04:00:00Z'),
      stoppedAt: new Date('2026-06-01T12:00:00Z'),
      durationMinutes: 480,
      status: 'completed',
      startMetadata: { ipAddress: '127.0.0.1', userAgent: 'test' },
    });
    expect((await previewImportDeletion(duplicate.batch.id)).existingEvents).toBe(0);
    const removed = await deleteAttendanceImport(
      original.batch.id,
      actorId,
      confirmation(await previewImportDeletion(original.batch.id)),
    );
    expect(removed.removedEvents).toBe(2);
    expect(await AttendanceEvent.countDocuments({ source: 'biometric', removedAt: null })).toBe(0);
    expect(
      await AttendanceEvent.countDocuments({ source: 'biometric', removedAt: { $ne: null } }),
    ).toBe(2);
    expect(await AttendanceEvent.countDocuments({ source: 'access_card', removedAt: null })).toBe(
      2,
    );
    expect(await WorkSession.exists({ _id: session._id })).toBeTruthy();
    expect(await Employee.countDocuments()).toBe(2);
    expect(
      (await getAttendanceSignals(String(employee._id), period.from)).biometric?.eventCount,
    ).toBe(0);
    const card = await DailyTimecard.findOne({
      employeeId: employee._id,
      workDate: period.from,
    }).lean();
    expect(card?.sourceSummary?.biometric?.eventCount).toBe(0);
    expect((await ImportBatch.findById(original.batch.id))?.status).toBe('deleted');
    expect((await upload()).batch.successfulRows).toBe(2);
    expect(
      await AttendanceImportChange.countDocuments({
        status: 'completed',
        actorId,
        action: 'delete',
      }),
    ).toBe(1);
  });

  it('replaces the entire selected source period, removing omitted employees while preserving other dates and sources', async () => {
    await upload(csv());
    await upload(csv('09:00', 'TEST002'));
    await upload(csv('09:00', 'TEST001', '2026-06-02'));
    await upload(csv(), 'access_card');
    const input = replacement();
    const review = await previewAttendanceReplacement(input);
    expect(review).toMatchObject({ existingEvents: 4, existingEmployees: 2, replacementEvents: 2 });
    const result = await replaceAttendancePeriod(input, confirmation(review));
    expect(result.removedEvents).toBe(4);
    expect(result.batch?.successfulRows).toBe(2);
    const employee = await Employee.findOne({ employeeCode: 'TEST001' }).orFail();
    const omitted = await Employee.findOne({ employeeCode: 'TEST002' }).orFail();
    expect(
      (await getAttendanceSignals(String(employee._id), period.from)).biometric.firstEventAt,
    ).toBe('2026-06-01T04:00:00.000Z');
    expect(
      (await getAttendanceSignals(String(omitted._id), period.from)).biometric?.eventCount,
    ).toBe(0);
    expect(await AttendanceEvent.countDocuments({ workDate: '2026-06-02', removedAt: null })).toBe(
      2,
    );
    expect(await AttendanceEvent.countDocuments({ source: 'access_card', removedAt: null })).toBe(
      2,
    );
    expect(
      (await DailyTimecard.findOne({ employeeId: employee._id, workDate: period.from }).lean())
        ?.sourceSummary?.biometric?.workedMinutes,
    ).toBe(510);
    expect(
      (await DailyTimecard.findOne({ employeeId: omitted._id, workDate: period.from }).lean())
        ?.sourceSummary?.biometric?.eventCount,
    ).toBe(0);
    const details = await buildAttendanceDetails(reportUser, { month: '2026-06' });
    expect(details.rows).toHaveLength(2);
    expect(details.rows.every((row) => row.employeeCode === 'TEST001')).toBe(true);
    expect(details.summary.employeesWithRecords).toBe(1);
  });

  it('removes empty summaries from report rows, counts and month discovery after the last source is deleted', async () => {
    const bio = await upload();
    const door = await upload(csv(), 'access_card');
    const employee = await Employee.findOne({ employeeCode: 'TEST001' }).orFail();
    await reconciliation.reconcileDailyTimecard(String(employee._id), '2026-07-01');
    const initial = await buildAttendanceDetails(reportUser, {});
    expect(initial.latestRecordedMonth).toBe('2026-06');
    expect(initial.availableMonths.map((month) => month.month)).toEqual(['2026-06']);
    await deleteAttendanceImport(
      bio.batch.id,
      actorId,
      confirmation(await previewImportDeletion(bio.batch.id)),
    );
    const remaining = await buildAttendanceDetails(reportUser, { month: '2026-06' });
    expect(remaining.rows).toHaveLength(1);
    expect(remaining.rows[0]?.biometric.eventCount).toBe(0);
    expect(remaining.rows[0]?.accessCard.eventCount).toBe(2);
    await deleteAttendanceImport(
      door.batch.id,
      actorId,
      confirmation(await previewImportDeletion(door.batch.id)),
    );
    const empty = await buildAttendanceDetails(reportUser, { month: '2026-06' });
    expect(empty.rows).toEqual([]);
    expect(empty.summary).toMatchObject({
      scopedEmployees: 2,
      employeesWithRecords: 0,
      attendanceDays: 0,
    });
    expect(empty.latestRecordedMonth).toBeNull();
    expect(empty.availableMonths).toEqual([]);
    const workforce = await buildWorkforceReport(reportUser, {
      dateFrom: period.from,
      dateTo: period.to,
    });
    expect(workforce.attendance).toEqual([]);
    expect(workforce.summary.attendanceRecords).toBe(0);
    expect(await DailyTimecard.countDocuments()).toBe(2);
    await upload();
    const restored = await buildAttendanceDetails(reportUser, { month: '2026-06' });
    expect(restored.rows).toHaveLength(1);
    expect(restored.availableMonths[0]?.biometricEvents).toBe(2);
  });

  it('continues to report website attendance after all imported punches are removed', async () => {
    const original = await upload();
    const employee = await Employee.findOne({ employeeCode: 'TEST001' }).orFail();
    await WorkSession.create({
      employeeId: employee._id,
      workDate: period.from,
      startedAt: new Date('2026-06-01T04:00:00Z'),
      stoppedAt: new Date('2026-06-01T12:00:00Z'),
      durationMinutes: 480,
      status: 'completed',
      startMetadata: { ipAddress: '127.0.0.1', userAgent: 'test' },
    });
    await deleteAttendanceImport(
      original.batch.id,
      actorId,
      confirmation(await previewImportDeletion(original.batch.id)),
    );
    const details = await buildAttendanceDetails(reportUser, { month: '2026-06' });
    expect(details.rows).toHaveLength(1);
    expect(details.rows[0]?.biometric.eventCount).toBe(0);
    expect(details.rows[0]?.website.sessionCount).toBe(1);
    expect(details.availableMonths[0]?.websiteSessions).toBe(1);
  });

  it('allows a duplicate-only file to supply attendance again after its original events were deleted', async () => {
    const original = await upload();
    const duplicate = await upload(csv() + '\n');
    expect(duplicate.batch.successfulRows).toBe(0);
    await deleteAttendanceImport(
      original.batch.id,
      actorId,
      confirmation(await previewImportDeletion(original.batch.id)),
    );
    expect((await ImportBatch.findById(duplicate.batch.id))?.status).toBe('completed');
    const restored = await upload(csv() + '\n');
    expect(restored.replayed).toBe(false);
    expect(restored.batch.successfulRows).toBe(2);
  });

  it.each([
    [`${header}\nTEST001,not-a-time,in`, 'REPLACEMENT_INVALID'],
    [csv('09:00', 'UNKNOWN'), 'REPLACEMENT_INVALID'],
    [csv('09:00', 'TEST001', '2026-06-02'), 'REPLACEMENT_OUTSIDE_PERIOD'],
    [header, 'REPLACEMENT_INVALID'],
  ])('rejects invalid replacement before changing data: %s', async (content, code) => {
    await upload();
    await expect(previewAttendanceReplacement(replacement(content))).rejects.toMatchObject({
      code,
    });
    expect(await AttendanceEvent.countDocuments({ removedAt: null })).toBe(2);
    expect(await AttendanceImportChange.countDocuments()).toBe(0);
  });

  it('rejects a stale preview and serializes concurrent writes', async () => {
    const original = await upload();
    const input = replacement();
    const review = await previewAttendanceReplacement(input);
    await upload(csv('08:00'));
    await expect(replaceAttendancePeriod(input, confirmation(review))).rejects.toMatchObject({
      code: 'IMPORT_PREVIEW_STALE',
    });
    await withAttendanceWriteLock(async () => {
      await expect(upload(csv('07:30'))).rejects.toMatchObject({ code: 'ATTENDANCE_BUSY' });
      await expect(
        deleteAttendanceImport(
          original.batch.id,
          actorId,
          confirmation(await previewImportDeletion(original.batch.id)),
        ),
      ).rejects.toMatchObject({ code: 'ATTENDANCE_BUSY' });
    });
    expect(await AttendanceWriteLock.countDocuments()).toBe(0);
  });

  it('rolls back removed punches, file replay and timecards when replacement insertion fails', async () => {
    const original = await upload();
    const input = replacement();
    const review = await previewAttendanceReplacement(input);
    vi.spyOn(AttendanceEvent, 'bulkWrite').mockRejectedValueOnce(
      new Error('Simulated storage error'),
    );
    await expect(replaceAttendancePeriod(input, confirmation(review))).rejects.toThrow(
      'Simulated storage error',
    );
    expect(await AttendanceEvent.countDocuments({ removedAt: null })).toBe(2);
    expect((await upload()).replayed).toBe(true);
    expect((await ImportBatch.findById(original.batch.id))?.removedAt).toBeNull();
    expect(await AttendanceImportChange.countDocuments({ status: 'rolled_back' })).toBe(1);
    expect(await AttendanceWriteLock.countDocuments()).toBe(0);
  });

  it('rolls back inserted replacement punches when recalculation fails', async () => {
    await upload();
    const input = replacement();
    const review = await previewAttendanceReplacement(input);
    vi.spyOn(reconciliation, 'reconcileDailyTimecard').mockRejectedValueOnce(
      new Error('Simulated calculation error'),
    );
    await expect(replaceAttendancePeriod(input, confirmation(review))).rejects.toThrow(
      'Simulated calculation error',
    );
    expect(await AttendanceEvent.countDocuments({ removedAt: null })).toBe(2);
    const employee = await Employee.findOne({ employeeCode: 'TEST001' }).orFail();
    expect(
      (await getAttendanceSignals(String(employee._id), period.from)).biometric.firstEventAt,
    ).toBe('2026-06-01T03:30:00.000Z');
    expect(await AttendanceImportChange.countDocuments({ status: 'rolled_back' })).toBe(1);
  });

  it('enforces authentication, company import scope, and previews through the HTTP API', async () => {
    const original = await upload();
    const employee = await Employee.findOne({ employeeCode: 'TEST001' }).orFail();
    const user = await User.create({
      employeeId: employee._id,
      email: employee.email,
      passwordHash: 'not-a-real-password',
    });
    const token = await issueAccessToken({
      userId: String(user._id),
      tokenVersion: user.tokenVersion,
    });
    const path = `/api/v1/imports/${original.batch.id}`;
    expect((await request(app).delete(path).send({})).status).toBe(401);
    expect(
      (await request(app).get(`${path}/delete-preview`).auth(token, { type: 'bearer' })).status,
    ).toBe(403);
    const roles = await ensureSystemRoles();
    const assignment = await RoleAssignment.create({
      userId: user._id,
      roleId: roles.get('ATTENDANCE_ADMIN')!._id,
      scopeType: 'department',
      scopeIds: [new Types.ObjectId()],
      grantedBy: user._id,
    });
    expect(
      (await request(app).get(`${path}/delete-preview`).auth(token, { type: 'bearer' })).status,
    ).toBe(403);
    assignment.scopeType = 'company';
    await assignment.save();
    const review = await request(app).get(`${path}/delete-preview`).auth(token, { type: 'bearer' });
    expect(review.status).toBe(200);
    expect(review.body.existingEvents).toBe(2);
    expect(
      (await request(app).delete(path).auth(token, { type: 'bearer' }).send({ reason: 'x' }))
        .status,
    ).toBe(400);
    const applied = await request(app)
      .delete(path)
      .auth(token, { type: 'bearer' })
      .send(confirmation(review.body));
    expect(applied.status).toBe(200);
    expect(applied.body.removedEvents).toBe(2);
    const endpoint = `/api/v1/imports/attendance/biometric/csv?from=${period.from}&to=${period.to}`;
    const replacementPreview = await request(app)
      .post(`${endpoint}&mode=replacement-preview`)
      .auth(token, { type: 'bearer' })
      .set('Content-Type', 'text/csv')
      .send(csv('09:30'));
    expect(replacementPreview.status).toBe(200);
    expect(await AttendanceEvent.countDocuments({ removedAt: null })).toBe(0);
    const replaced = await request(app)
      .post(`${endpoint}&mode=replace`)
      .auth(token, { type: 'bearer' })
      .set('Content-Type', 'text/csv')
      .set('x-preview-token', replacementPreview.body.previewToken)
      .set('x-change-reason', 'Corrected%20export')
      .send(csv('09:30'));
    expect(replaced.status).toBe(200);
    expect(replaced.body.batch.successfulRows).toBe(2);
  });

  it('keeps imports paused after failed recovery and can restore the interrupted change later', async () => {
    await upload();
    const input = replacement();
    const review = await previewAttendanceReplacement(input);
    vi.spyOn(reconciliation, 'reconcileDailyTimecard')
      .mockRejectedValueOnce(new Error('Simulated calculation error'))
      .mockRejectedValueOnce(new Error('Simulated rollback error'));
    await expect(replaceAttendancePeriod(input, confirmation(review))).rejects.toMatchObject({
      code: 'ATTENDANCE_RECOVERY_REQUIRED',
    });
    expect(await AttendanceWriteLock.countDocuments()).toBe(1);
    await expect(upload()).rejects.toMatchObject({ code: 'ATTENDANCE_BUSY' });
    vi.restoreAllMocks();
    const interrupted = await AttendanceImportChange.findOne({
      status: 'recovery_required',
    }).orFail();
    await restoreAttendanceChange(String(interrupted._id));
    expect((await AttendanceImportChange.findById(interrupted._id))?.status).toBe('rolled_back');
    expect(await AttendanceEvent.countDocuments({ removedAt: null })).toBe(2);
    const employee = await Employee.findOne({ employeeCode: 'TEST001' }).orFail();
    expect(
      (await getAttendanceSignals(String(employee._id), period.from)).biometric.firstEventAt,
    ).toBe('2026-06-01T03:30:00.000Z');
  });

  it('preserves approved attendance finalisation when the underlying import is removed', async () => {
    const original = await upload();
    const employee = await Employee.findOne({ employeeCode: 'TEST001' }).orFail();
    const correction = await RegularisationRequest.create({
      employeeId: employee._id,
      managerEmployeeId: new Types.ObjectId(),
      workDate: period.from,
      source: 'biometric',
      missingEvent: 'both',
      requestedStart: new Date('2026-06-01T04:30:00Z'),
      requestedEnd: new Date('2026-06-01T13:30:00Z'),
      requestedMinutes: 540,
      reason: 'Approved historical correction',
      status: 'approved',
      currentStep: 3,
    });
    await deleteAttendanceImport(
      original.batch.id,
      actorId,
      confirmation(await previewImportDeletion(original.batch.id)),
    );
    const card = await DailyTimecard.findOne({
      employeeId: employee._id,
      workDate: period.from,
    }).lean();
    expect(card?.finalisation).toMatchObject({
      isFinal: true,
      finalSource: 'regularised',
      finalMinutes: 540,
    });
    expect(await RegularisationRequest.exists({ _id: correction._id })).toBeTruthy();
    const details = await buildAttendanceDetails(reportUser, { month: '2026-06' });
    expect(details.rows).toHaveLength(1);
    expect(details.availableMonths[0]?.attendanceDays).toBe(1);
  });

  it('previews a door workbook without creating profiles, then replaces access-card attendance', async () => {
    await upload(csv(), 'access_card');
    const headers = [
      'Time',
      'Event Point',
      'Event Description',
      'Event Level',
      'Personnel ID',
      'First Name',
      'Last Name',
      'Card Number',
      'Department Name',
      'Reader Name',
      'Verification Mode',
    ];
    const rows = [
      headers,
      ...['09:00', '18:00'].map((time, index) => [
        `2026-06-01 ${time}:00`,
        'NORTH-ZONE-ENTRY',
        'Normal Verify Open',
        'Normal',
        '6000',
        'DoorOnly',
        'Profile',
        'CARD-6000',
        'Test Department',
        index === 0 ? 'North-In' : 'North-Out',
        'Only Card',
      ]),
    ];
    const xml = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map(
        (row, i) =>
          `<row r="${i + 1}">${row.map((value, j) => `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${value}</t></is></c>`).join('')}</row>`,
      )
      .join('')}</sheetData></worksheet>`;
    const buffer = Buffer.from(zipSync({ 'xl/worksheets/sheet1.xml': strToU8(xml) }));
    const input = {
      source: 'access_card' as const,
      importType: 'door_workbook' as const,
      fileContent: buffer,
      fileName: 'door.xlsx',
      importedBy: actorId,
      period,
      parse: () => parseDoorAttendanceWorkbook(buffer),
    };
    const review = await previewAttendanceReplacement(input);
    expect(review).toMatchObject({ existingEvents: 2, replacementEvents: 2 });
    expect(await Employee.countDocuments()).toBe(2);
    const result = await replaceAttendancePeriod(input, confirmation(review));
    expect(result.batch?.successfulRows).toBe(2);
    expect(result.batch?.provisionedEmployees).toBe(1);
    expect(await Employee.countDocuments()).toBe(3);
  });

  it('uses the 07:00 workday for replacement boundaries and rejects calendar-date-only inclusion', async () => {
    await upload();
    const overnight = `${header}\nTEST001,2026-06-01 23:00:00,in\nTEST001,2026-06-02 06:00:00,out`;
    const input = replacement(overnight);
    const review = await previewAttendanceReplacement(input);
    await replaceAttendancePeriod(input, confirmation(review));
    expect(await AttendanceEvent.countDocuments({ removedAt: null, workDate: period.from })).toBe(
      2,
    );
    await expect(
      previewAttendanceReplacement(replacement(`${header}\nTEST001,2026-06-01 06:00:00,out`)),
    ).rejects.toMatchObject({ code: 'REPLACEMENT_OUTSIDE_PERIOD' });
  });
});
