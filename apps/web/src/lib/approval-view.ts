import type { LeaveRequestDto, RegularisationRequestDto } from '@gnomon/shared';

import type { CsvValue } from './csv';

/**
 * One row model for both approval queues, so filters, grouping, sorting,
 * columns and export behave the same for regularisation and leave.
 */
export type ApprovalKind = 'regularisations' | 'leave';

export interface ApprovalRow {
  id: string;
  kind: ApprovalKind;
  employeeName: string;
  employeeCode: string;
  /** Work date (regularisation) or first leave date. */
  date: string;
  dateLabel: string;
  /** Source (regularisation) or leave type. */
  category: string;
  /** Corrected time window (regularisation) or day part (leave). */
  detail: string;
  /** Minutes (regularisation) or days (leave). */
  amount: number;
  amountLabel: string;
  reason: string;
  status: string;
  stage: string;
  submittedAt: string;
  myDecision: 'approved' | 'rejected' | null;
  myDecidedAt: string | null;
  myComment: string;
}

export const approvalColumnIds = [
  'employee',
  'date',
  'category',
  'detail',
  'amount',
  'reason',
  'stage',
  'submitted',
  'decision',
  'decidedAt',
] as const;
export type ApprovalColumnId = (typeof approvalColumnIds)[number];

export function approvalColumnLabels(kind: ApprovalKind): Record<ApprovalColumnId, string> {
  const leave = kind === 'leave';
  return {
    employee: 'Employee',
    date: leave ? 'Dates' : 'Work date',
    category: leave ? 'Leave type' : 'Source',
    detail: leave ? 'Day part' : 'Corrected time',
    amount: leave ? 'Days' : 'Duration',
    reason: 'Reason',
    stage: 'Stage',
    submitted: 'Submitted',
    decision: 'Your decision',
    decidedAt: 'Decided on',
  };
}

export const defaultVisibleApprovalColumns: readonly ApprovalColumnId[] = [
  'employee',
  'date',
  'category',
  'detail',
  'amount',
  'reason',
  'stage',
  'submitted',
  'decision',
];

export function parseVisibleApprovalColumns(value: unknown): ApprovalColumnId[] | null {
  if (!Array.isArray(value)) return null;
  const valid = approvalColumnIds.filter((id) => value.includes(id));
  return valid.length > 0 ? valid : null;
}

/* ---------------------------------------------------------- row mapping */

const finalStatusLabels: Record<string, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};
const sourceLabels: Record<RegularisationRequestDto['source'], string> = {
  biometric: 'Biometric',
  access_card: 'Access card',
  website: 'Website',
};
const dayPartLabels: Record<LeaveRequestDto['dayPart'], string> = {
  full_day: 'Full day',
  first_half: 'First half',
  second_half: 'Second half',
};

function myDecisionOf(
  decisions: ReadonlyArray<{
    decision: 'approved' | 'rejected';
    actorEmployeeId?: string;
    comment: string;
    decidedAt: string;
  }>,
  employeeId: string | undefined,
) {
  const mine = employeeId
    ? decisions.filter((decision) => decision.actorEmployeeId === employeeId).at(-1)
    : undefined;
  return {
    myDecision: mine?.decision ?? null,
    myDecidedAt: mine?.decidedAt ?? null,
    myComment: mine?.comment ?? '',
  };
}

