import {
  defaultTipsSettings,
  TipsSettingsSchema,
  type TipsSettings as TipsSettingsDto,
} from '@gnomon/shared';
import { Router } from 'express';
import { Types } from 'mongoose';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { TipsSettings } from './tips-settings.model.js';

async function readTipsSettings(): Promise<TipsSettingsDto> {
  const settings = await TipsSettings.findOne({ key: 'tips' }).lean().exec();
  if (!settings) return defaultTipsSettings;
  return {
    enabled: settings.enabled,
    intervalMinutes: settings.intervalMinutes,
    displaySeconds: settings.displaySeconds,
  };
}

/** Every signed-in person reads the setting so the app knows whether to show tips. */
export const tipsRouter = Router();
tipsRouter.use(requireAuth);
tipsRouter.get('/', async (_request, response) => {
  response.json({ tips: await readTipsSettings() });
});

/** Administrators turn tips on/off and tune their timing in Site preferences. */
export const tipsAdministrationRouter = Router();
tipsAdministrationRouter.use(requireAuth, requirePermission('policy:manage'));
tipsAdministrationRouter.put('/', async (request, response) => {
  const input = TipsSettingsSchema.parse(request.body);
  await TipsSettings.findOneAndUpdate(
    { key: 'tips' },
    { $set: { ...input, updatedByUserId: new Types.ObjectId(request.authUser!.id) } },
    { upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).exec();
  response.json({ tips: await readTipsSettings() });
});
