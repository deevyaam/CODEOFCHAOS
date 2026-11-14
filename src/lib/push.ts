import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { EAS_PROJECT_ID } from '@/config';

import type { Prefs } from './prefs';
import { supabase } from './supabase';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: 'web' | 'simulator' | 'expo-go' | 'no-project-id' | 'no-firebase' };

export function pushSupport(): PushSupport {
  if (Platform.OS === 'web') return { ok: false, reason: 'web' };
  if (!Device.isDevice) return { ok: false, reason: 'simulator' };
  // Remote push is not available in Expo Go on Android; it needs a development or release build.
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return { ok: false, reason: 'expo-go' };
  }
  if (!EAS_PROJECT_ID) return { ok: false, reason: 'no-project-id' };
  // Android builds made without Firebase's google-services.json can't get a push address.
  if (Platform.OS === 'android' && !(Constants.expoConfig?.extra as { androidPushReady?: boolean } | undefined)?.androidPushReady) {
    return { ok: false, reason: 'no-firebase' };
  }
  return { ok: true };
}

export const PUSH_REASON_TEXT: Record<Exclude<PushSupport, { ok: true }>['reason'], string> = {
  web: 'Push notifications are available in the phone app.',
  simulator: 'Push notifications need a real phone.',
  'expo-go': 'Push notifications need the installed app (a development or store build), not Expo Go.',
  'no-project-id': 'Push is not set up yet: link the app to an Expo project with "npx eas-cli@latest init".',
  'no-firebase': 'Push notifications aren’t switched on in this version of the app yet. They’ll arrive in an update.',
};

export async function getPushToken(ask: boolean): Promise<string | null> {
  if (!pushSupport().ok) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Alerts and updates',
      importance: AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
  return data;
}

/** Store (or update) this phone's token with its alert area and notification choices. */
export async function savePushToken(
  token: string,
  prefs: Pick<Prefs, 'alertArea' | 'notifyMyReports' | 'notifyMeToo' | 'notifyDiscussion'>,
  near?: { lat: number; lng: number } | null,
) {
  const a = prefs.alertArea;
  return supabase.from('push_tokens').upsert({
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    alert_mode: a.mode,
    alert_town: a.mode === 'town' ? a.town : null,
    alert_km: a.mode === 'near' ? a.km : null,
    alert_lat: a.mode === 'near' ? near?.lat ?? null : null,
    alert_lng: a.mode === 'near' ? near?.lng ?? null : null,
    notify_my_reports: prefs.notifyMyReports,
    notify_me_too: prefs.notifyMeToo,
    notify_discussion: prefs.notifyDiscussion,
    updated_at: new Date().toISOString(),
  });
}

export async function removePushToken(token: string) {
  return supabase.from('push_tokens').delete().eq('token', token);
}

/** Opening a notification goes to the screen it is about. */
export function useNotificationRouting(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    const go = (n: Notifications.Notification) => {
      const url = n.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) go(last.notification);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => go(r.notification));
    return () => sub.remove();
  }, [enabled]);
}
