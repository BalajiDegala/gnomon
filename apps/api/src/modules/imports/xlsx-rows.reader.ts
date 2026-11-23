import { unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';

const MAX_PART_BYTES = 50 * 1024 * 1024;

export interface WorkbookRow {
  rowNumber: number;
  /** Cell text keyed by 1-based column number. */
  cells: Map<number, string>;
}

export class WorkbookReadError extends Error {}

/** Element names without a namespace prefix: some exporters write `<x:row>`. */
function localName(name: string): string {
  const colon = name.indexOf(':');
  return colon === -1 ? name : name.slice(colon + 1);
}

function columnNumber(reference: string): number {
  const letters = /^[a-z]+/i.exec(reference)?.[0]?.toUpperCase() ?? '';
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
}

function parseXml(xml: Uint8Array, parser: SaxesParser): void {
  parser.on('error', (error) => {
    throw error;
  });
  parser.write(new TextDecoder().decode(xml)).close();
}

function readSharedStrings(xml: Uint8Array | undefined): string[] {
  if (!xml) return [];
  const values: string[] = [];
  const parser = new SaxesParser();
  let insideItem = false;
  let insidePhonetic = false;
  let insideText = false;
  let current = '';
  parser.on('opentag', (tag) => {
    const name = localName(tag.name);
    if (name === 'si') {
      insideItem = true;
      current = '';
    } else if (name === 'rPh') {
      insidePhonetic = true;
    } else if (insideItem && !insidePhonetic && name === 't') {
      insideText = true;
    }
  });
  parser.on('text', (text) => {
    if (insideText) current += text;
  });
  parser.on('closetag', (tag) => {
    const name = localName(tag.name);
    if (name === 't') insideText = false;
    if (name === 'rPh') insidePhonetic = false;
    if (name === 'si') {
      values.push(current);
      insideItem = false;
    }
  });
  parseXml(xml, parser);
  return values;
}

/** Resolve the worksheet part of the first sheet listed in the workbook. */
function firstWorksheetPath(files: Record<string, Uint8Array>): string | null {
  const workbook = files['xl/workbook.xml'];
  const rels = files['xl/_rels/workbook.xml.rels'];
  if (workbook && rels) {
    const decoder = new TextDecoder();
    const relId = /<(?:\w+:)?sheet\b[^>]*\br:id="([^"]+)"/.exec(decoder.decode(workbook))?.[1];
    if (relId) {
      const relation = new RegExp(`<(?:\\w+:)?Relationship\\b[^>]*\\bId="${relId}"[^>]*>`).exec(
        decoder.decode(rels),
      )?.[0];
      const target = relation ? /\bTarget="([^"]+)"/.exec(relation)?.[1] : undefined;
      if (target) {
        const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
        if (files[path]) return path;
      }
    }
  }
  return files['xl/worksheets/sheet1.xml'] ? 'xl/worksheets/sheet1.xml' : null;
}

/**
 * Read every non-empty row of the first worksheet of an XLSX workbook as text.
 * Numeric cells keep their raw value (dates stay Excel serial numbers).
 */
export function readFirstWorksheetRows(workbookBuffer: Buffer, maxRows: number): WorkbookRow[] {
  let files: Record<string, Uint8Array>;
  try {
    let oversized = false;
    files = unzipSync(workbookBuffer, {
      filter: (file) => {
        const relevant =
          file.name === 'xl/workbook.xml' ||
          file.name === 'xl/_rels/workbook.xml.rels' ||
          file.name === 'xl/sharedStrings.xml' ||
          file.name.startsWith('xl/worksheets/sheet');
        if (relevant && file.originalSize > MAX_PART_BYTES) oversized = true;
        return relevant && file.originalSize <= MAX_PART_BYTES;
      },
    });
    if (oversized) throw new WorkbookReadError('Workbook is too large to process safely');
  } catch (error) {
    if (error instanceof WorkbookReadError) throw error;
    throw new WorkbookReadError('File is not a readable XLSX workbook');
  }

  const sheetPath = firstWorksheetPath(files);
  if (!sheetPath) throw new WorkbookReadError('Workbook has no worksheet');
  const sharedStrings = readSharedStrings(files['xl/sharedStrings.xml']);

  const rows: WorkbookRow[] = [];
  const parser = new SaxesParser();
  let inferredRowNumber = 0;
  let rowNumber = 0;
  let cells = new Map<number, string>();
  let column = 0;
  let inferredColumn = 0;
  let cellType = '';
  let cellValue = '';
  let capture = false;
  let insidePhonetic = false;

  parser.on('opentag', (tag) => {
    const name = localName(tag.name);
    if (name === 'row') {
      inferredRowNumber += 1;
      rowNumber = Number(tag.attributes.r) || inferredRowNumber;
      inferredRowNumber = rowNumber;
      cells = new Map();
      inferredColumn = 0;
    } else if (name === 'c') {
      inferredColumn += 1;
      column = columnNumber(String(tag.attributes.r ?? '')) || inferredColumn;
      inferredColumn = column;
      cellType = String(tag.attributes.t ?? '');
      cellValue = '';
    } else if (name === 'rPh') {
      insidePhonetic = true;
    } else if ((name === 'v' || name === 't') && column > 0 && !insidePhonetic) {
      capture = true;
    }
  });
  parser.on('text', (text) => {
    if (capture) cellValue += text;
  });
  parser.on('closetag', (tag) => {
    const name = localName(tag.name);
    if (name === 'v' || name === 't') capture = false;
    if (name === 'rPh') insidePhonetic = false;
    if (name === 'c' && column > 0) {
      const value = cellType === 's' ? (sharedStrings[Number(cellValue)] ?? '') : cellValue;
      if (value.trim() !== '') cells.set(column, value);
      column = 0;
    }
    if (name === 'row' && cells.size > 0) {
      rows.push({ rowNumber, cells });
      if (rows.length > maxRows) {
        throw new WorkbookReadError(`Workbook exceeds the ${maxRows} row limit`);
      }
    }
  });

  try {
    parseXml(files[sheetPath]!, parser);
  } catch (error) {
    if (error instanceof WorkbookReadError) throw error;
    throw new WorkbookReadError('Worksheet could not be parsed');
  }
  return rows;
}
