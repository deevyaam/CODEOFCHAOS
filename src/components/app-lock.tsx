// Optional app lock: when on, the app asks for biometrics (or the phone's passcode) on open and after returning.
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { usePref } from '@/lib/prefs';
import { useTheme } from '@/theme';

import { Logo } from './logo';
import { Button, Text } from './ui';

const RELOCK_AFTER_MS = 30_000;

export async function authenticate(reason: string) {
  if (Platform.OS === 'web') return true;
  const has = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!has || !enrolled) return true; // nothing to check against; don't lock people out
  const res = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: 'Cancel' });
  return res.success;
}

export function AppLock() {
  const enabled = usePref('appLock');
  const native = Platform.OS !== 'web';
  const [locked, setLocked] = useState(enabled && native);
  const leftAt = useRef<number | null>(null);
  const { colors } = useTheme();

  const unlock = useCallback(async () => {
    if (await authenticate('Unlock Ansam Moris')) setLocked(false);
  }, []);

  useEffect(() => {
    if (!enabled || !native) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') leftAt.current = Date.now();
      if (s === 'active' && leftAt.current && Date.now() - leftAt.current > RELOCK_AFTER_MS) setLocked(true);
    });
    return () => sub.remove();
  }, [enabled, native]);

  const show = enabled && native && locked;
  useEffect(() => {
    // unlock() only sets state after the biometric prompt resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (show) unlock();
  }, [show, unlock]);

  if (!show) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.mark, { backgroundColor: colors.primary }]}>
        <Logo size={56} />
      </View>
      <Text variant="title">App locked</Text>
      <Text muted style={{ textAlign: 'center' }}>Unlock with your fingerprint, face or phone passcode.</Text>
      <Button title="Unlock" icon="lock-open" onPress={unlock} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 90, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  mark: { width: 96, height: 96, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
});
