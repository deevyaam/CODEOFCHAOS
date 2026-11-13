import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { categoryInfo, mediaUrl, pinOf, statusInfo, timeAgo, type Report, type Status } from '@/lib/reports';
import { daysOpen, isOverdue } from '@/lib/safety';
import { radius, spacing, useTheme } from '@/theme';
import { PRESS_SCALE, pressTiming } from '@/theme/motion';

import { Icon, PressableScale, Text } from './ui';

export function StatusPill({ status }: { status: Status }) {
  const { colors } = useTheme();
  const info = statusInfo(status);
  const tone = {
    reported: [colors.warningSoft, colors.warning],
    sent: [colors.primarySoft, colors.primary],
    in_progress: [colors.primarySoft, colors.primary],
    fixed: [colors.successSoft, colors.success],
  }[status];
  return (
    <View style={[styles.pill, { backgroundColor: tone[0] }]}>
      <Icon name={info.icon} size={13} color={tone[1]} />
      <Text variant="small" color={tone[1]} style={{ fontWeight: '600' }}>{info.label}</Text>
    </View>
  );
}

export function MeTooButton({
  count,
  on,
  disabled,
  onPress,
}: {
  count: number;
  on: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`Me too. Reported by ${count} ${count === 1 ? 'person' : 'people'}`}
      style={[styles.meToo, { backgroundColor: on ? colors.primary : colors.primarySoft }]}>
      <Icon name={on ? 'hand-left' : 'hand-left-outline'} size={16} color={on ? colors.onPrimary : colors.primary} />
      <Text variant="label" color={on ? colors.onPrimary : colors.primary}>
        Me too · {count}
      </Text>
    </PressableScale>
  );
}

export function ReportCard({
  report,
  voted,
  canVote,
  onVote,
  distance,
}: {
  report: Report;
  voted: boolean;
  canVote: boolean;
  onVote: () => void;
  distance?: string;
}) {
  const { colors, shadows } = useTheme();
  const cat = categoryInfo(report.category);
  const pin = pinOf(report);
  const thumb = report.media.find((m) => m.type === 'image');
  const scale = useSharedValue(1);
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // The whole card opens the report through a full-size Pressable *behind* the content, with "Me too" as a
  // sibling on top. Nesting the Me too button inside the card's button is invalid HTML on web (<button> in <button>).
  return (
    <Animated.View style={[styles.card, { backgroundColor: colors.surface, boxShadow: shadows.card }, pressed]}>
      <Pressable
        onPress={() => router.push({ pathname: '/report/[id]', params: { id: report.id } })}
        onPressIn={() => scale.set(withTiming(PRESS_SCALE, pressTiming))}
        onPressOut={() => scale.set(withTiming(1, pressTiming))}
        accessibilityRole="button"
        accessibilityLabel={`${cat.label} report, ${pin.label}: ${report.title}`}
        style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
      />
      <View style={[styles.top, styles.passThrough]}>
        <View style={[styles.catIcon, { backgroundColor: pin.color }]}>
          <Icon name={pin.icon} size={18} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={2}>{report.title}</Text>
          <Text variant="caption" muted numberOfLines={1}>
            {[cat.label, report.town ?? report.place_name, distance, timeAgo(report.created_at)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {thumb && <Image source={{ uri: mediaUrl(thumb) }} style={styles.thumb} contentFit="cover" accessibilityIgnoresInvertColors />}
      </View>
      {report.description ? (
        <Text variant="caption" muted numberOfLines={2} style={styles.passThrough}>{report.description}</Text>
      ) : null}
      <View style={[styles.bottom, styles.boxNone]}>
        <View style={[styles.meta, styles.passThrough]}>
          <StatusPill status={report.status} />
          {isOverdue(report) && (
            <View style={[styles.pill, { backgroundColor: colors.dangerSoft }]} accessibilityLabel={`Open for ${daysOpen(report)} days`}>
              <Icon name="time-outline" size={13} color={colors.danger} />
              <Text variant="small" color={colors.danger} style={{ fontWeight: '600' }}>Open {daysOpen(report)} days</Text>
            </View>
          )}
        </View>
        <View style={[styles.meta, styles.boxNone]}>
          {report.comment_count > 0 && (
            <View style={styles.metaItem}>
              <Icon name="chatbubble-outline" size={14} color={colors.textMuted} />
              <Text variant="small" muted>{report.comment_count}</Text>
            </View>
          )}
          <MeTooButton count={report.me_too_count} on={voted} disabled={!canVote} onPress={onVote} />
        </View>
      </View>
      {report.hidden && (
        <Text variant="small" color={colors.danger} style={styles.passThrough}>Hidden by a moderator — only you and moderators can see it.</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  // Content lets taps fall through to the card's Pressable; only Me too stays tappable.
  passThrough: { pointerEvents: 'none' },
  boxNone: { pointerEvents: 'box-none' },
  top: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  catIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 56, height: 56, borderRadius: radius.sm },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 26, borderRadius: radius.pill },
  meToo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 34, borderRadius: radius.pill },
});
