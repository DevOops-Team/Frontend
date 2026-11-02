import type { Task } from '../mock/catalog';

// 데이터셋 컬럼 → 태스크 역할 매핑. 값이 ''이면 매핑 안 함.
export type ColumnMapping = Record<string, string>;

export interface MappingCheck {
  errors: string[];
  warnings: string[];
}

// 이름이 비슷한 컬럼을 역할에 자동으로 붙인다. 한 컬럼은 한 역할에만 쓴다.
export function autoMap(task: Task, columns: string[]): ColumnMapping {
  const used = new Set<string>();
  const mapping: ColumnMapping = {};
  for (const role of task.roles) {
    const hit = role.synonyms
      .map((s) => columns.find((c) => !used.has(c) && c.toLowerCase() === s.toLowerCase()))
      .find(Boolean);
    mapping[role.key] = hit ?? '';
    if (hit) used.add(hit);
  }
  return mapping;
}

export function countEmpty(rows: Record<string, string>[], column: string): number {
  return rows.filter((r) => (r[column] ?? '').trim() === '').length;
}

// 오류가 있으면 다음 단계로 못 간다. 경고(빈 값 등)는 보여 주기만 한다.
export function validateMapping(task: Task, columns: string[], mapping: ColumnMapping, rows: Record<string, string>[]): MappingCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byColumn = new Map<string, string[]>();

  for (const role of task.roles) {
    const col = mapping[role.key] ?? '';
    if (!col) {
      if (role.required) errors.push(`'${role.label}' 역할에 컬럼을 지정하세요`);
      continue;
    }
    if (!columns.includes(col)) {
      errors.push(`'${role.label}'에 지정한 컬럼 '${col}'이 데이터셋에 없습니다`);
      continue;
    }
    byColumn.set(col, [...(byColumn.get(col) ?? []), role.label]);
    const empty = countEmpty(rows, col);
    if (empty > 0 && role.required) warnings.push(`'${col}' 컬럼에 빈 값 ${empty}개 — 해당 행은 학습에서 빠집니다`);
  }
  for (const [col, labels] of byColumn) {
    if (labels.length > 1) errors.push(`컬럼 '${col}'을 여러 역할(${labels.join(', ')})에 쓸 수 없습니다`);
  }
  if (task.id === 'tabular' && errors.length === 0) {
    const features = columns.filter((c) => !Object.values(mapping).includes(c));
    if (features.length === 0) errors.push('목표 열 말고 특성으로 쓸 열이 하나 이상 있어야 합니다');
  }
  if (task.labelRole && mapping[task.labelRole] && errors.length === 0) {
    const classes = new Set(rows.map((r) => r[mapping[task.labelRole!]]).filter((v) => v !== ''));
    if (rows.length > 1 && classes.size < 2) errors.push('라벨 값이 2종류 이상이어야 합니다');
  }
  return { errors, warnings };
}

export interface LabelCount {
  label: string;
  count: number;
}

// 라벨 분포(많은 순). top개를 넘으면 나머지는 '기타'로 묶는다.
export function labelDistribution(rows: Record<string, string>[], column: string, top = 5): LabelCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = (r[column] ?? '').trim() || '(빈 값)';
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const sorted = [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (sorted.length <= top) return sorted;
  const rest = sorted.slice(top).reduce((n, x) => n + x.count, 0);
  return [...sorted.slice(0, top), { label: '기타', count: rest }];
}

export function splitCounts(total: number, trainPercent: number): { train: number; validation: number } {
  const train = Math.round((total * trainPercent) / 100);
  return { train, validation: total - train };
}

// 컬럼 값으로 대략적인 타입을 추정한다(빈 값 제외).
export function inferType(rows: Record<string, string>[], column: string): '숫자' | '텍스트' | '빈 열' {
  const values = rows.map((r) => (r[column] ?? '').trim()).filter((v) => v !== '');
  if (values.length === 0) return '빈 열';
  return values.every((v) => v !== '' && Number.isFinite(Number(v))) ? '숫자' : '텍스트';
}
