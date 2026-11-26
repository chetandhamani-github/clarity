import { getLocalTodayYmd } from './date';

export interface ChartHistoryPoint {
  date: string;
  value: number;
}

export interface NormalizedLineChartConfig {
  values: number[];
  yBase: number;
  maxValue: number;
  min: number;
  max: number;
  hasVariance: boolean;
}

export interface NormalizeLineChartOptions {
  /**
   * When true and all values are >= 0 with variance, anchors baseline at 0
   * (useful for cashflow runway charts where proximity to 0 matters).
   */
  anchorZeroWhenNonNegative?: boolean;
}

const VARIANCE_EPSILON = 1e-4;

/**
 * Normalizes raw line-chart values into non-negative values in [0, maxValue]
 * so gifted-charts renders positive, negative, zero-crossing, and flat series
 * without yAxisOffset/maxValue squash bugs or negative-quadrant expansion.
 */
export function normalizeLineChartValues(
  rawValues: readonly number[],
  options: NormalizeLineChartOptions = {}
): NormalizedLineChartConfig {
  if (rawValues.length === 0) {
    return {
      values: [50, 50],
      yBase: -50,
      maxValue: 100,
      min: 0,
      max: 0,
      hasVariance: false,
    };
  }

  const sanitized = rawValues.map((v) => (Number.isFinite(v) ? v : 0));
  const min = Math.min(...sanitized);
  const max = Math.max(...sanitized);
  const range = max - min;

  if (range <= VARIANCE_EPSILON) {
    if (Math.abs(min) <= VARIANCE_EPSILON) {
      return {
        values: sanitized.map(() => 50),
        yBase: -50,
        maxValue: 100,
        min: 0,
        max: 0,
        hasVariance: false,
      };
    }

    if (min > 0) {
      return {
        values: sanitized.map(() => min),
        yBase: 0,
        maxValue: min * 1.25,
        min,
        max,
        hasVariance: false,
      };
    }

    // Flat negative series (e.g., constant credit card debt): keep plotted value > 0
    const absVal = Math.abs(min);
    const yBase = min - absVal * 0.5;
    return {
      values: sanitized.map(() => absVal * 0.5),
      yBase,
      maxValue: absVal,
      min,
      max,
      hasVariance: false,
    };
  }

  if (options.anchorZeroWhenNonNegative && min >= 0) {
    return {
      values: sanitized.map((v) => Math.max(0, v)),
      yBase: 0,
      maxValue: max * 1.15,
      min,
      max,
      hasVariance: true,
    };
  }

  const padding = range * 0.15;
  const yBase = min - padding;
  const maxValue = range + padding * 2;

  return {
    values: sanitized.map((v) => Math.max(0, v - yBase)),
    yBase,
    maxValue,
    min,
    max,
    hasVariance: true,
  };
}

/**
 * Ensures history contains at least 2 points so LineChart renders a line/area cleanly.
 */
export function padChartHistory<T extends ChartHistoryPoint>(
  history: readonly T[] | null | undefined,
  fallbackValue: number = 0,
  fallbackDate: string = getLocalTodayYmd()
): ChartHistoryPoint[] {
  if (!history || history.length === 0) {
    const safeVal = Number.isFinite(fallbackValue) ? fallbackValue : 0;
    return [
      { date: fallbackDate, value: safeVal },
      { date: fallbackDate, value: safeVal },
    ];
  }
  if (history.length === 1) {
    return [history[0], history[0]];
  }
  return history.map((point) => ({ date: point.date, value: point.value }));
}

function formatShortMmDd(dateStr: string): string {
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}`;
  }
  return dateStr;
}

/**
 * Builds start / middle / end axis labels for historical line charts.
 */
export function buildStartMidEndLabels(dates: readonly string[]): string[] {
  if (dates.length === 0) return [];
  const start = formatShortMmDd(dates[0]);
  const end = formatShortMmDd(dates[dates.length - 1]);
  if (dates.length <= 2 || dates[0] === dates[dates.length - 1]) {
    return [start, end];
  }
  const mid = formatShortMmDd(dates[Math.floor((dates.length - 1) / 2)]);
  return [start, mid, end];
}
