import type {
  AnnouncementDepartment,
  AnnouncementDto,
  AnnouncementFeed,
  AuthUser,
  CreateAnnouncementRequest,
  RoleCode,
} from '@gnomon/shared';
import { CreateAnnouncementRequestSchema } from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Employee } from '../employees/employee.model.js';
import { Notification } from '../notifications/notification.model.js';
import { Announcement, type AnnouncementDocument } from './announcement.model.js';

const DAY_MS = 24 * 60 * 60_000;

/** Roles that may message everyone; people with direct reports or approvees may too. */
const SENDER_ROLES = new Set<RoleCode>([
  'REPORTING_MANAGER',
  'SHOW_MANAGER',
  'HR',
  'ATTENDANCE_ADMIN',
  'SYSTEM_ADMIN',
]);

type Viewer = Pick<AuthUser, 'employeeId' | 'displayName' | 'grants'>;

function isSystemAdmin(viewer: Viewer): boolean {
  return viewer.grants.some((grant) => grant.roleCode === 'SYSTEM_ADMIN');
}

export async function canSendAnnouncements(viewer: Viewer): Promise<boolean> {
  if (viewer.grants.some((grant) => SENDER_ROLES.has(grant.roleCode))) return true;
  const me = new Types.ObjectId(viewer.employeeId);
  const managesSomeone = await Employee.exists({
    status: 'active',
    $or: [
      { reportingManagerId: me },
      { 'hrProfile.approver1EmployeeId': me },
      { 'hrProfile.approver2EmployeeId': me },
    ],
  }).exec();
  return Boolean(managesSomeone);
}

function departmentOf(employee: {
  hrProfile?: { departmentName?: string | null } | null;
  biometricProfile?: { departmentName?: string | null } | null;
  attendanceIdentity?: { departmentName?: string | null } | null;
}): string | null {
  const name =
    employee.hrProfile?.departmentName ||
    employee.biometricProfile?.departmentName ||
    employee.attendanceIdentity?.departmentName ||
    '';
  return name.trim() || null;
}

const departmentKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

async function activeEmployeesWithDepartments() {
  const employees = await Employee.find({ status: 'active' })
    .select({
      'hrProfile.departmentName': 1,
      'biometricProfile.departmentName': 1,
      'attendanceIdentity.departmentName': 1,
    })
    .lean()
    .exec();
  return employees.map((employee) => ({ id: employee._id, department: departmentOf(employee) }));
}

