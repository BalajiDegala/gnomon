import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseLeaveBalanceWorkbook } from '../src/modules/imports/leave-balance-workbook.parser.js';

const dataDir = fileURLToPath(new URL('../../../data/', import.meta.url));
const permanent = `${dataDir}permanentleavebalance.xlsx`;
const contract = `${dataDir}Contractleavebalance.xlsx`;

describe('parseLeaveBalanceWorkbook', () => {
  it('rejects a non-workbook upload', () => {
    const parsed = parseLeaveBalanceWorkbook(Buffer.from('not a zip'));
    expect(parsed.format).toBeNull();
    expect(parsed.errors[0]?.reason).toMatch(/XLSX/);
  });

  it.runIf(existsSync(permanent))('maps the HRMS permanent summary onto app leave types', () => {
    const parsed = parseLeaveBalanceWorkbook(readFileSync(permanent));
    expect(parsed.format).toBe('permanent');
    expect(parsed.year).toBe(2026);
    expect(parsed.ignoredLeaveTypes).toHaveProperty('Work From Home');
    const upendra = parsed.entries.filter((entry) => entry.employeeCode === 'DDIH005');
    expect(upendra).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ leaveType: 'casual', days: 2.5 }),
        expect.objectContaining({ leaveType: 'earned', days: 50 }),
      ]),
    );
    expect(
      parsed.entries.find(
        (entry) => entry.employeeCode === 'DDIH017' && entry.leaveType === 'comp_off',
      )?.days,
    ).toBe(4);
  });

  it.runIf(existsSync(contract))('reads contract closing balances as casual/sick leave', () => {
    const parsed = parseLeaveBalanceWorkbook(readFileSync(contract));
    expect(parsed.format).toBe('contract');
    expect(parsed.year).toBe(2026);
    expect(parsed.entries.find((entry) => entry.employeeCode === 'DDIC153')).toMatchObject({
      leaveType: 'casual',
      days: 0.5,
    });
    expect(parsed.entries.find((entry) => entry.employeeCode === 'DDIC285')?.days).toBe(-6);
  });
});
