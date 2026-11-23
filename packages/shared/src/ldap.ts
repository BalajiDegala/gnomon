import { z } from 'zod';

export const LdapTestResultSchema = z.object({
  at: z.string().datetime(),
  ok: z.boolean(),
  message: z.string(),
});
export type LdapTestResult = z.infer<typeof LdapTestResultSchema>;

/** Directory attribute names Gnomon reads for each person. */
export const LdapAttributeMapSchema = z.object({
  username: z.string().trim().min(1).max(64),
  email: z.string().trim().min(1).max(64),
  firstName: z.string().trim().min(1).max(64),
  lastName: z.string().trim().min(1).max(64),
  displayName: z.string().trim().max(64),
  department: z.string().trim().max(64),
  designation: z.string().trim().max(64),
  employeeId: z.string().trim().max(64),
});
export type LdapAttributeMap = z.infer<typeof LdapAttributeMapSchema>;

export const defaultLdapAttributes: LdapAttributeMap = {
  username: 'sAMAccountName',
  email: 'mail',
  firstName: 'givenName',
  lastName: 'sn',
  displayName: 'displayName',
  department: 'department',
  designation: 'title',
  employeeId: 'employeeID',
};

/** Active Directory default: match the login against the account name, UPN or email. */
export const defaultLdapUserFilter =
  '(&(objectClass=user)(|(sAMAccountName={{login}})(userPrincipalName={{login}})(mail={{login}})))';

/** Never contains the bind password; `hasBindPassword` says whether one is stored. */
export const LdapSettingsDtoSchema = z.object({
  configured: z.boolean(),
  enabled: z.boolean(),
  url: z.string(),
  startTls: z.boolean(),
  allowSelfSignedCertificate: z.boolean(),
  bindDn: z.string(),
  hasBindPassword: z.boolean(),
  passwordNeedsReentry: z.boolean(),
  baseDn: z.string(),
  userFilter: z.string(),
  attributes: LdapAttributeMapSchema,
  autoCreateUsers: z.boolean(),
  notifyAdmins: z.boolean(),
  lastTest: LdapTestResultSchema.nullable(),
  updatedAt: z.string().datetime().nullable(),
});
export type LdapSettingsDto = z.infer<typeof LdapSettingsDtoSchema>;

export const UpdateLdapSettingsRequestSchema = z.object({
  enabled: z.boolean(),
  url: z
    .string()
    .trim()
    .regex(/^ldaps?:\/\/[^\s/]+(:\d{1,5})?\/?$/i, 'Use ldap://host[:port] or ldaps://host[:port]'),
  startTls: z.boolean().default(false),
  allowSelfSignedCertificate: z.boolean().default(false),
  bindDn: z.string().trim().max(512),
  /** Omit to keep the stored password; empty string removes it. */
  bindPassword: z.string().max(512).optional(),
  baseDn: z.string().trim().min(1, 'Enter the base DN to search').max(512),
  userFilter: z
    .string()
    .trim()
    .min(1)
    .max(1_000)
    .refine((value) => value.includes('{{login}}'), 'The filter must contain {{login}}'),
  attributes: LdapAttributeMapSchema,
  autoCreateUsers: z.boolean().default(true),
  notifyAdmins: z.boolean().default(true),
});
export type UpdateLdapSettingsRequest = z.infer<typeof UpdateLdapSettingsRequestSchema>;

/** Test the saved settings; with a login (and password) it also looks up / signs in that user. */
export const TestLdapRequestSchema = z.object({
  login: z.string().trim().max(256).optional(),
  password: z.string().max(512).optional(),
});
export type TestLdapRequest = z.infer<typeof TestLdapRequestSchema>;
