import type { AttendanceSignalDto, AttendanceSignalsDto } from '@gnomon/shared';

import { AttendanceEvent, type AttendanceEventType } from './attendance-event.model.js';

function summarize(
  events: Array<{ eventType: AttendanceEventType; occurredAt: Date }>,
  openingType: AttendanceEventType,
  closingType: AttendanceEventType,
): AttendanceSignalDto {
  if (events.length === 0) {
    return { status: 'none', firstEventAt: null, lastEventAt: null, eventCount: 0 };
  }

  return {
    status:
      events.some((event) => event.eventType === openingType) &&
      events.some((event) => event.eventType === closingType)
        ? 'complete'
        : 'incomplete',
    firstEventAt: events[0]!.occurredAt.toISOString(),
    lastEventAt: events.at(-1)!.occurredAt.toISOString(),
    eventCount: events.length,
  };
}

export async function getAttendanceSignals(
  employeeId: string,
  workDate: string,
): Promise<AttendanceSignalsDto> {
  const events = await AttendanceEvent.find({ employeeId, workDate, removedAt: null })
    .select({ source: 1, eventType: 1, occurredAt: 1 })
    .sort({ occurredAt: 1 })
    .lean()
    .exec();

  const biometric = events.filter((event) => event.source === 'biometric');
  const accessCard = events.filter((event) => event.source === 'access_card');

  return {
    biometric: summarize(biometric, 'in', 'out'),
    accessCard: summarize(accessCard, 'entry', 'exit'),
  };
}
