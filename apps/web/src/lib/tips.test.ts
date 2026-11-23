import { describe, expect, it } from 'vitest';

import { pickTip, tipMoment, tips } from './tips';

describe('tips from Relangi', () => {
  it('has twenty unique tips', () => {
    expect(tips).toHaveLength(20);
    expect(new Set(tips.map((tip) => tip.id)).size).toBe(20);
  });

  it('uses India time to choose the moment of day', () => {
    expect(tipMoment(new Date('2026-11-19T03:30:00Z'))).toBe('morning'); // 09:00 IST
    expect(tipMoment(new Date('2026-11-19T13:30:00Z'))).toBe('evening'); // 19:00 IST
  });

  it('only picks tips that fit the time and were not shown recently', () => {
    const evening = new Date('2026-11-19T13:30:00Z');
    for (let index = 0; index < 50; index += 1) {
      const tip = pickTip(['timesheet'], evening);
      expect(['evening', 'any']).toContain(tip.moment);
      expect(tip.id).not.toBe('timesheet');
    }
  });
});
