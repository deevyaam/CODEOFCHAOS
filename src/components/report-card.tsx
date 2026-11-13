import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { categoryInfo, mediaUrl, statusInfo, timeAgo, type Report, type Status } from '@/lib/reports';
import { radius, spacing, useTheme } from '@/theme';

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
  const thumb = report.media.find((m) => m.type === 'image');
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/report/[id]', params: { id: report.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${cat.label} report: ${report.title}`}
      style={[styles.card, { backgroundColor: colors.surface, boxShadow: shadows.card }]}>
      <View style={styles.top}>
        <View style={[styles.catIcon, { backgroundColor: cat.color }]}>
          <Icon name={cat.icon} size={18} color="#fff" />
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
        <Text variant="caption" muted numberOfLines={2}>{report.description}</Text>
      ) : null}
      <View style={styles.bottom}>
        <StatusPill status={report.status} />
        <View style={styles.meta}>
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
        <Text variant="small" color={colors.danger}>Hidden by a moderator — only you and moderators can see it.</Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  top: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  catIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 56, height: 56, borderRadius: radius.sm },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 26, borderRadius: radius.pill },
  meToo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 34, borderRadius: radius.pill },
});