/** Departments of active employees, for the "send to" picker. */
export async function listAnnouncementDepartments(): Promise<AnnouncementDepartment[]> {
  const counts = new Map<string, AnnouncementDepartment>();
  for (const { department } of await activeEmployeesWithDepartments()) {
    if (!department) continue;
    const key = departmentKey(department);
    const entry = counts.get(key) ?? { name: department, employeeCount: 0 };
    entry.employeeCount += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function toDto(
  announcement: AnnouncementDocument,
  viewer: Viewer,
  readAt: Date | null,
): AnnouncementDto {
  const sentByMe = String(announcement.senderEmployeeId) === viewer.employeeId;
  return {
    id: String(announcement._id),
    title: announcement.title,
    message: announcement.message,
    audience:
      announcement.audienceType === 'all'
        ? { type: 'all' }
        : { type: 'departments', departments: announcement.departments },
    senderEmployeeId: String(announcement.senderEmployeeId),
    senderName: announcement.senderName,
    recipientCount: announcement.recipientEmployeeIds.length,
    createdAt: announcement.createdAt.toISOString(),
    expiresAt: announcement.expiresAt.toISOString(),
    readAt: sentByMe ? null : (readAt?.toISOString() ?? null),
    sentByMe,
    canWithdraw: sentByMe || isSystemAdmin(viewer),
  };
}

export async function listAnnouncementFeed(
  viewer: Viewer,
  now = new Date(),
): Promise<AnnouncementFeed> {
  const me = new Types.ObjectId(viewer.employeeId);
  const [canSend, announcements] = await Promise.all([
    canSendAnnouncements(viewer),
    Announcement.find({
      expiresAt: { $gt: now },
      $or: [{ recipientEmployeeIds: me }, { senderEmployeeId: me }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec(),
  ]);
  const reads = await Notification.find({
    recipientEmployeeId: me,
    entityType: 'announcement',
    entityId: { $in: announcements.map((announcement) => announcement._id) },
  })
    .select({ entityId: 1, readAt: 1 })
    .lean()
    .exec();
  const readAtById = new Map(reads.map((row) => [String(row.entityId), row.readAt]));
  return {
    canSend,
    items: announcements.map((announcement) =>
      toDto(announcement, viewer, readAtById.get(String(announcement._id)) ?? null),
    ),
  };
}

export async function createAnnouncement(
  viewer: Viewer,
  input: CreateAnnouncementRequest,
  now = new Date(),
): Promise<AnnouncementDto> {
  if (!(await canSendAnnouncements(viewer))) {
    throw new HttpError(
      403,
      'Only managers, HR and administrators can send messages',
      'ANNOUNCEMENT_FORBIDDEN',
    );
  }
  const parsed = CreateAnnouncementRequestSchema.parse(input);
  const me = new Types.ObjectId(viewer.employeeId);
  const employees = await activeEmployeesWithDepartments();

  let departments: string[] = [];
  let recipients: Types.ObjectId[];
  if (parsed.audience.type === 'all') {
    recipients = employees.map((employee) => employee.id);
  } else {
    const wanted = new Map(parsed.audience.departments.map((name) => [departmentKey(name), name]));
    const known = new Set(
      employees.flatMap((employee) =>
        employee.department ? [departmentKey(employee.department)] : [],
      ),
    );
    const unknown = [...wanted.entries()].filter(([key]) => !known.has(key));
    if (unknown.length > 0) {
      throw new HttpError(
        400,
        `No active employees in ${unknown.map(([, name]) => name).join(', ')}`,
        'ANNOUNCEMENT_UNKNOWN_DEPARTMENT',
      );
    }
    departments = [...wanted.values()];
    recipients = employees
      .filter((employee) => employee.department && wanted.has(departmentKey(employee.department)))
      .map((employee) => employee.id);
  }
  // The sender sees the message as "sent", not as something to read.
  recipients = recipients.filter((id) => !id.equals(me));
  if (recipients.length === 0) {
    throw new HttpError(
      400,
      'Nobody else would receive this message',
      'ANNOUNCEMENT_NO_RECIPIENTS',
    );
  }

  const announcement = await Announcement.create({
    title: parsed.title,
    message: parsed.message,
    audienceType: parsed.audience.type,
    departments,
    senderEmployeeId: me,
    senderName: viewer.displayName,
    recipientEmployeeIds: recipients,
    expiresAt: new Date(now.getTime() + parsed.durationDays * DAY_MS),
  });

  const preview =
    parsed.message.length > 200 ? `${parsed.message.slice(0, 197).trimEnd()}…` : parsed.message;
  try {
    await Notification.insertMany(
      recipients.map((recipientEmployeeId) => ({
        recipientEmployeeId,
        kind: 'announcement' as const,
        entityType: 'announcement' as const,
        entityId: announcement._id,
        dedupeKey: `announcement:${String(announcement._id)}:${String(recipientEmployeeId)}`,
        title: `${viewer.displayName}: ${parsed.title}`.slice(0, 160),
        message: preview,
        href: '/',
        readAt: null,
      })),
      { ordered: false },
    );
  } catch {
    // The message is still shown on the Overview page if a bell entry fails.
  }
  return toDto(announcement.toObject(), viewer, null);
}

export async function markAnnouncementRead(viewer: Viewer, announcementId: string) {
  await Notification.updateMany(
    {
      recipientEmployeeId: new Types.ObjectId(viewer.employeeId),
      entityType: 'announcement',
      entityId: new Types.ObjectId(announcementId),
      readAt: null,
    },
    { $set: { readAt: new Date() } },
  ).exec();
}

export async function withdrawAnnouncement(viewer: Viewer, announcementId: string) {
  const announcement = await Announcement.findById(announcementId).lean().exec();
  if (!announcement) throw new HttpError(404, 'Message not found', 'ANNOUNCEMENT_NOT_FOUND');
  if (String(announcement.senderEmployeeId) !== viewer.employeeId && !isSystemAdmin(viewer)) {
    throw new HttpError(
      403,
      'Only the sender or an administrator can withdraw this message',
      'ANNOUNCEMENT_FORBIDDEN',
    );
  }
  await Promise.all([
    Announcement.deleteOne({ _id: announcement._id }).exec(),
    Notification.deleteMany({ entityType: 'announcement', entityId: announcement._id }).exec(),
  ]);
}
