import { SendTestEmailRequestSchema, UpdateSmtpSettingsRequestSchema } from '@gnomon/shared';
import { Router } from 'express';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { getSmtpSettings, sendTestEmail, updateSmtpSettings } from './smtp.service.js';

export const smtpAdministrationRouter = Router();
smtpAdministrationRouter.use(requireAuth, requirePermission('policy:manage'));

smtpAdministrationRouter.get('/', async (_request, response) => {
  response.json({ smtp: await getSmtpSettings() });
});

smtpAdministrationRouter.put('/', async (request, response) => {
  const input = UpdateSmtpSettingsRequestSchema.parse(request.body);
  response.json({ smtp: await updateSmtpSettings(request.authUser!.id, input) });
});

smtpAdministrationRouter.post('/test', async (request, response) => {
  const { to } = SendTestEmailRequestSchema.parse(request.body);
  response.json({ smtp: await sendTestEmail(to) });
});
