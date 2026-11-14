import {
  GoogleSans_400Regular,
  GoogleSans_600SemiBold,
  GoogleSans_700Bold,
  useFonts,
} from '@expo-google-fonts/google-sans';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLock } from '@/components/app-lock';
import { SplashOverlay } from '@/components/splash-overlay';
import { useAutoPush, useNotificationRouting } from '@/lib/push';
import { loadPrefs } from '@/lib/prefs';
import { useWidgetSync } from '@/lib/widgets-sync';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeProvider, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ GoogleSans_400Regular, GoogleSans_600SemiBold, GoogleSans_700Bold });
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    loadPrefs().finally(() => setPrefsLoaded(true));
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SessionProvider>
            <AppShell assetsReady={(fontsLoaded || !!fontError) && prefsLoaded} />
          </SessionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppShell({ assetsReady }: { assetsReady: boolean }) {
  const { ready, consent, session } = useSession();
  const { scheme, colors } = useTheme();
  const loaded = assetsReady && ready;
  useNotificationRouting(loaded && !!session);
  // Signed-in members (not guests) who accepted the terms get notifications without a setting to find.
  useAutoPush(session?.user.id ?? null, loaded && !!consent && !!session && !session.user.is_anonymous);
  // Home screen widgets get a fresh snapshot when the app opens or comes back (phones only).
  useWidgetSync(loaded, !!session && !session.user.is_anonymous);

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: colors.background, card: colors.surface, text: colors.text, primary: colors.primary },
  };

  const hasConsent = !!consent;
  const signedIn = !!session;

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {loaded && (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Protected guard={!hasConsent}>
            <Stack.Screen name="consent" />
          </Stack.Protected>
          <Stack.Protected guard={hasConsent && !signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
          <Stack.Protected guard={hasConsent && signedIn}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="report/new" />
            <Stack.Screen name="report/[id]" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="account" />
            <Stack.Screen name="blocked" />
            <Stack.Screen name="moderation" />
            <Stack.Screen name="people" />
            <Stack.Screen name="people/[id]" />
            <Stack.Screen name="issues" />
          </Stack.Protected>
          <Stack.Screen name="auth-callback" />
          <Stack.Screen name="legal/[doc]" />
        </Stack>
      )}
      {loaded && signedIn && <AppLock />}
      <SplashOverlay ready={loaded} />
    </NavThemeProvider>
  );
}
