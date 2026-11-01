import { describe, expect, it } from 'vitest';
import { formatINR, largestRemainderRound, parseINR, toLakh } from '../../src/engine';

describe('parseINR', () => {
  it.each([
    ['8 lakh', 800_000],
    ['8L', 800_000],
    ['8l', 800_000],
    ['8,00,000', 800_000],
    ['₹800000', 800_000],
    ['8.5 lac', 850_000],
    ['2 crore', 20_000_000],
    ['2cr', 20_000_000],
    ['45k', 45_000],
    ['Rs. 1,50,000', 150_000],
    ['  12 lakhs  ', 1_200_000],
    ['5000/-', 5000],
    ['.5 lakh', 50_000],
  ])('parses %s', (input, expected) => {
    expect(parseINR(input)).toBe(expected);
  });

  it.each([
    '',
    'abc',
    '8 lakh crore',
    '-5 lakh',
    '0',
    '0 lakh',
    '1e9',
    '8..5',
    '₹',
    '999999999999999999',
  ])('rejects %j', (input) => {
    expect(parseINR(input)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(parseINR(undefined as unknown as string)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats en-IN grouping', () => {
    expect(formatINR(800_000)).toBe('₹8,00,000');
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(-25_000)).toBe('−₹25,000');
    expect(formatINR(1234.6)).toBe('₹1,235');
  });

  it('formats lakh and crore', () => {
    expect(toLakh(800_000)).toBe('₹8 lakh');
    expect(toLakh(850_000)).toBe('₹8.5 lakh');
    expect(toLakh(20_000_000)).toBe('₹2 crore');
    expect(toLakh(45_000)).toBe('₹45,000');
    expect(toLakh(-300_000)).toBe('−₹3 lakh');
  });
});

describe('largestRemainderRound', () => {
  it('always sums exactly to the total', () => {
    for (const total of [0, 1, 7, 99, 1000, 800_001, 123_456_789]) {
      const parts = largestRemainderRound([35, 20, 12, 10, 8, 5, 10], total);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.every((p) => Number.isInteger(p) && p >= 0)).toBe(true);
    }
  });

  it('handles empty, zero weights and bad weights', () => {
    expect(largestRemainderRound([], 100)).toEqual([]);
    expect(largestRemainderRound([0, 0, 0], 10)).toEqual([4, 3, 3]);
    expect(largestRemainderRound([NaN, -3, 1], 5)).toEqual([0, 0, 5]);
    expect(largestRemainderRound([1, 1], -5)).toEqual([0, 0]);
  });
});
