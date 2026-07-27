import { DailyReconciliationDtoSchema } from '@gnomon/shared';
import { describe, expect, it } from 'vitest';

import {
  applyApprovedLeaveToReconciliation,
  calculateDailyReconciliation,
  type ReconciliationInput,
} from '../src/modules/reconciliation/reconciliation.service.js';

const closedNow = new Date('2026-07-28T02:00:00.000Z');

function calculate(overrides: Partial<ReconciliationInput> = {}) {
  return calculateDailyReconciliation({
    workDate: '2026-07-27',
    now: closedNow,
    events: [],
    sessions: [],
    timeEntries: [],
    ...overrides,
  });
}

describe('calculateDailyReconciliation', () => {
  it('marks an aligned nine-hour biometric day present', () => {
    const result = calculate({
      events: [
        { source: 'biometric', eventType: 'in', occurredAt: new Date('2026-07-27T03:30:00Z') },
        { source: 'biometric', eventType: 'out', occurredAt: new Date('2026-07-27T12:30:00Z') },
        { source: 'access_card', eventType: 'entry', occurredAt: new Date('2026-07-27T03:25:00Z') },
        { source: 'access_card', eventType: 'exit', occurredAt: new Date('2026-07-27T12:35:00Z') },
      ],
      sessions: [
        {
          startedAt: new Date('2026-07-27T03:30:00Z'),
          stoppedAt: new Date('2026-07-27T12:30:00Z'),
          status: 'completed',
        },
      ],
      timeEntries: [
        {
          startedAt: new Date('2026-07-27T03:30:00Z'),
          endedAt: new Date('2026-07-27T12:30:00Z'),
          durationMinutes: 540,
          status: 'submitted',
        },
      ],
    });

    expect(result.calculated).toMatchObject({
      primarySource: 'biometric',
      grossMinutes: 540,
      status: 'present',
      provisional: false,
      requiresReview: false,
      anomalies: [],
    });
    expect(result.sourceSummary.taskEntries.totalMinutes).toBe(540);
    expect(() =>
      DailyReconciliationDtoSchema.parse({ id: 'daily-timecard', ...result }),
    ).not.toThrow();
  });

  it('keeps lower-priority evidence provisional when biometric punches are absent', () => {
    const result = calculate({
      events: [
        { source: 'access_card', eventType: 'entry', occurredAt: new Date('2026-07-27T03:30:00Z') },
        { source: 'access_card', eventType: 'exit', occurredAt: new Date('2026-07-27T12:30:00Z') },
      ],
      sessions: [
        {
          startedAt: new Date('2026-07-27T03:30:00Z'),
          stoppedAt: new Date('2026-07-27T12:30:00Z'),
          status: 'completed',
        },
      ],
    });

    expect(result.calculated.primarySource).toBe('access_card');
    expect(result.calculated.status).toBe('partial');
    expect(result.calculated.provisional).toBe(true);
    expect(result.calculated.anomalies).toEqual(
      expect.arrayContaining(['missing_biometric_in', 'missing_biometric_out']),
    );
  });

  it('detects source endpoints beyond the provisional tolerance', () => {
    const result = calculate({
      events: [
        { source: 'biometric', eventType: 'in', occurredAt: new Date('2026-07-27T03:30:00Z') },
        { source: 'biometric', eventType: 'out', occurredAt: new Date('2026-07-27T12:30:00Z') },
        { source: 'access_card', eventType: 'entry', occurredAt: new Date('2026-07-27T03:00:00Z') },
        { source: 'access_card', eventType: 'exit', occurredAt: new Date('2026-07-27T13:00:00Z') },
      ],
    });

    expect(result.calculated.anomalies).toContain('source_time_mismatch');
  });

  it('flags task time that is outside website presence', () => {
    const result = calculate({
      now: new Date('2026-07-27T06:00:00Z'),
      sessions: [
        {
          startedAt: new Date('2026-07-27T03:30:00Z'),
          stoppedAt: new Date('2026-07-27T05:30:00Z'),
          status: 'completed',
        },
      ],
      timeEntries: [
        {
          startedAt: new Date('2026-07-27T05:00:00Z'),
          endedAt: new Date('2026-07-27T06:00:00Z'),
          durationMinutes: 60,
          status: 'draft',
        },
      ],
    });

    expect(result.calculated.workdayClosed).toBe(false);
    expect(result.calculated.anomalies).toContain('task_outside_web_session');
    expect(result.calculated.anomalies).not.toContain('insufficient_hours');
  });

  it('calculates live website minutes without premature missing-source anomalies', () => {
    const result = calculate({
      now: new Date('2026-07-27T06:00:00Z'),
      sessions: [
        {
          startedAt: new Date('2026-07-27T03:30:00Z'),
          stoppedAt: null,
          status: 'running',
        },
      ],
    });

    expect(result.sourceSummary.website.status).toBe('running');
    expect(result.sourceSummary.website.workedMinutes).toBe(150);
    expect(result.calculated.primarySource).toBe('website');
    expect(result.calculated.attendanceEnd).toBe('2026-07-27T06:00:00.000Z');
    expect(result.calculated.anomalies).toEqual([]);
  });

  it('does not mark a closed weekend as absent', () => {
    const result = calculate({
      workDate: '2026-07-26',
      now: new Date('2026-07-27T02:00:00Z'),
    });

    expect(result.calculated.status).toBe('weekend');
    expect(result.calculated.anomalies).toEqual([]);
  });

  it('applies full-day approved leave without rewriting source evidence', () => {
    const calculated = calculate();
    const result = applyApprovedLeaveToReconciliation(calculated, 'full_day');

    expect(result.calculated).toMatchObject({
      status: 'leave',
      anomalies: [],
      provisional: false,
      requiresReview: false,
    });
    expect(result.sourceSummary).toEqual(calculated.sourceSummary);
  });

  it('reduces a half-day requirement while retaining attendance evidence', () => {
    const calculated = calculate({
      events: [
        { source: 'biometric', eventType: 'in', occurredAt: new Date('2026-07-27T03:30:00Z') },
        { source: 'biometric', eventType: 'out', occurredAt: new Date('2026-07-27T08:00:00Z') },
      ],
    });
    const result = applyApprovedLeaveToReconciliation(calculated, 'second_half');

    expect(result.calculated.requiredMinutes).toBe(270);
    expect(result.calculated.differenceMinutes).toBe(0);
    expect(result.calculated.status).toBe('present');
    expect(result.calculated.anomalies).not.toContain('insufficient_hours');
    expect(result.sourceSummary.biometric.workedMinutes).toBe(270);
  });
});
