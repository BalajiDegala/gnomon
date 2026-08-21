import type { NotificationDto, NotificationKind, NotificationListDto } from '@gnomon/shared';
import { Types } from 'mongoose';

import { Notification } from './notification.model.js';

function toDto(notification: {
  _id: unknown;
  kind: NotificationKind;
  title: string;
  message: string;
  href: string;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto {
  return {
    id: String(notification._id),
    kind: notification.kind,
    title: notification.title,
    message: notification.message,
    href: notification.href,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

export async function listNotifications(
  employeeId: string,
  limit = 20,
): Promise<NotificationListDto> {
  const [items, unreadCount] = await Promise.all([
    Notification.find({ recipientEmployeeId: new Types.ObjectId(employeeId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec(),
    Notification.countDocuments({
      recipientEmployeeId: new Types.ObjectId(employeeId),
      readAt: null,
    }),
  ]);
  return { unreadCount, items: items.map(toDto) };
}

export async function markNotificationRead(employeeId: string, notificationId: string) {
  await Notification.updateOne(
    {
      _id: new Types.ObjectId(notificationId),
      recipientEmployeeId: new Types.ObjectId(employeeId),
      readAt: null,
    },
    { $set: { readAt: new Date() } },
  ).exec();
  return listNotifications(employeeId);
}

export async function markAllNotificationsRead(employeeId: string) {
  await Notification.updateMany(
    { recipientEmployeeId: new Types.ObjectId(employeeId), readAt: null },
    { $set: { readAt: new Date() } },
  ).exec();
  return listNotifications(employeeId);
}

interface LeaveNotificationInput {
  requestId: Types.ObjectId;
  employeeId: Types.ObjectId;
  employeeDisplayName: string;
  startDate: string;
  endDate: string;
  requestedDays: number;
}

async function safelyUpsertNotifications(
  rows: Array<{
    recipientEmployeeId: Types.ObjectId;
    kind: NotificationKind;
    entityId: Types.ObjectId;
    dedupeKey: string;
    title: string;
    message: string;
    href: string;
  }>,
) {
  if (rows.length === 0) return;
  try {
    await Notification.bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: { dedupeKey: row.dedupeKey },
          update: {
            $setOnInsert: {
              ...row,
              entityType: 'leave' as const,
              readAt: null,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  } catch {
    // A notification must never make an already-persisted leave transition fail.
  }
}

export async function notifyLeaveApprovalRequired(
  input: LeaveNotificationInput,
  recipientEmployeeIds: Types.ObjectId[],
  stage: 1 | 2,
) {
  const recipients = [...new Map(recipientEmployeeIds.map((id) => [String(id), id])).values()];
  await safelyUpsertNotifications(
    recipients.map((recipientEmployeeId) => ({
      recipientEmployeeId,
      kind: 'leave_approval_required',
      entityId: input.requestId,
      dedupeKey: `leave:${String(input.requestId)}:approval:${stage}:${String(recipientEmployeeId)}`,
      title: `Leave approval ${stage === 1 ? 'required' : 'moved to stage 2'}`,
      message: `${input.employeeDisplayName} requested ${input.requestedDays} day${input.requestedDays === 1 ? '' : 's'} from ${input.startDate} to ${input.endDate}.`,
      href: '/approvals',
    })),
  );
}

export async function notifyLeaveOutcome(
  input: LeaveNotificationInput,
  outcome: 'approved' | 'rejected',
) {
  await safelyUpsertNotifications([
    {
      recipientEmployeeId: input.employeeId,
      kind: outcome === 'approved' ? 'leave_approved' : 'leave_rejected',
      entityId: input.requestId,
      dedupeKey: `leave:${String(input.requestId)}:outcome:${outcome}`,
      title: `Leave request ${outcome}`,
      message: `Your ${input.requestedDays}-day leave request from ${input.startDate} to ${input.endDate} was ${outcome}.`,
      href: '/leave',
    },
  ]);
}

export async function markLeaveApprovalNotificationRead(
  employeeId: string,
  requestId: Types.ObjectId,
) {
  await Notification.updateMany(
    {
      recipientEmployeeId: new Types.ObjectId(employeeId),
      entityType: 'leave',
      entityId: requestId,
      kind: 'leave_approval_required',
      readAt: null,
    },
    { $set: { readAt: new Date() } },
  ).exec();
}

export async function resolveLeaveApprovalNotifications(requestId: Types.ObjectId) {
  await Notification.updateMany(
    {
      entityType: 'leave',
      entityId: requestId,
      kind: 'leave_approval_required',
      readAt: null,
    },
    { $set: { readAt: new Date() } },
  ).exec();
}
