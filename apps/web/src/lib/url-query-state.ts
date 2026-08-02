import { useCallback, useEffect, useState } from 'react';

export type QueryValueParser<T> = (value: string) => T | null;

const stringifyQueryValue = <T>(value: T) => String(value);

export function parseIsoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100 ? value : null;
}

export function parseYearMonth(value: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 ? value : null;
}

export function parseShortSearch(value: string): string | null {
  return value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
}

export function parseEnumValue<const T extends string>(
  value: string,
  allowedValues: readonly T[],
): T | null {
  return allowedValues.includes(value as T) ? (value as T) : null;
}

export function readUrlQueryValue<T>(
  search: string,
  key: string,
  defaultValue: T,
  parse: QueryValueParser<T>,
): T {
  const rawValue = new URLSearchParams(search).get(key);
  return rawValue === null ? defaultValue : (parse(rawValue) ?? defaultValue);
}

export function updateUrlQueryValue<T>(
  search: string,
  key: string,
  value: T,
  defaultValue: T,
  serialize: (value: T) => string = stringifyQueryValue,
): string {
  const parameters = new URLSearchParams(search);
  const serialized = serialize(value);
  if (serialized === serialize(defaultValue)) parameters.delete(key);
  else parameters.set(key, serialized);
  const query = parameters.toString();
  return query ? `?${query}` : '';
}

export function useUrlQueryState<T>(
  key: string,
  defaultValue: T,
  parse: QueryValueParser<T>,
  serialize: (value: T) => string = stringifyQueryValue,
): readonly [T, (value: T) => void] {
  const readCurrentValue = useCallback(
    () => readUrlQueryValue(window.location.search, key, defaultValue, parse),
    [defaultValue, key, parse],
  );
  const [value, setValue] = useState(readCurrentValue);

  useEffect(() => {
    const handleHistoryChange = () => setValue(readCurrentValue());
    window.addEventListener('popstate', handleHistoryChange);
    return () => window.removeEventListener('popstate', handleHistoryChange);
  }, [readCurrentValue]);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const rawValue = parameters.get(key);
    if (rawValue === null || parse(rawValue) !== null) return;

    parameters.delete(key);
    const query = parameters.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [key, parse]);

  const updateValue = useCallback(
    (nextValue: T) => {
      const nextSearch = updateUrlQueryValue(
        window.location.search,
        key,
        nextValue,
        defaultValue,
        serialize,
      );
      if (nextSearch !== window.location.search) {
        const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
        window.history.replaceState(window.history.state, '', nextUrl);
      }
      setValue(nextValue);
    },
    [defaultValue, key, serialize],
  );

  return [value, updateValue] as const;
}
