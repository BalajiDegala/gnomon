import { LeaveBalance, LeaveRequest } from './leave.model.js';

/**
 * Casual and sick leave were merged into one "Casual/Sick" pool (stored as
 * `casual`) to match the HRMS. Fold any legacy `sick` requests and balances
 * into `casual` so existing data keeps validating. Safe to run repeatedly.
 */
export async function migrateLegacySickLeave(): Promise<{ requests: number; balances: number }> {
  const requests = await LeaveRequest.collection.updateMany(
    { leaveType: 'sick' },
    { $set: { leaveType: 'casual' } },
  );

  let balances = 0;
  const legacyBalances = await LeaveBalance.collection.find({ leaveType: 'sick' }).toArray();
  for (const legacy of legacyBalances) {
    const merged = await LeaveBalance.collection.updateOne(
      { employeeId: legacy.employeeId, leaveType: 'casual', year: legacy.year },
      {
        $inc: {
          entitledDays: Number(legacy.entitledDays ?? 0),
          adjustedDays: Number(legacy.adjustedDays ?? 0),
        },
      },
    );
    if (merged.matchedCount > 0) {
      await LeaveBalance.collection.deleteOne({ _id: legacy._id });
    } else {
      await LeaveBalance.collection.updateOne(
        { _id: legacy._id },
        { $set: { leaveType: 'casual' } },
      );
    }
    balances += 1;
  }

  return { requests: requests.modifiedCount, balances };
}