function formatMinutes(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function regularisationRow(
  request: RegularisationRequestDto,
  employeeId: string | undefined,
  formatTime: (iso: string) => string,
): ApprovalRow {
  return {
    id: request.id,
    kind: 'regularisations',
    employeeName: request.employeeDisplayName,
    employeeCode: request.employeeCode,
    date: request.workDate,
    dateLabel: request.workDate,
    category: sourceLabels[request.source] ?? request.source,
    detail: `${formatTime(request.requestedStart)} – ${formatTime(request.requestedEnd)}`,
    amount: request.requestedMinutes,
    amountLabel: formatMinutes(request.requestedMinutes),
    reason: request.reason,
    status: request.status,
    stage:
      finalStatusLabels[request.status] ??
      (request.status === 'pending_manager' ? 'Manager review' : 'Final HR review'),
    submittedAt: request.submittedAt,
    ...myDecisionOf(request.decisions, employeeId),
  };
}

export function leaveRow(
  request: LeaveRequestDto,
  employeeId: string | undefined,
  leaveTypeLabel: (type: LeaveRequestDto['leaveType']) => string,
): ApprovalRow {
  return {
    id: request.id,
    kind: 'leave',
    employeeName: request.employeeDisplayName,
    employeeCode: request.employeeCode,
    date: request.startDate,
    dateLabel:
      request.startDate === request.endDate
        ? request.startDate
        : `${request.startDate} – ${request.endDate}`,
    category: leaveTypeLabel(request.leaveType),
    detail: dayPartLabels[request.dayPart],
    amount: request.requestedDays,
    amountLabel: String(request.requestedDays),
    reason: request.reason,
    status: request.status,
    stage:
      finalStatusLabels[request.status] ??
      (request.status === 'pending_manager'
        ? `Approver 1 of ${request.approvalSteps}`
        : `Approver 2 of ${request.approvalSteps}`),
    submittedAt: request.submittedAt,
    ...myDecisionOf(request.decisions, employeeId),
  };
}

/* -------------------------------------------------------------- filters */

export interface ApprovalFilters {
  search: string;
  stages: readonly string[];
  categories: readonly string[];
  decisions: readonly string[];
  dateFrom: string;
  dateTo: string;
}

export const decisionLabel = (row: ApprovalRow) =>
  row.myDecision === 'approved' ? 'Approved' : row.myDecision === 'rejected' ? 'Rejected' : '—';

export function filterApprovals(rows: readonly ApprovalRow[], filters: ApprovalFilters) {
  const term = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.stages.length && !filters.stages.includes(row.stage)) return false;
    if (filters.categories.length && !filters.categories.includes(row.category)) return false;
    if (filters.decisions.length && !filters.decisions.includes(decisionLabel(row))) return false;
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    if (!term) return true;
    return [row.employeeName, row.employeeCode, row.reason, row.category, row.stage].some((value) =>
      value.toLowerCase().includes(term),
    );
  });
}

export function approvalFacet(
  rows: readonly ApprovalRow[],
  pick: (row: ApprovalRow) => string,
): Array<{ value: string; label: string; secondary: string }> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(pick(row), (counts.get(pick(row)) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, count]) => ({ value, label: value, secondary: `${count} requests` }));
}

/* -------------------------------------------------------------- sorting */

export type ApprovalSortKey = ApprovalColumnId;
export interface ApprovalSortRule {
  key: ApprovalSortKey;
  direction: 'asc' | 'desc';
}

export function defaultApprovalSort(view: 'pending' | 'decided'): ApprovalSortRule[] {
  return view === 'decided'
    ? [{ key: 'decidedAt', direction: 'desc' }]
    : [{ key: 'submitted', direction: 'asc' }];
}

export function parseApprovalSort(value: string): ApprovalSortRule[] | null {
  const rules: ApprovalSortRule[] = [];
  for (const part of value.split(',')) {
    const [key, direction] = part.split(':');
    if (!approvalColumnIds.includes(key as ApprovalSortKey)) return null;
    if (direction !== 'asc' && direction !== 'desc') return null;
    if (rules.some((rule) => rule.key === key)) return null;
    rules.push({ key: key as ApprovalSortKey, direction });
  }
  return rules.length > 0 && rules.length <= 3 ? rules : null;
}

export function serializeApprovalSort(rules: readonly ApprovalSortRule[]): string {
  return rules.map((rule) => `${rule.key}:${rule.direction}`).join(',');
}

/** Click sorts by one column; Shift+click adds or flips a level (max three). */
export function nextApprovalSort(
  rules: readonly ApprovalSortRule[],
  key: ApprovalSortKey,
  additive: boolean,
): ApprovalSortRule[] {
  const initial: 'asc' | 'desc' = key === 'decidedAt' ? 'desc' : 'asc';
  const existing = rules.find((rule) => rule.key === key);
  const flip = (rule: ApprovalSortRule): ApprovalSortRule => ({
    ...rule,
    direction: rule.direction === 'asc' ? 'desc' : 'asc',
  });
  if (additive) {
    if (existing) return rules.map((rule) => (rule.key === key ? flip(rule) : rule));
    return [...rules, { key, direction: initial }].slice(-3);
  }
  if (existing && rules[0]?.key === key) return [flip(existing)];
  return [{ key, direction: initial }];
}

function sortValue(row: ApprovalRow, key: ApprovalSortKey): string | number {
  switch (key) {
    case 'employee':
      return `${row.employeeName} ${row.employeeCode}`;
    case 'date':
      return row.date;
    case 'category':
      return row.category;
    case 'detail':
      return row.detail;
    case 'amount':
      return row.amount;
    case 'reason':
      return row.reason;
    case 'stage':
      return row.stage;
    case 'submitted':
      return row.submittedAt;
    case 'decision':
      return row.myDecision ?? '';
    case 'decidedAt':
      return row.myDecidedAt ?? '';
  }
}

