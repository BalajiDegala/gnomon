import { describe, expect, it } from 'vitest';

import { visibleAvailability } from './availability.js';

describe('visibleAvailability', () => {
  it('follows the real status in automatic mode', () => {
    expect(visibleAvailability('auto', 'available')).toBe('available');
    expect(visibleAvailability('auto', 'away')).toBe('away');
  });

  it('hides the real status behind a manual mode', () => {
    expect(visibleAvailability('busy', 'available')).toBe('busy');
    expect(visibleAvailability('busy', 'away')).toBe('busy');
    expect(visibleAvailability('available', 'away')).toBe('available');
  });
});
