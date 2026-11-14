// Adds values that must not be committed (read from the environment / EAS secrets) to app.json.
import type { ConfigContext, ExpoConfig } from 'expo/config';

// The app's TypeScript setup has no Node types; this file only ever runs in Node.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { existsSync } = require('fs') as { existsSync: (path: string) => boolean };

// Android push needs Firebase's google-services.json: either the file in the project folder, or an EAS "file"
// environment variable named GOOGLE_SERVICES_JSON (EAS puts the file on disk and gives us its path).
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? (existsSync('./google-services.json') ? './google-services.json' : undefined);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    ...(googleServicesFile ? { googleServicesFile } : {}),
    // Maps on Android use OpenStreetMap in a WebView (no key needed). A Google Maps key is only used if set.
    ...(process.env.GOOGLE_MAPS_ANDROID_API_KEY
      ? { config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY } } }
      : {}),
  },
  extra: {
    ...config.extra,
    // Lets the app say "push isn't set up in this version" instead of showing Firebase's error.
    androidPushReady: !!googleServicesFile,
  },
});
