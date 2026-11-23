import { describe, expect, it } from 'vitest';

import { clearFormDraft, readFormDraft, writeFormDraft } from './form-drafts';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('form drafts', () => {
  it('round-trips a valid session draft and clears it', () => {
    const storage = memoryStorage();
    const draft = { reason: 'A useful draft' };
    const validate = (value: unknown): value is typeof draft =>
      typeof value === 'object' && value !== null && 'reason' in value;

    writeFormDraft('employee:leave', draft, storage);
    expect(readFormDraft('employee:leave', validate, storage)).toEqual(draft);

    clearFormDraft('employee:leave', storage);
    expect(readFormDraft('employee:leave', validate, storage)).toBeNull();
  });

  it('removes malformed and invalid stored values', () => {
    const storage = memoryStorage();
    storage.setItem('gnomon:form-draft:v1:broken', '{');
    expect(
      readFormDraft('broken', (value): value is object => typeof value === 'object', storage),
    ).toBeNull();
    expect(storage.length).toBe(0);

    writeFormDraft('wrong-shape', { password: 'never persist me' }, storage);
    expect(
      readFormDraft(
        'wrong-shape',
        (value): value is { reason: string } =>
          typeof value === 'object' && value !== null && 'reason' in value,
        storage,
      ),
    ).toBeNull();
    expect(storage.length).toBe(0);
  });
});
