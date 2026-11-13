import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader, useTabBarSpace } from '@/components/layout';
import { ReportCard } from '@/components/report-card';
import { NoTabSwipe } from '@/components/tab-swipe';
import { Chip, Empty, Icon, Notice, PressableScale, Segmented, Text } from '@/components/ui';
import { CATEGORIES, STATUSES, useReports, type Category, type Status } from '@/lib/reports';
import { useSession } from '@/lib/session';
import { useVotes } from '@/lib/votes';
import { GUTTER, radius, spacing, useTheme } from '@/theme';

export default function Reports() {
  const params = useLocalSearchParams<{ mine?: string }>();
  const { user, isGuest } = useSession();
  const { colors, type, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  // "Mine" follows the link (?mine=1) until the person toggles it here.
  const [mineToggle, setMineToggle] = useState<{ param?: string; on: boolean } | null>(null);
  const mine = mineToggle && mineToggle.param === params.mine ? mineToggle.on : params.mine === '1';
  const setMine = (f: (m: boolean) => boolean) => setMineToggle({ param: params.mine, on: f(mine) });
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [status, setStatus] = useState<Status | 'open' | 'all'>('all');
  const [sort, setSort] = useState<'newest' | 'confirmed'>('newest');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { reports, loading, error, reload } = useReports({ category, status, sort, search, mine }, user?.id);
  const { voted, toggle, canVote } = useVotes(reports);
  const [refreshing, setRefreshing] = useState(false);

  const header = (
    <View>
      <PageHeader
        title={mine ? 'My reports' : 'Reports'}
        subtitle={mine ? 'Reports you posted, including anonymous ones' : 'Problems people have reported'}
      />
      <View style={[styles.search, { backgroundColor: colors.surface, boxShadow: shadows.card }]}>
        <Icon name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search reports, towns, places"
          placeholderTextColor={colors.textFaint}
          style={[type('body'), { flex: 1, color: colors.text, minHeight: 46 }]}
          returnKeyType="search"
          accessibilityLabel="Search reports"
        />
        {query ? (
          <PressableScale onPress={() => setQuery('')} accessibilityLabel="Clear search" accessibilityRole="button">
            <Icon name="close-circle" size={18} color={colors.textFaint} />
          </PressableScale>
        ) : null}
      </View>

      <NoTabSwipe>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ marginHorizontal: -GUTTER }}>
          {!isGuest && <Chip label="Mine" icon="person" selected={mine} onPress={() => setMine((m) => !m)} />}
          <Chip label="All types" selected={category === 'all'} onPress={() => setCategory('all')} />
          {CATEGORIES.map((c) => (
            <Chip key={c.value} label={c.label} icon={c.icon} color={c.color} selected={category === c.value} onPress={() => setCategory(c.value)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ marginHorizontal: -GUTTER }}>
          <Chip label="Any status" selected={status === 'all'} onPress={() => setStatus('all')} />
          <Chip label="Open" selected={status === 'open'} onPress={() => setStatus('open')} />
          {STATUSES.map((s) => (
            <Chip key={s.value} label={s.label} icon={s.icon} selected={status === s.value} onPress={() => setStatus(s.value)} />
          ))}
        </ScrollView>
      </NoTabSwipe>

      <View style={{ marginTop: spacing.sm, marginBottom: spacing.lg }}>
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: 'newest', label: 'Newest', icon: 'time-outline' },
            { value: 'confirmed', label: 'Most confirmed', icon: 'hand-left-outline' },
          ]}
        />
      </View>
      {error && (
        <View style={{ marginBottom: spacing.lg }}>
          <Notice tone="danger"><Text>{error}</Text></Notice>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={reports}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: GUTTER,
          paddingBottom: tabSpace + 64,
          gap: spacing.md,
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={async () => {
              setRefreshing(true);
              await reload();
              setRefreshing(false);
            }}
          />
        }
        renderItem={({ item }) => (
          <ReportCard report={item} voted={voted.has(item.id)} canVote={canVote} onVote={() => toggle(item.id)} />
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
          ) : (
            <Empty
              icon={mine ? 'folder-open-outline' : 'document-text-outline'}
              title={mine ? 'You haven’t posted a report yet' : 'No reports match'}
              body={mine ? 'When you report a problem, you can follow it here.' : 'Try another filter or search.'}
            />
          )
        }
      />
      {!isGuest && (
        <PressableScale
          onPress={() => router.push('/report/new')}
          accessibilityRole="button"
          accessibilityLabel="Report a problem"
          style={[styles.fab, { bottom: tabSpace - spacing.sm, backgroundColor: colors.primary, boxShadow: shadows.float }]}>
          <Icon name="add" size={22} color={colors.onPrimary} />
          <Text variant="label" color={colors.onPrimary}>Report</Text>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.pill, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  chips: { gap: spacing.sm, paddingHorizontal: GUTTER, paddingVertical: spacing.xs },
  fab: {
    position: 'absolute',
    right: GUTTER,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 18,
    height: 52,
    borderRadius: radius.pill,
  },
});
