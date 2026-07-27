import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { ensureSystemRoles } from '../modules/roles/system-roles.js';

async function seedSystemRoles(): Promise<void> {
  await connectDatabase();
  const roles = await ensureSystemRoles();
  process.stdout.write(`Seeded ${roles.size} system roles\n`);
}

seedSystemRoles()
  .then(disconnectDatabase)
  .catch(async (error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    await disconnectDatabase();
    process.exitCode = 1;
  });
