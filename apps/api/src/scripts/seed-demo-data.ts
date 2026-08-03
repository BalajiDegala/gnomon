import 'dotenv/config';

import bcrypt from 'bcryptjs';
import type { HydratedDocument } from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { AttendanceEvent } from '../modules/attendance/attendance-event.model.js';
import { User, type UserDocument } from '../modules/auth/user.model.js';
import { Employee, type EmployeeDocument } from '../modules/employees/employee.model.js';
import {
  EmployeeLocationAssignment,
  Location,
  type LocationDocument,
} from '../modules/employees/location.model.js';
import { ImportBatch } from '../modules/imports/import-batch.model.js';
import { LeaveBalance, LeaveRequest } from '../modules/leaves/leave.model.js';
import { DailyTimecard } from '../modules/reconciliation/daily-timecard.model.js';
import { reconcileDailyTimecard } from '../modules/reconciliation/reconciliation.service.js';
import { RegularisationRequest } from '../modules/regularisations/regularisation.model.js';
import { RoleAssignment } from '../modules/roles/role.model.js';
import { ensureSystemRoles } from '../modules/roles/system-roles.js';
import { Show, ShowAssignment, type ShowDocument } from '../modules/shows/show.model.js';
import { WorkSession } from '../modules/timecard/work-session.model.js';
import { TimeEntry } from '../modules/timesheets/time-entry.model.js';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-password-123';
const ADMIN_EMAIL = process.env.DEMO_SEED_ADMIN_EMAIL ?? 'admin@example.com';

const employeeDefinitions = [
  {
    code: 'DEMO1001',
    firstName: 'Meera',
    lastName: 'Kapoor',
    email: 'demo.manager@example.com',
    managerCode: null,
    locationCode: 'DEMO-MUM',
    specialistRole: 'REPORTING_MANAGER',
  },
  {
    code: 'DEMO1002',
    firstName: 'Arjun',
    lastName: 'Mehta',
    email: 'demo.showmanager@example.com',
    managerCode: 'DEMO1001',
    locationCode: 'DEMO-MUM',
    specialistRole: 'SHOW_MANAGER',
  },
  {
    code: 'DEMO1003',
    firstName: 'Nisha',
    lastName: 'Iyer',
    email: 'demo.hr@example.com',
    managerCode: null,
    locationCode: 'DEMO-MUM',
    specialistRole: 'HR',
  },
  {
    code: 'DEMO1004',
    firstName: 'Vikram',
    lastName: 'Shah',
    email: 'demo.attendance@example.com',
    managerCode: null,
    locationCode: 'DEMO-MUM',
    specialistRole: 'ATTENDANCE_ADMIN',
  },
  {
    code: 'DEMO2001',
    firstName: 'Asha',
    lastName: 'Rao',
    email: 'demo.asha@example.com',
    managerCode: 'DEMO1001',
    locationCode: 'DEMO-MUM',
    specialistRole: null,
  },
  {
    code: 'DEMO2002',
    firstName: 'Rohan',
    lastName: 'Das',
    email: 'demo.rohan@example.com',
    managerCode: 'DEMO1001',
    locationCode: 'DEMO-MUM',
    specialistRole: null,
  },
  {
    code: 'DEMO2003',
    firstName: 'Isha',
    lastName: 'Menon',
    email: 'demo.isha@example.com',
    managerCode: 'DEMO1001',
    locationCode: 'DEMO-MUM',
    specialistRole: null,
  },
  {
    code: 'DEMO2004',
    firstName: 'Dev',
    lastName: 'Patel',
    email: 'demo.dev@example.com',
    managerCode: 'DEMO1001',
    locationCode: 'DEMO-MUM',
    specialistRole: null,
  },
  {
    code: 'DEMO2005',
    firstName: 'Tara',
    lastName: 'Singh',
    email: 'demo.tara@example.com',
    managerCode: 'DEMO1001',
    locationCode: 'DEMO-MUM',
    specialistRole: null,
  },
] as const;

