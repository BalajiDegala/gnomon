import { useCallback, useEffect, useState } from 'react';

/**
 * Moves `columnId` next to `targetId` and returns a new order. Ids missing
 * from `order` leave it unchanged.
 */
export function moveColumn<Id extends string>(
  order: readonly Id[],
  columnId: Id,
  targetId: Id,
  place: 'before' | 'after',
): Id[] {
  if (columnId === targetId || !order.includes(columnId) || !order.includes(targetId)) {
    return [...order];
  }
  const without = order.filter((id) => id !== columnId);
  const targetIndex = without.indexOf(targetId);
  without.splice(place === 'before' ? targetIndex : targetIndex + 1, 0, columnId);
  return without;
}

/**
 * Reconciles a saved order with the columns that exist today: it drops
 * unknown ids and adds new columns at their default position.
 */
export function normalizeColumnOrder<Id extends string>(
  saved: unknown,
  defaults: readonly Id[],
): Id[] {
  if (!Array.isArray(saved)) return [...defaults];
  const known = new Set<string>(defaults);
  const order = [
    ...new Set(saved.filter((id): id is Id => typeof id === 'string' && known.has(id))),
  ];
  defaults.forEach((id, index) => {
    if (order.includes(id)) return;
    // Insert after the closest default predecessor that is already placed.
    const previous = defaults
      .slice(0, index)
      .reverse()
      .find((candidate) => order.includes(candidate));
    order.splice(previous ? order.indexOf(previous) + 1 : 0, 0, id);
  });
  return order;
}

function readOrder<Id extends string>(storageKey: string, defaults: readonly Id[]): Id[] {
  try {
    const raw = localStorage.getItem(storageKey);
    return normalizeColumnOrder(raw === null ? null : JSON.parse(raw), defaults);
  } catch {
    return [...defaults];
  }
}

/** Column order saved per browser, so a reordered table stays that way. */
export function useStoredColumnOrder<Id extends string>(
  storageKey: string,
  defaults: readonly Id[],
) {
  const [order, setOrder] = useState<Id[]>(() => readOrder(storageKey, defaults));
  const isDefault = order.length === defaults.length && order.every((id, i) => id === defaults[i]);

  useEffect(() => {
    try {
      if (isDefault) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(order));
    } catch {
      // Preferences are a convenience; ignore blocked storage.
    }
  }, [isDefault, order, storageKey]);

  const move = useCallback(
    (columnId: string, targetId: string, place: 'before' | 'after') =>
      setOrder((current) => moveColumn(current, columnId as Id, targetId as Id, place)),
    [],
  );
  const reset = useCallback(() => setOrder([...defaults]), [defaults]);

  return { order, move, reset, isDefault };
}
