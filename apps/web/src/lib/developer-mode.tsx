import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface DeveloperModeContextValue {
  isActive: boolean;
  timeUntilChaos: number; // seconds remaining
  activate: () => void;
  deactivate: () => void;
  chaosTriggered: boolean;
}

const DeveloperModeContext = createContext<DeveloperModeContextValue | null>(null);

const CHAOS_DELAY_SECONDS = 2; // Quick start - magic begins almost immediately

export function DeveloperModeProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [activatedAt, setActivatedAt] = useState<number | null>(null);
  const [timeUntilChaos, setTimeUntilChaos] = useState(CHAOS_DELAY_SECONDS);
  const [chaosTriggered, setChaosTriggered] = useState(false);

  const activate = useCallback(() => {
    setIsActive(true);
    setActivatedAt(Date.now());
    setTimeUntilChaos(CHAOS_DELAY_SECONDS);
    setChaosTriggered(false);
  }, []);

  const deactivate = useCallback(() => {
    setIsActive(false);
    setActivatedAt(null);
    setTimeUntilChaos(CHAOS_DELAY_SECONDS);
    setChaosTriggered(false);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!isActive || !activatedAt || chaosTriggered) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - activatedAt) / 1000;
      const remaining = Math.max(0, CHAOS_DELAY_SECONDS - elapsed);
      setTimeUntilChaos(Math.ceil(remaining));

      if (remaining <= 0) {
        setChaosTriggered(true);
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isActive, activatedAt, chaosTriggered]);

  // Secret keyboard shortcut: Ctrl+Shift+D to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        if (isActive) {
          deactivate();
        } else {
          activate();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, activate, deactivate]);

  return (
    <DeveloperModeContext.Provider
      value={{ isActive, timeUntilChaos, activate, deactivate, chaosTriggered }}
    >
      {children}
    </DeveloperModeContext.Provider>
  );
}

export function useDeveloperMode() {
  const context = useContext(DeveloperModeContext);
  if (!context) {
    throw new Error('useDeveloperMode must be used within DeveloperModeProvider');
  }
  return context;
}
