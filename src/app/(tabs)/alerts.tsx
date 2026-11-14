import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { Page, PageHeader } from '@/components/layout';
import { Sheet } from '@/components/sheet';
import { Button, Card, Chip, Divider, Icon, Notice, Row, Segmented, SectionTitle, Text, ToggleRow } from '@/components/ui';
import { TOWNS } from '@/lib/places';
import { setPref, usePrefs, type AlertArea } from '@/lib/prefs';
import { PUSH_REASON_TEXT, getPushToken, pushSupport, removePushToken, savePushToken } from '@/lib/push';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { getPositionWithTimeout } from '@/lib/weather';
import { spacing, useTheme } from '@/theme';

const DISTANCES = [2, 5, 10, 20];

export default function Alerts() {
  const prefs = usePrefs();
  const { isGuest } = useSession();
  const { colors } = useTheme();
  const support = pushSupport();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger' | 'warning'; text: string } | null>(null);
  const [townPicker, setTownPicker] = useState(false);

  useEffect(() => {
    if (!isGuest && support.ok) getPushToken(false).then(setToken).catch(() => {});
  }, [isGuest, support.ok]);

  const sync = useCallback(
    async (area: AlertArea, t = token) => {
      if (!t) return;
      const near = area.mode === 'near' ? await getPositionWithTimeout() : null;
      const p = { ...prefs, alertArea: area };
      const { error } = await savePushToken(t, p, near);
      if (error) setMessage({ tone: 'danger', text: error.message });
      else if (area.mode === 'near' && !near) setMessage({ tone: 'warning', text: 'Couldn’t get your location, so “near me” alerts can’t be matched yet.' });
    },
    [prefs, token],
  );

  const setArea = (area: AlertArea) => {
    setPref('alertArea', area);
    sync(area);
  };

  const togglePush = async (on: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      if (on) {
        const t = await getPushToken(true);
        if (!t) {
          setMessage({ tone: 'warning', text: 'Notifications are turned off for this app in your phone settings.' });
        } else {
          setToken(t);
          await sync(prefs.alertArea, t);
        }
      } else if (token) {
        await removePushToken(token);
        setToken(null);
      }
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setMessage(null);
    if (token) {
      const { error } = await supabase.rpc('send_test_push');
      setMessage(error ? { tone: 'danger', text: error.message } : { tone: 'info', text: 'Test sent. It should arrive in a few seconds.' });
    } else if (Platform.OS !== 'web') {
      // Local notification: checks this phone can show notifications, without the server.
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return setMessage({ tone: 'warning', text: 'Allow notifications in your phone settings first.' });
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Test notification', body: 'This phone can show notifications.', data: { url: '/alerts' } },
        trigger: null,
      });
      setMessage({ tone: 'info', text: 'Local test shown. Turn on push notifications to get alerts from the community.' });
    }
  };

  const area = prefs.alertArea;

  return (
    <Page>
      <PageHeader title="Alerts" subtitle="Hear about new reports where it matters to you" />

      <SectionTitle>Alert area</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        <Segmented
          value={area.mode}
          onChange={(m) =>
            setArea(m === 'everywhere' ? { mode: 'everywhere' } : m === 'town' ? { mode: 'town', town: area.mode === 'town' ? area.town : TOWNS[0].name } : { mode: 'near', km: area.mode === 'near' ? area.km : 5 })
          }
          options={[
            { value: 'everywhere', label: 'Everywhere' },
            { value: 'town', label: 'A town' },
            { value: 'near', label: 'Near me' },
          ]}
        />
        {area.mode === 'town' && <Row icon="business-outline" title={area.town} subtitle="Change town" onPress={() => setTownPicker(true)} />}
        {area.mode === 'near' && (
          <View style={{ gap: spacing.sm }}>
            <Text variant="label" muted>Within</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {DISTANCES.map((d) => (
                <Chip key={d} label={`${d} km`} selected={area.km === d} onPress={() => setArea({ mode: 'near', km: d })} />
              ))}
            </View>
            <Text variant="small" muted>Your position is saved with this phone’s alert settings only, and updated when you change them.</Text>
          </View>
        )}
      </Card>

      <SectionTitle>Push notifications</SectionTitle>
      <Card style={{ gap: spacing.xs }}>
        {isGuest ? (
          <Notice icon="lock-closed-outline"><Text>Sign in to get push notifications.</Text></Notice>
        ) : !support.ok ? (
          <Notice tone="warning"><Text>{PUSH_REASON_TEXT[support.reason]}</Text></Notice>
        ) : (
          <>
            <ToggleRow icon="notifications-outline" title="Push notifications on this phone" value={!!token} onChange={togglePush} disabled={busy} />
            <Divider />
            <ToggleRow
              icon="document-text-outline"
              title="Updates on my reports"
              subtitle="Status changes and new comments"
              value={prefs.notifyMyReports}
              onChange={(v) => {
                setPref('notifyMyReports', v);
                if (token) savePushToken(token, { ...prefs, notifyMyReports: v });
              }}
            />
            <ToggleRow
              icon="hand-left-outline"
              title="Updates on reports I said “me too” to"
              value={prefs.notifyMeToo}
              onChange={(v) => {
                setPref('notifyMeToo', v);
                if (token) savePushToken(token, { ...prefs, notifyMeToo: v });
              }}
            />
            <ToggleRow
              icon="chatbubbles-outline"
              title="New messages in Discuss"
              subtitle="At most one every 10 minutes"
              value={prefs.notifyDiscussion}
              onChange={(v) => {
                setPref('notifyDiscussion', v);
                if (token) savePushToken(token, { ...prefs, notifyDiscussion: v });
              }}
            />
          </>
        )}
      </Card>

      {!isGuest && Platform.OS !== 'web' && (
        <Button kind="secondary" icon="paper-plane-outline" title="Send a test notification" onPress={test} style={{ marginTop: spacing.lg }} />
      )}
      {message && (
        <View style={{ marginTop: spacing.lg }}>
          <Notice tone={message.tone}><Text>{message.text}</Text></Notice>
        </View>
      )}

      <Sheet visible={townPicker} onClose={() => setTownPicker(false)} title="Alert town">
        {TOWNS.map((t) => (
          <Row
            key={t.name}
            title={t.name}
            right={area.mode === 'town' && area.town === t.name ? <Icon name="checkmark" color={colors.primary} /> : undefined}
            onPress={() => {
              setArea({ mode: 'town', town: t.name });
              setTownPicker(false);
            }}
          />
        ))}
      </Sheet>
    </Page>
  );
}
