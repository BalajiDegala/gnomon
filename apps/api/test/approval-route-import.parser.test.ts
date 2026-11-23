import { describe, expect, it } from 'vitest';

import { parseApprovalRoutesCsv } from '../src/modules/imports/approval-route-import.parser.js';

describe('approval route CSV parser', () => {
  it('reads support references and artist approval stages from the supplied sheet shape', () => {
    const parsed = parseApprovalRoutesCsv(`,Support Appoval,Department ,
,Devarshi Thakkar,"Prod, Pipeline",
,,,
,Artist Appoval,Department ,Approval
,Abhishek Donikena,Comp and CG,2nd  Approval
,Lokanath Sahu,"Roto, Paint, Integ, Comp",Artist First approval`);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        rowNumber: 2,
        section: 'support',
        approverName: 'Devarshi Thakkar',
        departmentLabels: ['Prod', 'Pipeline'],
        stage: null,
      },
      {
        rowNumber: 5,
        section: 'artist',
        approverName: 'Abhishek Donikena',
        departmentLabels: ['Comp', 'CG'],
        stage: 2,
      },
      {
        rowNumber: 6,
        section: 'artist',
        approverName: 'Lokanath Sahu',
        departmentLabels: ['Roto', 'Paint', 'Integ', 'Comp'],
        stage: 1,
      },
    ]);
  });
});
