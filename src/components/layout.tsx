import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GUTTER, spacing, useTheme } from '@/theme';

import { Icon, PressableScale, Text } from './ui';

/** Height of the floating tab bar pill (without its bottom margin). */
export const TAB_BAR_HEIGHT = 64;
const TAB_BAR_MARGIN = 12;

/** Space a tab page must leave at the bottom so its last item stays clear of the floating bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + TAB_BAR_MARGIN + Math.max(insets.bottom, 8) + spacing.xl;
}

export function useTabBarBottom() {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 8) + TAB_BAR_MARGIN;
}

/** True while the on-screen keyboard is open (the tab bar hides while typing). */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return;
      const full = window.innerHeight;
      const onResize = () => setVisible(full - vv.height > 150);
      vv.addEventListener('resize', onResize);
      return () => vv.removeEventListener('resize', onResize);
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, () => setVisible(true));
    const b = Keyboard.addListener(hideEvt, () => setVisible(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return visible;
}

/** Large page header used by tab pages. */
export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="display" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text muted>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Header for stack screens (non-tab), with a back button. */
export function StackHeader({ title, right }: { title: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View style={[styles.stackHeader, { paddingTop: insets.top + spacing.sm, backgroundColor: colors.background }]}>
      <PressableScale
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={[styles.back, { backgroundColor: colors.surface }]}>
        <Icon name="chevron-back" size={22} />
      </PressableScale>
      <Text variant="headline" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}

/** Scrollable page with the 16 px gutter, safe-area top and room for the tab bar. */
export function Page({
  children,
  tab = true,
  contentStyle,
  ...rest
}: ScrollViewProps & { children: ReactNode; tab?: boolean; contentStyle?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const { colors } = useTheme();
  return (
    <ScrollView
      {...rest}
      style={[{ flex: 1, backgroundColor: colors.background }, rest.style]}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        {
          paddingTop: tab ? insets.top + spacing.lg : spacing.lg,
          paddingHorizontal: GUTTER,
          paddingBottom: tab ? tabSpace : insets.bottom + spacing.xxl,
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
        },
        contentStyle,
      ]}>
      {children}
    </ScrollView>
  );
}

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  stackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: GUTTER,
    paddingBottom: spacing.md,
  },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
