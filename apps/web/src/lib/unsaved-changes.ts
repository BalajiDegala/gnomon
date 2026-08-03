import { useEffect, useRef } from 'react';

const warningMessage = 'You have unsaved changes. Discard them and continue?';
const dirtyForms = new Map<symbol, boolean>();

export function hasUnsavedChanges(): boolean {
  return [...dirtyForms.values()].some(Boolean);
}

export function confirmDiscardChanges(): boolean {
  return !hasUnsavedChanges() || window.confirm(warningMessage);
}

export function useUnsavedChanges(isDirty: boolean): void {
  const token = useRef(Symbol('unsaved-form'));

  useEffect(() => {
    const currentToken = token.current;
    dirtyForms.set(currentToken, isDirty);
    return () => {
      dirtyForms.delete(currentToken);
    };
  }, [isDirty]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
}
