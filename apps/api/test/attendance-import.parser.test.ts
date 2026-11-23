import { describe, expect, it } from 'vitest';

import {
  normalizeEventType,
  parseAttendanceCsv,
  parseAttendanceTimestamp,
} from '../src/modules/imports/attendance-import.parser.js';

describe('attendance CSV parsing', () => {
  it('accepts canonical biometric rows and common event aliases', () => {
    const result = parseAttendanceCsv(
      [
        'employee_code,occurred_at,event_type,source_event_id,device_name',
        'DDI0001,27/07/2026 09:05:12,PUNCH-IN,BIO-101,"Studio, main gate"',
        'DDI0001,2026-07-27T18:11:00+05:30,OUT,BIO-102,Studio main gate',
      ].join('\n'),
      'biometric',
    );

    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      employeeCode: 'DDI0001',
      eventType: 'in',
      sourceEventId: 'BIO-101',
      deviceName: 'Studio, main gate',
    });
    expect(result.rows[0]!.occurredAt.toISOString()).toBe('2026-07-27T03:35:12.000Z');
  });

  it('reports row-level validation failures without discarding valid rows', () => {
    const result = parseAttendanceCsv(
      [
        'employee_code,occurred_at,event_type',
        'DDI0001,2026-07-27 08:00:00,entry',
        'UNKNOWN,not-a-date,exit',
        ',2026-07-27 18:00:00,exit',
      ].join('\n'),
      'access_card',
    );

    expect(result.totalRows).toBe(3);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.eventType).toBe('entry');
    expect(result.errors).toEqual([
      expect.objectContaining({ rowNumber: 3, employeeCode: 'UNKNOWN' }),
      expect.objectContaining({ rowNumber: 4, reason: 'Employee code is required' }),
    ]);
  });

  it('rejects a file that is missing required columns', () => {
    const result = parseAttendanceCsv('employee_code,event_type\nDDI0001,in', 'biometric');

    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.reason).toContain('occurred_at');
  });

  it('converts a biometric attendance summary into in and out evidence', () => {
    const result = parseAttendanceCsv(
      [
        'Date,Employee Code,Employee Name,Department,In Time,Out Time,Status,Punch Records',
        '2026-06-24,DDIH500,Raman Kumar,Roto,14:46:12,0:03:18,Present,punches',
        '2026-06-25,DDIH500,Raman Kumar,Roto,09:00:00,,Present (No OutPunch),punches',
        '2026-06-26,DDIH500,Raman Kumar,Roto,,,Absent,',
      ].join('\n'),
      'biometric',
    );

    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(3);
    expect(result.ignoredRows).toBe(1);
    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((row) => row.eventType)).toEqual(['in', 'out', 'in']);
    expect(result.rows[0]?.workDate).toBe('2026-06-24');
    expect(result.rows[1]?.occurredAt.toISOString()).toBe('2026-06-24T18:33:18.000Z');
  });
});

describe('attendance timestamp and event normalization', () => {
  it('interprets timestamps without an offset in Asia/Kolkata', () => {
    expect(parseAttendanceTimestamp('2026-07-27 07:00:00')?.toISOString()).toBe(
      '2026-07-27T01:30:00.000Z',
    );
    expect(parseAttendanceTimestamp('31/02/2026 09:00:00')).toBeNull();
  });

  it('keeps source-specific event vocabularies separate', () => {
    expect(normalizeEventType('biometric', 'check-in')).toBe('in');
    expect(normalizeEventType('biometric', 'entry')).toBeNull();
    expect(normalizeEventType('access_card', 'card-out')).toBe('exit');
  });
});
