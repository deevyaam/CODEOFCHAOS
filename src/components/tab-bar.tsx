// Floating tab bar: a rounded, blurred pill at the bottom that hides while typing.
// Tab switches are instant; only the bar's hide/show uses a (critically damped) spring.
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { BlurView } from 'expo-blur';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useDiscussUnread } from '@/lib/unread';
import { radius, useTheme } from '@/theme';
import { spring } from '@/theme/motion';

import { TAB_BAR_HEIGHT, useKeyboardVisible, useTabBarBottom } from './layout';
import { Icon, Text, type IconName } from './ui';

export const TABS: { name: string; label: string; icon: IconName; iconOn: IconName }[] = [
  { name: 'index', label: 'Home', icon: 'home-outline', iconOn: 'home' },
  { name: 'map', label: 'Map', icon: 'map-outline', iconOn: 'map' },
  { name: 'reports', label: 'Reports', icon: 'document-text-outline', iconOn: 'document-text' },
  { name: 'discuss', label: 'Discuss', icon: 'chatbubbles-outline', iconOn: 'chatbubbles' },
  { name: 'assistant', label: 'Assistant', icon: 'sparkles-outline', iconOn: 'sparkles' },
  { name: 'alerts', label: 'Alerts', icon: 'notifications-outline', iconOn: 'notifications' },
];

export function FloatingTabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { colors, shadows, scheme } = useTheme();
  const bottom = useTabBarBottom();
  const keyboard = useKeyboardVisible();
  const unread = useDiscussUnread();
  const hidden = useSharedValue(0);

  useEffect(() => {
    hidden.set(withSpring(keyboard ? 1 : 0, spring));
  }, [keyboard, hidden]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: hidden.value * (TAB_BAR_HEIGHT + bottom + 20) }],
    opacity: 1 - hidden.value,
  }));

  return (
    <Animated.View
      pointerEvents={keyboard ? 'none' : 'box-none'}
      style={[styles.wrap, { bottom }, animated]}>
      <View style={[styles.pill, { boxShadow: shadows.float }]}>
        <BlurView
          intensity={Platform.OS === 'android' ? 40 : 60}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBar }]} />
        {state.routes.map((route, index) => {
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;
          const focused = state.index === index;
          const badge = tab.name === 'discuss' && unread > 0 ? unread : 0;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={badge ? `${tab.label}, ${badge} unread` : tab.label}
              onPress={() => {
                if (!focused) navigateToTab(route.key);
              }}
              style={styles.item}>
              <View style={[styles.iconWrap, focused && { backgroundColor: colors.primarySoft }]}>
                <Icon name={focused ? tab.iconOn : tab.icon} size={21} color={focused ? colors.primary : colors.textMuted} />
                {badge > 0 && (
                  <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                    <Text variant="small" color="#fff" style={{ fontSize: 10, lineHeight: 13 }}>
                      {badge > 99 ? '99+' : badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                variant="small"
                numberOfLines={1}
                color={focused ? colors.primary : colors.textMuted}
                style={{ fontSize: 10.5, lineHeight: 13 }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  pill: {
    height: TAB_BAR_HEIGHT,
    width: '100%',
    maxWidth: 520,
    borderRadius: radius.pill,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 56 },
  iconWrap: { width: 44, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -3,
    right: 0,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
