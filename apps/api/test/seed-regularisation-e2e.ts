import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/db/mongoose.js';
import { User } from '../src/modules/auth/user.model.js';
import { Employee } from '../src/modules/employees/employee.model.js';
import { DailyTimecard } from '../src/modules/reconciliation/daily-timecard.model.js';
import { RegularisationRequest } from '../src/modules/regularisations/regularisation.model.js';
import { RoleAssignment } from '../src/modules/roles/role.model.js';
import { ensureSystemRoles } from '../src/modules/roles/system-roles.js';

const FixtureEnvSchema = z.object({
  E2E_EMPLOYEE_EMAIL: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  E2E_EMPLOYEE_PASSWORD: z.string().min(12),
  E2E_MANAGER_EMAIL: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  E2E_MANAGER_PASSWORD: z.string().min(12),
  E2E_HR_EMAIL: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  E2E_HR_PASSWORD: z.string().min(12),
});

function assertIsolatedTestDatabase(): void {
  const databaseName = new URL(env.MONGODB_URI).pathname.replace(/^\//, '');
  if (env.NODE_ENV !== 'test' || !databaseName.endsWith('_test')) {
    throw new Error('Regularisation E2E fixtures may only be seeded into a *_test database');
  }
}

async function upsertEmployee(
  employeeCode: string,
  email: string,
  firstName: string,
  lastName: string,
) {
  return Employee.findOneAndUpdate(
    { employeeCode },
    {
      $set: {
        email,
        firstName,
        lastName,
        timezone: 'Asia/Kolkata',
        status: 'active',
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
}

async function upsertUser(employeeId: unknown, email: string, password: string) {
  return User.findOneAndUpdate(
    { email },
    {
      $set: {
        employeeId,
        passwordHash: await bcrypt.hash(password, 4),
        status: 'active',
        tokenVersion: 0,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
}

async function seedRegularisationFixtures(): Promise<void> {
  assertIsolatedTestDatabase();
  const input = FixtureEnvSchema.parse(process.env);
  await connectDatabase();

  const manager = await upsertEmployee('E2ERM001', input.E2E_MANAGER_EMAIL, 'Meera', 'Manager');
  const hr = await upsertEmployee('E2EHR001', input.E2E_HR_EMAIL, 'Harini', 'HR');
  const employee = await upsertEmployee('E2EEMP01', input.E2E_EMPLOYEE_EMAIL, 'Eshan', 'Artist');
  employee.reportingManagerId = manager._id;
  await employee.save();

  const employeeUser = await upsertUser(
    employee._id,
    input.E2E_EMPLOYEE_EMAIL,
    input.E2E_EMPLOYEE_PASSWORD,
  );
  const managerUser = await upsertUser(
    manager._id,
    input.E2E_MANAGER_EMAIL,
    input.E2E_MANAGER_PASSWORD,
  );
  const hrUser = await upsertUser(hr._id, input.E2E_HR_EMAIL, input.E2E_HR_PASSWORD);

  const fixtureEmployeeIds = [employee._id, manager._id, hr._id];
  const fixtureUserIds = [employeeUser._id, managerUser._id, hrUser._id];
  await Promise.all([
    RegularisationRequest.deleteMany({ employeeId: { $in: fixtureEmployeeIds } }),
    DailyTimecard.deleteMany({ employeeId: { $in: fixtureEmployeeIds } }),
    RoleAssignment.deleteMany({ userId: { $in: fixtureUserIds } }),
  ]);

  const roles = await ensureSystemRoles();
  const employeeRole = roles.get('EMPLOYEE');
  const managerRole = roles.get('REPORTING_MANAGER');
  const hrRole = roles.get('HR');
  if (!employeeRole || !managerRole || !hrRole) {
    throw new Error('Required system roles could not be seeded');
  }

  await RoleAssignment.insertMany([
    {
      userId: employeeUser._id,
      roleId: employeeRole._id,
      scopeType: 'self',
      scopeIds: [employee._id],
      validFrom: new Date(),
      validUntil: null,
      grantedBy: null,
    },
    {
      userId: managerUser._id,
      roleId: employeeRole._id,
      scopeType: 'self',
      scopeIds: [manager._id],
      validFrom: new Date(),
      validUntil: null,
      grantedBy: null,
    },
    {
      userId: managerUser._id,
      roleId: managerRole._id,
      scopeType: 'direct_reports',
      scopeIds: [employee._id],
      validFrom: new Date(),
      validUntil: null,
      grantedBy: null,
    },
    {
      userId: hrUser._id,
      roleId: employeeRole._id,
      scopeType: 'self',
      scopeIds: [hr._id],
      validFrom: new Date(),
      validUntil: null,
      grantedBy: null,
    },
    {
      userId: hrUser._id,
      roleId: hrRole._id,
      scopeType: 'company',
      scopeIds: [],
      validFrom: new Date(),
      validUntil: null,
      grantedBy: null,
    },
  ]);

  process.stdout.write('Seeded isolated regularisation E2E fixtures\n');
}

seedRegularisationFixtures()
  .then(disconnectDatabase)
  .catch(async (error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    await disconnectDatabase();
    process.exitCode = 1;
  });
