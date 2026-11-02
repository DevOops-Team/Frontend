import { describe, expect, it } from 'vitest';
import { formatOf, parseCsv, parseDataset, parseJsonl } from './parse';

describe('parseCsv', () => {
  it('reads header and rows', () => {
    expect(parseCsv('text,label\n좋아요,긍정\n별로,부정\n')).toEqual({
      columns: ['text', 'label'],
      rows: [
        { text: '좋아요', label: '긍정' },
        { text: '별로', label: '부정' },
      ],
    });
  });

  it('handles quotes, escaped quotes, commas and newlines inside quotes, CRLF and BOM', () => {
    const t = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"line1\nline2",2\r\n');
    expect(t.columns).toEqual(['a', 'b']);
    expect(t.rows).toEqual([
      { a: 'x, y', b: 'say "hi"' },
      { a: 'line1\nline2', b: '2' },
    ]);
  });

  it('skips blank lines, fills missing cells and handles no trailing newline', () => {
    expect(parseCsv('a,b,c\n\n1,2\n3,4,5').rows).toEqual([
      { a: '1', b: '2', c: '' },
      { a: '3', b: '4', c: '5' },
    ]);
  });

  it('renames empty and duplicate headers', () => {
    expect(parseCsv('x,,x\n1,2,3').columns).toEqual(['x', 'column_2', 'x_2']);
  });

  it('returns empty table for empty input and rejects unclosed quotes', () => {
    expect(parseCsv('')).toEqual({ columns: [], rows: [] });
    expect(() => parseCsv('a\n"oops')).toThrow(/따옴표/);
  });
});

describe('parseJsonl', () => {
  it('unions keys in first-seen order and stringifies values', () => {
    const t = parseJsonl('{"instruction":"hi","output":"hello"}\n\n{"instruction":"q","input":null,"output":"a","meta":{"k":1},"n":3}\n');
    expect(t.columns).toEqual(['instruction', 'output', 'input', 'meta', 'n']);
    expect(t.rows[0]).toEqual({ instruction: 'hi', output: 'hello', input: '', meta: '', n: '' });
    expect(t.rows[1]).toEqual({ instruction: 'q', output: 'a', input: '', meta: '{"k":1}', n: '3' });
  });

  it('reports the bad line number', () => {
    expect(() => parseJsonl('{"a":1}\n{bad')).toThrow('JSONL 2번째 줄을 읽을 수 없습니다');
    expect(() => parseJsonl('[1,2]')).toThrow('JSONL 1번째 줄이 객체가 아닙니다');
  });
});

describe('parseDataset', () => {
  it('picks the parser from the file extension', () => {
    expect(formatOf('a.JSONL')).toBe('jsonl');
    expect(formatOf('a.csv')).toBe('csv');
    expect(parseDataset('d.jsonl', '{"a":"1"}').columns).toEqual(['a']);
    expect(parseDataset('d.csv', 'a\n1').rows).toEqual([{ a: '1' }]);
  });
});
