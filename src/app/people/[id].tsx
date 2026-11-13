import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ChoiceCard } from '@/components/choice-card';
import { StackHeader } from '@/components/layout';
import { Badges } from '@/components/person-badges';
import { Sheet } from '@/components/sheet';
import { Button, Card, Empty, Notice, Text, ToggleRow, type IconName } from '@/components/ui';
import {
  LIMIT_INFO,
  ROLE_INFO,
  accessOf,
  describeChange,
  fetchHistory,
  fetchPerson,
  saveAccess,
  type Access,
  type Change,
  type Person,
  type Role,
} from '@/lib/people';
import { timeAgo } from '@/lib/reports';
import { useSession } from '@/lib/session';
import { GUTTER, radius, spacing, useTheme } from '@/theme';

const ROLE_ICON: Record<Role, IconName> = { member: 'person', moderator: 'shield-half', authority: 'business' };

const asState = (a: Access) => ({
  role: a.role,
  authority_name: a.role === 'authority' ? a.authorityName.trim() : null,
  no_reports: a.noReports,
  no_comments: a.noComments,
  no_discussion: a.noDiscussion,
});

export default function PersonAccess() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { roles, user } = useSession();
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const allowed = roles.is_moderator || roles.is_admin;

  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [draft, setDraft] = useState<Access | null>(null);
  const [history, setHistory] = useState<Change[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!allowed || !id) return;
    const [p, h] = await Promise.all([fetchPerson(id), fetchHistory(id)]);
    setPerson(p);
    setDraft(p ? accessOf(p) : null);
    setHistory(h);
  }, [allowed, id]);

  useEffect(() => {
    // load() sets state only after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StackHeader title="Change access" />
        <Empty icon="lock-closed-outline" title="Moderators only" />
      </View>
    );
  }
  if (person === undefined || (person && !draft)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StackHeader title="Change access" />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      </View>
    );
  }
  if (!person || !draft) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StackHeader title="Change access" />
        <Empty icon="person-outline" title="Person not found" body="They may have deleted their account." />
      </View>
    );
  }

  const name = person.full_name?.trim() || 'Member without a name';
  const isMe = person.id === user?.id;
  const adminLocked = person.is_admin && !roles.is_admin;
  const locked = isMe || adminLocked;
  const before = asState(accessOf(person));
  const after = asState(draft);
  const changed = JSON.stringify(before) !== JSON.stringify(after) || (draft.reason.trim() !== (person.restriction_reason ?? '') && (after.no_reports || after.no_comments || after.no_discussion));
  const anyPaused = draft.noReports || draft.noComments || draft.noDiscussion;
  const needsName = draft.role === 'authority' && !draft.authorityName.trim();
  const summary = describeChange({ from: before, to: after, reason: null });

  const set = (patch: Partial<Access>) => {
    setSaved(false);
    setError(null);
    setDraft({ ...draft, ...patch });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveAccess(person.id, draft);
      setConfirm(false);
      setSaved(true);
      await load();
    } catch (e) {
      setConfirm(false);
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const input = [type('body'), styles.input, { backgroundColor: colors.surfaceMuted, color: colors.text }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <StackHeader title="Change access" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <Card style={styles.who}>
          <Avatar profile={person} name={name} size={56} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="headline" numberOfLines={2}>{name}{isMe ? <Text muted> (you)</Text> : null}</Text>
            <Text variant="caption" muted>Joined {new Date(person.joined_at).toLocaleDateString()}</Text>
            <Badges person={person} />
          </View>
        </Card>

        {isMe && (
          <Notice icon="information-circle">
            <Text>This is you. To change your own access, ask another moderator.</Text>
          </Notice>
        )}
        {adminLocked && (
          <Notice tone="warning" icon="lock-closed">
            <Text>This person is an admin. Only another admin can change their access.</Text>
          </Notice>
        )}

        <View style={{ gap: spacing.md }} accessibilityRole="radiogroup">
          <Text variant="headline" accessibilityRole="header">Role</Text>
          {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
            <ChoiceCard
              key={r}
              icon={ROLE_ICON[r]}
              title={ROLE_INFO[r].label}
              hint={ROLE_INFO[r].hint}
              selected={draft.role === r}
              disabled={locked}
              onPress={() => set({ role: r })}
            />
          ))}
          {draft.role === 'authority' && (
            <View style={{ gap: spacing.sm }}>
              <Text variant="label">Name of the authority</Text>
              <TextInput
                style={input}
                value={draft.authorityName}
                onChangeText={(t) => set({ authorityName: t })}
                editable={!locked}
                placeholder="For example: Municipal Council of Curepipe"
                placeholderTextColor={colors.textFaint}
                maxLength={120}
                accessibilityLabel="Name of the authority"
              />
              <Text variant="caption" muted>People will see this name next to their updates.</Text>
            </View>
          )}
          {person.is_admin && (
            <Text variant="caption" muted>Admin stays on whatever role you pick here. Admin can only be removed outside the app.</Text>
          )}
        </View>

        <View style={{ gap: spacing.md }}>
          <Text variant="headline" accessibilityRole="header">What they can do</Text>
          <Text muted>Turn something off to pause it. They can still read everything.</Text>
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            <ToggleRow
              icon="add-circle-outline"
              title={LIMIT_INFO.noReports.label}
              subtitle={draft.noReports ? 'Paused' : 'Allowed'}
              value={!draft.noReports}
              onChange={(v) => set({ noReports: !v })}
              disabled={locked}
            />
            <ToggleRow
              icon="chatbox-outline"
              title={LIMIT_INFO.noComments.label}
              subtitle={draft.noComments ? 'Paused' : 'Allowed'}
              value={!draft.noComments}
              onChange={(v) => set({ noComments: !v })}
              disabled={locked}
            />
            <ToggleRow
              icon="chatbubbles-outline"
              title={LIMIT_INFO.noDiscussion.label}
              subtitle={draft.noDiscussion ? 'Paused' : 'Allowed'}
              value={!draft.noDiscussion}
              onChange={(v) => set({ noDiscussion: !v })}
              disabled={locked}
            />
          </Card>
          {anyPaused && (
            <View style={{ gap: spacing.sm }}>
              <Text variant="label">Reason <Text variant="label" muted>(they will see this)</Text></Text>
              <TextInput
                style={[input, { minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.md }]}
                value={draft.reason}
                onChangeText={(t) => set({ reason: t })}
                editable={!locked}
                multiline
                maxLength={300}
                placeholder="For example: Repeated rude comments"
                placeholderTextColor={colors.textFaint}
                accessibilityLabel="Reason, shown to the person"
              />
            </View>
          )}
        </View>

        {error && <Notice tone="danger"><Text>{error}</Text></Notice>}
        {saved && !changed && (
          <Notice icon="checkmark-circle">
            <Text>Saved. The change works straight away; they may need to reopen the app to see it.</Text>
          </Notice>
        )}

        {!locked && (
          <View style={{ gap: spacing.sm }}>
            <Button
              title="Save changes"
              icon="checkmark"
              disabled={!changed || needsName}
              onPress={() => setConfirm(true)}
            />
            {!changed && <Text variant="caption" muted style={{ textAlign: 'center' }}>Nothing has changed yet.</Text>}
            {changed && needsName && <Text variant="caption" muted style={{ textAlign: 'center' }}>Enter the name of the authority to save.</Text>}
            {changed && !needsName && (
              <Button kind="ghost" title="Undo my changes" onPress={() => set(accessOf(person))} />
            )}
          </View>
        )}

        <View style={{ gap: spacing.md }}>
          <Text variant="headline" accessibilityRole="header">History</Text>
          {history.length === 0 ? (
            <Text muted>No changes yet.</Text>
          ) : (
            <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
              {history.map((h, i) => (
                <View
                  key={h.id}
                  style={[styles.history, i < history.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
                  <Text variant="bodyStrong">{describeChange(h.change)}</Text>
                  {!!h.change.reason && <Text variant="caption">“{h.change.reason}”</Text>}
                  <Text variant="small" muted>By {h.changer} · {timeAgo(h.created_at)}</Text>
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>

      <Sheet visible={confirm} onClose={() => !busy && setConfirm(false)} title="Save these changes?">
        <View style={{ gap: spacing.lg }}>
          <Text>
            <Text variant="bodyStrong">{name}</Text>: {summary}.
          </Text>
          {draft.role === 'moderator' && before.role !== 'moderator' && (
            <Notice tone="warning" icon="shield-half">
              <Text>Moderators can hide posts and change other people’s access, including yours.</Text>
            </Notice>
          )}
          <Text variant="caption" muted>This is saved in the history with your name.</Text>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Button kind="secondary" title="Cancel" onPress={() => setConfirm(false)} disabled={busy} style={{ flex: 1 }} />
            <Button title="Yes, save" icon="checkmark" haptic loading={busy} onPress={save} style={{ flex: 1 }} />
          </View>
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, gap: spacing.xl, width: '100%', maxWidth: 760, alignSelf: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  input: { minHeight: 52, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  history: { paddingVertical: spacing.md, gap: 2 },
});
