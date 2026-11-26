import { z } from 'zod';

/**
 * How a person's availability is shown to colleagues. `auto` (the default)
 * follows their timecard: available while the workday is running, away once
 * it is stopped. The manual modes hide the real status (and machine).
 */
export const AvailabilityModeSchema = z.enum(['auto', 'busy', 'available']);
export type AvailabilityMode = z.infer<typeof AvailabilityModeSchema>;

export const availabilityModeLabels: Record<AvailabilityMode, string> = {
  auto: 'Automatic',
  busy: 'Do not disturb',
  available: 'Always available',
};

export const AvailabilityStatusSchema = z.enum(['available', 'busy', 'away']);
export type AvailabilityStatus = z.infer<typeof AvailabilityStatusSchema>;

export const availabilityStatusLabels: Record<AvailabilityStatus, string> = {
  available: 'Available',
  busy: 'Do not disturb',
  away: 'Away',
};

export const AvailabilityPersonSchema = z.object({
  employeeId: z.string(),
  employeeCode: z.string(),
  fullName: z.string(),
  email: z.string(),
  loginId: z.string(),
  department: z.string().nullable(),
  status: AvailabilityStatusSchema,
  /** When the shown status began (timecard start); null for manual modes. */
  since: z.string().nullable(),
  /** Machine the timecard was started from; only shown while available automatically. */
  ipAddress: z.string().nullable(),
  isMe: z.boolean(),
});
export type AvailabilityPerson = z.infer<typeof AvailabilityPersonSchema>;

export const AvailabilityDirectorySchema = z.object({
  generatedAt: z.string(),
  people: z.array(AvailabilityPersonSchema),
});
export type AvailabilityDirectory = z.infer<typeof AvailabilityDirectorySchema>;

export const MyAvailabilitySchema = z.object({
  mode: AvailabilityModeSchema,
  /** What colleagues currently see for you. */
  status: AvailabilityStatusSchema,
});
export type MyAvailability = z.infer<typeof MyAvailabilitySchema>;

export const UpdateAvailabilityModeRequestSchema = z.object({ mode: AvailabilityModeSchema });
export type UpdateAvailabilityModeRequest = z.infer<typeof UpdateAvailabilityModeRequestSchema>;

/** The status colleagues see, given the real (automatic) status and the chosen mode. */
export function visibleAvailability(
  mode: AvailabilityMode,
  automatic: AvailabilityStatus,
): AvailabilityStatus {
  if (mode === 'busy') return 'busy';
  if (mode === 'available') return 'available';
  return automatic;
}
