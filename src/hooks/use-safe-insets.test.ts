import { calculateSafeInsets } from './use-safe-insets';

describe('calculateSafeInsets', () => {
  it('returns valid insets when insets.top is positive', () => {
    const insets = { top: 44, bottom: 34, left: 0, right: 0 };
    const result = calculateSafeInsets(insets, 'ios');
    expect(result.top).toBe(44);
    expect(result.bottom).toBe(34);
  });

  it('falls back to statusBarHeight on Android when insets.top is 0', () => {
    const insets = { top: 0, bottom: 16, left: 0, right: 0 };
    const result = calculateSafeInsets(insets, 'android', 36);
    expect(result.top).toBe(36);
    expect(result.bottom).toBe(16);
  });

  it('falls back to default 24 on Android when insets.top is 0 and statusBarHeight is undefined', () => {
    const insets = { top: 0, bottom: 0, left: 0, right: 0 };
    const result = calculateSafeInsets(insets, 'android', undefined);
    expect(result.top).toBe(24);
  });

  it('preserves 0 on iOS when insets.top is 0 (for sheet modals)', () => {
    const insets = { top: 0, bottom: 20, left: 0, right: 0 };
    const result = calculateSafeInsets(insets, 'ios');
    expect(result.top).toBe(0);
    expect(result.bottom).toBe(20);
  });
});
