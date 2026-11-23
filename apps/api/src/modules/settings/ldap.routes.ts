import { TestLdapRequestSchema, UpdateLdapSettingsRequestSchema } from '@gnomon/shared';
import { Router } from 'express';

import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { getLdapSettings, testLdapSettings, updateLdapSettings } from './ldap.service.js';

export const ldapAdministrationRouter = Router();
ldapAdministrationRouter.use(requireAuth, requirePermission('policy:manage'));

ldapAdministrationRouter.get('/', async (_request, response) => {
  response.json({ ldap: await getLdapSettings() });
});

ldapAdministrationRouter.put('/', async (request, response) => {
  const input = UpdateLdapSettingsRequestSchema.parse(request.body);
  response.json({ ldap: await updateLdapSettings(request.authUser!.id, input) });
});

ldapAdministrationRouter.post('/test', async (request, response) => {
  const input = TestLdapRequestSchema.parse(request.body ?? {});
  response.json({ ldap: await testLdapSettings(input) });
});
