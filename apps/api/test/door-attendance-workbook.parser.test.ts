import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { parseDoorAttendanceWorkbook } from '../src/modules/imports/door-attendance-workbook.parser.js';

const headers = [
  'Time',
  'Area Name',
  'Device Name',
  'Event Point',
  'Event Description',
  'Event Level',
  'Personnel ID',
  'First Name',
  'Last Name',
  'Card Number',
  'Department Name',
  'Reader Name',
  'Verification Mode',
];

function transaction(
  time: string,
  eventPoint: string,
  personnelId: string,
  readerName: string,
  description = 'Normal Verify Open',
  level = 'Normal',
  verificationMode = 'Only Card',
): string[] {
  return [
    time,
    'Main Doors',
    'Doors',
    eventPoint,
    description,
    level,
    personnelId,
    'Test',
    'Employee',
    '1234',
    'Test Department',
    readerName,
    verificationMode,
  ];
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnName(index: number): string {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function workbookBuffer(rows: string[][], workbookHeaders = headers): Buffer {
  const allRows = [['All Transactions'], workbookHeaders, ...rows];
  const rowXml = allRows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map(
            (value, columnIndex) =>
              `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`,
          )
          .join('')}</row>`,
    )
    .join('');
  const worksheet =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
  return Buffer.from(zipSync({ 'xl/worksheets/sheet1.xml': strToU8(worksheet) }));
}

describe('door attendance workbook parsing', () => {
  it('keeps the first exterior entry and last exterior exit in the 07:00 workday', async () => {
    const result = await parseDoorAttendanceWorkbook(
      workbookBuffer([
        transaction('2026-06-01 08:30:00', 'NORTH-ZONE-PASSAGE', 'E001', 'NORTH-PASSAGE-In'),
        transaction('2026-06-01 09:00:00', 'SOUTH-ZONE-ENTRY', 'E001', 'South-In'),
        transaction('2026-06-01 12:00:00', 'NORTH-ZONE-ENTRY', 'E001', 'NORTH-Out'),
        transaction('2026-06-01 13:00:00', 'NORTH-ZONE-ENTRY', 'E001', 'NORTH-In'),
        transaction('2026-06-02 01:00:00', 'SOUTH-ZONE-ENTRY', 'E001', 'south-Out'),
        transaction(
          '2026-06-02 01:30:00',
          'SOUTH-ZONE-ENTRY',
          'E001',
          'south-Out',
          'Superuser Open Doors',
          'Normal',
          'Other',
        ),
        transaction(
          '2026-06-01 10:00:00',
          'SOUTH-ZONE-ENTRY',
          'E002',
          'South-In',
          'Personnel Expired',
          'Exception',
        ),
        transaction('2026-06-01 10:05:00', 'NORTH-ZONE-ENTRY', 'E002', 'NORTH-In'),
        transaction('2026-06-01 11:00:00', 'NORTH-ZONE-PASSAGE', 'E003', 'NORTH-PASSAGE-In'),
      ]),
    );

    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(9);
    expect(result.ignoredRows).toBe(6);
    expect(result.rows).toHaveLength(3);
    expect(result.employeeProfiles).toEqual([
      {
        employeeCode: 'E001',
        firstName: 'Test',
        lastName: 'Employee',
        departmentName: 'Test Department',
        cardNumber: '1234',
        lastSeenAt: new Date('2026-06-01T20:00:00.000Z'),
      },
      {
        employeeCode: 'E002',
        firstName: 'Test',
        lastName: 'Employee',
        departmentName: 'Test Department',
        cardNumber: '1234',
        lastSeenAt: new Date('2026-06-01T04:35:00.000Z'),
      },
      {
        employeeCode: 'E003',
        firstName: 'Test',
        lastName: 'Employee',
        departmentName: 'Test Department',
        cardNumber: '1234',
        lastSeenAt: new Date('2026-06-01T05:30:00.000Z'),
      },
    ]);
    expect(
      result.rows.map((row) => ({
        employeeCode: row.employeeCode,
        eventType: row.eventType,
        occurredAt: row.occurredAt.toISOString(),
        deviceId: row.deviceId,
      })),
    ).toEqual([
      {
        employeeCode: 'E001',
        eventType: 'entry',
        occurredAt: '2026-06-01T03:30:00.000Z',
        deviceId: 'SOUTH-ZONE-ENTRY',
      },
      {
        employeeCode: 'E001',
        eventType: 'exit',
        occurredAt: '2026-06-01T19:30:00.000Z',
        deviceId: 'SOUTH-ZONE-ENTRY',
      },
      {
        employeeCode: 'E002',
        eventType: 'entry',
        occurredAt: '2026-06-01T04:35:00.000Z',
        deviceId: 'NORTH-ZONE-ENTRY',
      },
    ]);
  });

  it('returns a file-level error when the export columns are missing', async () => {
    const result = await parseDoorAttendanceWorkbook(workbookBuffer([], ['Name', 'Date']));

    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toMatchObject({ rowNumber: 1 });
    expect(result.errors[0]?.reason).toContain('missing required columns');
  });
});
