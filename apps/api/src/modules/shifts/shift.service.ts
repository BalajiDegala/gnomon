import { shiftDurationMinutes, type ShiftDto, type ShiftRequest } from '@gnomon/shared';
import { Types } from 'mongoose';

import { HttpError } from '../../middleware/errors.js';
import { Shift, type ShiftDocument } from './shift.model.js';

/** Created automatically so existing installations keep their 09:00–18:00 workday. */
export const STANDARD_SHIFT = { name: 'Standard shift', startTime: '09:00', endTime: '18:00' };

function toDto(shift: ShiftDocument): ShiftDto {
  return {
    id: String(shift._id),
    name: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
    durationMinutes: shiftDurationMinutes(shift.startTime, shift.endTime),
    isDefault: shift.isDefault,
    active: shift.active,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}

let standardShiftReady: Promise<unknown> | null = null;

async function ensureStandardShift(): Promise<void> {
  standardShiftReady ??= (async () => {
    await Shift.createIndexes();
    if ((await Shift.countDocuments().exec()) > 0) return;
    try {
      await Shift.create({
        ...STANDARD_SHIFT,
        nameKey: STANDARD_SHIFT.name.toLowerCase(),
        isDefault: true,
        active: true,
      });
    } catch (error) {
      // Another API replica created it first.
      if (!isDuplicateKeyError(error)) throw error;
    }
  })().catch((error: unknown) => {
    standardShiftReady = null;
    throw error;
  });
  await standardShiftReady;
}

function sortShifts(shifts: ShiftDocument[]): ShiftDocument[] {
  return [...shifts].sort(
    (left, right) =>
      Number(right.isDefault) - Number(left.isDefault) ||
      Number(right.active) - Number(left.active) ||
      left.startTime.localeCompare(right.startTime) ||
      left.name.localeCompare(right.name),
  );
}

export async function listShifts(options: { activeOnly?: boolean } = {}): Promise<ShiftDto[]> {
  await ensureStandardShift();
  const shifts = await Shift.find(options.activeOnly ? { active: true } : {})
    .lean()
    .exec();
  return sortShifts(shifts).map(toDto);
}

/** Resolves the shift an employee chose at timecard start, falling back to the default shift. */
export async function resolveShiftForStart(shiftId: string | undefined): Promise<ShiftDocument> {
  await ensureStandardShift();
  const shift = shiftId
    ? await Shift.findOne({ _id: shiftId, active: true }).lean().exec()
    : await Shift.findOne({ isDefault: true }).lean().exec();
  if (!shift) {
    throw new HttpError(
      400,
      shiftId ? 'The selected shift is not available' : 'No default shift is configured',
      'SHIFT_NOT_AVAILABLE',
    );
  }
  return shift;
}

export async function saveShift(
  userId: string,
  shiftId: string | null,
  input: ShiftRequest,
): Promise<ShiftDto[]> {
  await ensureStandardShift();
  const existing = shiftId ? await Shift.findById(shiftId).exec() : null;
  if (shiftId && !existing) throw new HttpError(404, 'Shift not found', 'SHIFT_NOT_FOUND');
  if (existing?.isDefault && !input.isDefault) {
    throw new HttpError(
      409,
      'Choose another default shift before changing this one',
      'DEFAULT_SHIFT_REQUIRED',
    );
  }

  const values = {
    name: input.name,
    nameKey: input.name.toLowerCase(),
    startTime: input.startTime,
    endTime: input.endTime,
    active: input.active,
    updatedByUserId: new Types.ObjectId(userId),
  };

  try {
    const saved = existing
      ? await Shift.findByIdAndUpdate(
          existing._id,
          { $set: values },
          {
            returnDocument: 'after',
            runValidators: true,
          },
        ).exec()
      : await Shift.create({ ...values, isDefault: false });
    if (input.isDefault && !saved!.isDefault) {
      await Shift.updateMany({ isDefault: true }, { $set: { isDefault: false } }).exec();
      await Shift.updateOne({ _id: saved!._id }, { $set: { isDefault: true } }).exec();
    }
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, 'A shift with this name already exists', 'SHIFT_NAME_TAKEN');
    }
    throw error;
  }

  return listShifts();
}