const showDefinitions = [
  { code: 'DEMO-ORION', name: 'Project Orion' },
  { code: 'DEMO-NOVA', name: 'Nova Campaign' },
  { code: 'DEMO-ATLAS', name: 'Atlas Trailer' },
] as const;

const showCodes = showDefinitions.map((show) => show.code);

function currentIndiaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
}

function shiftDate(workDate: string, days: number): string {
  const date = new Date(`${workDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdays(direction: -1 | 1, count: number): string[] {
  const result: string[] = [];
  let date = currentIndiaDate();
  while (result.length < count) {
    date = shiftDate(date, direction);
    const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    if (day !== 0 && day !== 6) result.push(date);
  }
  return result;
}

function indiaDateTime(workDate: string, time: string): Date {
  return new Date(`${workDate}T${time}:00+05:30`);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

async function seedDemoData(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo data cannot be seeded when NODE_ENV=production');
  }
  if (DEMO_PASSWORD.length < 12) {
    throw new Error('DEMO_PASSWORD must contain at least 12 characters');
  }

  await connectDatabase();

  const adminUser = await User.findOne({ email: ADMIN_EMAIL }).exec();
  if (!adminUser) {
    throw new Error(`Administrator ${ADMIN_EMAIL} must be seeded before demo data`);
  }

  const roles = await ensureSystemRoles();
  const employeeRole = roles.get('EMPLOYEE');
  if (!employeeRole) throw new Error('The Employee role could not be seeded');

  const locations = new Map<string, HydratedDocument<LocationDocument>>();
  for (const definition of [{ code: 'DEMO-MUM', name: 'Mumbai Demo Studio' }]) {
    const location = await Location.findOneAndUpdate(
      { code: definition.code },
      {
        $set: {
          name: definition.name,
          status: 'active',
          updatedByUserId: adminUser._id,
        },
        $setOnInsert: { createdByUserId: adminUser._id },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).exec();
    locations.set(definition.code, location);
  }
  await Location.updateMany({ code: 'DEMO-HYD' }, { $set: { status: 'inactive' } }).exec();

  const employees = new Map<string, HydratedDocument<EmployeeDocument>>();
  for (const definition of employeeDefinitions) {
    const employee = await Employee.findOneAndUpdate(
      { employeeCode: definition.code },
      {
        $set: {
          firstName: definition.firstName,
          lastName: definition.lastName,
          email: definition.email,
          timezone: 'Asia/Kolkata',
          locationId: locations.get(definition.locationCode)!._id,
          status: 'active',
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).exec();
    employees.set(definition.code, employee);
  }

  for (const definition of employeeDefinitions) {
    await Employee.updateOne(
      { _id: employees.get(definition.code)!._id },
      {
        $set: {
          reportingManagerId: definition.managerCode
            ? employees.get(definition.managerCode)!._id
            : null,
        },
      },
    ).exec();
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 8);
  const users = new Map<string, HydratedDocument<UserDocument>>();
  for (const definition of employeeDefinitions) {
    const employee = employees.get(definition.code)!;
    const user = await User.findOneAndUpdate(
      { employeeId: employee._id },
      {
        $set: {
          email: definition.email,
          passwordHash,
          status: 'active',
          tokenVersion: 0,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).exec();
    users.set(definition.code, user);
  }

  const showManagerUser = users.get('DEMO1002')!;
  const shows = new Map<string, HydratedDocument<ShowDocument>>();
  for (const definition of showDefinitions) {
    const show = await Show.findOneAndUpdate(
      { code: definition.code },
      {
        $set: { name: definition.name, status: 'active', createdBy: showManagerUser._id },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).exec();
    shows.set(definition.code, show);
  }

  const employeeIds = [...employees.values()].map((employee) => employee._id);
  const userIds = [...users.values()].map((user) => user._id);
  const showIds = [...shows.values()].map((show) => show._id);
  await Promise.all([
    RoleAssignment.deleteMany({ userId: { $in: userIds } }),
    EmployeeLocationAssignment.deleteMany({ employeeId: { $in: employeeIds } }),
    ShowAssignment.deleteMany({
      $or: [{ showId: { $in: showIds } }, { employeeId: { $in: employeeIds } }],
    }),
    AttendanceEvent.deleteMany({ fingerprint: /^demo:/ }),
    WorkSession.deleteMany({ employeeId: { $in: employeeIds } }),
    TimeEntry.deleteMany({ employeeId: { $in: employeeIds } }),
    DailyTimecard.deleteMany({ employeeId: { $in: employeeIds } }),
    LeaveRequest.deleteMany({ employeeId: { $in: employeeIds } }),
    LeaveBalance.deleteMany({ employeeId: { $in: employeeIds } }),
    RegularisationRequest.deleteMany({ employeeId: { $in: employeeIds } }),
  ]);

  const pastWorkDates = weekdays(-1, 10);
  const futureWorkDates = weekdays(1, 5);
  const effectiveFrom = shiftDate(pastWorkDates.at(-1)!, -30);
  const effectiveFromDate = indiaDateTime(effectiveFrom, '07:00');

  await EmployeeLocationAssignment.insertMany(
    employeeDefinitions.map((definition) => ({
      employeeId: employees.get(definition.code)!._id,
      locationId: locations.get(definition.locationCode)!._id,
      effectiveFrom,
      effectiveUntil: null,
      assignedByUserId: adminUser._id,
    })),
  );

  const roleAssignments: Array<Record<string, unknown>> = employeeDefinitions.map((definition) => ({
    userId: users.get(definition.code)!._id,
    roleId: employeeRole._id,
    scopeType: 'self' as const,
    scopeIds: [employees.get(definition.code)!._id],
    validFrom: effectiveFromDate,
    validUntil: null,
    grantedBy: adminUser._id,
  }));
  const artistIds = employeeDefinitions
    .filter((definition) => definition.code.startsWith('DEMO2'))
    .map((definition) => employees.get(definition.code)!._id);
  roleAssignments.push({
    userId: users.get('DEMO1001')!._id,
    roleId: roles.get('REPORTING_MANAGER')!._id,
    scopeType: 'direct_reports',
    scopeIds: artistIds,
    validFrom: effectiveFromDate,
    validUntil: null,
    grantedBy: adminUser._id,
  });
  roleAssignments.push({
    userId: showManagerUser._id,
    roleId: roles.get('SHOW_MANAGER')!._id,
    scopeType: 'show',
    scopeIds: showIds,
    validFrom: effectiveFromDate,
    validUntil: null,
    grantedBy: adminUser._id,
  });
  roleAssignments.push({
    userId: users.get('DEMO1003')!._id,
    roleId: roles.get('HR')!._id,
    scopeType: 'company',
    scopeIds: [],
    validFrom: effectiveFromDate,
    validUntil: null,
    grantedBy: adminUser._id,
  });
  roleAssignments.push({
    userId: users.get('DEMO1004')!._id,
    roleId: roles.get('ATTENDANCE_ADMIN')!._id,
    scopeType: 'company',
    scopeIds: [],
    validFrom: effectiveFromDate,
    validUntil: null,
    grantedBy: adminUser._id,
  });
  await RoleAssignment.insertMany(roleAssignments);

  const managerEmployee = employees.get('DEMO1001')!;
  const managerUser = users.get('DEMO1001')!;
  const leaveDecisionAt = addMinutes(indiaDateTime(pastWorkDates[0]!, '18:30'), 30);
  await LeaveRequest.insertMany([
    {
      employeeId: employees.get('DEMO2001')!._id,
      managerEmployeeId: managerEmployee._id,
      leaveType: 'casual',
      startDate: futureWorkDates[0],
      endDate: futureWorkDates[0],
      dayPart: 'full_day',
      requestedDays: 1,
      workingDates: [futureWorkDates[0]],
      reservedDates: [futureWorkDates[0]],
      reservationActive: true,
      reason: 'Demo family appointment request awaiting manager review.',
      status: 'pending_manager',
      approvalPolicyVersion: 'LEAVE_V1',
      decision: null,
      submittedAt: leaveDecisionAt,
    },
    {
      employeeId: employees.get('DEMO2002')!._id,
      managerEmployeeId: managerEmployee._id,
      leaveType: 'sick',
      startDate: futureWorkDates[1],
      endDate: futureWorkDates[1],
      dayPart: 'full_day',
      requestedDays: 1,
      workingDates: [futureWorkDates[1]],
      reservedDates: [futureWorkDates[1]],
      reservationActive: true,
      reason: 'Demo approved medical leave for calendar visibility.',
      status: 'approved',
      approvalPolicyVersion: 'LEAVE_V1',
      decision: {
        decision: 'approved',
        actorUserId: managerUser._id,
        actorEmployeeId: managerEmployee._id,
        actorDisplayName: 'Meera Kapoor',
        actorRole: 'reporting_manager',
        comment: 'Approved for the demo calendar.',
        decidedAt: addMinutes(leaveDecisionAt, 60),
      },
      submittedAt: leaveDecisionAt,
    },
    {
      employeeId: employees.get('DEMO2003')!._id,
      managerEmployeeId: managerEmployee._id,
      leaveType: 'earned',
      startDate: futureWorkDates[2],
      endDate: futureWorkDates[2],
      dayPart: 'full_day',
      requestedDays: 1,
      workingDates: [futureWorkDates[2]],
      reservedDates: [],
      reservationActive: false,
      reason: 'Demo rejected leave request retained for history.',
      status: 'rejected',
      approvalPolicyVersion: 'LEAVE_V1',
      decision: {
        decision: 'rejected',
        actorUserId: managerUser._id,
        actorEmployeeId: managerEmployee._id,
        actorDisplayName: 'Meera Kapoor',
        actorRole: 'reporting_manager',
        comment: 'Delivery coverage is required on this date.',
        decidedAt: addMinutes(leaveDecisionAt, 90),
      },
      submittedAt: leaveDecisionAt,
    },
    {
      employeeId: employees.get('DEMO2004')!._id,
      managerEmployeeId: managerEmployee._id,
      leaveType: 'casual',
      startDate: pastWorkDates[4],
      endDate: pastWorkDates[4],
      dayPart: 'full_day',
      requestedDays: 1,
      workingDates: [pastWorkDates[4]],
      reservedDates: [pastWorkDates[4]],
      reservationActive: true,
      reason: 'Demo historical approved leave for attendance reporting.',
      status: 'approved',
      approvalPolicyVersion: 'LEAVE_V1',
      decision: {
        decision: 'approved',
        actorUserId: managerUser._id,
        actorEmployeeId: managerEmployee._id,
        actorDisplayName: 'Meera Kapoor',
        actorRole: 'reporting_manager',
        comment: 'Approved and reflected in attendance.',
        decidedAt: addMinutes(indiaDateTime(pastWorkDates[4]!, '18:30'), 30),
      },
      submittedAt: indiaDateTime(pastWorkDates[4]!, '18:30'),
    },
  ]);

  await LeaveBalance.insertMany(
    employeeDefinitions
      .filter((definition) => definition.code.startsWith('DEMO2'))
      .flatMap((definition) =>
        [
          ['casual', 8],
          ['sick', 6],
          ['earned', 12],
        ].map(([leaveType, entitledDays]) => ({
          employeeId: employees.get(definition.code)!._id,
          leaveType,
          year: Number(currentIndiaDate().slice(0, 4)),
          entitledDays,
          adjustedDays: 0,
          note: 'Demo annual balance',
          updatedByUserId: users.get('DEMO1003')!._id,
        })),
      ),
  );

  const regularisationDecisionAt = indiaDateTime(pastWorkDates[1]!, '19:00');
  await RegularisationRequest.insertMany([
    {
      employeeId: employees.get('DEMO2002')!._id,
      managerEmployeeId: managerEmployee._id,
      workDate: pastWorkDates[1],
      source: 'biometric',
      missingEvent: 'closing',
      requestedStart: indiaDateTime(pastWorkDates[1]!, '09:05'),
      requestedEnd: indiaDateTime(pastWorkDates[1]!, '18:05'),
      requestedMinutes: 540,
      reason: 'Demo missing biometric closing punch after a completed shift.',
      status: 'pending_manager',
      currentStep: 1,
      approvalPolicyVersion: 'REGULARISATION_V1',
      deduplicationKey: `demo:DEMO2002:${pastWorkDates[1]}:biometric`,
      decisions: [],
      submittedAt: regularisationDecisionAt,
    },
    {
      employeeId: employees.get('DEMO2003')!._id,
      managerEmployeeId: managerEmployee._id,
      workDate: pastWorkDates[2],
      source: 'website',
      missingEvent: 'both',
      requestedStart: indiaDateTime(pastWorkDates[2]!, '09:00'),
      requestedEnd: indiaDateTime(pastWorkDates[2]!, '18:00'),
      requestedMinutes: 540,
      reason: 'Demo website session correction waiting for final HR review.',
      status: 'pending_hr',
      currentStep: 2,
      approvalPolicyVersion: 'REGULARISATION_V1',
      deduplicationKey: `demo:DEMO2003:${pastWorkDates[2]}:website`,
      decisions: [
        {
          step: 1,
          decision: 'approved',
          actorUserId: managerUser._id,
          actorEmployeeId: managerEmployee._id,
          actorDisplayName: 'Meera Kapoor',
          actorRole: 'reporting_manager',
          comment: 'Website activity is supported by biometric evidence.',
          decidedAt: addMinutes(regularisationDecisionAt, 30),
        },
      ],
      submittedAt: regularisationDecisionAt,
    },
    {
      employeeId: employees.get('DEMO2005')!._id,
      managerEmployeeId: managerEmployee._id,
      workDate: pastWorkDates[3],
      source: 'biometric',
      missingEvent: 'closing',
      requestedStart: indiaDateTime(pastWorkDates[3]!, '09:10'),
      requestedEnd: indiaDateTime(pastWorkDates[3]!, '18:10'),
      requestedMinutes: 540,
      reason: 'Demo approved biometric correction with complete decision history.',
      status: 'approved',
      currentStep: 3,
      approvalPolicyVersion: 'REGULARISATION_V1',
      deduplicationKey: `demo:DEMO2005:${pastWorkDates[3]}:biometric`,
      decisions: [
        {
          step: 1,
          decision: 'approved',
          actorUserId: managerUser._id,
          actorEmployeeId: managerEmployee._id,
          actorDisplayName: 'Meera Kapoor',
          actorRole: 'reporting_manager',
          comment: 'Shift details are consistent.',
          decidedAt: addMinutes(regularisationDecisionAt, 30),
        },
        {
          step: 2,
          decision: 'approved',
          actorUserId: users.get('DEMO1003')!._id,
          actorEmployeeId: employees.get('DEMO1003')!._id,
          actorDisplayName: 'Nisha Iyer',
          actorRole: 'hr',
          comment: 'Approved for final attendance.',
          decidedAt: addMinutes(regularisationDecisionAt, 90),
        },
      ],
      submittedAt: regularisationDecisionAt,
    },
  ]);

  const biometricBatch = await ImportBatch.findOneAndUpdate(
    { source: 'biometric', fileHash: 'demo-seed-biometric-v1' },
    {
      $set: {
        importType: 'csv',
        fileName: 'demo-biometric-history.csv',
        periodStart: indiaDateTime(pastWorkDates.at(-1)!, '09:00'),
        periodEnd: indiaDateTime(pastWorkDates[0]!, '18:30'),
        failedRows: 0,
        duplicateRows: 0,
        status: 'completed',
        importedBy: adminUser._id,
        errors: [],
        errorsTruncated: false,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).exec();
  const accessBatch = await ImportBatch.findOneAndUpdate(
    { source: 'access_card', fileHash: 'demo-seed-access-v1' },
    {
      $set: {
        importType: 'csv',
        fileName: 'demo-access-card-history.csv',
        periodStart: indiaDateTime(pastWorkDates.at(-1)!, '08:50'),
        periodEnd: indiaDateTime(pastWorkDates[0]!, '18:30'),
        failedRows: 0,
        duplicateRows: 0,
        status: 'completed',
        importedBy: adminUser._id,
        errors: [],
        errorsTruncated: false,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).exec();

  const attendanceEvents: Array<Record<string, unknown>> = [];
  const workSessions: Array<Record<string, unknown>> = [];
  for (const [employeeIndex, definition] of employeeDefinitions.entries()) {
    for (const [dateIndex, workDate] of pastWorkDates.entries()) {
      const isApprovedLeave = definition.code === 'DEMO2004' && dateIndex === 4;
      if (isApprovedLeave) continue;

      const minuteOffset = employeeIndex % 4;
      const biometricStart = indiaDateTime(workDate, `09:0${minuteOffset}`);
      const biometricEnd = indiaDateTime(workDate, `18:1${minuteOffset}`);
      const accessStart = addMinutes(biometricStart, -5);
      const accessEnd = addMinutes(biometricEnd, 5);
      const missingBiometricOut =
        (definition.code === 'DEMO2002' && dateIndex === 1) ||
        (definition.code === 'DEMO2005' && dateIndex === 3);
      const missingWebsiteSession = definition.code === 'DEMO2003' && dateIndex === 2;

      attendanceEvents.push(
        {
          employeeId: employees.get(definition.code)!._id,
          source: 'biometric',
          eventType: 'in',
          occurredAt: biometricStart,
          workDate,
          sourceEmployeeCode: definition.code,
          sourceEventId: `DEMO-${definition.code}-${workDate}-BIO-IN`,
          importBatchId: biometricBatch._id,
          device: {
            deviceId: 'DEMO-BIO-01',
            deviceName: 'Demo studio biometric',
            locationId: locations.get(definition.locationCode)!._id,
          },
          rawPayload: { seed: 'demo' },
          fingerprint: `demo:biometric:${definition.code}:${workDate}:in`,
          isSynthetic: true,
          correctionRequestId: null,
        },
        {
          employeeId: employees.get(definition.code)!._id,
          source: 'access_card',
          eventType: 'entry',
          occurredAt: accessStart,
          workDate,
          sourceEmployeeCode: definition.code,
          sourceEventId: `DEMO-${definition.code}-${workDate}-ACCESS-IN`,
          importBatchId: accessBatch._id,
          device: {
            deviceId: 'DEMO-GATE-01',
            deviceName: 'Demo studio gate',
            locationId: locations.get(definition.locationCode)!._id,
          },
          rawPayload: { seed: 'demo' },
          fingerprint: `demo:access:${definition.code}:${workDate}:entry`,
          isSynthetic: true,
          correctionRequestId: null,
        },
        {
          employeeId: employees.get(definition.code)!._id,
          source: 'access_card',
          eventType: 'exit',
          occurredAt: accessEnd,
          workDate,
          sourceEmployeeCode: definition.code,
          sourceEventId: `DEMO-${definition.code}-${workDate}-ACCESS-OUT`,
          importBatchId: accessBatch._id,
          device: {
            deviceId: 'DEMO-GATE-01',
            deviceName: 'Demo studio gate',
            locationId: locations.get(definition.locationCode)!._id,
          },
          rawPayload: { seed: 'demo' },
          fingerprint: `demo:access:${definition.code}:${workDate}:exit`,
          isSynthetic: true,
          correctionRequestId: null,
        },
      );
      if (!missingBiometricOut) {
        attendanceEvents.push({
          employeeId: employees.get(definition.code)!._id,
          source: 'biometric',
          eventType: 'out',
          occurredAt: biometricEnd,
          workDate,
          sourceEmployeeCode: definition.code,
          sourceEventId: `DEMO-${definition.code}-${workDate}-BIO-OUT`,
          importBatchId: biometricBatch._id,
          device: {
            deviceId: 'DEMO-BIO-01',
            deviceName: 'Demo studio biometric',
            locationId: locations.get(definition.locationCode)!._id,
          },
          rawPayload: { seed: 'demo' },
          fingerprint: `demo:biometric:${definition.code}:${workDate}:out`,
          isSynthetic: true,
          correctionRequestId: null,
        });
      }
      if (!missingWebsiteSession) {
        workSessions.push({
          employeeId: employees.get(definition.code)!._id,
          workDate,
          startedAt: biometricStart,
          stoppedAt: biometricEnd,
          durationMinutes: Math.round((biometricEnd.getTime() - biometricStart.getTime()) / 60_000),
          status: 'completed',
          startMetadata: { ipAddress: '127.0.0.1', userAgent: 'Gnomon demo seed' },
          stopMetadata: { ipAddress: '127.0.0.1', userAgent: 'Gnomon demo seed' },
          stoppedBy: null,
          correctionRequestId: null,
        });
      }
    }
  }

  await AttendanceEvent.insertMany(attendanceEvents);
  const createdSessions = await WorkSession.insertMany(workSessions);
  const sessionByEmployeeDate = new Map(
    createdSessions.map((session) => [`${session.employeeId}:${session.workDate}`, session]),
  );

  const timeEntries: Array<Record<string, unknown>> = [];
  const artistDefinitions = employeeDefinitions.filter((definition) =>
    definition.code.startsWith('DEMO2'),
  );
  for (const [employeeIndex, definition] of artistDefinitions.entries()) {
    for (const [dateIndex, workDate] of pastWorkDates.entries()) {
      if (definition.code === 'DEMO2004' && dateIndex === 4) continue;
      const intervals = [
        {
          startedAt: indiaDateTime(workDate, '09:30'),
          endedAt: indiaDateTime(workDate, '13:00'),
          durationMinutes: 210,
          percentage: 60,
          comment: 'Shot preparation, production work, and internal review.',
        },
        {
          startedAt: indiaDateTime(workDate, '14:00'),
          endedAt: indiaDateTime(workDate, '18:00'),
          durationMinutes: 240,
          percentage: 80,
          comment: 'Review feedback, revisions, and delivery checks.',
        },
      ];
      for (const [entryIndex, interval] of intervals.entries()) {
        const showCode = showCodes[(dateIndex + employeeIndex + entryIndex) % showCodes.length]!;
        timeEntries.push({
          employeeId: employees.get(definition.code)!._id,
          workDate,
          showId: shows.get(showCode)!._id,
          workSessionId:
            sessionByEmployeeDate.get(`${employees.get(definition.code)!._id}:${workDate}`)?._id ??
            null,
          ...interval,
        });
      }
    }
  }
  await TimeEntry.insertMany(timeEntries);

  const biometricCount = attendanceEvents.filter((event) => event.source === 'biometric').length;
  const accessCount = attendanceEvents.filter((event) => event.source === 'access_card').length;
  await Promise.all([
    ImportBatch.updateOne(
      { _id: biometricBatch._id },
      { $set: { totalRows: biometricCount, successfulRows: biometricCount } },
    ),
    ImportBatch.updateOne(
      { _id: accessBatch._id },
      { $set: { totalRows: accessCount, successfulRows: accessCount } },
    ),
  ]);

  for (const employee of employees.values()) {
    for (const workDate of pastWorkDates) {
      await reconcileDailyTimecard(String(employee._id), workDate);
    }
  }

  process.stdout.write(
    [
      'Seeded repeatable demo data:',
      `- ${employees.size} employees and login accounts`,
      `- ${shows.size} active shows available to every employee`,
      `- ${timeEntries.length} show-level time entries`,
      `- ${attendanceEvents.length} attendance events across ${pastWorkDates.length} workdays`,
      '- direct-saved timesheets with comments and progress percentages',
      '',
      `Demo password: ${DEMO_PASSWORD}`,
      'Employee: demo.asha@example.com',
      'Reporting Manager: demo.manager@example.com',
      'Show Manager: demo.showmanager@example.com',
      'HR: demo.hr@example.com',
      'Attendance Admin: demo.attendance@example.com',
      '',
    ].join('\n'),
  );
}

seedDemoData()
  .then(disconnectDatabase)
  .catch(async (error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    await disconnectDatabase();
    process.exitCode = 1;
  });
