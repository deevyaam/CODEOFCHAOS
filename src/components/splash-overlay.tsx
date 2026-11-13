// The splash grows and fades into the app once fonts, preferences and the session are ready.
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Logo } from './logo';

// Matches the native splash background in app.json so the hand-off is seamless.
export const SPLASH_BG = '#0E7C74';

export function SplashOverlay({ ready }: { ready: boolean }) {
  const [gone, setGone] = useState(false);
  const progress = useSharedValue(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
    progress.set(withTiming(
      1,
      { duration: reduce ? 200 : 520, easing: Easing.bezier(0.3, 0, 0.2, 1), reduceMotion: ReduceMotion.Never },
      (finished) => {
        if (finished) scheduleOnRN(setGone, true);
      },
    ));
  }, [ready, reduce, progress]);

  const container = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const mark = useAnimatedStyle(() => ({
    transform: [{ scale: reduce ? 1 : 1 + progress.value * 1.4 }],
  }));

  if (gone) return null;
  return (
    <Animated.View
      pointerEvents={ready ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, styles.root, container]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Animated.View style={mark}>
        <View style={styles.badge}>
          <Logo size={76} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: SPLASH_BG, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  badge: { alignItems: 'center', justifyContent: 'center' },
});
