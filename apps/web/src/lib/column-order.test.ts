import { describe, expect, it } from 'vitest';

import { moveColumn, normalizeColumnOrder } from './column-order';

describe('column order', () => {
  const defaults = ['a', 'b', 'c', 'd'] as const;

  it('moves a column before or after a target', () => {
    expect(moveColumn(defaults, 'd', 'a', 'before')).toEqual(['d', 'a', 'b', 'c']);
    expect(moveColumn(defaults, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveColumn(defaults, 'a', 'a', 'after')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops unknown ids and inserts new columns near their default spot', () => {
    expect(normalizeColumnOrder(['c', 'x', 'a', 'c'], defaults)).toEqual(['c', 'd', 'a', 'b']);
    expect(normalizeColumnOrder('bad', defaults)).toEqual(['a', 'b', 'c', 'd']);
  });
});
