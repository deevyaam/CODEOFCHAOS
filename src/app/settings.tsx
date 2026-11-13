import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { authenticate } from '@/components/app-lock';
import { EmojiPicker } from '@/components/community';
import { Page, Screen, StackHeader } from '@/components/layout';
import { Card, Divider, Notice, PressableScale, Row, Segmented, SectionTitle, Text, ToggleRow } from '@/components/ui';
import { APP_NAME, APP_VERSION, CONTACT_EMAIL, isPlaceholder } from '@/config';
import { DEFAULT_QUICK_REACTIONS } from '@/lib/discussion';
import { setPref, usePrefs, type Appearance } from '@/lib/prefs';
import { useSession } from '@/lib/session';
import { radius, spacing, useTheme } from '@/theme';

export default function Settings() {
  const prefs = usePrefs();
  const { isGuest } = useSession();
  const { colors } = useTheme();
  const [slot, setSlot] = useState<number | null>(null);
  const native = Platform.OS !== 'web';
  const emailReady = !isPlaceholder(CONTACT_EMAIL);

  const mail = (subject: string) =>
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME}: ${subject}`)}&body=${encodeURIComponent(`\n\n—\nApp version ${APP_VERSION} · ${Platform.OS}`)}`);

  return (
    <Screen>
      <StackHeader title="Settings" />
      <Page tab={false}>
        <SectionTitle>Appearance</SectionTitle>
        <Card style={{ gap: spacing.md }}>
          <Segmented<Appearance>
            value={prefs.appearance}
            onChange={(v) => setPref('appearance', v)}
            options={[
              { value: 'light', label: 'Light', icon: 'sunny-outline' },
              { value: 'dark', label: 'Dark', icon: 'moon-outline' },
              { value: 'device', label: 'Device', icon: 'phone-portrait-outline' },
            ]}
          />
          <Text variant="label" muted>Font</Text>
          <Segmented
            value={prefs.font}
            onChange={(v) => setPref('font', v)}
            options={[
              { value: 'google-sans', label: 'Google Sans' },
              { value: 'system', label: 'Phone font' },
            ]}
          />
        </Card>

        <SectionTitle>Weather</SectionTitle>
        <Card style={{ gap: spacing.md }}>
          <Segmented
            value={prefs.weatherStyle}
            onChange={(v) => setPref('weatherStyle', v)}
            options={[
              { value: 'dynamic', label: 'Dynamic' },
              { value: 'static', label: 'Static' },
            ]}
          />
          <Text variant="small" muted>Dynamic animates clouds, rain, waves and the palm. With Reduce Motion on, the scene is always still.</Text>
          <Row icon="location-outline" title="Weather place" subtitle={prefs.weatherTown === 'my-location' ? 'My location' : prefs.weatherTown} onPress={() => router.back()} />
        </Card>

        <SectionTitle>Alerts and notifications</SectionTitle>
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <Row
            icon="notifications-outline"
            title="Alert area and push notifications"
            subtitle={prefs.alertArea.mode === 'town' ? prefs.alertArea.town : prefs.alertArea.mode === 'near' ? `Within ${prefs.alertArea.km} km of me` : 'Everywhere'}
            onPress={() => router.push('/alerts')}
          />
        </Card>

        {!isGuest && (
          <>
            <SectionTitle>Posting</SectionTitle>
            <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
              <ToggleRow
                icon="eye-off-outline"
                title="Post reports anonymously by default"
                subtitle="You can still change it on each report"
                value={prefs.anonymousDefault}
                onChange={(v) => setPref('anonymousDefault', v)}
              />
            </Card>

            <SectionTitle action={<PressableScale onPress={() => setPref('quickReactions', DEFAULT_QUICK_REACTIONS)} accessibilityRole="button"><Text variant="label" color={colors.primary}>Reset</Text></PressableScale>}>
              Quick reactions
            </SectionTitle>
            <Card style={{ gap: spacing.sm }}>
              <Text variant="caption" muted>The six reactions shown first. Tap one to change it.</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                {prefs.quickReactions.map((e, i) => (
                  <PressableScale
                    key={`${e}-${i}`}
                    onPress={() => setSlot(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`Quick reaction ${i + 1}: ${e}. Change`}
                    style={{ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 24, lineHeight: 30 }}>{e}</Text>
                  </PressableScale>
                ))}
              </View>
            </Card>
          </>
        )}

        <SectionTitle>Security</SectionTitle>
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <ToggleRow
            icon="finger-print"
            title="App lock"
            subtitle={native ? 'Ask for fingerprint, face or passcode when opening the app' : 'Available in the phone app'}
            value={prefs.appLock}
            disabled={!native}
            onChange={async (v) => {
              if (v && !(await authenticate('Turn on app lock'))) return;
              setPref('appLock', v);
            }}
          />
          <ToggleRow
            icon="shield-checkmark-outline"
            title="Approve important actions"
            subtitle="Confirm with biometrics before changing a status or deleting"
            value={prefs.approveImportant}
            disabled={!native}
            onChange={async (v) => {
              if (!(await authenticate('Change security setting'))) return;
              setPref('approveImportant', v);
            }}
          />
          {!isGuest && (
            <>
              <Divider />
              <Row icon="ban" title="Blocked people" onPress={() => router.push('/blocked')} />
            </>
          )}
        </Card>

        <SectionTitle>About and support</SectionTitle>
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <Row icon="information-circle-outline" title={APP_NAME} subtitle={`Version ${APP_VERSION}`} />
          <Divider />
          <Row icon="bug-outline" title="Report a problem" subtitle={emailReady ? CONTACT_EMAIL : 'Support email not set yet'} onPress={emailReady ? () => mail('Problem report') : undefined} />
          <Row icon="mail-outline" title="Contact us" onPress={emailReady ? () => mail('Hello') : undefined} subtitle={emailReady ? undefined : 'Support email not set yet'} />
          <Divider />
          <Row icon="document-lock-outline" title="Privacy policy" onPress={() => router.push('/legal/privacy')} />
          <Row icon="document-text-outline" title="Terms" onPress={() => router.push('/legal/terms')} />
          <Row icon="business-outline" title="Legal notice" onPress={() => router.push('/legal/legal')} />
          <Row icon="trash-bin-outline" title="Delete your data" onPress={() => router.push('/legal/delete-data')} />
        </Card>
        {!emailReady && (
          <View style={{ marginTop: spacing.lg }}>
            <Notice tone="warning"><Text variant="caption">The support email is still a placeholder (src/config.ts).</Text></Notice>
          </View>
        )}
      </Page>

      <EmojiPicker
        visible={slot !== null}
        title="Choose a quick reaction"
        current={slot !== null ? prefs.quickReactions[slot] : null}
        onClose={() => setSlot(null)}
        onPick={(e) => {
          if (slot === null) return;
          const next = [...prefs.quickReactions];
          const existing = next.indexOf(e);
          if (existing >= 0) next[existing] = next[slot]; // swap, so there are no duplicates
          next[slot] = e;
          setPref('quickReactions', next);
          setSlot(null);
        }}
      />
    </Screen>
  );
}
