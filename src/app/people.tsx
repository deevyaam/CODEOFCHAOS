import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Badges, badgeText } from '@/components/person-badges';
import { Page, Screen, StackHeader } from '@/components/layout';
import { Card, Empty, Icon, Notice, PressableScale, Segmented, Text } from '@/components/ui';
import { fetchPeople, type PeopleFilter, type Person } from '@/lib/people';
import { useSession } from '@/lib/session';
import { radius, spacing, useTheme } from '@/theme';

export default function People() {
  const { roles, user } = useSession();
  const { colors, type } = useTheme();
  const allowed = roles.is_moderator || roles.is_admin;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PeopleFilter>('all');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    // Wait for typing to pause before searching.
    const t = setTimeout(() => {
      fetchPeople(search, filter)
        .then((p) => alive && (setPeople(p), setError(null)))
        .catch((e: Error) => alive && setError(e.message));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [allowed, search, filter]);

  if (!allowed) {
    return (
      <Screen>
        <StackHeader title="People & roles" />
        <Empty icon="lock-closed-outline" title="Moderators only" />
      </Screen>
    );
  }

  return (
    <Screen>
      <StackHeader title="People & roles" />
      <Page tab={false}>
        <Text muted style={{ marginBottom: spacing.lg }}>
          Tap a person to make them a moderator or an authority, or to pause what they can post.
        </Text>
        <View style={[styles.search, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name"
            placeholderTextColor={colors.textFaint}
            style={[type('body'), { flex: 1, color: colors.text, minHeight: 48 }]}
            autoCapitalize="words"
            accessibilityLabel="Search people by name"
          />
          {!!search && (
            <PressableScale onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clear}>
              <Icon name="close-circle" size={18} color={colors.textFaint} />
            </PressableScale>
          )}
        </View>
        <View style={{ marginTop: spacing.md }}>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'staff', label: 'Staff' },
              { value: 'limited', label: 'Paused' },
            ]}
          />
        </View>

        {error && <View style={{ marginTop: spacing.lg }}><Notice tone="danger"><Text>{error}</Text></Notice></View>}

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          {people === null && !error && <ActivityIndicator color={colors.primary} />}
          {people?.length === 0 && (
            <Empty
              icon="people-outline"
              title={search ? 'Nobody with that name' : filter === 'limited' ? 'Nobody is paused' : 'Nobody here yet'}
              body={search ? 'Check the spelling, or try part of the name.' : undefined}
            />
          )}
          {people?.map((p) => {
            const name = p.full_name?.trim() || 'Member without a name';
            const me = p.id === user?.id;
            return (
              <PressableScale
                key={p.id}
                onPress={() => router.push({ pathname: '/people/[id]', params: { id: p.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${name}${me ? ', you' : ''}. ${badgeText(p).join(', ') || 'Member'}`}>
                <Card style={styles.row}>
                  <Avatar profile={p} name={name} size={44} />
                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {name}{me ? <Text muted> (you)</Text> : null}
                    </Text>
                    <Badges person={p} />
                  </View>
                  <Icon name="chevron-forward" size={18} color={colors.textFaint} />
                </Card>
              </PressableScale>
            );
          })}
        </View>
      </Page>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, paddingLeft: spacing.lg, paddingRight: spacing.xs },
  clear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
