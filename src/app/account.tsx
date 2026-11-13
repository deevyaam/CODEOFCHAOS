import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { authenticate } from '@/components/app-lock';
import { AVATAR_COLORS, AVATAR_ICONS, Avatar } from '@/components/avatar';
import { Page, Screen, StackHeader } from '@/components/layout';
import { Sheet } from '@/components/sheet';
import { Button, Card, Divider, Icon, Notice, PressableScale, Row, Segmented, SectionTitle, Text } from '@/components/ui';
import { getPrefs } from '@/lib/prefs';
import { displayName, useSession, type Profile } from '@/lib/session';
import { BUCKETS, supabase } from '@/lib/supabase';
import { radius, spacing, useTheme } from '@/theme';

export default function Account() {
  const { user, profile, roles, isGuest, signOut, refreshProfile } = useSession();
  const { colors, type } = useTheme();
  const [draft, setName] = useState<string | null>(null);
  const name = draft ?? profile?.full_name ?? '';
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [editAvatar, setEditAvatar] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);


  const update = async (patch: Partial<Profile>) => {
    if (!user) return;
    const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
    if (error) setMsg({ tone: 'danger', text: error.message });
    await refreshProfile();
  };

  const uploadPhoto = async () => {
    if (!user) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    if (res.canceled) return;
    const a = res.assets[0];
    const path = `${user.id}/avatar.jpg`;
    const body = await (await fetch(a.uri)).arrayBuffer();
    const { error } = await supabase.storage.from(BUCKETS.avatars).upload(path, body, { contentType: a.mimeType ?? 'image/jpeg', upsert: true });
    if (error) return setMsg({ tone: 'danger', text: error.message });
    await update({ avatar_kind: 'photo', avatar_path: path });
    setEditAvatar(false);
  };

  const deleteAccount = async () => {
    if (getPrefs().approveImportant && !(await authenticate('Delete your account'))) return;
    setDeleting(true);
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    setDeleting(false);
    if (error) return setMsg({ tone: 'danger', text: 'Your account could not be deleted. Please try again or contact us.' });
    setConfirmDelete(false);
    await signOut();
  };

  if (isGuest || !user) {
    return (
      <Screen>
        <StackHeader title="My account" />
        <Page tab={false}>
          <Notice icon="eye-outline">
            <Text variant="label">You’re a guest</Text>
            <Text variant="caption" muted>Guests don’t have a profile. Sign in or create an account to post and take part.</Text>
          </Notice>
          <Button title="Sign in or create an account" icon="log-in-outline" onPress={signOut} style={{ marginTop: spacing.lg }} />
        </Page>
      </Screen>
    );
  }

  const shownName = displayName(profile, user);
  const badge = roles.is_admin ? 'Admin' : roles.is_moderator ? 'Moderator' : roles.authority_verified ? `Verified authority${roles.authority_name ? ` · ${roles.authority_name}` : ''}` : null;

  return (
    <Screen>
      <StackHeader title="My account" />
      <Page tab={false}>
        <View style={styles.top}>
          <PressableScale onPress={() => setEditAvatar(true)} accessibilityRole="button" accessibilityLabel="Change profile picture">
            <Avatar profile={profile} name={shownName} size={96} />
            <View style={[styles.edit, { backgroundColor: colors.primary }]}>
              <Icon name="pencil" size={14} color={colors.onPrimary} />
            </View>
          </PressableScale>
          <Text variant="title">{shownName}</Text>
          {badge && (
            <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
              <Icon name="shield-checkmark" size={14} color={colors.primary} />
              <Text variant="label" color={colors.primary}>{badge}</Text>
            </View>
          )}
        </View>

        <SectionTitle>Profile</SectionTitle>
        <Card style={{ gap: spacing.md }}>
          <Text variant="label" muted>Full name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={80}
            placeholder="Your name"
            placeholderTextColor={colors.textFaint}
            style={[type('body'), styles.input, { backgroundColor: colors.surfaceMuted, color: colors.text }]}
            accessibilityLabel="Full name"
          />
          <Button
            kind="secondary"
            title="Save name"
            loading={saving}
            disabled={name.trim() === (profile?.full_name ?? '')}
            onPress={async () => {
              setSaving(true);
              await update({ full_name: name.trim() || null });
              setName(null);
              setSaving(false);
            }}
          />
          <Divider />
          <Row icon="mail-outline" title="Email" subtitle={user.email ?? '—'} />
          <Row icon="calendar-outline" title="Member since" subtitle={new Date(user.created_at).toLocaleDateString('en-MU', { day: 'numeric', month: 'long', year: 'numeric' })} />
        </Card>

        {msg && (
          <View style={{ marginTop: spacing.lg }}>
            <Notice tone={msg.tone}><Text>{msg.text}</Text></Notice>
          </View>
        )}

        <SectionTitle>Account</SectionTitle>
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <Row icon="log-out-outline" title="Sign out" onPress={signOut} />
          <Divider />
          <Row icon="trash-outline" title="Delete account" subtitle="Removes your account and everything you posted" danger onPress={() => setConfirmDelete(true)} />
        </Card>
      </Page>

      <Sheet visible={editAvatar} onClose={() => setEditAvatar(false)} title="Profile picture">
        <AvatarEditor profile={profile} onPhoto={uploadPhoto} onChange={update} />
      </Sheet>

      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your account?">
        <View style={{ gap: spacing.md }}>
          <Text>
            This permanently deletes your account, your reports (including anonymous ones), comments, Discussion messages, assistant chats, photos and videos. It can’t be undone.
          </Text>
          <Text variant="label">Type DELETE to confirm</Text>
          <TextInput
            value={deleteText}
            onChangeText={setDeleteText}
            autoCapitalize="characters"
            style={[type('body'), styles.input, { backgroundColor: colors.surfaceMuted, color: colors.text }]}
            accessibilityLabel="Type DELETE to confirm"
          />
          <Button kind="danger" icon="trash" title="Delete my account" disabled={deleteText.trim() !== 'DELETE'} loading={deleting} onPress={deleteAccount} />
        </View>
      </Sheet>
    </Screen>
  );
}

