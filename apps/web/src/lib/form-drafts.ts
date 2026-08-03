import { useCallback, useEffect } from 'react';

const DRAFT_PREFIX = 'gnomon:form-draft:v1';

function storageKey(key: string): string {
  return `${DRAFT_PREFIX}:${key}`;
}

function browserSessionStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readFormDraft<T>(
  key: string,
  validate: (value: unknown) => value is T,
  storage: Storage | null = browserSessionStorage(),
): T | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(storageKey(key));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (validate(value)) return value;
    storage.removeItem(storageKey(key));
  } catch {
    storage.removeItem(storageKey(key));
  }

  return null;
}

export function writeFormDraft<T>(
  key: string,
  value: T,
  storage: Storage | null = browserSessionStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    // Draft recovery is best-effort when browser storage is unavailable or full.
  }
}

export function clearFormDraft(
  key: string,
  storage: Storage | null = browserSessionStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(storageKey(key));
  } catch {
    // Ignore unavailable browser storage.
  }
}

export function useSessionFormDraft<T>(key: string, value: T, isDirty: boolean) {
  useEffect(() => {
    if (isDirty) writeFormDraft(key, value);
    else clearFormDraft(key);
  }, [isDirty, key, value]);

  return useCallback(() => clearFormDraft(key), [key]);
}
