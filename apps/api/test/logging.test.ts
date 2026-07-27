import pino, { type DestinationStream } from 'pino';
import { describe, expect, it } from 'vitest';

import { sensitiveLogPaths } from '../src/config/logging.js';

describe('sensitive HTTP logging', () => {
  it('redacts authorization, cookie, API-key, and response-cookie values', () => {
    let output = '';
    const destination: DestinationStream = {
      write(chunk: string) {
        output += chunk;
      },
    };
    const logger = pino(
      { redact: { paths: [...sensitiveLogPaths], censor: '[REDACTED]' } },
      destination,
    );

    logger.info({
      req: {
        headers: {
          authorization: 'Bearer access-secret',
          cookie: 'refresh-cookie-secret',
          'x-api-key': 'api-key-secret',
        },
      },
      res: { headers: { 'set-cookie': 'new-refresh-cookie-secret' } },
    });

    expect(output).not.toContain('access-secret');
    expect(output).not.toContain('refresh-cookie-secret');
    expect(output).not.toContain('api-key-secret');
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(4);
  });
});
