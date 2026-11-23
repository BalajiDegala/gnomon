import { model, Schema, Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';

const lockSchema = new Schema({
  _id: String,
  owner: { type: Schema.Types.ObjectId, required: true },
  startedAt: { type: Date, required: true },
});
export const AttendanceWriteLock = model('AttendanceWriteLock', lockSchema);

// No expiry: a paused or interrupted writer must never overlap another writer.
// An interrupted destructive change is recoverable from AttendanceImportChange
// and the retained event records before an operator releases this lock.
export async function withAttendanceWriteLock<T>(action: () => Promise<T>): Promise<T> {
  const owner = new Types.ObjectId();
  try {
    await AttendanceWriteLock.create({ _id: 'attendance', owner, startedAt: new Date() });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    throw new HttpError(
      409,
      'Another attendance import or change is running. Try again after it finishes.',
      'ATTENDANCE_BUSY',
    );
  }
  let release = true;
  try {
    return await action();
  } catch (error) {
    release = !(error instanceof HttpError && error.code === 'ATTENDANCE_RECOVERY_REQUIRED');
    throw error;
  } finally {
    if (release) await AttendanceWriteLock.deleteOne({ _id: 'attendance', owner }).exec();
  }
}
