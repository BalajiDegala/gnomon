import { describe, expect, it } from 'vitest';

import {
  parseEnumValue,
  parseIsoDate,
  parseShortSearch,
  parseYearMonth,
  readUrlQueryValue,
  updateUrlQueryValue,
} from './url-query-state';

describe('URL query state', () => {
  it('accepts real business dates and months', () => {
    expect(parseIsoDate('2028-02-29')).toBe('2028-02-29');
    expect(parseIsoDate('2027-02-29')).toBeNull();
    expect(parseIsoDate('1999-12-31')).toBeNull();
    expect(parseYearMonth('2026-12')).toBe('2026-12');
    expect(parseYearMonth('2026-13')).toBeNull();
  });

  it('validates enums and short, non-control-character searches', () => {
    expect(parseEnumValue('active', ['all', 'active', 'inactive'] as const)).toBe('active');
    expect(parseEnumValue('deleted', ['all', 'active', 'inactive'] as const)).toBeNull();
    expect(parseShortSearch('Asha Rao')).toBe('Asha Rao');
    expect(parseShortSearch('bad\nsearch')).toBeNull();
    expect(parseShortSearch('x'.repeat(101))).toBeNull();
  });

  it('uses defaults for missing or invalid values', () => {
    expect(readUrlQueryValue('?date=2026-07-24', 'date', '2026-08-02', parseIsoDate)).toBe(
      '2026-07-24',
    );
    expect(readUrlQueryValue('?date=not-a-date', 'date', '2026-08-02', parseIsoDate)).toBe(
      '2026-08-02',
    );
    expect(readUrlQueryValue('', 'date', '2026-08-02', parseIsoDate)).toBe('2026-08-02');
  });

  it('updates one parameter, preserves others, and omits default values', () => {
    expect(updateUrlQueryValue('?tab=leave', 'from', '2026-07-01', '2026-08-01')).toBe(
      '?tab=leave&from=2026-07-01',
    );
    expect(
      updateUrlQueryValue('?tab=leave&from=2026-07-01', 'tab', 'attendance', 'attendance'),
    ).toBe('?from=2026-07-01');
  });
});
