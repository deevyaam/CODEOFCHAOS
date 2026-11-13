// Adds values that must not be committed (read from the environment / EAS secrets) to app.json.
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    // Google Maps on Android release builds needs an API key (Expo Go has its own).
    ...(process.env.GOOGLE_MAPS_ANDROID_API_KEY
      ? { config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY } } }
      : {}),
  },
});
