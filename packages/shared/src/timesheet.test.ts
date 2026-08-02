import { describe, expect, it } from 'vitest';

import { CreateTimeEntryRequestSchema, UpdateShowRequestSchema } from './timesheet.js';

describe('show timesheet contract', () => {
  const validEntry = {
    showId: '507f1f77bcf86cd799439011',
    startedAt: '2026-07-27T03:30:00.000Z',
    endedAt: '2026-07-27T04:30:00.000Z',
    comment: 'Prepared the review delivery.',
    percentage: 70,
  };

  it('accepts a show, work comment, and progress percentage without a task', () => {
    expect(CreateTimeEntryRequestSchema.parse(validEntry)).toEqual(validEntry);
  });

  it('requires a comment and progress from 10 to 100 in ten-percent steps', () => {
    expect(CreateTimeEntryRequestSchema.safeParse({ ...validEntry, comment: '' }).success).toBe(
      false,
    );
    expect(CreateTimeEntryRequestSchema.safeParse({ ...validEntry, percentage: 0 }).success).toBe(
      false,
    );
    expect(CreateTimeEntryRequestSchema.safeParse({ ...validEntry, percentage: 75 }).success).toBe(
      false,
    );
    expect(CreateTimeEntryRequestSchema.safeParse({ ...validEntry, percentage: 100 }).success).toBe(
      true,
    );
  });

  it('validates show lifecycle updates and normalizes the show code', () => {
    expect(
      UpdateShowRequestSchema.parse({ code: 'show_42', name: 'Lifecycle show', status: 'on_hold' }),
    ).toEqual({ code: 'SHOW_42', name: 'Lifecycle show', status: 'on_hold' });
    expect(
      UpdateShowRequestSchema.safeParse({
        code: 'SHOW_42',
        name: 'Lifecycle show',
        status: 'inactive',
      }).success,
    ).toBe(false);
  });
});
