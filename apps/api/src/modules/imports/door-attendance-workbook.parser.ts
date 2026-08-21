import { getWorkDate } from '@gnomon/shared';
import { unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';

import type { AttendanceEventType } from '../attendance/attendance-event.model.js';
import {
  parseAttendanceTimestamp,
  type ParsedAttendanceFile,
  type ParsedAttendanceRow,
  type ParsedEmployeeProfile,
} from './attendance-import.parser.js';

const REQUIRED_HEADERS = [
  'time',
  'event_point',
  'event_description',
  'event_level',
  'personnel_id',
  'first_name',
  'last_name',
  'card_number',
  'department_name',
  'reader_name',
  'verification_mode',
] as const;
const EXTERIOR_GATE_POINTS = new Set(['NORTH-ZONE-ENTRY', 'SOUTH-ZONE-ENTRY']);
const MAX_WORKBOOK_ROWS = 250_000;
const MAX_WORKSHEET_BYTES = 200 * 1024 * 1024;

interface WorkdayEndpoints {
  firstEntry: ParsedAttendanceRow | null;
  lastExit: ParsedAttendanceRow | null;
}

class WorkbookRowLimitError extends Error {}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function columnNumber(reference: string): number {
  const letters = /^[a-z]+/i.exec(reference)?.[0]?.toUpperCase() ?? '';
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
}

async function parseXmlInChunks(xml: Uint8Array, parser: SaxesParser): Promise<void> {
  const decoder = new TextDecoder();
  const chunkSize = 128 * 1024;
  for (let offset = 0; offset < xml.length; offset += chunkSize) {
    parser.write(decoder.decode(xml.subarray(offset, offset + chunkSize), { stream: true }));
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  parser.write(decoder.decode()).close();
}

async function parseSharedStrings(xml: Uint8Array | undefined): Promise<string[]> {
  if (!xml) return [];

  const values: string[] = [];
  const parser = new SaxesParser();
  let insideItem = false;
  let insideText = false;
  let current = '';

  parser.on('opentag', (tag) => {
    if (tag.name === 'si') {
      insideItem = true;
      current = '';
    } else if (insideItem && tag.name === 't') {
      insideText = true;
    }
  });
  parser.on('text', (text) => {
    if (insideText) current += text;
  });
  parser.on('closetag', (tag) => {
    if (tag.name === 't') insideText = false;
    if (tag.name === 'si') {
      values.push(current);
      insideItem = false;
    }
  });
  parser.on('error', (error) => {
    throw error;
  });
  await parseXmlInChunks(xml, parser);
  return values;
}

function timestampFromCell(value: string): Date | null {
  const parsed = parseAttendanceTimestamp(value);
  if (parsed) return parsed;

  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const excelValue = new Date(Date.UTC(1899, 11, 30) + serial * 24 * 60 * 60_000);
  const wallClock = [
    String(excelValue.getUTCFullYear()).padStart(4, '0'),
    String(excelValue.getUTCMonth() + 1).padStart(2, '0'),
    String(excelValue.getUTCDate()).padStart(2, '0'),
  ].join('-');
  const time = [
    String(excelValue.getUTCHours()).padStart(2, '0'),
    String(excelValue.getUTCMinutes()).padStart(2, '0'),
    String(excelValue.getUTCSeconds()).padStart(2, '0'),
  ].join(':');
  return parseAttendanceTimestamp(`${wallClock} ${time}`);
}

function eventTypeForReader(readerName: string): AttendanceEventType | null {
  const normalized = normalizeValue(readerName);
  if (normalized.endsWith('-in')) return 'entry';
  if (normalized.endsWith('-out')) return 'exit';
  return null;
}

function invalidWorkbook(reason: string, totalRows = 0): ParsedAttendanceFile {
  return {
    totalRows,
    ignoredRows: 0,
    rows: [],
    employeeProfiles: [],
    errors: [{ rowNumber: 1, employeeCode: '', reason }],
  };
}

/**
 * Convert the supplied door-controller workbook into one exterior-gate entry and
 * one exterior-gate exit per employee and logical workday.
 */
export async function parseDoorAttendanceWorkbook(
  workbookBuffer: Buffer,
): Promise<ParsedAttendanceFile> {
  const endpoints = new Map<string, WorkdayEndpoints>();
  const employeeProfiles = new Map<string, ParsedEmployeeProfile>();
  const errors: ParsedAttendanceFile['errors'] = [];
  let totalRows = 0;
  let foundTransactionSheet = false;
  let oversizedWorksheet = false;

  try {
    const files = unzipSync(workbookBuffer, {
      filter: (file) => {
        const relevant =
          file.name === 'xl/sharedStrings.xml' || file.name === 'xl/worksheets/sheet1.xml';
        if (relevant && file.originalSize > MAX_WORKSHEET_BYTES) oversizedWorksheet = true;
        return relevant && file.originalSize <= MAX_WORKSHEET_BYTES;
      },
    });
    if (oversizedWorksheet) {
      return invalidWorkbook('Door workbook worksheet is too large to process safely');
    }

    const worksheetXml = files['xl/worksheets/sheet1.xml'];
    if (!worksheetXml) {
      return invalidWorkbook(
        'Door workbook could not be parsed; upload an XLSX workbook exported from All Transactions',
      );
    }
    const sharedStrings = await parseSharedStrings(files['xl/sharedStrings.xml']);
    const parser = new SaxesParser();
    let headers: Map<string, number> | null = null;
    let rowNumber = 0;
    let inferredRowNumber = 0;
    let cells = new Map<number, string>();
    let cellColumn = 0;
    let cellType = '';
    let cellValue = '';
    let captureCellValue = false;

    const processRow = () => {
      if (!headers) {
        const candidates = new Map<string, number>();
        cells.forEach((value, column) => {
          const header = normalizeHeader(value);
          if (header) candidates.set(header, column);
        });
        if (REQUIRED_HEADERS.every((header) => candidates.has(header))) {
          headers = candidates;
          foundTransactionSheet = true;
        }
        return;
      }

      const hasValues = [...headers.values()].some((column) => (cells.get(column) ?? '') !== '');
      if (!hasValues) return;

      totalRows += 1;
      if (totalRows > MAX_WORKBOOK_ROWS) throw new WorkbookRowLimitError();

      const read = (header: string) => (cells.get(headers!.get(header)!) ?? '').trim();
      const eventPoint = read('event_point').toUpperCase();
      const description = normalizeValue(read('event_description'));
      const level = normalizeValue(read('event_level'));
      const personnelId = read('personnel_id').toUpperCase().slice(0, 100);
      const readerName = read('reader_name');
      const verificationMode = normalizeValue(read('verification_mode'));
      const eventType = eventTypeForReader(readerName);
      const occurredAt = timestampFromCell(read('time'));
      if (personnelId && occurredAt) {
        const firstName = read('first_name').slice(0, 80);
        const lastName = read('last_name').slice(0, 80);
        const profile = employeeProfiles.get(personnelId);
        if (!profile || occurredAt > profile.lastSeenAt) {
          employeeProfiles.set(personnelId, {
            employeeCode: personnelId,
            firstName,
            lastName,
            departmentName: read('department_name').slice(0, 255) || null,
            cardNumber: read('card_number').slice(0, 255) || null,
            lastSeenAt: occurredAt,
          });
        }
      }
      const isAttendanceSwipe =
        EXTERIOR_GATE_POINTS.has(eventPoint) &&
        description === 'normal verify open' &&
        level === 'normal' &&
        Boolean(personnelId) &&
        verificationMode.includes('card') &&
        eventType !== null;
      if (!isAttendanceSwipe || !eventType) return;

      if (!occurredAt) {
        errors.push({
          rowNumber,
          employeeCode: personnelId,
          reason: 'Timestamp is invalid; use YYYY-MM-DD HH:mm:ss',
        });
        return;
      }

      const parsedRow: ParsedAttendanceRow = {
        rowNumber,
        employeeCode: personnelId,
        occurredAt,
        eventType,
        sourceEventId: null,
        deviceId: eventPoint,
        deviceName: readerName.slice(0, 255),
        rawPayload: Object.fromEntries(
          [...headers.entries()].map(([header, column]) => [
            header,
            (cells.get(column) ?? '').slice(0, 2_000),
          ]),
        ),
      };
      const key = `${personnelId}\u001f${getWorkDate(occurredAt)}`;
      const current = endpoints.get(key) ?? { firstEntry: null, lastExit: null };

      if (
        eventType === 'entry' &&
        (!current.firstEntry || occurredAt < current.firstEntry.occurredAt)
      ) {
        current.firstEntry = parsedRow;
      }
      if (eventType === 'exit' && (!current.lastExit || occurredAt > current.lastExit.occurredAt)) {
        current.lastExit = parsedRow;
      }
      endpoints.set(key, current);
    };

    parser.on('opentag', (tag) => {
      if (tag.name === 'row') {
        inferredRowNumber += 1;
        rowNumber = Number(tag.attributes.r) || inferredRowNumber;
        cells = new Map();
      } else if (tag.name === 'c') {
        cellColumn = columnNumber(String(tag.attributes.r ?? ''));
        cellType = String(tag.attributes.t ?? '');
        cellValue = '';
      } else if ((tag.name === 't' || tag.name === 'v') && cellColumn > 0) {
        captureCellValue = true;
      }
    });
    parser.on('text', (text) => {
      if (captureCellValue) cellValue += text;
    });
    parser.on('closetag', (tag) => {
      if (tag.name === 't' || tag.name === 'v') captureCellValue = false;
      if (tag.name === 'c' && cellColumn > 0) {
        const value = cellType === 's' ? (sharedStrings[Number(cellValue)] ?? '') : cellValue;
        cells.set(cellColumn, value);
        cellColumn = 0;
      }
      if (tag.name === 'row') processRow();
    });
    parser.on('error', (error) => {
      throw error;
    });
    await parseXmlInChunks(worksheetXml, parser);
  } catch (error) {
    if (error instanceof WorkbookRowLimitError) {
      return invalidWorkbook(
        `Door workbook exceeds the ${MAX_WORKBOOK_ROWS.toLocaleString('en-IN')} row limit`,
        totalRows,
      );
    }
    return invalidWorkbook(
      'Door workbook could not be parsed; upload an XLSX workbook exported from All Transactions',
    );
  }

  if (!foundTransactionSheet) {
    return invalidWorkbook(
      `Door workbook is missing required columns: ${REQUIRED_HEADERS.join(', ')}`,
    );
  }
  if (totalRows === 0) return invalidWorkbook('Door workbook contains no transaction rows');

  const rows = [...endpoints.values()]
    .flatMap(({ firstEntry, lastExit }) => [firstEntry, lastExit])
    .filter((row): row is ParsedAttendanceRow => Boolean(row))
    .sort((left, right) => left.rowNumber - right.rowNumber);

  return {
    totalRows,
    ignoredRows: Math.max(0, totalRows - rows.length - errors.length),
    rows,
    errors,
    employeeProfiles: [...employeeProfiles.values()],
  };
}
