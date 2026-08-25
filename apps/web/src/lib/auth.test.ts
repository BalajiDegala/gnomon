import { describe, expect, it } from 'vitest';

import { parseAuthResponse } from './auth';

describe('parseAuthResponse', () => {
  it('returns a successful JSON authentication response', async () => {
    const response = new Response(
      JSON.stringify({ accessToken: 'access-token', user: { id: 'user-1' } }),
      { headers: { 'content-type': 'application/json; charset=utf-8' } },
    );

    await expect(parseAuthResponse(response)).resolves.toMatchObject({
      accessToken: 'access-token',
      user: { id: 'user-1' },
    });
  });

  it('explains when the API route returns HTML', async () => {
    const response = new Response('<html>web application</html>', {
      headers: { 'content-type': 'text/html' },
    });

    await expect(parseAuthResponse(response)).rejects.toThrow(/instead of JSON.*\/api/i);
  });

  it('rejects malformed JSON from the API', async () => {
    const response = new Response('{invalid', {
      headers: { 'content-type': 'application/json' },
    });

    await expect(parseAuthResponse(response)).rejects.toThrow(/invalid JSON/i);
  });

  it('uses the API error message for unsuccessful responses', async () => {
    const response = new Response(JSON.stringify({ error: { message: 'Incorrect password' } }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });

    await expect(parseAuthResponse(response)).rejects.toThrow('Incorrect password');
  });
});
