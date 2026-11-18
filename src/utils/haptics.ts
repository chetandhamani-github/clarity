import { Vibration, Platform } from 'react-native';

export const haptics = {
  selection: () => {
    if (Platform.OS === 'android') {
      Vibration.vibrate(8);
    }
  },
  light: () => {
    if (Platform.OS === 'android') {
      Vibration.vibrate(12);
    }
  },
  medium: () => {
    if (Platform.OS === 'android') {
      Vibration.vibrate(25);
    }
  },
  heavy: () => {
    if (Platform.OS === 'android') {
      Vibration.vibrate(40);
    }
  },
  success: () => {
    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 15, 50, 20]);
    }
  },
  warning: () => {
    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 20, 80, 25]);
    }
  },
  error: () => {
    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 30, 60, 30, 60, 40]);
    }
  },
};
