const PERSONNEL_ID_PREFIXES: Record<string, readonly string[]> = {
  DDIC: ['7'],
  DDIH: ['9'],
  DDII: ['5'],
};

export function normalizePersonnelId(value: string): string | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  return normalized.replace(/^0+(?=\d)/, '');
}

/**
 * Return controller Personnel IDs that can represent a directory code.
 *
 * The biometric directory keeps a business prefix in codes such as DDIH054,
 * while the door controller stores a numeric ID. The unprefixed suffix is
 * retained for older exports; current controller exports use the family
 * prefix (for example DDIH054 -> 9054).
 */
export function directoryPersonnelIdCandidates(employeeCode: string): string[] {
  const normalizedCode = employeeCode.trim().toUpperCase();
  const numericCode = normalizePersonnelId(normalizedCode);
  if (numericCode) return [numericCode];

  const match = /^([A-Z]+)(\d+)$/.exec(normalizedCode);
  if (!match) return [];

  const prefixes = PERSONNEL_ID_PREFIXES[match[1]!];
  if (!prefixes) return [];

  const suffix = normalizePersonnelId(match[2]!);
  if (!suffix) return [];

  const candidates = match[1] === 'DDIH' ? [suffix] : [];
  for (const prefix of prefixes) {
    candidates.push(`${prefix}${suffix.padStart(3, '0')}`);
  }
  return [...new Set(candidates)];
}

export function normalizeAttendanceName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}
