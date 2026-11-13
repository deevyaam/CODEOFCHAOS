import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Page } from '@/components/layout';
import { Sheet } from '@/components/sheet';
import { Card, Divider, Icon, Notice, PressableScale, Row, Segmented, SectionTitle, Text, type IconName } from '@/components/ui';
import { WeatherCard } from '@/components/weather-card';
import { listAccounts, switchTo, type SavedAccount } from '@/lib/accounts';
import { setPref, usePref, type Appearance } from '@/lib/prefs';
import { displayName, useSession } from '@/lib/session';
import { radius, spacing, useTheme } from '@/theme';

type Feature = { title: string; subtitle: string; icon: IconName; href: Href; guestOk?: boolean; show?: boolean };

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const { user, profile, isGuest, roles, isStaff } = useSession();
  const layout = usePref('homeLayout');
  const [menu, setMenu] = useState(false);
  const name = displayName(profile, user);

  const sections: { title: string; items: Feature[] }[] = [
    {
      title: 'Your work',
      items: [
        { title: 'Report a problem', subtitle: 'Something wrong near you? Tell people here', icon: 'add-circle', href: '/report/new' },
        { title: 'My reports', subtitle: 'Follow what happens to them', icon: 'folder-open', href: { pathname: '/reports', params: { mine: '1' } } },
        { title: 'Issues to handle', subtitle: 'Reports for your authority', icon: 'briefcase', href: '/issues', show: isStaff },
      ],
    },
    {
      title: 'Stay informed',
      items: [
        { title: 'Map', subtitle: 'Reports around you', icon: 'map', href: '/map', guestOk: true },
        { title: 'Alerts', subtitle: 'Choose your area and notifications', icon: 'notifications', href: '/alerts', guestOk: true },
        { title: 'Assistant', subtitle: 'Ask about the app or what to do', icon: 'sparkles', href: '/assistant', guestOk: true },
      ],
    },
    {
      title: 'Community',
      items: [
        { title: 'Discuss', subtitle: 'Talk with members', icon: 'chatbubbles', href: '/discuss' },
        { title: 'All reports', subtitle: 'Browse, search and say “me too”', icon: 'document-text', href: '/reports', guestOk: true },
        { title: 'Moderation', subtitle: 'Flagged posts', icon: 'shield-half', href: '/moderation', show: roles.is_moderator || roles.is_admin },
        { title: 'People & roles', subtitle: 'Make moderators and authorities, pause posting', icon: 'people', href: '/people', show: roles.is_moderator || roles.is_admin },
      ],
    },
    {
      title: 'Account',
      items: [
        { title: 'My account', subtitle: 'Profile, photo and sign-out', icon: 'person-circle', href: '/account', guestOk: true },
        { title: 'Settings', subtitle: 'Appearance, privacy and security', icon: 'settings', href: '/settings', guestOk: true },
        { title: 'Privacy and legal', subtitle: 'Privacy policy, terms, legal notice', icon: 'document-lock', href: '/legal/privacy', guestOk: true },
      ],
    },
  ];

  return (
    <Page>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="caption" muted>{greeting()}</Text>
          <Text variant="title" numberOfLines={1} accessibilityRole="header">{name}</Text>
        </View>
        <PressableScale onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel="Account menu">
          <Avatar profile={profile} name={name} size={44} />
        </PressableScale>
      </View>

      {isGuest && (
        <View style={{ marginBottom: spacing.lg }}>
          <Notice icon="eye-outline">
            <Text variant="label">You’re browsing as a guest</Text>
            <Text variant="caption" muted>Sign in to post reports, comment, react and join the Discussion.</Text>
          </Notice>
        </View>
      )}

      <WeatherCard />

      <View style={styles.layoutSwitch}>
        <Text variant="label" muted>Features</Text>
        <View style={{ width: 150 }}>
          <Segmented
            value={layout}
            onChange={(v) => setPref('homeLayout', v)}
            options={[
              { value: 'list', label: 'List', icon: 'list' },
              { value: 'grid', label: 'Grid', icon: 'grid' },
            ]}
          />
        </View>
      </View>

      {sections.map((s) => {
        const items = s.items.filter((i) => i.show !== false && (!isGuest || i.guestOk));
        if (!items.length) return null;
        return (
          <View key={s.title}>
            <SectionTitle>{s.title}</SectionTitle>
            {layout === 'list' ? (
              <Card style={{ paddingVertical: spacing.xs }}>
                {items.map((f, i) => (
                  <View key={f.title}>
                    {i > 0 && <Divider />}
                    <Row icon={f.icon} title={f.title} subtitle={f.subtitle} onPress={() => router.push(f.href)} />
                  </View>
                ))}
              </Card>
            ) : (
              <View style={styles.grid}>
                {items.map((f) => (
                  <GridTile key={f.title} feature={f} />
                ))}
              </View>
            )}
          </View>
        );
      })}

      <AccountMenu visible={menu} onClose={() => setMenu(false)} />
    </Page>
  );
}

