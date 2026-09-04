import { PermissionsAndroid, Platform } from 'react-native';
import { SmsPermissionManager } from './smsPermissionManager';

describe('SmsPermissionManager', () => {
  let checkSpy: jest.SpyInstance;
  let requestSpy: jest.SpyInstance;
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    checkSpy = jest.spyOn(PermissionsAndroid, 'check');
    requestSpy = jest.spyOn(PermissionsAndroid, 'request');
  });

  afterEach(() => {
    checkSpy.mockRestore();
    requestSpy.mockRestore();
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('returns granted when permission is already granted', async () => {
    checkSpy.mockResolvedValue(true);
    const status = await SmsPermissionManager.checkSmsPermission();
    expect(status).toBe('granted');
  });

  it('returns denied when permission is not granted', async () => {
    checkSpy.mockResolvedValue(false);
    const status = await SmsPermissionManager.checkSmsPermission();
    expect(status).toBe('denied');
  });

  it('handles user granting permission on request', async () => {
    requestSpy.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    const status = await SmsPermissionManager.requestSmsPermission();
    expect(status).toBe('granted');
  });

  it('handles user denying permission on request', async () => {
    requestSpy.mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
    const status = await SmsPermissionManager.requestSmsPermission();
    expect(status).toBe('denied');
  });

  it('handles permanently denied (never_ask_again)', async () => {
    requestSpy.mockResolvedValue(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    const status = await SmsPermissionManager.requestSmsPermission();
    expect(status).toBe('permanently_denied');
  });

  it('returns unavailable on non-Android platforms', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      configurable: true,
    });
    const checkStatus = await SmsPermissionManager.checkSmsPermission();
    const reqStatus = await SmsPermissionManager.requestSmsPermission();
    expect(checkStatus).toBe('unavailable');
    expect(reqStatus).toBe('unavailable');
  });
});
