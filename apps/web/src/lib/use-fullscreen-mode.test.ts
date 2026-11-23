import { describe, expect, it } from 'vitest';

import { isFullscreenShortcut } from './use-fullscreen-mode';

const key = (overrides: Partial<KeyboardEvent>) => ({
  key: 'f',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

describe('isFullscreenShortcut', () => {
  it('matches Meta+F, including caps lock', () => {
    expect(isFullscreenShortcut(key({ metaKey: true }))).toBe(true);
    expect(isFullscreenShortcut(key({ metaKey: true, key: 'F' }))).toBe(true);
  });

  it('leaves Ctrl+F to the browser Find', () => {
    expect(isFullscreenShortcut(key({ ctrlKey: true }))).toBe(false);
    expect(isFullscreenShortcut(key({ ctrlKey: true, metaKey: true }))).toBe(false);
  });

  it('ignores plain F and other combinations', () => {
    expect(isFullscreenShortcut(key({}))).toBe(false);
    expect(isFullscreenShortcut(key({ metaKey: true, shiftKey: true }))).toBe(false);
    expect(isFullscreenShortcut(key({ metaKey: true, altKey: true }))).toBe(false);
    expect(isFullscreenShortcut(key({ metaKey: true, key: 'g' }))).toBe(false);
  });
});
