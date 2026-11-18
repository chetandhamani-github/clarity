import Reactotron from 'reactotron-react-native';
import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

declare global {
  interface Console {
    tron?: typeof Reactotron;
  }
}

if (__DEV__) {
  let host = 'localhost';

  const hostUri =
    Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoClient?.hostUri;

  if (hostUri) {
    // When running with Metro over Wi-Fi/LAN, connect to Metro's host machine IP
    host = hostUri.split(':')[0];
  } else {
    const scriptURL = (NativeModules.SourceCode as { scriptURL?: string } | undefined)?.scriptURL;
    if (scriptURL) {
      try {
        const url = new URL(scriptURL);
        if (url.hostname && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
          host = url.hostname;
        }
      } catch {
        // Ignore URL parsing errors
      }
    } else if (Platform.OS === 'android' && !Device.isDevice) {
      // Android emulator routes host machine loopback to 10.0.2.2
      host = '10.0.2.2';
    }
  }

  Reactotron.configure({
    name: 'Clarity',
    host,
    onConnect: () => {
      console.log(`[Reactotron] Connected successfully to host: ${host}:9090`);
    },
    onDisconnect: () => {
      console.log(`[Reactotron] Disconnected from host: ${host}:9090`);
    },
  })
    .useReactNative({
      log: true,
      asyncStorage: false, // Project uses mmkv
      networking: {
        ignoreUrls: /symbolicate/,
      },
      errors: { veto: () => false },
      overlay: false,
    })
    .connect();

  Reactotron.clear?.();

  console.tron = Reactotron;
}

export default Reactotron;
