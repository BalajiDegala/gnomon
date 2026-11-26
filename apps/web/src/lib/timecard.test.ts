import { describe, expect, it } from 'vitest';

import { trackedSecondsAt } from './timecard';

const running = { totalTrackedSeconds: 3_600, activeSession: {} as never };

describe('trackedSecondsAt', () => {
  it('ticks from when the browser received the figures, whatever the server clock says', () => {
    const receivedAt = 1_000_000;
    expect(trackedSecondsAt(running, receivedAt, receivedAt)).toBe(3_600);
    expect(trackedSecondsAt(running, receivedAt, receivedAt + 5_400)).toBe(3_605);
    expect(trackedSecondsAt(running, receivedAt, receivedAt - 2_000)).toBe(3_600);
  });

  it('shows the stored total when nothing is running', () => {
    expect(trackedSecondsAt({ totalTrackedSeconds: 120, activeSession: null }, 0, 99_000)).toBe(
      120,
    );
  });
});
