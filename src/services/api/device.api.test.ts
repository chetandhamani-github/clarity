import { isVersionOutdated } from './device.api';

describe('device.api version comparison', () => {
  it('correctly detects when current app version is outdated', () => {
    expect(isVersionOutdated('1.0.0', '1.0.1')).toBe(true);
    expect(isVersionOutdated('1.0.0', '1.1.0')).toBe(true);
    expect(isVersionOutdated('1.0.0', '2.0.0')).toBe(true);
    expect(isVersionOutdated('0.9.9', '1.0.0')).toBe(true);
  });

  it('correctly detects when current app version is up to date or newer', () => {
    expect(isVersionOutdated('1.0.0', '1.0.0')).toBe(false);
    expect(isVersionOutdated('1.0.1', '1.0.0')).toBe(false);
    expect(isVersionOutdated('1.2.0', '1.1.9')).toBe(false);
    expect(isVersionOutdated('2.0.0', '1.9.9')).toBe(false);
  });
});
