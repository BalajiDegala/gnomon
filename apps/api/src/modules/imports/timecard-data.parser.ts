import { getWorkDate, type TimecardDataImportIssue } from '@gnomon/shared';

/**
 * Parser for timecard records exported (MongoDB extended JSON) from the legacy
 * timecard application, e.g. data/time_data.json:
 *
 *   { "_id": {"$oid": "..."}, "login": "balajid",
 *     "date": {"$date": "2023-05-03T19:10:50.932Z"},
 *     "project": ["AUPS", "BA"], "task": {"AUPS": "Published"},
 *     "start_time": "19:10:47", "stop_time": "19:10:50" | "Working",
 *     "work_time": "10:00" }
 *
 * Times are India wall-clock times. The legacy app stored that wall-clock time
 * in `date` as if it were UTC, so the calendar date is read from the stored
 * value without converting time zones.
 */

const MAX_RECORDS = 20_000;
const TIME_OF_DAY = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const DURATION = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/;
const SHOW_CODE = /^[A-Z0-9_-]{2,24}$/;
const DAY_MS = 86_400_000;

export interface ParsedTimecardProject {
  code: string;
  comment: string;
}

export interface ParsedTimecardRecord {
  rowNumber: number;
  recordId: string;
  login: string;
  calendarDate: string;
  workDate: string;
  startedAt: Date;
  /** Null when the source still shows the day as "Working". */
  stoppedAt: Date | null;
  workMinutes: number;
  projects: ParsedTimecardProject[];
}

export interface ParsedTimecardFile {
  totalRecords: number;
  records: ParsedTimecardRecord[];
  errors: TimecardDataImportIssue[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** `{"$oid": "..."}` or a plain string. */
function readId(value: unknown): string {
  if (value && typeof value === 'object' && '$oid' in value)
    return text((value as { $oid: unknown }).$oid);
  return text(value);
}

/** Calendar date (YYYY-MM-DD) as stored, from `{"$date": ...}` or a plain value. */
function readCalendarDate(value: unknown): string | null {
  let raw: unknown = value;
  if (raw && typeof raw === 'object' && '$date' in raw) raw = (raw as { $date: unknown }).$date;
  if (raw && typeof raw === 'object' && '$numberLong' in raw) {
    raw = Number((raw as { $numberLong: unknown }).$numberLong);
  }
  if (typeof raw === 'number' && Number.isFinite(raw))
    return new Date(raw).toISOString().slice(0, 10);
  if (typeof raw !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]
    ? null
    : match[1]!;
}

function indiaInstant(calendarDate: string, timeOfDay: string): Date | null {
  const match = TIME_OF_DAY.exec(timeOfDay);
  if (!match) return null;
  const [, hours, minutes, seconds = '00'] = match;
  return new Date(`${calendarDate}T${hours!.padStart(2, '0')}:${minutes}:${seconds}+05:30`);
}

function durationMinutes(value: string): number | null {
  const match = DURATION.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes <= 24 * 60 ? minutes : null;
}

function readProjects(project: unknown, task: unknown): ParsedTimecardProject[] | string {
  if (project !== undefined && !Array.isArray(project)) return 'project must be a list of codes';
  const notes = new Map<string, string>();
  if (task && typeof task === 'object' && !Array.isArray(task)) {
    for (const [code, note] of Object.entries(task as Record<string, unknown>)) {
      notes.set(code.trim().toUpperCase(), text(note));
    }
  }
  const projects = new Map<string, ParsedTimecardProject>();
  for (const item of (project as unknown[] | undefined) ?? []) {
    const code = text(item).toUpperCase();
    if (!code) continue;
    if (!SHOW_CODE.test(code)) return `Project code "${text(item)}" is not a valid show code`;
    // Codes differing only in case (Beetle, BEETLE) are the same project.
    if (!projects.has(code)) {
      projects.set(code, { code, comment: (notes.get(code) ?? '').slice(0, 500) });
    }
  }
  return [...projects.values()];
}

export function parseTimecardData(jsonText: string, now = new Date()): ParsedTimecardFile {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return {
      totalRecords: 0,
      records: [],
      errors: [{ rowNumber: 1, login: '', reason: 'File is not valid JSON' }],
    };
  }
  if (!Array.isArray(data)) {
    return {
      totalRecords: 0,
      records: [],
      errors: [{ rowNumber: 1, login: '', reason: 'Expected a JSON array of timecard records' }],
    };
  }
  if (data.length > MAX_RECORDS) {
    return {
      totalRecords: data.length,
      records: [],
      errors: [{ rowNumber: 1, login: '', reason: `File exceeds the ${MAX_RECORDS} record limit` }],
    };
  }

  const today = getWorkDate(now);
  const records: ParsedTimecardRecord[] = [];
  const errors: TimecardDataImportIssue[] = [];
  const seenIds = new Set<string>();

  data.forEach((item: unknown, index) => {
    const rowNumber = index + 1;
    const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const login = text(record.login).toLowerCase();
    const fail = (reason: string) => errors.push({ rowNumber, login, reason });

    const recordId = readId(record._id);
    if (!recordId) return fail('Record has no _id');
    if (seenIds.has(recordId)) return fail('Duplicate _id in the file; only the first was used');
    if (!login) return fail('login is missing');
    const calendarDate = readCalendarDate(record.date);
    if (!calendarDate) return fail('date is missing or invalid');

    const startedAt = indiaInstant(calendarDate, text(record.start_time));
    if (!startedAt) return fail('start_time must be HH:MM or HH:MM:SS');
    const stopText = text(record.stop_time);
    let stoppedAt: Date | null = null;
    if (stopText.toLowerCase() !== 'working') {
      stoppedAt = indiaInstant(calendarDate, stopText);
      if (!stoppedAt) return fail('stop_time must be HH:MM, HH:MM:SS or "Working"');
      // A stop earlier than the start crossed midnight.
      if (stoppedAt < startedAt) stoppedAt = new Date(stoppedAt.getTime() + DAY_MS);
    }
    const workMinutes = durationMinutes(text(record.work_time) || '0:00');
    if (workMinutes === null) return fail('work_time must be H:MM (up to 24:00)');

    const projects = readProjects(record.project, record.task);
    if (typeof projects === 'string') return fail(projects);

    const workDate = getWorkDate(startedAt);
    if (workDate > today) return fail(`Work date ${workDate} is in the future`);

    seenIds.add(recordId);
    records.push({
      rowNumber,
      recordId,
      login,
      calendarDate,
      workDate,
      startedAt,
      stoppedAt,
      workMinutes,
      projects,
    });
  });

  return { totalRecords: data.length, records, errors };
}

/** Split a day's minutes across its projects; earlier projects take any remainder. */
export function splitMinutes(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}
