import { UpdateSmtpSettingsRequestSchema } from '@gnomon/shared';
import { describe, expect, it } from 'vitest';

import { openSecret, sealSecret } from '../src/modules/settings/secret-box.js';
import { describeSmtpError } from '../src/modules/settings/smtp.service.js';

describe('SMTP settings', () => {
  it('seals secrets so they round-trip but are not stored in plain text', () => {
    const sealed = sealSecret('abcd efgh ijkl mnop');
    expect(sealed).not.toContain('abcd');
    expect(sealed).not.toBe(sealSecret('abcd efgh ijkl mnop'));
    expect(openSecret(sealed)).toBe('abcd efgh ijkl mnop');
  });

  it('refuses tampered or foreign ciphertext instead of returning garbage', () => {
    const [version, iv, tag, data] = sealSecret('secret').split(':');
    const tampered = [version, iv, tag, Buffer.from('other').toString('base64')].join(':');
    expect(openSecret(tampered)).toBeNull();
    expect(openSecret(`${version}:${iv}:${tag}`)).toBeNull();
    expect(openSecret('plain-text')).toBeNull();
    expect(data).toBeTruthy();
  });

  it('explains common delivery failures', () => {
    expect(describeSmtpError({ code: 'EAUTH' }, 'smtp.gmail.com')).toMatch(/App Password/);
    expect(describeSmtpError({ responseCode: 535 }, 'mail.local')).toMatch(/rejected/);
    expect(describeSmtpError({ code: 'ETIMEDOUT' }, 'mail.local')).toMatch(/Could not reach/);
    expect(describeSmtpError({ message: 'self-signed certificate' }, 'mail.local')).toMatch(
      /self-signed/,
    );
  });

  it('validates settings and treats an empty reply-to as none', () => {
    const base = {
      enabled: true,
      host: 'smtp.gmail.com',
      port: 587,
      security: 'starttls',
      username: 'alerts@example.com',
      fromName: 'Gnomon',
      fromAddress: 'Alerts@Example.com',
      replyTo: '',
    } as const;
    const parsed = UpdateSmtpSettingsRequestSchema.parse(base);
    expect(parsed.replyTo).toBeNull();
    expect(parsed.fromAddress).toBe('alerts@example.com');
    expect(UpdateSmtpSettingsRequestSchema.safeParse({ ...base, host: 'bad host!' }).success).toBe(
      false,
    );
    expect(UpdateSmtpSettingsRequestSchema.safeParse({ ...base, port: 70_000 }).success).toBe(
      false,
    );
  });
});
