import { getInstallationId } from './installationId';
import { mmkv } from '@/lib/storage';

describe('installationId utility', () => {
  beforeEach(() => {
    mmkv.clearAll();
  });

  it('generates a valid UUID on first call and persists it', () => {
    const id1 = getInstallationId();
    expect(typeof id1).toBe('string');
    expect(id1.length).toBeGreaterThan(10);
    // RFC4122 v4 pattern check
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('returns the same installationId on subsequent calls', () => {
    const id1 = getInstallationId();
    const id2 = getInstallationId();
    const id3 = getInstallationId();

    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
  });
});