function AvatarEditor({ profile, onPhoto, onChange }: { profile: Profile | null; onPhoto: () => void; onChange: (p: Partial<Profile>) => void }) {
  const { colors } = useTheme();
  const kind = profile?.avatar_kind ?? 'initials';
  const color = profile?.avatar_color ?? AVATAR_COLORS[0];
  return (
    <View style={{ gap: spacing.md }}>
      <Segmented
        value={kind}
        onChange={(k) => (k === 'photo' ? onPhoto() : onChange({ avatar_kind: k, avatar_icon: k === 'icon' ? profile?.avatar_icon ?? 'person' : profile?.avatar_icon ?? null }))}
        options={[
          { value: 'photo', label: 'Photo', icon: 'image-outline' },
          { value: 'icon', label: 'Icon', icon: 'happy-outline' },
          { value: 'initials', label: 'Initials', icon: 'text' },
        ]}
      />
      {kind === 'photo' && <Button kind="secondary" icon="images-outline" title="Choose a photo" onPress={onPhoto} />}
      {kind === 'icon' && (
        <View style={styles.wrap}>
          {AVATAR_ICONS.map((ic) => (
            <PressableScale
              key={ic}
              onPress={() => onChange({ avatar_kind: 'icon', avatar_icon: ic })}
              accessibilityRole="radio"
              accessibilityState={{ checked: profile?.avatar_icon === ic }}
              accessibilityLabel={ic}
              style={[styles.choice, { backgroundColor: profile?.avatar_icon === ic ? color : colors.surfaceMuted }]}>
              <Icon name={ic} size={22} color={profile?.avatar_icon === ic ? '#fff' : colors.textMuted} />
            </PressableScale>
          ))}
        </View>
      )}
      {kind !== 'photo' && (
        <>
          <Text variant="label" muted>Background colour</Text>
          <View style={styles.wrap}>
            {AVATAR_COLORS.map((c) => (
              <PressableScale
                key={c}
                onPress={() => onChange({ avatar_color: c })}
                accessibilityRole="radio"
                accessibilityState={{ checked: color === c }}
                accessibilityLabel={`Colour ${c}`}
                style={[styles.choice, { backgroundColor: c }]}>
                {color === c && <Icon name="checkmark" size={18} color="#fff" />}
              </PressableScale>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'center', gap: spacing.sm },
  edit: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 12, minHeight: 28, borderRadius: radius.pill },
  input: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