/* ------------------------------------------------------------- grouping */

export const approvalGroupOptions = [
  'none',
  'employee',
  'stage',
  'category',
  'month',
  'decision',
] as const;
export type ApprovalGroupBy = (typeof approvalGroupOptions)[number];

export function approvalGroupLabels(kind: ApprovalKind): Record<ApprovalGroupBy, string> {
  return {
    none: 'No grouping',
    employee: 'Employee',
    stage: 'Stage',
    category: kind === 'leave' ? 'Leave type' : 'Source',
    month: 'Month',
    decision: 'Your decision',
  };
}

export function approvalGroupFor(
  row: ApprovalRow,
  groupBy: Exclude<ApprovalGroupBy, 'none'>,
): { key: string; label: string; secondary?: string } {
  switch (groupBy) {
    case 'employee':
      return {
        key: `employee:${row.employeeCode}`,
        label: row.employeeName,
        secondary: row.employeeCode,
      };
    case 'stage':
      return { key: `stage:${row.stage}`, label: row.stage };
    case 'category':
      return { key: `category:${row.category}`, label: row.category };
    case 'month': {
      const month = row.date.slice(0, 7);
      const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
      return { key: `month:${month}`, label };
    }
    case 'decision':
      return { key: `decision:${decisionLabel(row)}`, label: decisionLabel(row) };
  }
}

export function orderApprovals(
  rows: readonly ApprovalRow[],
  rules: readonly ApprovalSortRule[],
  groupBy: ApprovalGroupBy,
): ApprovalRow[] {
  return rows.slice().sort((left, right) => {
    if (groupBy !== 'none') {
      const leftGroup = approvalGroupFor(left, groupBy);
      const rightGroup = approvalGroupFor(right, groupBy);
      if (leftGroup.key !== rightGroup.key) {
        // Months read newest first; everything else alphabetically.
        return groupBy === 'month'
          ? rightGroup.key.localeCompare(leftGroup.key)
          : leftGroup.label.localeCompare(rightGroup.label);
      }
    }
    for (const rule of rules) {
      const leftValue = sortValue(left, rule.key);
      const rightValue = sortValue(right, rule.key);
      if (leftValue === '' && rightValue !== '') return 1;
      if (rightValue === '' && leftValue !== '') return -1;
      const result =
        typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true });
      if (result) return rule.direction === 'asc' ? result : -result;
    }
    return left.id.localeCompare(right.id);
  });
}

/* --------------------------------------------------------------- export */

function exportCells(row: ApprovalRow, id: ApprovalColumnId): CsvValue[] {
  switch (id) {
    case 'employee':
      return [row.employeeName, row.employeeCode];
    case 'date':
      return [row.dateLabel];
    case 'category':
      return [row.category];
    case 'detail':
      return [row.detail];
    case 'amount':
      return [row.kind === 'leave' ? row.amount : row.amountLabel];
    case 'reason':
      return [row.reason];
    case 'stage':
      return [row.stage];
    case 'submitted':
      return [row.submittedAt];
    case 'decision':
      return [row.myDecision ? decisionLabel(row) : null, row.myComment || null];
    case 'decidedAt':
      return [row.myDecidedAt];
  }
}

function exportHeaders(kind: ApprovalKind, id: ApprovalColumnId): string[] {
  const labels = approvalColumnLabels(kind);
  if (id === 'employee') return ['Employee', 'Employee code'];
  if (id === 'decision') return ['Your decision', 'Your comment'];
  return [labels[id]];
}

export function buildApprovalExport(
  rows: readonly ApprovalRow[],
  kind: ApprovalKind,
  columnIds: readonly ApprovalColumnId[],
  groupBy: ApprovalGroupBy,
): { headers: string[]; rows: CsvValue[][] } {
  const grouped = groupBy !== 'none';
  return {
    headers: [
      ...(grouped ? [approvalGroupLabels(kind)[groupBy]] : []),
      ...columnIds.flatMap((id) => exportHeaders(kind, id)),
    ],
    rows: rows.map((row) => [
      ...(grouped ? [approvalGroupFor(row, groupBy).label] : []),
      ...columnIds.flatMap((id) => exportCells(row, id)),
    ]),
  };
}
