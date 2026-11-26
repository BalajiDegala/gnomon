import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MongoDB-backed checks for leave balance imports, sign-in lockout, the system
 * event log and stale timecard sessions. Runs with the same opt-in variable as
 * the attendance integration suite, on its own `<db>_features_test` database.
 */
const baseUri = process.env.GNOMON_IMPORT_TEST_MONGODB_URI;
process.env.SYSTEM_EVENTS_ENABLED = 'true';

const dataDir = fileURLToPath(new URL('../../../data/', import.meta.url));
const permanentFile = `${dataDir}permanentleavebalance.xlsx`;
const contractFile = `${dataDir}Contractleavebalance.xlsx`;

function featureUri(uri: string): string {
  const url = new URL(uri);
  const database = url.pathname.slice(1);
  if (!/^gnomon_import_changes_[a-z0-9_]*test$/.test(database)) {
    throw new Error('Use an isolated gnomon_import_changes_*test database');
  }
  url.pathname = `/${database.replace(/_test$/, '')}_features_test`;
  return url.toString();
}

describe.skipIf(!baseUri)('session features with MongoDB', () => {
  let Employee: typeof import('../src/modules/employees/employee.model.js').Employee;
  let LeaveBalance: typeof import('../src/modules/leaves/leave.model.js').LeaveBalance;
  let LeaveRequest: typeof import('../src/modules/leaves/leave.model.js').LeaveRequest;
  let WorkSession: typeof import('../src/modules/timecard/work-session.model.js').WorkSession;
  let SystemEvent: typeof import('../src/modules/system-events/system-event.model.js').SystemEvent;
  let importLeaveBalanceWorkbook: typeof import('../src/modules/imports/leave-balance-import.service.js').importLeaveBalanceWorkbook;
  let throttle: typeof import('../src/modules/auth/login-throttle.js');
  let events: typeof import('../src/modules/system-events/system-event.service.js');
  let startTimecard: typeof import('../src/modules/timecard/timecard.service.js').startTimecard;
  let migrateLegacySickLeave: typeof import('../src/modules/leaves/leave-type.migration.js').migrateLegacySickLeave;
  let importTimecardData: typeof import('../src/modules/imports/timecard-data-import.service.js').importTimecardData;
  let TimeEntry: typeof import('../src/modules/timesheets/time-entry.model.js').TimeEntry;
  let Show: typeof import('../src/modules/shows/show.model.js').Show;
  let DailyTimecard: typeof import('../src/modules/reconciliation/daily-timecard.model.js').DailyTimecard;
  const importedBy = new Types.ObjectId().toString();
  const metadata = { ipAddress: '10.0.0.5', userAgent: 'machine-A' };

  beforeAll(async () => {
    ({ Employee } = await import('../src/modules/employees/employee.model.js'));
    ({ LeaveBalance, LeaveRequest } = await import('../src/modules/leaves/leave.model.js'));
    ({ WorkSession } = await import('../src/modules/timecard/work-session.model.js'));
    ({ SystemEvent } = await import('../src/modules/system-events/system-event.model.js'));
    ({ importLeaveBalanceWorkbook } =
      await import('../src/modules/imports/leave-balance-import.service.js'));
    throttle = await import('../src/modules/auth/login-throttle.js');
    events = await import('../src/modules/system-events/system-event.service.js');
    ({ startTimecard } = await import('../src/modules/timecard/timecard.service.js'));
    ({ migrateLegacySickLeave } = await import('../src/modules/leaves/leave-type.migration.js'));
    ({ importTimecardData } =
      await import('../src/modules/imports/timecard-data-import.service.js'));
    ({ TimeEntry } = await import('../src/modules/timesheets/time-entry.model.js'));
    ({ Show } = await import('../src/modules/shows/show.model.js'));
    ({ DailyTimecard } = await import('../src/modules/reconciliation/daily-timecard.model.js'));
    await mongoose.connect(featureUri(baseUri!));
    await mongoose.connection.dropDatabase();
    await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).createIndexes()));
  }, 120_000);

  beforeEach(async () => {
    await Promise.all(
      Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
    );
    // Timecard starts fall back to the default shift.
    const { Shift } = await import('../src/modules/shifts/shift.model.js');
    const { STANDARD_SHIFT } = await import('../src/modules/shifts/shift.service.js');
    await Shift.create({
      ...STANDARD_SHIFT,
      nameKey: STANDARD_SHIFT.name.toLowerCase(),
      isDefault: true,
    });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  const employee = (employeeCode: string) =>
    Employee.create({
      employeeCode,
      firstName: employeeCode,
      lastName: 'Test',
      email: `${employeeCode.toLowerCase()}@example.test`,
      timezone: 'Asia/Kolkata',
      status: 'active',
    });

  describe('leave balance import', () => {
    it.runIf(existsSync(permanentFile))(
      'stores HRMS available balances so the leave page shows the sheet figure',
      async () => {
        const upendra = await employee('DDIH005');
        // Leave already pending in the app must not be deducted twice.
        await LeaveRequest.create({
          employeeId: upendra._id,
          managerEmployeeId: upendra._id,
          leaveType: 'casual',
          startDate: '2026-12-01',
          endDate: '2026-12-01',
          dayPart: 'full_day',
          requestedDays: 1,
          workingDates: ['2026-12-01'],
          reservedDates: ['2026-12-01'],
          reason: 'Pending in the app',
          status: 'pending_manager',
        });
        const result = await importLeaveBalanceWorkbook({
          fileName: 'permanentleavebalance.xlsx',
          workbookBuffer: readFileSync(permanentFile),
          importedBy,
        });
        expect(result).toMatchObject({ format: 'permanent', year: 2026, employeesUpdated: 1 });
        expect(result.unmatchedEmployeeCodes).toContain('DDIH009');
        expect(result.ignoredLeaveTypes).toHaveProperty('Work From Home');
        const balances = await LeaveBalance.find({ employeeId: upendra._id, year: 2026 }).lean();
        const byType = Object.fromEntries(balances.map((balance) => [balance.leaveType, balance]));
        // Sheet: casual/sick 2.5 available; 1 day pending in the app is added back.
        expect(byType.casual).toMatchObject({ entitledDays: 3.5, adjustedDays: 0 });
        expect(byType.earned).toMatchObject({ entitledDays: 50, adjustedDays: 0 });
        expect(byType.casual?.note).toContain('permanentleavebalance.xlsx');
      },
    );

    it.runIf(existsSync(contractFile))(
      'keeps negative contract balances and overwrites on re-import',
      async () => {
        const santosh = await employee('DDIC285');
        const input = {
          fileName: 'Contractleavebalance.xlsx',
          workbookBuffer: readFileSync(contractFile),
          importedBy,
        };
        await importLeaveBalanceWorkbook(input);
        const second = await importLeaveBalanceWorkbook(input);
        expect(second).toMatchObject({ format: 'contract', balancesWritten: 1 });
        const balances = await LeaveBalance.find({ employeeId: santosh._id }).lean();
        expect(balances).toHaveLength(1);
        expect(balances[0]).toMatchObject({
          leaveType: 'casual',
          entitledDays: 0,
          adjustedDays: -6,
        });
      },
    );

    it('rejects a file that is not a leave balance workbook', async () => {
      await expect(
        importLeaveBalanceWorkbook({
          fileName: 'notes.xlsx',
          workbookBuffer: Buffer.from('plain text'),
          importedBy,
        }),
      ).rejects.toMatchObject({ status: 400, code: 'INVALID_WORKBOOK' });
    });
  });

  describe('legacy sick leave migration', () => {
    it('folds sick balances into casual/sick leave', async () => {
      const person = await employee('MIG001');
      const other = await employee('MIG002');
      await LeaveBalance.collection.insertMany([
        {
          employeeId: person._id,
          leaveType: 'casual',
          year: 2026,
          entitledDays: 6,
          adjustedDays: 0,
        },
        { employeeId: person._id, leaveType: 'sick', year: 2026, entitledDays: 4, adjustedDays: 1 },
        { employeeId: other._id, leaveType: 'sick', year: 2026, entitledDays: 3, adjustedDays: 0 },
      ]);
      expect(await migrateLegacySickLeave()).toEqual({ requests: 0, balances: 2 });
      const merged = await LeaveBalance.find({ year: 2026 }).sort({ entitledDays: -1 }).lean();
      expect(
        merged.map((balance) => [balance.leaveType, balance.entitledDays, balance.adjustedDays]),
      ).toEqual([
        ['casual', 10, 1],
        ['casual', 3, 0],
      ]);
      expect(await migrateLegacySickLeave()).toEqual({ requests: 0, balances: 0 });
    });
  });

  describe('sign-in lockout', () => {
    it('locks a login ID after five failures without affecting others, and resets on success', async () => {
      const now = new Date('2026-11-23T05:00:00Z');
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await throttle.assertLoginAllowed('Balajid', '10.0.0.9', now);
        await throttle.recordLoginFailure('balajid', '10.0.0.9', now);
      }
      await expect(throttle.assertLoginAllowed('BALAJID', '10.0.0.9', now)).rejects.toMatchObject({
        status: 429,
        code: 'LOGIN_LOCKED',
      });
      await expect(
        throttle.assertLoginAllowed('someone', '10.0.0.9', now),
      ).resolves.toBeUndefined();
      const later = new Date(now.getTime() + 16 * 60_000);
      await expect(
        throttle.assertLoginAllowed('balajid', '10.0.0.9', later),
      ).resolves.toBeUndefined();
      await throttle.recordLoginSuccess('balajid');
      expect(await throttle.LoginAttempt.exists({ _id: 'user:balajid' })).toBeNull();
    });

    it('starts a fresh window once the previous one has passed', async () => {
      const now = new Date('2026-11-23T05:00:00Z');
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await throttle.recordLoginFailure('windowed', null, now);
      }
      const later = new Date(now.getTime() + 20 * 60_000);
      await throttle.recordLoginFailure('windowed', null, later);
      const attempt = await throttle.LoginAttempt.findById('user:windowed').lean();
      expect(attempt).toMatchObject({ failures: 1, lockedUntil: null });
    });
  });

  describe('system event log', () => {
    const waitForEvents = (count: number) =>
      vi.waitFor(async () => expect(await SystemEvent.countDocuments()).toBe(count), {
        timeout: 5_000,
      });

    it('stores, filters, pages and redacts events', async () => {
      for (let index = 0; index < 5; index += 1) {
        events.recordEvent({
          category: index % 2 ? 'leave' : 'auth',
          action: `test.action_${index}`,
          message: `Event number ${index}`,
          severity: index === 4 ? 'error' : 'info',
          actor: {
            type: 'user',
            id: null,
            employeeCode: index === 1 ? 'DDIH005' : 'DDI0001',
            label: null,
          },
          metadata: { index, password: 'secret-value', nested: { refreshToken: 'abc' } },
          requestId: `req-${index}-abcdef`,
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await waitForEvents(5);

      const first = await events.listSystemEvents({ limit: 2 });
      expect(first.events.map((event) => event.action)).toEqual(['test.action_4', 'test.action_3']);
      expect(first.events[0]).not.toHaveProperty('metadata');
      const second = await events.listSystemEvents({ limit: 2, cursor: first.nextCursor! });
      expect(second.events.map((event) => event.action)).toEqual([
        'test.action_2',
        'test.action_1',
      ]);

      expect(
        (await events.listSystemEvents({ limit: 50, category: ['leave'] })).events,
      ).toHaveLength(2);
      expect(
        (await events.listSystemEvents({ limit: 50, severity: ['error'] })).events,
      ).toHaveLength(1);
      expect(
        (await events.listSystemEvents({ limit: 50, employeeCode: 'DDIH005' })).events.map(
          (event) => event.action,
        ),
      ).toEqual(['test.action_1']);
      expect((await events.listSystemEvents({ limit: 50, q: 'req-3-abc' })).events).toHaveLength(1);
      expect((await events.listSystemEvents({ limit: 50, q: 'number 2' })).events).toHaveLength(1);

      const detail = await events.getSystemEvent(first.events[0]!.id);
      expect(detail.metadata).toEqual({
        index: 4,
        password: '[REDACTED]',
        nested: { refreshToken: '[REDACTED]' },
      });
      await expect(events.getSystemEvent('not-an-id')).rejects.toMatchObject({ status: 404 });

      const stored = await SystemEvent.findById(first.events[0]!.id).lean();
      const retentionDays =
        (stored!.expiresAt.getTime() - stored!.createdAt.getTime()) / 86_400_000;
      expect(retentionDays).toBe(180);
    });
  });

  describe('timecard data import', () => {
    const balaji = () =>
      Employee.create({
        employeeCode: 'DDIH334',
        firstName: 'Balaji',
        lastName: 'Degala',
        email: 'balaji.degala@example.test',
        timezone: 'Asia/Kolkata',
        status: 'active',
        hrProfile: {
          source: 'users_csv',
          userId: 'balajid',
          mailId: 'balaji.degala@example.test',
          fullName: 'Balaji Degala',
          departmentName: 'Systems',
          emailTriggers: [],
          importedAt: new Date(),
        },
      });
    const records = [
      {
        _id: { $oid: 'rec-closed' },
        login: 'balajid',
        date: { $date: '2023-05-03T19:10:50.932Z' },
        project: ['AUPS', 'Beetle', 'BA'],
        task: { AUPS: 'Published', BEETLE: 'started today' },
        start_time: '10:00:00',
        stop_time: '19:30:00',
        work_time: '9:10',
      },
      {
        _id: { $oid: 'rec-open' },
        login: 'balajid',
        date: { $date: '2023-05-05T11:49:09.006Z' },
        project: [],
        task: {},
        start_time: '11:49:09',
        stop_time: 'Working',
        work_time: '00:00',
      },
      {
        _id: { $oid: 'rec-unknown' },
        login: 'schaitanya',
        date: { $date: '2023-05-03T19:10:50.932Z' },
        project: ['BA'],
        task: {},
        start_time: '19:10:47',
        stop_time: '19:10:50',
        work_time: '9:10',
      },
    ];
    const upload = (data: unknown) =>
      importTimecardData({
        fileName: 'time_data.json',
        jsonText: JSON.stringify(data),
        importedBy,
      });

    it('creates sessions, project timesheet entries and shows, and reports unknown logins', async () => {
      const person = await balaji();
      const result = await upload(records);
      expect(result).toMatchObject({
        totalRecords: 3,
        importedRecords: 2,
        sessionsCreated: 2,
        sessionsUpdated: 0,
        openSessions: 1,
        timesheetEntries: 3,
        unmatchedLogins: ['schaitanya'],
      });
      expect(result.showsCreated.sort()).toEqual(['AUPS', 'BA', 'BEETLE']);
      expect(result.errors).toEqual([
        { rowNumber: 3, login: 'schaitanya', reason: 'No active Gnomon user has this login' },
      ]);

      const closed = await WorkSession.findOne({ 'importRef.recordId': 'rec-closed' }).lean();
      expect(closed).toMatchObject({
        employeeId: person._id,
        workDate: '2023-05-03',
        status: 'completed',
        durationMinutes: 570,
      });
      expect(closed!.startedAt.toISOString()).toBe('2023-05-03T04:30:00.000Z');
      const open = await WorkSession.findOne({ 'importRef.recordId': 'rec-open' }).lean();
      expect(open).toMatchObject({
        status: 'force_stopped',
        stoppedAt: null,
        workDate: '2023-05-05',
      });
      expect(await WorkSession.countDocuments({ status: 'running' })).toBe(0);

      const entries = await TimeEntry.find({ 'importRef.recordId': 'rec-closed' })
        .sort({ durationMinutes: -1 })
        .lean();
      expect(entries.map((entry) => entry.durationMinutes)).toEqual([184, 183, 183]);
      expect(entries.every((entry) => String(entry.workSessionId) === String(closed!._id))).toBe(
        true,
      );
      const shows = await Show.find().lean();
      const codeById = new Map(shows.map((show) => [String(show._id), show.code]));
      expect(
        Object.fromEntries(
          entries.map((entry) => [codeById.get(String(entry.showId)), entry.comment]),
        ),
      ).toEqual({ AUPS: 'Published', BEETLE: 'started today', BA: '' });

      // Attendance is refreshed for imported days.
      expect(
        await DailyTimecard.findOne({ employeeId: person._id, workDate: '2023-05-03' }).lean(),
      ).toMatchObject({ sourceSummary: { website: { sessionCount: 1 } } });
    });

    it('updates earlier imports instead of duplicating them', async () => {
      await balaji();
      await upload(records);
      const changed = structuredClone(records);
      changed[0]!.stop_time = '18:00:00';
      changed[0]!.project = ['AUPS'];
      const result = await upload(changed);
      expect(result).toMatchObject({ sessionsCreated: 0, sessionsUpdated: 2, showsCreated: [] });
      expect(await WorkSession.countDocuments({ 'importRef.recordId': 'rec-closed' })).toBe(1);
      expect(
        await WorkSession.findOne({ 'importRef.recordId': 'rec-closed' }).lean(),
      ).toMatchObject({ durationMinutes: 480 });
      const entries = await TimeEntry.find({ 'importRef.recordId': 'rec-closed' }).lean();
      expect(entries.map((entry) => entry.durationMinutes)).toEqual([550]);
    });

    it('skips records that overlap a session already recorded on the website', async () => {
      const person = await balaji();
      await WorkSession.create({
        employeeId: person._id,
        workDate: '2023-05-03',
        startedAt: new Date('2023-05-03T05:00:00Z'),
        stoppedAt: new Date('2023-05-03T06:00:00Z'),
        durationMinutes: 60,
        status: 'completed',
        startMetadata: metadata,
      });
      const result = await upload([records[0]]);
      expect(result.importedRecords).toBe(0);
      expect(result.errors[0]?.reason).toContain('Overlaps a timecard session already recorded');
      expect(await TimeEntry.countDocuments()).toBe(0);
    });

    it('rejects a file that is not a JSON array', async () => {
      await expect(
        importTimecardData({ fileName: 'x.json', jsonText: 'nope', importedBy }),
      ).rejects.toMatchObject({ status: 400, code: 'INVALID_TIMECARD_FILE' });
    });
  });

  describe('stale timecard sessions', () => {
    it('stops a session left open on an earlier day at 07:00 so today can start, and logs it', async () => {
      const person = await employee('TCD001');
      const stale = await WorkSession.create({
        employeeId: person._id,
        workDate: '2026-11-19',
        startedAt: new Date('2026-11-19T13:10:00Z'),
        status: 'running',
        startMetadata: metadata,
      });
      const today = await startTimecard(
        String(person._id),
        { ipAddress: '10.0.0.6', userAgent: 'machine-B' },
        {},
        new Date('2026-11-23T04:00:00Z'),
      );
      expect(today.activeSession).not.toBeNull();
      const closed = await WorkSession.findById(stale._id).lean();
      // Stopped at the 07:00 boundary that ended its workday, waiting for confirmation.
      expect(closed).toMatchObject({
        status: 'auto_stopped',
        stoppedAt: new Date('2026-11-20T01:30:00Z'),
        durationMinutes: 740,
      });
      expect(await WorkSession.countDocuments({ employeeId: person._id, status: 'running' })).toBe(
        1,
      );
      await vi.waitFor(async () =>
        expect(await SystemEvent.findOne({ action: 'timecard.auto_stopped' }).lean()).toMatchObject(
          { severity: 'warn', metadata: { workDate: '2026-11-19' } },
        ),
      );
    });

    it('stops forgotten timecards at 07:00 and lets the employee confirm from Catch-up', async () => {
      const autoStop = await import('../src/modules/timecard/auto-stop.service.js');
      const { listAttendanceActionItems } =
        await import('../src/modules/timecard/action-items.service.js');
      const person = await employee('TCD003');
      const other = await employee('TCD004');
      // Thursday 2026-11-19, started 09:42 India time and never stopped.
      const forgotten = await WorkSession.create({
        employeeId: person._id,
        workDate: '2026-11-19',
        startedAt: new Date('2026-11-19T04:12:00Z'),
        status: 'running',
        startMetadata: metadata,
      });
      const now = new Date('2026-11-23T06:00:00Z');
      const todays = await startTimecard(String(other._id), metadata, {}, now);

      expect(await autoStop.autoStopStaleSessions(now)).toEqual({ stopped: 1 });
      expect(await autoStop.autoStopStaleSessions(now)).toEqual({ stopped: 0 });
      expect(await WorkSession.findById(forgotten._id).lean()).toMatchObject({
        status: 'auto_stopped',
        stoppedAt: new Date('2026-11-20T01:30:00Z'),
      });
      // Today's running timecards are left alone.
      expect(todays.activeSession).not.toBeNull();
      expect(await WorkSession.countDocuments({ employeeId: other._id, status: 'running' })).toBe(
        1,
      );

      // Until confirmed the day is incomplete and shows in Catch-up with both options.
      const day = await DailyTimecard.findOne({ employeeId: person._id, workDate: '2026-11-19' })
        .lean()
        .exec();
      expect(day?.calculated?.status).toBe('partial');
      expect(day?.calculated?.anomalies).toContain('missing_web_stop');
      const pending = await listAttendanceActionItems(String(person._id), now);
      expect(pending.items.find((item) => item.workDate === '2026-11-19')).toMatchObject({
        kind: 'partial',
        source: 'website',
        missingEvent: 'closing',
        autoStopped: {
          sessionId: String(forgotten._id),
          startedAt: '2026-11-19T04:12:00.000Z',
          stoppedAt: '2026-11-20T01:30:00.000Z',
          // Standard shift end, 18:30 India time.
          suggestedEnd: '2026-11-19T13:00:00.000Z',
        },
      });

      // Someone else cannot confirm it.
      await expect(
        autoStop.confirmAutoStop(
          String(other._id),
          'aaaaaaaaaaaaaaaaaaaaaaaa',
          String(forgotten._id),
          now,
        ),
      ).rejects.toMatchObject({ status: 409, code: 'AUTO_STOP_NOT_PENDING' });

      await autoStop.confirmAutoStop(
        String(person._id),
        'aaaaaaaaaaaaaaaaaaaaaaaa',
        String(forgotten._id),
        now,
      );
      const confirmed = await WorkSession.findById(forgotten._id).lean();
      expect(confirmed).toMatchObject({ status: 'completed', durationMinutes: 1278 });
      expect(confirmed?.stopConfirmedAt).toEqual(now);
      const after = await DailyTimecard.findOne({ employeeId: person._id, workDate: '2026-11-19' })
        .lean()
        .exec();
      expect(after?.calculated?.anomalies).not.toContain('missing_web_stop');
      const cleared = await listAttendanceActionItems(String(person._id), now);
      // The timecard question is answered (any remaining office-punch issues are separate).
      const clearedDay = cleared.items.find((item) => item.workDate === '2026-11-19');
      expect(clearedDay?.autoStopped ?? null).toBeNull();
      expect(clearedDay?.issues ?? []).not.toContain('Timecard not stopped');

      await expect(
        autoStop.confirmAutoStop(
          String(person._id),
          'aaaaaaaaaaaaaaaaaaaaaaaa',
          String(forgotten._id),
          now,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('still refuses a second start on the same day', async () => {
      const person = await employee('TCD002');
      const now = new Date('2026-11-23T04:00:00Z');
      await startTimecard(String(person._id), metadata, {}, now);
      await expect(
        startTimecard(String(person._id), metadata, {}, new Date(now.getTime() + 60_000)),
      ).rejects.toMatchObject({ status: 409, code: 'TIMECARD_ALREADY_RUNNING' });
    });
  });
  describe('deleting employees', () => {
    const admin = (employeeId: string) => ({
      id: new Types.ObjectId().toString(),
      employeeId,
      employeeCode: 'ADMIN',
      displayName: 'Admin',
      email: 'admin@example.test',
      permissions: ['employee:update' as const],
      scopes: [{ type: 'company', ids: [] }],
      grants: [
        {
          roleCode: 'SYSTEM_ADMIN' as const,
          permissions: ['employee:update' as const],
          scope: { type: 'company' as const, ids: [] },
        },
      ],
    });

    it('removes a person with no history, with their login and leave balances', async () => {
      const { deleteEmployee } = await import('../src/modules/employees/employee.service.js');
      const { User } = await import('../src/modules/auth/user.model.js');
      const actor = await employee('ADM1');
      const person = await employee('MIST1');
      await User.create({
        employeeId: person._id,
        email: 'mist1@example.test',
        passwordHash: 'x',
        status: 'active',
      });
      await LeaveBalance.create({
        employeeId: person._id,
        leaveType: 'casual',
        year: 2026,
        entitledDays: 5,
      });

      await deleteEmployee(admin(String(actor._id)), String(person._id));

      expect(await Employee.exists({ _id: person._id })).toBeNull();
      expect(await User.exists({ employeeId: person._id })).toBeNull();
      expect(await LeaveBalance.exists({ employeeId: person._id })).toBeNull();
    });

    it('keeps people with history or who approve for others, and never deletes yourself', async () => {
      const { deleteEmployee } = await import('../src/modules/employees/employee.service.js');
      const actor = await employee('ADM2');
      const worker = await employee('WORK1');
      const manager = await employee('MGR1');
      await Employee.updateOne({ _id: worker._id }, { reportingManagerId: manager._id });
      const now = new Date();
      await startTimecard(String(worker._id), metadata, {}, now);

      await expect(
        deleteEmployee(admin(String(actor._id)), String(worker._id)),
      ).rejects.toMatchObject({ status: 409, code: 'EMPLOYEE_HAS_HISTORY' });
      await expect(
        deleteEmployee(admin(String(actor._id)), String(manager._id)),
      ).rejects.toMatchObject({ status: 409, code: 'EMPLOYEE_IS_APPROVER' });
      await expect(
        deleteEmployee(admin(String(actor._id)), String(actor._id)),
      ).rejects.toMatchObject({ status: 409, code: 'EMPLOYEE_DELETE_SELF' });
      expect(await Employee.countDocuments()).toBe(3);
    });
  });
  describe('availability', () => {
    it('follows the timecard by default and hides it behind a manual mode', async () => {
      const availability = await import('../src/modules/availability/availability.service.js');
      const viewer = await employee('VIEW1');
      const worker = await employee('WORKA');
      const idle = await employee('IDLE1');
      await startTimecard(String(worker._id), metadata, {}, new Date());

      const find = async (id: unknown) =>
        (await availability.listAvailability(String(viewer._id))).people.find(
          (person) => person.employeeId === String(id),
        )!;

      expect(await find(worker._id)).toMatchObject({
        status: 'available',
        ipAddress: '10.0.0.5',
        loginId: 'worka',
        email: 'worka@example.test',
      });
      expect((await find(worker._id)).since).not.toBeNull();
      expect(await find(idle._id)).toMatchObject({ status: 'away', ipAddress: null });
      expect(await find(viewer._id)).toMatchObject({ isMe: true });

      // Do not disturb hides the running timecard, its start time and machine.
      await availability.setMyAvailabilityMode(String(worker._id), 'busy');
      expect(await find(worker._id)).toMatchObject({
        status: 'busy',
        ipAddress: null,
        since: null,
      });
      expect(await availability.getMyAvailability(String(worker._id))).toEqual({
        mode: 'busy',
        status: 'busy',
      });

      // Always available shows available even with no timecard running.
      await availability.setMyAvailabilityMode(String(idle._id), 'available');
      expect(await find(idle._id)).toMatchObject({ status: 'available', ipAddress: null });

      await availability.setMyAvailabilityMode(String(worker._id), 'auto');
      expect(await find(worker._id)).toMatchObject({ status: 'available', ipAddress: '10.0.0.5' });
    });
  });

  describe('announcements', () => {
    it('lets managers message everyone or departments, with bell entries and read state', async () => {
      const service = await import('../src/modules/announcements/announcement.service.js');
      const { Notification } = await import('../src/modules/notifications/notification.model.js');
      const inDepartment = async (code: string, departmentName: string) => {
        const person = await employee(code);
        person.biometricProfile = {
          fullName: `${code} Test`,
          departmentName,
          designation: null,
          companyName: null,
          importedAt: new Date(),
        };
        return person.save();
      };
      const lead = await inDepartment('LEAD1', 'Compositing');
      const comp = await inDepartment('COMP1', 'Compositing');
      const fx = await inDepartment('FX001', 'FX');
      const roto = await inDepartment('ROTO1', 'Roto ');
      await Employee.updateOne({ _id: comp._id }, { reportingManagerId: lead._id });
      const viewer = (
        person: { _id: unknown; employeeCode: string },
        roleCode?: 'SYSTEM_ADMIN',
      ) => ({
        employeeId: String(person._id),
        displayName: `${person.employeeCode} Test`,
        grants: roleCode
          ? [{ roleCode, permissions: [], scope: { type: 'company' as const, ids: [] } }]
          : [],
      });

      // Plain employees cannot send; someone with direct reports can.
      expect(await service.canSendAnnouncements(viewer(fx))).toBe(false);
      await expect(
        service.createAnnouncement(viewer(fx), {
          title: 'Hello',
          message: 'Not allowed',
          audience: { type: 'all' },
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(await service.canSendAnnouncements(viewer(lead))).toBe(true);

      expect(await service.listAnnouncementDepartments()).toEqual([
        { name: 'Compositing', employeeCount: 2 },
        { name: 'FX', employeeCount: 1 },
        { name: 'Roto', employeeCount: 1 },
      ]);

      // Department match ignores case and spacing; the sender is not a recipient.
      const sent = await service.createAnnouncement(viewer(lead), {
        title: 'Render farm maintenance',
        message: 'The farm is down from 18:00 to 20:00 today.',
        audience: { type: 'departments', departments: ['compositing', 'roto'] },
        durationDays: 3,
      });
      expect(sent).toMatchObject({ recipientCount: 2, sentByMe: true, canWithdraw: true });
      await expect(
        service.createAnnouncement(viewer(lead), {
          title: 'Typo',
          message: 'Unknown department',
          audience: { type: 'departments', departments: ['Lighting'] },
        }),
      ).rejects.toMatchObject({ status: 400 });

      const bell = await Notification.find({ entityId: sent.id }).lean();
      expect(bell.map((row) => String(row.recipientEmployeeId)).sort()).toEqual(
        [String(comp._id), String(roto._id)].sort(),
      );
      expect(bell[0]).toMatchObject({ kind: 'announcement', href: '/', readAt: null });

      const compFeed = await service.listAnnouncementFeed(viewer(comp));
      expect(compFeed.canSend).toBe(false);
      expect(compFeed.items).toEqual([
        expect.objectContaining({
          title: 'Render farm maintenance',
          senderName: 'LEAD1 Test',
          readAt: null,
          sentByMe: false,
          canWithdraw: false,
        }),
      ]);
      expect((await service.listAnnouncementFeed(viewer(fx))).items).toEqual([]);
      expect((await service.listAnnouncementFeed(viewer(lead))).items[0]?.sentByMe).toBe(true);

      await service.markAnnouncementRead(viewer(comp), sent.id);
      expect((await service.listAnnouncementFeed(viewer(comp))).items[0]?.readAt).not.toBeNull();

      // Expired messages leave the Overview page.
      const later = new Date(Date.now() + 4 * 24 * 60 * 60_000);
      expect((await service.listAnnouncementFeed(viewer(comp), later)).items).toEqual([]);

      // Only the sender or a system admin may withdraw; it removes the bell entries.
      await expect(service.withdrawAnnouncement(viewer(comp), sent.id)).rejects.toMatchObject({
        status: 403,
      });
      const everyone = await service.createAnnouncement(viewer(fx, 'SYSTEM_ADMIN'), {
        title: 'Office closed Friday',
        message: 'Diwali holiday.',
        audience: { type: 'all' },
      });
      expect(everyone.recipientCount).toBe(3);
      await service.withdrawAnnouncement(viewer(fx, 'SYSTEM_ADMIN'), sent.id);
      expect(await Notification.countDocuments({ entityId: sent.id })).toBe(0);
      expect((await service.listAnnouncementFeed(viewer(comp))).items.map((i) => i.title)).toEqual([
        'Office closed Friday',
      ]);
    });
  });
});
