import { describe, expect, it } from 'vitest';
import { taskOf } from '../mock/catalog';
import { autoMap, inferType, labelDistribution, splitCounts, validateMapping } from './mapping';

const cls = taskOf('text-classification');
const sft = taskOf('instruction-sft');
const tab = taskOf('tabular');

describe('autoMap', () => {
  it('maps columns by synonym, one column per role', () => {
    expect(autoMap(cls, ['id', 'document', 'label'])).toEqual({ text: 'document', label: 'label' });
    expect(autoMap(sft, ['prompt', 'response'])).toEqual({ instruction: 'prompt', input: '', output: 'response' });
    expect(autoMap(cls, ['foo', 'bar'])).toEqual({ text: '', label: '' });
  });
});

describe('validateMapping', () => {
  const rows = [
    { t: 'a', l: 'x' },
    { t: 'b', l: 'y' },
    { t: 'c', l: '' },
  ];

  it('passes a complete mapping and warns about empty values', () => {
    const r = validateMapping(cls, ['t', 'l'], { text: 't', label: 'l' }, rows);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual(["'l' 컬럼에 빈 값 1개 — 해당 행은 학습에서 빠집니다"]);
  });

  it('requires required roles but not optional ones', () => {
    expect(validateMapping(cls, ['t', 'l'], { text: 't', label: '' }, rows).errors).toEqual(["'라벨' 역할에 컬럼을 지정하세요"]);
    expect(validateMapping(sft, ['i', 'o'], { instruction: 'i', input: '', output: 'o' }, [{ i: 'q', o: 'a' }]).errors).toEqual([]);
  });

  it('rejects unknown columns and a column used twice', () => {
    expect(validateMapping(cls, ['t', 'l'], { text: 'zzz', label: 'l' }, rows).errors[0]).toMatch(/'zzz'이 데이터셋에 없습니다/);
    expect(validateMapping(cls, ['t', 'l'], { text: 't', label: 't' }, rows).errors).toEqual(["컬럼 't'을 여러 역할(텍스트, 라벨)에 쓸 수 없습니다"]);
  });

  it('needs at least two label classes', () => {
    const same = [
      { t: 'a', l: 'x' },
      { t: 'b', l: 'x' },
    ];
    expect(validateMapping(cls, ['t', 'l'], { text: 't', label: 'l' }, same).errors).toEqual(['라벨 값이 2종류 이상이어야 합니다']);
  });

  it('needs feature columns for tabular tasks', () => {
    const r = [
      { y: '1', id: 'a' },
      { y: '0', id: 'b' },
    ];
    expect(validateMapping(tab, ['y', 'id'], { target: 'y', id: 'id' }, r).errors).toEqual(['목표 열 말고 특성으로 쓸 열이 하나 이상 있어야 합니다']);
    expect(validateMapping(tab, ['y', 'id', 'f'], { target: 'y', id: 'id' }, r).errors).toEqual([]);
  });
});

describe('labelDistribution / splitCounts / inferType', () => {
  it('counts labels, most common first, grouping the tail as 기타', () => {
    const rows = ['a', 'b', 'a', 'c', 'd', ''].map((l) => ({ l }));
    expect(labelDistribution(rows, 'l')).toEqual([
      { label: 'a', count: 2 },
      { label: '(빈 값)', count: 1 },
      { label: 'b', count: 1 },
      { label: 'c', count: 1 },
      { label: 'd', count: 1 },
    ]);
    expect(labelDistribution(rows, 'l', 2)).toEqual([
      { label: 'a', count: 2 },
      { label: '(빈 값)', count: 1 },
      { label: '기타', count: 3 },
    ]);
  });

  it('splits rows by percent', () => {
    expect(splitCounts(1000, 90)).toEqual({ train: 900, validation: 100 });
    expect(splitCounts(7, 50)).toEqual({ train: 4, validation: 3 });
  });

  it('infers column type', () => {
    expect(inferType([{ a: '1' }, { a: '2.5' }, { a: '' }], 'a')).toBe('숫자');
    expect(inferType([{ a: '1' }, { a: 'x' }], 'a')).toBe('텍스트');
    expect(inferType([{ a: '' }], 'a')).toBe('빈 열');
  });
});
