// 업로드한 CSV/JSONL을 브라우저에서 바로 읽는 작은 파서. 런타임 의존성 없이 미리보기·컬럼 감지에 쓴다.

export interface ParsedTable {
  columns: string[];
  rows: Record<string, string>[];
}

export type DatasetFormat = 'csv' | 'jsonl';

// RFC 4180에 가까운 CSV 파서: 따옴표 안의 쉼표·줄바꿈, "" 이스케이프, CRLF, BOM, 빈 줄을 처리한다.
// 첫 줄은 헤더다. 비어 있거나 중복된 헤더는 column_N / 이름_2로 바꾼다.
export function parseCsv(text: string): ParsedTable {
  const src = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    if (!(record.length === 1 && record[0] === '')) records.push(record);
    record = [];
  };

  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += c;
      }
      i++;
      continue;
    }
    if (c === '"' && field === '') quoted = true;
    else if (c === ',') endField();
    else if (c === '\n') endRecord();
    else if (c === '\r') {
      if (src[i + 1] === '\n') i++;
      endRecord();
    } else field += c;
    i++;
  }
  if (quoted) throw new Error('CSV: 닫히지 않은 따옴표가 있습니다');
  if (field !== '' || record.length > 0) endRecord();
  if (records.length === 0) return { columns: [], rows: [] };

  const columns = uniqueHeaders(records[0]);
  const rows = records.slice(1).map((r) => Object.fromEntries(columns.map((col, j) => [col, (r[j] ?? '').trim()])));
  return { columns, rows };
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = h.trim() || `column_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

// JSONL: 줄마다 JSON 객체 하나. 컬럼은 처음 나온 순서대로 합친다. 값은 문자열로 바꾼다(null → 빈 값, 객체 → JSON).
export function parseJsonl(text: string): ParsedTable {
  const columns: string[] = [];
  const rows: Record<string, unknown>[] = [];
  text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .forEach((line, idx) => {
      if (line.trim() === '') return;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new Error(`JSONL ${idx + 1}번째 줄을 읽을 수 없습니다`);
      }
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`JSONL ${idx + 1}번째 줄이 객체가 아닙니다`);
      }
      for (const key of Object.keys(value)) if (!columns.includes(key)) columns.push(key);
      rows.push(value as Record<string, unknown>);
    });
  return {
    columns,
    rows: rows.map((r) => Object.fromEntries(columns.map((c) => [c, stringify(r[c])]))),
  };
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function formatOf(fileName: string): DatasetFormat {
  return /\.(jsonl|ndjson|json)$/i.test(fileName) ? 'jsonl' : 'csv';
}

export function parseDataset(fileName: string, text: string): ParsedTable {
  return formatOf(fileName) === 'jsonl' ? parseJsonl(text) : parseCsv(text);
}
