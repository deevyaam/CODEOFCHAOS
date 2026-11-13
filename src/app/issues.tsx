// "Issues to handle": open reports for verified authorities and moderators, most-confirmed first.
import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Page, Screen, StackHeader } from '@/components/layout';
import { ReportCard } from '@/components/report-card';
import { Chip, Empty, Segmented } from '@/components/ui';
import { CATEGORIES, useReports, type Category, type Status } from '@/lib/reports';
import { useSession } from '@/lib/session';
import { useVotes } from '@/lib/votes';
import { GUTTER, spacing, useTheme } from '@/theme';

export default function Issues() {
  const { isStaff, user, roles } = useSession();
  const { colors } = useTheme();
  const [status, setStatus] = useState<Status>('reported');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const { reports, loading } = useReports({ status, category, sort: 'confirmed' }, user?.id);
  const { voted, toggle, canVote } = useVotes(reports);

  if (!isStaff) {
    return (
      <Screen>
        <StackHeader title="Issues to handle" />
        <Empty icon="lock-closed-outline" title="For verified authorities and moderators" />
      </Screen>
    );
  }

  return (
    <Screen>
      <StackHeader title={roles.authority_name ? `Issues · ${roles.authority_name}` : 'Issues to handle'} />
      <Page tab={false}>
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'reported', label: 'New' },
            { value: 'sent', label: 'Sent' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'fixed', label: 'Fixed' },
          ]}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER, marginVertical: spacing.md }} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: GUTTER }}>
          <Chip label="All types" selected={category === 'all'} onPress={() => setCategory('all')} />
          {CATEGORIES.map((c) => (
            <Chip key={c.value} label={c.label} icon={c.icon} color={c.color} selected={category === c.value} onPress={() => setCategory(c.value)} />
          ))}
        </ScrollView>
        <View style={{ gap: spacing.md }}>
          {loading && <ActivityIndicator color={colors.primary} />}
          {!loading && reports.length === 0 && <Empty icon="checkmark-done-outline" title="Nothing here" body="No reports with this status." />}
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} voted={voted.has(r.id)} canVote={canVote} onVote={() => toggle(r.id)} />
          ))}
        </View>
      </Page>
    </Screen>
  );
}
