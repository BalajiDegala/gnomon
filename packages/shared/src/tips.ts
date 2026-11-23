import { z } from 'zod';

/** Site-wide settings for the "Tip from Relangi" wellbeing reminders. */
export const TipsSettingsSchema = z.object({
  enabled: z.boolean(),
  /** How often a tip appears for each signed-in person. */
  intervalMinutes: z.number().int().min(30).max(480),
  /** How long a tip stays on screen before it slides away. */
  displaySeconds: z.number().int().min(10).max(120),
});
export type TipsSettings = z.infer<typeof TipsSettingsSchema>;

export const defaultTipsSettings: TipsSettings = {
  enabled: true,
  intervalMinutes: 120,
  displaySeconds: 30,
};
