import { parse } from 'csv-parse/sync';

export interface ParsedApprovalRouteRow {
  rowNumber: number;
  section: 'support' | 'artist';
  approverName: string;
  departmentLabels: string[];
  stage: 1 | 2 | null;
}

export interface ParsedApprovalRoutes {
  rows: ParsedApprovalRouteRow[];
  errors: Array<{ rowNumber: number; reason: string }>;
}

function departmentLabels(value: string): string[] {
  return [
    ...new Set(
      value
        .replace(/\band\b/gi, ',')
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  ];
}

export function parseApprovalRoutesCsv(csvText: string): ParsedApprovalRoutes {
  let records: string[][];
  try {
    records = parse(csvText, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: false,
      trim: true,
    }) as string[][];
  } catch (error) {
    return {
      rows: [],
      errors: [
        {
          rowNumber: 1,
          reason: `Approvals CSV could not be parsed: ${error instanceof Error ? error.message : 'invalid format'}`,
        },
      ],
    };
  }

  const rows: ParsedApprovalRouteRow[] = [];
  const errors: ParsedApprovalRoutes['errors'] = [];
  let section: ParsedApprovalRouteRow['section'] | null = null;
  records.forEach((record, index) => {
    const rowNumber = index + 1;
    const title = (record[1] ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (title.includes('supportappoval') || title.includes('supportapproval')) {
      section = 'support';
      return;
    }
    if (title.includes('artistappoval') || title.includes('artistapproval')) {
      section = 'artist';
      return;
    }
    const approverName = (record[1] ?? '').trim();
    const coverage = (record[2] ?? '').trim();
    const approval = (record[3] ?? '').trim().toLowerCase();
    if (!approverName && !coverage && !approval) return;
    if (!section) {
      errors.push({ rowNumber, reason: 'Approval section heading is missing' });
      return;
    }
    if (!approverName || !coverage) {
      errors.push({ rowNumber, reason: 'Approver name and department coverage are required' });
      return;
    }
    const stage = /(^|\s)(2nd|second)(\s|$)/.test(approval)
      ? 2
      : /(^|\s)(1st|first)(\s|$)/.test(approval)
        ? 1
        : null;
    if (section === 'artist' && stage === null) {
      errors.push({
        rowNumber,
        reason: 'Artist approval row must identify first or second approval',
      });
      return;
    }
    rows.push({
      rowNumber,
      section,
      approverName,
      departmentLabels: departmentLabels(coverage),
      stage,
    });
  });
  if (rows.length === 0 && errors.length === 0) {
    errors.push({ rowNumber: 1, reason: 'No approval routes were found' });
  }
  return { rows, errors };
}
