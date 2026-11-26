import {
  abortSpeechRecognition,
  isNativeSpeechRecognitionAvailable,
  requestSpeechPermissions,
  startSpeechRecognition,
  stopSpeechRecognition,
  supportsOnDeviceSpeechRecognition,
} from './speech-recognition';

jest.mock('expo-speech-recognition', () => {
  const listeners: Record<string, ((event: unknown) => void)[]> = {};
  return {
    ExpoSpeechRecognitionModule: {
      start: jest.fn(() => {
        // Trigger simulated start and result for testing
        setTimeout(() => {
          listeners.start?.forEach((cb) => cb({}));
          listeners.result?.forEach((cb) =>
            cb({
              results: [{ transcript: 'Paid 200 for coffee' }],
              isFinal: true,
            })
          );
        }, 10);
      }),
      stop: jest.fn(),
      abort: jest.fn(),
      requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
      supportsOnDeviceRecognition: jest.fn().mockReturnValue(true),
      isRecognitionAvailable: jest.fn().mockReturnValue(true),
      addListener: jest.fn((event: string, handler: (e: unknown) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
        return {
          remove: jest.fn(() => {
            listeners[event] = listeners[event]?.filter((h) => h !== handler) || [];
          }),
        };
      }),
    },
  };
});

describe('speech-recognition service', () => {
  afterEach(() => {
    stopSpeechRecognition();
  });

  it('checks if native speech recognition is available', () => {
    expect(isNativeSpeechRecognitionAvailable()).toBe(true);
  });

  it('checks if on-device speech recognition is supported', () => {
    expect(supportsOnDeviceSpeechRecognition()).toBe(true);
  });

  it('requests speech permissions properly', async () => {
    const granted = await requestSpeechPermissions();
    expect(granted).toBe(true);
  });

  it('starts recognition and receives transcript in callback', async () => {
    const onStart = jest.fn();
    const onResult = jest.fn();

    const started = await startSpeechRecognition({
      onStart,
      onResult,
    });

    expect(started).toBe(true);

    // Wait for the mock async events to fire
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onStart).toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith('Paid 200 for coffee', true);
  });

  it('stops and aborts recognition cleanly', () => {
    expect(() => stopSpeechRecognition()).not.toThrow();
    expect(() => abortSpeechRecognition()).not.toThrow();
  });
});
