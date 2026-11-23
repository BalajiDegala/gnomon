import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseTimecardData, splitMinutes } from '../src/modules/imports/timecard-data.parser.js';

const demoFile = fileURLToPath(new URL('../../../data/time_data.json', import.meta.url));
const now = new Date('2026-11-23T06:00:00Z');

const record = (overrides: Record<string, unknown> = {}) => ({
  _id: { $oid: '6452646210d07c0cdbac7d94' },
  login: 'BalajiD',
  date: { $date: '2023-05-03T19:10:50.932Z' },
  project: ['AUPS', 'beetle', 'BEETLE'],
  task: { AUPS: 'Published', Beetle: 'started today', OTHER: 'ignored' },
  start_time: '19:10:47',
  stop_time: '21:40:00',
  work_time: '10:00',
  ...overrides,
});

describe('parseTimecardData', () => {
  it('reads India wall-clock times on the stored calendar date', () => {
    const parsed = parseTimecardData(JSON.stringify([record()]), now);
    expect(parsed.errors).toEqual([]);
    expect(parsed.records[0]).toMatchObject({
      recordId: '6452646210d07c0cdbac7d94',
      login: 'balajid',
      calendarDate: '2023-05-03',
      workDate: '2023-05-03',
      workMinutes: 600,
      projects: [
        { code: 'AUPS', comment: 'Published' },
        { code: 'BEETLE', comment: 'started today' },
      ],
    });
    expect(parsed.records[0]!.startedAt.toISOString()).toBe('2023-05-03T13:40:47.000Z');
    expect(parsed.records[0]!.stoppedAt!.toISOString()).toBe('2023-05-03T16:10:00.000Z');
  });

  it('keeps "Working" days open, crosses midnight, and uses the 07:00 workday boundary', () => {
    const parsed = parseTimecardData(
      JSON.stringify([
        record({ _id: { $oid: 'a1' }, stop_time: 'Working' }),
        record({ _id: { $oid: 'a2' }, start_time: '22:00', stop_time: '02:30' }),
        record({ _id: { $oid: 'a3' }, start_time: '05:30', stop_time: '06:30' }),
      ]),
      now,
    );
    expect(parsed.records[0]!.stoppedAt).toBeNull();
    expect(parsed.records[1]!.stoppedAt!.toISOString()).toBe('2023-05-03T21:00:00.000Z');
    // 05:30 India time belongs to the previous workday.
    expect(parsed.records[2]!.workDate).toBe('2023-05-02');
  });

  it('reports bad records without stopping the rest of the file', () => {
    const parsed = parseTimecardData(
      JSON.stringify([
        record({ _id: { $oid: 'ok' } }),
        record({ _id: { $oid: 'ok' } }),
        record({ _id: { $oid: 'b1' }, login: '' }),
        record({ _id: { $oid: 'b2' }, start_time: '7pm' }),
        record({ _id: { $oid: 'b3' }, work_time: 'ten hours' }),
        record({ _id: { $oid: 'b4' }, project: ['NO SPACES'] }),
        record({ _id: { $oid: 'b5' }, date: { $date: '2027-01-04T10:00:00Z' } }),
        record({ _id: undefined }),
      ]),
      now,
    );
    expect(parsed.records.map((item) => item.recordId)).toEqual(['ok']);
    expect(parsed.errors.map((error) => [error.rowNumber, error.reason])).toEqual([
      [2, 'Duplicate _id in the file; only the first was used'],
      [3, 'login is missing'],
      [4, 'start_time must be HH:MM or HH:MM:SS'],
      [5, 'work_time must be H:MM (up to 24:00)'],
      [6, 'Project code "NO SPACES" is not a valid show code'],
      [7, 'Work date 2027-01-04 is in the future'],
      [8, 'Record has no _id'],
    ]);
  });

  it('rejects files that are not a JSON array', () => {
    expect(parseTimecardData('not json').errors[0]?.reason).toBe('File is not valid JSON');
    expect(parseTimecardData('{"a":1}').errors[0]?.reason).toBe(
      'Expected a JSON array of timecard records',
    );
  });

  it.runIf(existsSync(demoFile))('parses every record in data/time_data.json', () => {
    const parsed = parseTimecardData(readFileSync(demoFile, 'utf8'), now);
    expect(parsed.totalRecords).toBe(10);
    expect(parsed.errors).toEqual([]);
    expect(parsed.records.filter((item) => item.stoppedAt === null)).toHaveLength(2);
    expect(new Set(parsed.records.map((item) => item.login))).toEqual(
      new Set(['balajid', 'schaitanya']),
    );
  });
});

describe('splitMinutes', () => {
  it('splits evenly and gives the remainder to the first projects', () => {
    expect(splitMinutes(600, 3)).toEqual([200, 200, 200]);
    expect(splitMinutes(550, 3)).toEqual([184, 183, 183]);
    expect(splitMinutes(1, 2)).toEqual([1, 0]);
    expect(splitMinutes(60, 0)).toEqual([]);
  });
});
