export type CsvValue = string | number | boolean | null | undefined;

/**
 * Escapes one CSV cell. Text that a spreadsheet would treat as a formula is
 * prefixed with an apostrophe so opening an export can never run it.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** Downloads CSV with a UTF-8 byte-order mark so Excel shows names correctly. */
export function downloadCsv(
  fileName: string,
  headers: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): void {
  const blob = new Blob(['﻿', buildCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
