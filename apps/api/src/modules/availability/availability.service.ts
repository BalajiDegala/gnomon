import {
  visibleAvailability,
  type AvailabilityDirectory,
  type AvailabilityMode,
  type AvailabilityPerson,
  type AvailabilityStatus,
  type MyAvailability,
} from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { User } from '../auth/user.model.js';
import { Employee } from '../employees/employee.model.js';
import { WorkSession } from '../timecard/work-session.model.js';

interface AutomaticState {
  status: AvailabilityStatus;
  since: Date | null;
  ipAddress: string | null;
}

/** Real status from the timecard: available while the workday runs, otherwise away. */
async function automaticStates(
  employeeIds: Types.ObjectId[],
): Promise<Map<string, AutomaticState>> {
  const running = await WorkSession.find({ employeeId: { $in: employeeIds }, status: 'running' })
    .select({ employeeId: 1, startedAt: 1, 'startMetadata.ipAddress': 1 })
    .lean()
    .exec();
  const states = new Map<string, AutomaticState>();
  for (const session of running) {
    const ip = session.startMetadata?.ipAddress;
    states.set(String(session.employeeId), {
      status: 'available',
      since: session.startedAt,
      ipAddress: ip && ip !== 'import' ? ip.replace(/^::ffff:/, '') : null,
    });
  }
  return states;
}

function emailPrefix(email: string | null | undefined): string {
  return (email ?? '').split('@')[0]!.toLowerCase();
}

/** Every active employee with what colleagues are allowed to see. */
export async function listAvailability(
  viewerEmployeeId: string,
  now = new Date(),
): Promise<AvailabilityDirectory> {
  const employees = await Employee.find({ status: 'active' })
    .select({
      employeeCode: 1,
      firstName: 1,
      lastName: 1,
      email: 1,
      availabilityMode: 1,
      'hrProfile.userId': 1,
      'hrProfile.mailId': 1,
      'hrProfile.fullName': 1,
      'hrProfile.departmentName': 1,
      'biometricProfile.departmentName': 1,
    })
    .lean()
    .exec();
  const ids = employees.map((employee) => employee._id as Types.ObjectId);
  const [states, accounts] = await Promise.all([
    automaticStates(ids),
    User.find({ employeeId: { $in: ids } })
      .select({ employeeId: 1, email: 1 })
      .lean()
      .exec(),
  ]);
  const accountEmail = new Map(accounts.map((user) => [String(user.employeeId), user.email]));

  const people: AvailabilityPerson[] = employees.map((employee) => {
    const id = String(employee._id);
    const mode: AvailabilityMode = employee.availabilityMode ?? 'auto';
    const automatic = states.get(id) ?? { status: 'away', since: null, ipAddress: null };
    const manual = mode !== 'auto';
    const email = employee.hrProfile?.mailId || accountEmail.get(id) || employee.email;
    return {
      employeeId: id,
      employeeCode: employee.employeeCode,
      fullName: employee.hrProfile?.fullName || `${employee.firstName} ${employee.lastName}`.trim(),
      email,
      loginId:
        employee.hrProfile?.userId?.toLowerCase() ||
        emailPrefix(accountEmail.get(id)) ||
        emailPrefix(employee.email),
      department:
        employee.hrProfile?.departmentName || employee.biometricProfile?.departmentName || null,
      status: visibleAvailability(mode, automatic.status),
      // A manual mode hides the real status, including when and where work started.
      since: manual || !automatic.since ? null : automatic.since.toISOString(),
      ipAddress: manual ? null : automatic.ipAddress,
      isMe: id === viewerEmployeeId,
    };
  });
  people.sort((left, right) => left.fullName.localeCompare(right.fullName));
  return { generatedAt: now.toISOString(), people };
}

export async function getMyAvailability(
  employeeId: string,
  now = new Date(),
): Promise<MyAvailability> {
  const employee = await Employee.findById(employeeId)
    .select({ availabilityMode: 1 })
    .lean()
    .exec();
  if (!employee) throw new HttpError(404, 'Employee not found', 'EMPLOYEE_NOT_FOUND');
  const mode: AvailabilityMode = employee.availabilityMode ?? 'auto';
  const automatic = (await automaticStates([employee._id as Types.ObjectId])).get(employeeId);
  return { mode, status: visibleAvailability(mode, automatic?.status ?? 'away') };
}

export async function setMyAvailabilityMode(
  employeeId: string,
  mode: AvailabilityMode,
): Promise<MyAvailability> {
  const updated = await Employee.updateOne(
    { _id: employeeId },
    { $set: { availabilityMode: mode } },
  ).exec();
  if (updated.matchedCount === 0) {
    throw new HttpError(404, 'Employee not found', 'EMPLOYEE_NOT_FOUND');
  }
  return getMyAvailability(employeeId);
}
