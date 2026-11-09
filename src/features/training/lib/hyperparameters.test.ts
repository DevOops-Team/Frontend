import { describe, expect, it } from 'vitest';
import type { HyperparameterDef } from '../types';
import { parseHyperparameters } from './hyperparameters';

const DEFS: HyperparameterDef[] = [
  { key: 'epochs', level: 'basic', type: 'integer', default: 10, min: 1, max: 20 },
  { key: 'learning_rate', level: 'advanced', type: 'number', default: 3e-5, exclusiveMin: 0, max: 0.01 },
];

describe('parseHyperparameters', () => {
  it('sends only the values the user typed so the backend keeps its defaults', () => {
    expect(parseHyperparameters(DEFS, {})).toEqual({ values: {}, errors: [] });
    expect(parseHyperparameters(DEFS, { epochs: '  ', learning_rate: '' })).toEqual({ values: {}, errors: [] });
  });

  it('converts typed values to numbers', () => {
    expect(parseHyperparameters(DEFS, { epochs: '3', learning_rate: '0.001' })).toEqual({ values: { epochs: 3, learning_rate: 0.001 }, errors: [] });
  });

  it('rejects non-numbers, fractions for integers and values out of range', () => {
    const inputs: Record<string, string>[] = [{ epochs: 'abc' }, { epochs: '1.5' }, { epochs: '0' }, { epochs: '21' }, { learning_rate: '0' }, { learning_rate: '0.5' }];
    for (const input of inputs) {
      const got = parseHyperparameters(DEFS, input);
      expect(got.errors, JSON.stringify(input)).toHaveLength(1);
      expect(got.values, JSON.stringify(input)).toEqual({});
    }
  });

  it('accepts the limits themselves except an exclusive minimum', () => {
    expect(parseHyperparameters(DEFS, { epochs: '1' }).errors).toEqual([]);
    expect(parseHyperparameters(DEFS, { epochs: '20' }).errors).toEqual([]);
    expect(parseHyperparameters(DEFS, { learning_rate: '0.01' }).errors).toEqual([]);
  });
});
