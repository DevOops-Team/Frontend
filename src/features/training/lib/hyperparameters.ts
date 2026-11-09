import type { HyperparameterDef } from '../types';

// 상세 설정 입력 → 요청 값. 비운 칸은 보내지 않아 백엔드 기본값을 쓴다.
// 범위는 /api/models가 준 정의를 따르고, 최종 검증은 백엔드가 다시 한다.

export function rangeText(d: HyperparameterDef): string {
  const low = d.exclusiveMin !== undefined ? `${d.exclusiveMin} 초과` : d.min !== undefined ? `${d.min} 이상` : '';
  const high = d.max !== undefined ? `${d.max} 이하` : '';
  return [low, high].filter(Boolean).join(', ');
}

export function parseHyperparameters(defs: HyperparameterDef[], input: Record<string, string>): { values: Record<string, number>; errors: string[] } {
  const values: Record<string, number> = {};
  const errors: string[] = [];
  for (const d of defs) {
    const raw = (input[d.key] ?? '').trim();
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      errors.push(`${d.key}: 숫자를 입력해 주세요.`);
    } else if (d.type === 'integer' && !Number.isInteger(n)) {
      errors.push(`${d.key}: 정수를 입력해 주세요.`);
    } else if ((d.min !== undefined && n < d.min) || (d.max !== undefined && n > d.max) || (d.exclusiveMin !== undefined && n <= d.exclusiveMin)) {
      errors.push(`${d.key}: ${rangeText(d)}이어야 합니다.`);
    } else {
      values[d.key] = n;
    }
  }
  return { values, errors };
}
