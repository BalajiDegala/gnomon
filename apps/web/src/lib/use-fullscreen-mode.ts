import { useCallback, useEffect, useState } from 'react';

/**
 * True for Meta+F (the Windows/Super key, or ⌘ on macOS) with no other
 * modifiers. Ctrl+F is deliberately left alone so the browser's Find works.
 */
export function isFullscreenShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): boolean {
  return (
    event.key.toLowerCase() === 'f' &&
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

/** How to write the shortcut on this device, for tooltips. */
export function fullscreenShortcutLabel(): string {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform;
  return /mac/i.test(platform) ? '⌘F' : 'Win+F';
}

/**
 * Full-screen mode for data pages: a fixed overlay over the app plus native
 * browser full screen when allowed. Meta+F toggles it while the page is open,
 * and Esc exits.
 */
export function useFullscreenMode() {
  const [fullscreen, setFullscreen] = useState(false);

  const exit = useCallback(() => {
    setFullscreen(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  const enter = useCallback(() => {
    setFullscreen(true);
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  const toggle = useCallback(() => {
    if (fullscreen) exit();
    else enter();
  }, [enter, exit, fullscreen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isFullscreenShortcut(event)) {
        event.preventDefault();
        toggle();
      } else if (
        fullscreen &&
        event.key === 'Escape' &&
        // Esc closes an open menu first; only exit when nothing else is open.
        !document.querySelector('.MuiPopover-root')
      ) {
        exit();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [exit, fullscreen, toggle]);

  useEffect(() => {
    if (!fullscreen) return;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);

  return { fullscreen, toggle, exit };
}
