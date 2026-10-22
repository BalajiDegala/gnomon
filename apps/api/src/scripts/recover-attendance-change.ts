import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { AttendanceImportChange } from '../modules/imports/attendance-import-change.model.js';
import { restoreAttendanceChange } from '../modules/imports/attendance-import-change.service.js';
import { AttendanceWriteLock } from '../modules/imports/attendance-write-lock.js';

async function recover() {
  if (!process.argv.includes('--writers-stopped')) {
    throw new Error('Stop API and import workers first, then run with --writers-stopped.');
  }
  await connectDatabase();
  const lock = await AttendanceWriteLock.findById('attendance').lean().exec();
  const interrupted = await AttendanceImportChange.find({
    status: { $in: ['applying', 'recovery_required'] },
  })
    .sort({ createdAt: 1 })
    .lean()
    .exec();
  for (const change of interrupted) {
    await restoreAttendanceChange(String(change._id));
    console.log(`Restored attendance change ${change._id}`);
  }
  if (lock) await AttendanceWriteLock.deleteOne({ _id: 'attendance', owner: lock.owner }).exec();
  console.log('Attendance changes recovered; import lock released.');
}

recover()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
