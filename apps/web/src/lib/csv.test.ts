import { describe, expect, it } from 'vitest';

import { buildCsv, csvCell } from './csv';

describe('csv', () => {
  it('quotes separators, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(42)).toBe('42');
  });

  it('neutralises spreadsheet formulas in text cells', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell(-5)).toBe('-5');
  });

  it('builds rows with CRLF line endings', () => {
    expect(buildCsv(['A', 'B'], [[1, 'x']])).toBe('A,B\r\n1,x');
  });
});
