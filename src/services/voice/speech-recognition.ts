/**
 * On-Device Speech Recognition Service
 *
 * Integrates `expo-speech-recognition` for real-time offline/on-device
 * voice transcription with graceful fallback for unlinked/dev-client environments.
 */

export interface SpeechRecognitionCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onVolumeChange?: (volume: number) => void;
}

export interface SpeechEventPayload {
  results?: Array<{ transcript?: string }>;
  isFinal?: boolean;
  message?: string;
  error?: string;
  value?: number;
}

// Dynamically check if the native module is linked and speech recognition service is present
export function isNativeSpeechRecognitionAvailable(): boolean {
  try {
    const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
    if (!ExpoSpeechRecognitionModule || typeof ExpoSpeechRecognitionModule.start !== 'function') {
      return false;
    }
    if (typeof ExpoSpeechRecognitionModule.isRecognitionAvailable === 'function') {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    }
    return true;
  } catch {
    return false;
  }
}

// Check if device supports offline/on-device speech recognition
export function supportsOnDeviceSpeechRecognition(): boolean {
  try {
    const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
    if (!ExpoSpeechRecognitionModule) return false;
    if (typeof ExpoSpeechRecognitionModule.supportsOnDeviceRecognition === 'function') {
      return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    }
    return false;
  } catch {
    return false;
  }
}

export async function requestSpeechPermissions(): Promise<boolean> {
  try {
    const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
    if (!ExpoSpeechRecognitionModule?.requestPermissionsAsync) return false;
    const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return Boolean(res?.granted);
  } catch {
    return false;
  }
}

let activeSubscriptionRemovers: (() => void)[] = [];

export async function startSpeechRecognition(
  callbacks: SpeechRecognitionCallbacks,
  options?: { lang?: string; requiresOnDevice?: boolean }
): Promise<boolean> {
  stopSpeechRecognition();

  try {
    const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
    if (!ExpoSpeechRecognitionModule) return false;

    const hasPermission = await requestSpeechPermissions();
    if (!hasPermission) {
      callbacks.onError?.('Microphone permission not granted.');
      return false;
    }

    const addListener = (event: string, handler: (e: SpeechEventPayload) => void) => {
      if (typeof ExpoSpeechRecognitionModule.addListener === 'function') {
        const sub = ExpoSpeechRecognitionModule.addListener(event, handler);
        if (sub && typeof sub.remove === 'function') {
          activeSubscriptionRemovers.push(() => sub.remove());
        }
      }
    };

    addListener('start', () => {
      callbacks.onStart?.();
    });

    addListener('end', () => {
      callbacks.onEnd?.();
    });

    addListener('result', (event) => {
      const results = event?.results;
      if (results && results.length > 0) {
        const best = results[0]?.transcript || '';
        const isFinal = Boolean(event.isFinal);
        callbacks.onResult?.(best, isFinal);
      }
    });

    addListener('volumechange', (event) => {
      if (typeof event.value === 'number') {
        callbacks.onVolumeChange?.(event.value);
      }
    });

    addListener('error', (event) => {
      const errorMsg = event?.message || event?.error || 'Speech recognition error';
      // "no-speech" or "speech-timeout" just means the user paused
      if (event?.error === 'no-speech' || event?.error === 'speech-timeout') {
        callbacks.onEnd?.();
        return;
      }

      // If Android reports offline language pack not downloaded, retry with standard recognition
      if (
        typeof errorMsg === 'string' &&
        errorMsg.toLowerCase().includes('not yet downloaded')
      ) {
        try {
          ExpoSpeechRecognitionModule.start({
            lang: options?.lang || 'en-US',
            interimResults: true,
            continuous: true,
            maxAlternatives: 1,
            requiresOnDeviceRecognition: false,
            contextualStrings: [
              'rupees',
              'cash',
              'credit card',
              'debit card',
              'HDFC',
              'SBI',
              'ICICI',
              'Axis',
              'Paytm',
              'PhonePe',
              'GPay',
              'Google Pay',
              'Swiggy',
              'Zomato',
              'Uber',
              'Ola',
              'Blinkit',
              'Zepto',
              'Amazon',
              'Flipkart',
              'Subway',
            ],
          });
          return;
        } catch {
          // Fall through to error callback
        }
      }

      callbacks.onError?.(errorMsg);
      callbacks.onEnd?.();
    });

    ExpoSpeechRecognitionModule.start({
      lang: options?.lang || 'en-US',
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      requiresOnDeviceRecognition: options?.requiresOnDevice ?? false,
      contextualStrings: [
        'rupees',
        'cash',
        'credit card',
        'debit card',
        'HDFC',
        'SBI',
        'ICICI',
        'Axis',
        'Paytm',
        'PhonePe',
        'GPay',
        'Google Pay',
        'Swiggy',
        'Zomato',
        'Uber',
        'Ola',
        'Blinkit',
        'Zepto',
        'Amazon',
        'Flipkart',
        'Subway',
      ],
      androidIntentOptions: {
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2500,
      },
    });

    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to start speech recognition';
    callbacks.onError?.(message);
    return false;
  }
}

export function stopSpeechRecognition(): void {
  try {
    for (const remove of activeSubscriptionRemovers) {
      remove();
    }
  } catch {
    // Ignore cleanup errors
  }
  activeSubscriptionRemovers = [];

  try {
    const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
    if (ExpoSpeechRecognitionModule && typeof ExpoSpeechRecognitionModule.stop === 'function') {
      ExpoSpeechRecognitionModule.stop();
    }
  } catch {
    // Graceful fallback
  }
}

export function abortSpeechRecognition(): void {
  stopSpeechRecognition();
  try {
    const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
    if (ExpoSpeechRecognitionModule && typeof ExpoSpeechRecognitionModule.abort === 'function') {
      ExpoSpeechRecognitionModule.abort();
    }
  } catch {
    // Graceful fallback
  }
}
