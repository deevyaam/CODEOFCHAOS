import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text as RNText,
  StyleSheet,
  Switch,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { GUTTER, radius, spacing, useTheme, type TypeVariant } from '@/theme';
import { PRESS_SCALE, pressTiming } from '@/theme/motion';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? colors.text} style={style} />;
}

export function Text({
  variant = 'body',
  color,
  muted,
  style,
  ...rest
}: TextProps & { variant?: TypeVariant; color?: string; muted?: boolean }) {
  const { type, colors } = useTheme();
  return (
    <RNText
      {...rest}
      style={[type(variant), { color: color ?? (muted ? colors.textMuted : colors.text) }, style]}
    />
  );
}

/** Pressable with the standard press feedback: scale to 0.97 in 120 ms. */
export function PressableScale({
  children,
  style,
  disabled,
  haptic,
  onPress,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Only for meaningful actions (submit, vote, react) — never for navigation or scroll. */
  haptic?: boolean;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        scale.set(withTiming(PRESS_SCALE, pressTiming));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withTiming(1, pressTiming));
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic && Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(e);
      }}>
      <Animated.View style={[style, animated, disabled && { opacity: 0.5 }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { colors, shadows } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: colors.surface, borderRadius: radius.lg, boxShadow: shadows.card },
        padded && { padding: spacing.lg },
        style,
      ]}>
      {children}
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  haptic,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const bg = {
    primary: colors.primary,
    secondary: colors.primarySoft,
    ghost: 'transparent',
    danger: colors.dangerSoft,
  }[kind];
  const fg = {
    primary: colors.onPrimary,
    secondary: colors.primary,
    ghost: colors.primary,
    danger: colors.danger,
  }[kind];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      haptic={haptic}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={[styles.button, { backgroundColor: bg }, style]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={19} color={fg} />}
          <Text variant="label" color={fg} style={{ fontSize: 15 }}>
            {title}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  color,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: string;
}) {
  const { colors } = useTheme();
  const tint = color ?? colors.primary;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? tint : colors.surfaceMuted },
      ]}>
      {icon && <Icon name={icon} size={16} color={selected ? '#fff' : tint} />}
      <Text variant="label" color={selected ? '#fff' : colors.text}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text variant="headline">{children}</Text>
      {action}
    </View>
  );
}

export function Row({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  onPress,
  danger,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={styles.row}>
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: danger ? colors.dangerSoft : colors.primarySoft }]}>
          <Icon name={icon} size={19} color={iconColor ?? (danger ? colors.danger : colors.primary)} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" color={danger ? colors.danger : undefined} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" muted numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.textFaint} /> : null)}
    </View>
  );
  return onPress ? (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      {content}
    </PressableScale>
  ) : (
    content
  );
}

export function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
  disabled,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Row
      icon={icon}
      title={title}
      subtitle={subtitle}
      right={
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ true: colors.primary, false: colors.surfaceSunken }}
          thumbColor="#fff"
          accessibilityLabel={title}
        />
      }
    />
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginVertical: spacing.xs }} />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surfaceSunken }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[
              styles.segment,
              on && { backgroundColor: colors.surface, boxShadow: shadows.card },
            ]}>
            {o.icon && <Icon name={o.icon} size={16} color={on ? colors.primary : colors.textMuted} />}
            <Text variant="label" color={on ? colors.text : colors.textMuted} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
        <Icon name={icon} size={28} color={colors.primary} />
      </View>
      <Text variant="headline" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text muted style={{ textAlign: 'center' }}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function Notice({ tone = 'info', icon, children }: { tone?: 'info' | 'warning' | 'danger'; icon?: IconName; children: ReactNode }) {
  const { colors } = useTheme();
  const bg = { info: colors.primarySoft, warning: colors.warningSoft, danger: colors.dangerSoft }[tone];
  const fg = { info: colors.primary, warning: colors.warning, danger: colors.danger }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      <Icon name={icon ?? (tone === 'info' ? 'information-circle' : 'warning')} size={20} color={fg} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

export const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 36,
    borderRadius: radius.pill,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 52 },
  rowIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, gap: 4 },
  segment: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: GUTTER },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  notice: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, alignItems: 'flex-start' },
});
