import { describe, expect, it } from 'vitest';

import { UpdateDepartmentApprovalPolicyRequestSchema } from './policy.js';

const approver1EmployeeId = '507f1f77bcf86cd799439011';
const approver2EmployeeId = '507f1f77bcf86cd799439012';
const alternateApprover2EmployeeId = '507f1f77bcf86cd799439013';

describe('department approval policy input', () => {
  it('accepts an any-of second-approver pool', () => {
    const result = UpdateDepartmentApprovalPolicyRequestSchema.safeParse({
      approvalSteps: 2,
      approver1EmployeeId,
      approver2EmployeeIds: [approver2EmployeeId, alternateApprover2EmployeeId],
      emailTriggers: [],
    });

    expect(result.success).toBe(true);
  });

  it('requires a second approver for two-stage routes', () => {
    const result = UpdateDepartmentApprovalPolicyRequestSchema.safeParse({
      approvalSteps: 2,
      approver1EmployeeId,
      approver2EmployeeIds: [],
      emailTriggers: [],
    });

    expect(result.success).toBe(false);
  });

  it('keeps the first approver out of the second-approval pool', () => {
    const result = UpdateDepartmentApprovalPolicyRequestSchema.safeParse({
      approvalSteps: 2,
      approver1EmployeeId,
      approver2EmployeeIds: [approver1EmployeeId],
      emailTriggers: [],
    });

    expect(result.success).toBe(false);
  });

  it('accepts the legacy singular second-approver field', () => {
    const result = UpdateDepartmentApprovalPolicyRequestSchema.safeParse({
      approvalSteps: 2,
      approver1EmployeeId,
      approver2EmployeeId,
      emailTriggers: [],
    });

    expect(result.success).toBe(true);
  });
});
