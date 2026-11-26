import {
  buildStartMidEndLabels,
  normalizeLineChartValues,
  padChartHistory,
} from './chart-utils';

describe('chart-utils', () => {
  describe('normalizeLineChartValues', () => {
    it('handles empty input with centered flat baseline', () => {
      const result = normalizeLineChartValues([]);
      expect(result.hasVariance).toBe(false);
      expect(result.values).toEqual([50, 50]);
      expect(result.maxValue).toBe(100);
    });

    it('scales high-magnitude positive series without bottom-squashing', () => {
      const result = normalizeLineChartValues([95000, 100000, 105000]);
      expect(result.hasVariance).toBe(true);
      expect(result.yBase).toBe(93500);
      expect(result.maxValue).toBe(13000);
      expect(result.values).toEqual([1500, 6500, 11500]);
      // Min fills ~11.5% and max fills ~88.5% instead of being squashed under 11%
      expect(result.values[0] / result.maxValue).toBeCloseTo(1500 / 13000, 5);
      expect(result.values[2] / result.maxValue).toBeCloseTo(11500 / 13000, 5);
    });

    it('keeps all internal values strictly positive for all-negative series (credit cards/loans)', () => {
      const result = normalizeLineChartValues([-8000, -5000, -2000]);
      expect(result.hasVariance).toBe(true);
      expect(result.maxValue).toBe(7800);
      expect(result.values).toEqual([900, 3900, 6900]);
      expect(result.values.every((v) => v > 0 && v < result.maxValue)).toBe(true);
    });

    it('keeps all internal values strictly positive when crossing zero', () => {
      const result = normalizeLineChartValues([-2000, 0, 5000]);
      expect(result.hasVariance).toBe(true);
      expect(result.maxValue).toBe(9100);
      expect(result.values).toEqual([1050, 3050, 8050]);
      expect(result.values.every((v) => v > 0 && v < result.maxValue)).toBe(true);
    });

    it('handles flat zero, flat positive, and flat negative without 0/negative maxValue', () => {
      const flatZero = normalizeLineChartValues([0, 0, 0]);
      expect(flatZero.hasVariance).toBe(false);
      expect(flatZero.values).toEqual([50, 50, 50]);
      expect(flatZero.maxValue).toBe(100);

      const flatPositive = normalizeLineChartValues([50000, 50000]);
      expect(flatPositive.hasVariance).toBe(false);
      expect(flatPositive.values).toEqual([50000, 50000]);
      expect(flatPositive.maxValue).toBe(62500);

      const flatNegative = normalizeLineChartValues([-5000, -5000]);
      expect(flatNegative.hasVariance).toBe(false);
      expect(flatNegative.values).toEqual([2500, 2500]);
      expect(flatNegative.maxValue).toBe(5000);
    });

    it('anchors zero baseline when anchorZeroWhenNonNegative is enabled and min >= 0', () => {
      const positive = normalizeLineChartValues([2000, 8000], {
        anchorZeroWhenNonNegative: true,
      });
      expect(positive.yBase).toBe(0);
      expect(positive.values).toEqual([2000, 8000]);
      expect(positive.maxValue).toBeCloseTo(9200, 5);

      const deficit = normalizeLineChartValues([-1000, 3000], {
        anchorZeroWhenNonNegative: true,
      });
      expect(deficit.values.every((v) => v > 0)).toBe(true);
      expect(deficit.maxValue).toBe(5200);
    });

    it('ignores floating-point noise below epsilon', () => {
      const flatNoisy = normalizeLineChartValues([1000, 1000.000001]);
      expect(flatNoisy.hasVariance).toBe(false);
      expect(flatNoisy.maxValue).toBe(1250);
    });

    it('sanitizes non-finite values', () => {
      const result = normalizeLineChartValues([NaN, 100, Infinity]);
      expect(result.values.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
      expect(Number.isFinite(result.maxValue)).toBe(true);
    });
  });

  describe('padChartHistory', () => {
    it('pads empty history to two fallback points using explicit date', () => {
      expect(padChartHistory([], -2500, '2026-11-26')).toEqual([
        { date: '2026-11-26', value: -2500 },
        { date: '2026-11-26', value: -2500 },
      ]);
    });

    it('duplicates a single point so LineChart draws a line', () => {
      const pt = { date: '2026-11-26', value: 1200 };
      expect(padChartHistory([pt])).toEqual([pt, pt]);
    });
  });

  describe('buildStartMidEndLabels', () => {
    it('builds start, mid, and end MM/DD labels', () => {
      expect(buildStartMidEndLabels(['2026-11-01', '2026-11-15', '2026-11-26'])).toEqual([
        '11/01',
        '11/15',
        '11/26',
      ]);
    });

    it('returns start and end when fewer than 3 dates or same start/end', () => {
      expect(buildStartMidEndLabels(['2026-11-26', '2026-11-26'])).toEqual([
        '11/26',
        '11/26',
      ]);
    });
  });
});
