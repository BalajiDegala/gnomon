import { describe, expect, it } from 'vitest';

import { parseApprovalRoutesCsv } from '../src/modules/imports/approval-route-import.parser.js';
import { parseUserDirectoryCsv } from '../src/modules/imports/user-directory.parser.js';

const usersCsv = [
  'Emp ID,User ID,Mail ID,Emp name,New Designation,Dept,Leave Approver 1,Leave Approver 2,Email Triggers',
  'DDIH001,asha,asha@example.com,Asha Rao,Artist,Roto,Lead Person,NA,NA',
].join('\n');
const approvalsCsv = [
  ',Support Appoval,Department ,',
  ',Lead Person,"Prod, Pipeline",',
  ',Artist Appoval,Department ,Approval',
  ',Second Person,Comp and CG,2nd  Approval',
].join('\n');

describe('mixed-up directory and approval uploads', () => {
  it('explains when users.csv is uploaded as approval routes', () => {
    const result = parseApprovalRoutesCsv(usersCsv);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({ reason: expect.stringContaining('User directory CSV') }),
    ]);
  });

  it('explains when approvals.csv is uploaded as the user directory', () => {
    const result = parseUserDirectoryCsv(approvalsCsv);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({ reason: expect.stringContaining('Leave approval routes CSV') }),
    ]);
  });

  it('still accepts each file in its own upload', () => {
    expect(parseApprovalRoutesCsv(approvalsCsv).errors).toEqual([]);
    expect(parseUserDirectoryCsv(usersCsv).errors).toEqual([]);
  });
});