function GridTile({ feature }: { feature: Feature }) {
  const { colors, shadows } = useTheme();
  return (
    <PressableScale
      onPress={() => router.push(feature.href)}
      accessibilityRole="button"
      accessibilityLabel={feature.title}
      style={[styles.tile, { backgroundColor: colors.surface, boxShadow: shadows.card }]}>
      <View style={[styles.tileIcon, { backgroundColor: colors.primarySoft }]}>
        <Icon name={feature.icon} size={24} color={colors.primary} />
      </View>
      <Text variant="label" numberOfLines={2} style={{ textAlign: 'center' }}>{feature.title}</Text>
    </PressableScale>
  );
}

function AccountMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user, profile, signOut } = useSession();
  const { colors } = useTheme();
  const appearance = usePref('appearance');
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (visible) listAccounts().then(setAccounts);
  }, [visible]);

  const go = (href: Href) => {
    onClose();
    router.push(href);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Account">
      {accounts.length > 0 && (
        <>
          <Text variant="label" muted style={{ marginBottom: spacing.xs }}>Switch account</Text>
          {accounts.map((a) => {
            const current = a.userId === user?.id;
            return (
              <Row
                key={a.userId}
                icon="person-circle-outline"
                title={a.name || a.email}
                subtitle={a.name ? a.email : undefined}
                right={current ? <Icon name="checkmark-circle" color={colors.primary} /> : undefined}
                onPress={
                  current
                    ? undefined
                    : async () => {
                        const ok = await switchTo(a.userId);
                        if (ok) onClose();
                        else {
                          setNote('That sign-in has expired. Sign in to that account again.');
                          setAccounts(await listAccounts());
                        }
                      }
                }
              />
            );
          })}
          <Row icon="add" title="Add another account" onPress={async () => { onClose(); await signOut(); }} />
          {note && <Text variant="caption" color={colors.danger}>{note}</Text>}
          <Divider />
        </>
      )}
      <Row icon="notifications-outline" title="Notifications" onPress={() => go('/alerts')} />
      <Row icon="settings-outline" title="Settings" onPress={() => go('/settings')} />
      <Row icon="person-outline" title="My account" onPress={() => go('/account')} />
      <Text variant="label" muted style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>Appearance</Text>
      <Segmented<Appearance>
        value={appearance}
        onChange={(v) => setPref('appearance', v)}
        options={[
          { value: 'light', label: 'Light', icon: 'sunny-outline' },
          { value: 'dark', label: 'Dark', icon: 'moon-outline' },
          { value: 'device', label: 'Device', icon: 'phone-portrait-outline' },
        ]}
      />
      <Divider />
      <Row
        icon="log-out-outline"
        title={profile || user ? 'Sign out' : 'Leave'}
        danger
        onPress={async () => {
          onClose();
          await signOut();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  layoutSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexBasis: '30%',
    flexGrow: 1,
    maxWidth: '32%',
    minWidth: 96,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 104,
    justifyContent: 'center',
  },
  tileIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
