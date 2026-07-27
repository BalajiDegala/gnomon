import 'dotenv/config';

import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { User } from '../modules/auth/user.model.js';
import { Employee } from '../modules/employees/employee.model.js';
import { RoleAssignment } from '../modules/roles/role.model.js';
import { ensureSystemRoles } from '../modules/roles/system-roles.js';

const AdminEnvSchema = z.object({
  ADMIN_EMAIL: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  ADMIN_PASSWORD: z.string().min(12),
  ADMIN_EMPLOYEE_CODE: z.string().min(1).default('DDI0001'),
});

async function seedAdmin(): Promise<void> {
  const input = AdminEnvSchema.parse(process.env);
  await connectDatabase();

  const employee = await Employee.findOneAndUpdate(
    { employeeCode: input.ADMIN_EMPLOYEE_CODE },
    {
      $set: {
        firstName: 'System',
        lastName: 'Administrator',
        email: input.ADMIN_EMAIL,
        timezone: 'Asia/Kolkata',
        status: 'active',
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  const passwordHash = await bcrypt.hash(input.ADMIN_PASSWORD, 12);
  const user = await User.findOneAndUpdate(
    { employeeId: employee._id },
    {
      $set: {
        email: input.ADMIN_EMAIL,
        passwordHash,
        status: 'active',
      },
      $setOnInsert: { tokenVersion: 0 },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  const roles = await ensureSystemRoles();
  const role = roles.get('SYSTEM_ADMIN');
  if (!role) throw new Error('The System Administrator role could not be seeded');

  await RoleAssignment.findOneAndUpdate(
    { userId: user._id, roleId: role._id, scopeType: 'company' },
    {
      $setOnInsert: {
        scopeIds: [],
        validFrom: new Date(),
        validUntil: null,
        grantedBy: null,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  process.stdout.write(`Seeded administrator ${input.ADMIN_EMAIL}\n`);
}

seedAdmin()
  .then(disconnectDatabase)
  .catch(async (error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    await disconnectDatabase();
    process.exitCode = 1;
  });
