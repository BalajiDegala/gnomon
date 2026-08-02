import { describe, expect, it } from 'vitest';

import { appViewFromPath, appViewPath, appViewPaths } from './navigation';

describe('application routes', () => {
  it('maps every application view to a unique path and back', () => {
    const entries = Object.entries(appViewPaths);
    expect(new Set(entries.map(([, path]) => path)).size).toBe(entries.length);

    for (const [view, path] of entries) {
      expect(appViewPath(view as keyof typeof appViewPaths)).toBe(path);
      expect(appViewFromPath(path)).toBe(view);
    }
  });

  it('accepts a trailing slash but rejects unknown paths', () => {
    expect(appViewFromPath('/timesheets/')).toBe('timesheets');
    expect(appViewFromPath('/not-a-page')).toBeNull();
  });
});
