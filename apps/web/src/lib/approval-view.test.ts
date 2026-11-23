import { describe, expect, it } from 'vitest';

import {
  buildApprovalExport,
  filterApprovals,
  nextApprovalSort,
  orderApprovals,
  type ApprovalRow,
} from './approval-view';

function row(overrides: Partial<ApprovalRow> & { id: string }): ApprovalRow {
  return {
    kind: 'leave',
    employeeName: 'Asha',
    employeeCode: 'E1',
    date: '2026-11-03',
    dateLabel: '2026-11-03',
    category: 'Casual',
    detail: 'Full day',
    amount: 1,
    amountLabel: '1',
    reason: 'Family',
    status: 'approved',
    stage: 'Approved',
    submittedAt: '2026-11-01T00:00:00.000Z',
    myDecision: 'approved',
    myDecidedAt: '2026-11-02T00:00:00.000Z',
    myComment: '',
    ...overrides,
  };
}

const rows = [
  row({ id: '1' }),
  row({
    id: '2',
    employeeName: 'Ravi',
    category: 'Sick',
    date: '2026-10-05',
    myDecision: 'rejected',
    stage: 'Rejected',
  }),
];
const none = { search: '', stages: [], categories: [], decisions: [], dateFrom: '', dateTo: '' };

describe('approval view', () => {
  it('filters by category, decision, and date range', () => {
    expect(filterApprovals(rows, { ...none, categories: ['Sick'] }).map((r) => r.id)).toEqual([
      '2',
    ]);
    expect(filterApprovals(rows, { ...none, decisions: ['Approved'] }).map((r) => r.id)).toEqual([
      '1',
    ]);
    expect(filterApprovals(rows, { ...none, dateFrom: '2026-11-01' }).map((r) => r.id)).toEqual([
      '1',
    ]);
  });

  it('groups months newest first and sorts within groups', () => {
    const ordered = orderApprovals(rows, [{ key: 'employee', direction: 'asc' }], 'month');
    expect(ordered.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('adds a sort level on shift+click', () => {
    expect(
      nextApprovalSort([{ key: 'submitted', direction: 'asc' }], 'employee', true),
    ).toHaveLength(2);
  });

  it('exports in the given column order', () => {
    const csv = buildApprovalExport(rows.slice(0, 1), 'leave', ['decision', 'employee'], 'none');
    expect(csv.headers).toEqual(['Your decision', 'Your comment', 'Employee', 'Employee code']);
    expect(csv.rows[0]).toEqual(['Approved', null, 'Asha', 'E1']);
  });
});
