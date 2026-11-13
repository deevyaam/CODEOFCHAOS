// Role and status badges for a person (Admin, Moderator, Authority, Paused, Member).
import { StyleSheet, View } from 'react-native';

import { isLimited, type Person } from '@/lib/people';
import { radius, spacing, useTheme } from '@/theme';

import { Text } from './ui';

export function badgeText(p: Person) {
  const out: string[] = [];
  if (p.is_admin) out.push('Admin');
  if (p.is_moderator) out.push('Moderator');
  if (p.authority_verified) out.push(`Authority: ${p.authority_name ?? ''}`);
  if (isLimited(p)) out.push('Paused');
  return out;
}

export function Badges({ person }: { person: Person }) {
  const { colors } = useTheme();
  const items: { label: string; fg: string; bg: string }[] = [];
  if (person.is_admin) items.push({ label: 'Admin', fg: colors.moderator, bg: colors.moderatorSoft });
  if (person.is_moderator) items.push({ label: 'Moderator', fg: colors.moderator, bg: colors.moderatorSoft });
  if (person.authority_verified) items.push({ label: person.authority_name || 'Authority', fg: colors.authority, bg: colors.authoritySoft });
  if (isLimited(person)) items.push({ label: 'Paused', fg: colors.warning, bg: colors.warningSoft });
  if (!items.length) items.push({ label: 'Member', fg: colors.textMuted, bg: colors.surfaceMuted });
  return (
    <View style={styles.badges}>
      {items.map((b) => (
        <View key={b.label} style={[styles.badge, { backgroundColor: b.bg }]}>
          <Text variant="small" color={b.fg} numberOfLines={1} style={{ fontWeight: '600' }}>{b.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  badge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, maxWidth: 220 },
});
