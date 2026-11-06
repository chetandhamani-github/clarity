const mockRouter = {
  push: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(),
  dismiss: jest.fn(),
  dismissAll: jest.fn(),
  dismissTo: jest.fn(),
  canDismiss: jest.fn(),
  setParams: jest.fn(),
  reload: jest.fn(),
  prefetch: jest.fn(),
};

jest.mock('expo-router', () => {
  const router = {
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(),
    dismiss: jest.fn(),
    dismissAll: jest.fn(),
    dismissTo: jest.fn(),
    canDismiss: jest.fn(),
    setParams: jest.fn(),
    reload: jest.fn(),
    prefetch: jest.fn(),
  };
  return { router };
});

import { router } from 'expo-router';
import {
  initNavigationGuard,
  restoreNavigationGuard,
  resetNavigationLock,
  setNavigationCooldown,
  isNavigating,
} from './navigation';

describe('navigation guard', () => {
  let originalUnderlyingPush: typeof router.push;
  let originalUnderlyingNavigate: typeof router.navigate;
  let originalUnderlyingReplace: typeof router.replace;

  beforeAll(() => {
    // Record what was mocked
    originalUnderlyingPush = jest.fn();
    originalUnderlyingNavigate = jest.fn();
    originalUnderlyingReplace = jest.fn();
  });

  beforeEach(() => {
    restoreNavigationGuard();
    router.push = originalUnderlyingPush;
    router.navigate = originalUnderlyingNavigate;
    router.replace = originalUnderlyingReplace;
    (originalUnderlyingPush as jest.Mock).mockClear();
    (originalUnderlyingNavigate as jest.Mock).mockClear();
    (originalUnderlyingReplace as jest.Mock).mockClear();

    initNavigationGuard();
    setNavigationCooldown(500);
    resetNavigationLock();
  });

  afterEach(() => {
    restoreNavigationGuard();
  });

  it('allows the first push call immediately', () => {
    router.push('/(app)/add-bill');
    expect(originalUnderlyingPush).toHaveBeenCalledTimes(1);
    expect(originalUnderlyingPush).toHaveBeenCalledWith('/(app)/add-bill', undefined);
    expect(isNavigating()).toBe(true);
  });

  it('drops rapid consecutive push calls within cooldown window', () => {
    router.push('/(app)/add-bill');
    router.push('/(app)/add-bill');
    router.push('/(app)/add-bill');
    router.push('/(app)/add-bill');

    expect(originalUnderlyingPush).toHaveBeenCalledTimes(1);
  });

  it('allows next push call after cooldown has passed', () => {
    const originalDateNow = Date.now;
    let currentTime = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

    router.push('/(app)/add-bill');
    expect(originalUnderlyingPush).toHaveBeenCalledTimes(1);

    // Fast-forward 200ms - still within cooldown
    currentTime = 1200;
    router.push('/(app)/add-bill');
    expect(originalUnderlyingPush).toHaveBeenCalledTimes(1);

    // Fast-forward past cooldown (600ms total)
    currentTime = 1600;
    router.push('/(app)/add-bill');
    expect(originalUnderlyingPush).toHaveBeenCalledTimes(2);

    Date.now = originalDateNow;
  });

  it('throttles router.navigate in the same manner', () => {
    router.navigate('/(app)/bills');
    router.navigate('/(app)/bills');
    router.navigate('/(app)/bills');

    expect(originalUnderlyingNavigate).toHaveBeenCalledTimes(1);
    expect(originalUnderlyingNavigate).toHaveBeenCalledWith('/(app)/bills', undefined);
  });

  it('throttles router.replace in the same manner', () => {
    router.replace('/(app)/(tabs)');
    router.replace('/(app)/(tabs)');

    expect(originalUnderlyingReplace).toHaveBeenCalledTimes(1);
    expect(originalUnderlyingReplace).toHaveBeenCalledWith('/(app)/(tabs)', undefined);
  });

  it('allows manual reset of navigation lock', () => {
    router.push('/(app)/add-bill');
    expect(originalUnderlyingPush).toHaveBeenCalledTimes(1);

    resetNavigationLock();
    expect(isNavigating()).toBe(false);

    router.push('/(app)/add-bill');
    expect(originalUnderlyingPush).toHaveBeenCalledTimes(2);
  });
});
