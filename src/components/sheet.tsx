// Bottom sheet: slides up with a critically damped spring, drags to dismiss (distance or flick velocity),
// and can be interrupted at any point. Reduce Motion: appears/disappears without sliding.
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { GUTTER, radius, spacing, useTheme } from '@/theme';
import { FLICK_VELOCITY, spring, springFlick } from '@/theme/motion';

import { Text } from './ui';

export function Sheet({
  visible,
  onClose,
  title,
  children,
  scroll = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // Stay mounted while the closing animation runs ("adjust state while rendering" pattern).
  const [closing, setClosing] = useState(false);
  const [prevVisible, setPrevVisible] = useState(visible);
  if (prevVisible !== visible) {
    setPrevVisible(visible);
    setClosing(!visible);
  }
  const y = useSharedValue(height);

  useEffect(() => {
    // spring has reduceMotion: System, so with Reduce Motion on it jumps straight to the end.
    if (visible) y.set(withSpring(0, spring));
    else
      y.set(
        withSpring(height, spring, (done) => {
          if (done) scheduleOnRN(setClosing, false);
        }),
      );
  }, [visible, height, y]);

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-20, 20],
    onUpdate: (e) => {
      'worklet';
      y.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      const dismiss = e.translationY > 120 || e.velocityY > FLICK_VELOCITY;
      if (dismiss) {
        y.set(withSpring(height, springFlick(e.velocityY)));
        scheduleOnRN(onClose);
      } else {
        // a little bounce only after a flick back up
        y.set(withSpring(0, Math.abs(e.velocityY) > FLICK_VELOCITY ? springFlick(e.velocityY) : spring));
      }
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, height], [1, 0]) }));

  if (!visible && !closing) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg, maxHeight: height * 0.88, boxShadow: shadows.raised },
          sheetStyle,
        ]}
        accessibilityViewIsModal>
        <GestureDetector gesture={pan}>
          <View style={styles.grabArea}>
            <View style={[styles.grabber, { backgroundColor: colors.textFaint }]} />
            {title ? (
              <Text variant="headline" accessibilityRole="header" style={{ alignSelf: 'flex-start' }}>
                {title}
              </Text>
            ) : null}
          </View>
        </GestureDetector>
        {scroll ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={{ paddingHorizontal: GUTTER }}>{children}</View>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  grabArea: { paddingTop: spacing.sm, paddingBottom: spacing.md, paddingHorizontal: GUTTER, alignItems: 'center', gap: spacing.md },
  grabber: { width: 40, height: 5, borderRadius: 3, opacity: 0.5 },
});
