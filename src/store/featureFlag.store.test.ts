import { useFeatureFlagStore, isFeatureEnabled } from './featureFlag.store';
import { mmkv } from '@/lib/storage';

describe('featureFlag.store', () => {
  beforeEach(() => {
    mmkv.clearAll();
    useFeatureFlagStore.setState({
      flags: {
        subscription_manager: true,
        bills_reminders: true,
        splitwise: false,
        premium: false,
      },
      lastUpdated: null,
    });
  });

  it('correctly reads initial feature flag states', () => {
    expect(isFeatureEnabled('subscription_manager')).toBe(true);
    expect(isFeatureEnabled('splitwise')).toBe(false);
    expect(isFeatureEnabled('non_existent_flag')).toBe(false);
  });

  it('updates a feature flag dynamically', () => {
    useFeatureFlagStore.getState().updateFlag('splitwise', true);
    expect(isFeatureEnabled('splitwise')).toBe(true);

    useFeatureFlagStore.getState().updateFlag('splitwise', false);
    expect(isFeatureEnabled('splitwise')).toBe(false);
  });

  it('bulk updates feature flags and records timestamp', () => {
    useFeatureFlagStore.getState().setFlags({
      splitwise: true,
      premium: true,
    });

    expect(isFeatureEnabled('splitwise')).toBe(true);
    expect(isFeatureEnabled('premium')).toBe(true);
    expect(useFeatureFlagStore.getState().lastUpdated).not.toBeNull();
  });
});
