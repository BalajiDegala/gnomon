import { describe, expect, it } from 'vitest';

import { CreateEmployeeRequestSchema, UpdateEmployeeRequestSchema } from './employee.js';

describe('employee contracts', () => {
  it('normalizes employee identifiers and email addresses', () => {
    const result = CreateEmployeeRequestSchema.parse({
      employeeCode: ' ddi-102 ',
      firstName: ' Asha ',
      lastName: ' Rao ',
      email: ' ASHA.RAO@EXAMPLE.TEST ',
    });

    expect(result).toMatchObject({
      employeeCode: 'DDI-102',
      firstName: 'Asha',
      lastName: 'Rao',
      email: 'asha.rao@example.test',
      timezone: 'Asia/Kolkata',
      reportingManagerId: null,
    });
  });

  it('requires at least one field in an employee update', () => {
    expect(UpdateEmployeeRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdateEmployeeRequestSchema.safeParse({ status: 'inactive' }).success).toBe(true);
  });
});
