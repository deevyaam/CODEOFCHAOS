import { useIsFocused } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { FlagSheet, QuickReactions, ReactionBar, blockUser } from '@/components/community';
import { useKeyboardVisible, useTabBarSpace } from '@/components/layout';
import { MediaStrip } from '@/components/media-view';
import { Sheet } from '@/components/sheet';
import { Empty, Icon, Notice, PressableScale, Row, Text, type IconName } from '@/components/ui';
import { summariseReactions } from '@/lib/discussion';
import { setPref } from '@/lib/prefs';
import { badgeLabel, useProfiles, type PublicProfile } from '@/lib/profiles';
import { timeAgo, uploadMedia, type MediaItem } from '@/lib/reports';
import { useSession } from '@/lib/session';
import { BUCKETS, supabase } from '@/lib/supabase';
import { GUTTER, radius, spacing, useTheme, type Colors } from '@/theme';

type Message = {
  id: string;
  user_id: string;
  body: string;
  media: MediaItem[];
  reply_to: string | null;
  hidden: boolean;
  created_at: string;
  /** Set when a moderator or authority removed the message (body and media are then empty). */
  deleted_at: string | null;
  deleted_by_role: 'moderator' | 'authority' | null;
};
type Reaction = { message_id: string; user_id: string; emoji: string };

const PAGE = 100;

const deletedLabel = (m: Pick<Message, 'deleted_by_role'>) =>
  m.deleted_by_role === 'authority' ? 'Message deleted by an authority' : 'Message deleted by a moderator';

/** Short preview of a message for reply quotes. */
const preview = (m: Message) => (m.deleted_at ? 'Deleted message' : m.body || 'Photo');

function confirmAction(title: string, message: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

/** Bubble colour by who wrote it: authorities blue, moderators/admins green, everyone else plain (yours tinted). */
function bubbleTone(p: PublicProfile | undefined, mine: boolean, colors: Colors): { background: string; accent: string; icon: IconName | null } {
  if (p?.badge === 'authority') return { background: colors.authoritySoft, accent: colors.authority, icon: 'checkmark-circle' };
  if (p?.badge === 'moderator' || p?.badge === 'admin') return { background: colors.moderatorSoft, accent: colors.moderator, icon: 'shield-checkmark' };
  return { background: mine ? colors.primarySoft : colors.surface, accent: colors.textMuted, icon: null };
}

export default function Discuss() {
  const { user, isGuest } = useSession();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();

  if (isGuest || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + spacing.xxl }}>
        <Empty icon="chatbubbles-outline" title="The Discussion is for members" body="Sign in to read and join the community conversation. Guests can still browse reports and the map." />
      </View>
    );
  }
  return <Room userId={user.id} focused={focused} />;
}

function Room({ userId, focused }: { userId: string; focused: boolean }) {
  const { colors, type, shadows } = useTheme();
  const { roles, limits } = useSession();
  const isStaff = roles.is_admin || roles.is_moderator || roles.authority_verified;
  const myRole: Message['deleted_by_role'] = roles.is_admin || roles.is_moderator ? 'moderator' : 'authority';
  const paused = limits.no_discussion;
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const keyboard = useKeyboardVisible();
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [attach, setAttach] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<Message | null>(null);
  const [flag, setFlag] = useState<Message | null>(null);
  const list = useRef<FlatList<Message>>(null);

  const profiles = useProfiles(messages.map((m) => m.user_id));
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('discussion_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE);
    if (e) setError(e.message);
    const msgs = (data ?? []) as Message[];
    setMessages(msgs);
    if (msgs.length) {
      const { data: rs } = await supabase.from('discussion_reactions').select('message_id,user_id,emoji').in('message_id', msgs.map((m) => m.id));
      setReactions((rs ?? []) as Reaction[]);
      const paths = msgs.flatMap((m) => m.media.map((x) => x.path));
      if (paths.length) {
        const { data: signed } = await supabase.storage.from(BUCKETS.discussionMedia).createSignedUrls(paths, 3600);
        setUrls(Object.fromEntries((signed ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl]] : []))));
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // load() sets state only after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const ch = supabase
      .channel('discussion')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discussion_messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discussion_reactions' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  // Opening Discuss marks everything as read (clears the tab badge).
  useEffect(() => {
    if (focused && messages[0]) setPref('discussLastRead', messages[0].created_at);
  }, [focused, messages]);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const media: MediaItem[] = [];
      for (const a of attach) media.push(await uploadMedia(BUCKETS.discussionMedia, userId, a));
      const { error: e } = await supabase
        .from('discussion_messages')
        .insert({ user_id: userId, body: text.trim(), media, reply_to: replyTo?.id ?? null });
      if (e) throw e;
      setText('');
      setAttach([]);
      setReplyTo(null);
      await load(); // don't depend on realtime to see your own message
      list.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send');
    } finally {
      setSending(false);
    }
  };

  const react = async (messageId: string, emoji: string | null) => {
    // Optimistic: one reaction per person, replaced or removed immediately.
    setReactions((rs) => [
      ...rs.filter((r) => !(r.message_id === messageId && r.user_id === userId)),
      ...(emoji ? [{ message_id: messageId, user_id: userId, emoji }] : []),
    ]);
    const { error: e } = emoji
      ? await supabase.from('discussion_reactions').upsert({ message_id: messageId, user_id: userId, emoji })
      : await supabase.from('discussion_reactions').delete().eq('message_id', messageId).eq('user_id', userId);
    if (e) setError(e.message);
    load();
  };

  // Moderators and authorities remove a normal member's message; the room then shows who removed it (by role).
  const staffDelete = (m: Message) => {
    setActions(null);
    confirmAction(
      'Delete this message?',
      `It will be removed for everyone and replaced with “${deletedLabel({ deleted_by_role: myRole })}”. This can’t be undone.`,
      'Delete',
      async () => {
        const { error: e } = await supabase.rpc('staff_delete_message', { p_id: m.id });
        if (!e) setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, body: '', media: [], deleted_at: new Date().toISOString(), deleted_by_role: myRole } : x)));
        if (e) setError(e.message);
        load();
      },
    );
  };

  const canSend = !sending && (!!text.trim() || attach.length > 0);

  const composerBottom = keyboard ? insets.bottom + spacing.sm : tabSpace - spacing.lg;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text variant="display" accessibilityRole="header">Discuss</Text>
        <Text muted>One room for the whole community. Be kind; no personal details.</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : messages.length === 0 ? (
        // Rendered outside the inverted list: ListEmptyComponent would be flipped upside down.
        <View style={styles.center}>
          <Empty icon="chatbubble-ellipses-outline" title="No messages yet" body="Say hello to your neighbours." />
        </View>
      ) : (
        <FlatList
          ref={list}
          data={messages}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingVertical: spacing.md, gap: spacing.md, width: '100%', maxWidth: 760, alignSelf: 'center' }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: m }) => {
            const p = profiles.get(m.user_id);
            const name = p?.full_name || 'Member';
            const mine = m.user_id === userId;
            const parent = m.reply_to ? byId.get(m.reply_to) : null;
            const tone = bubbleTone(p, mine, colors);
            const badge = badgeLabel(p);
            if (m.deleted_at) {
              return (
                <View style={[styles.bubble, styles.deleted, { backgroundColor: colors.surfaceMuted }]} accessibilityLabel={`${deletedLabel(m)}, originally from ${mine ? 'you' : name}`}>
                  <Icon name="shield-checkmark-outline" size={18} color={colors.textMuted} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="caption" muted style={{ fontStyle: 'italic' }}>{deletedLabel(m)}</Text>
                    <Text variant="small" color={colors.textFaint} numberOfLines={1}>
                      {mine ? 'Your message' : `From ${name}`} · {timeAgo(m.created_at)}
                    </Text>
                  </View>
                </View>
              );
            }
            return (
              <PressableScale
                onLongPress={() => setActions(m)}
                delayLongPress={300}
                accessibilityHint="Long press for reply, react and more"
                style={[styles.bubble, { backgroundColor: tone.background, boxShadow: shadows.card }]}>
                <View style={styles.byline}>
                  <Avatar profile={p ?? null} name={name} size={28} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.nameRow}>
                      <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{mine ? 'You' : name}</Text>
                      {badge && tone.icon && (
                        <View style={styles.badge}>
                          <Icon name={tone.icon} size={13} color={tone.accent} />
                          <Text variant="small" color={tone.accent} numberOfLines={1} style={{ flexShrink: 1 }}>{badge}</Text>
                        </View>
                      )}
                    </View>
                    <Text variant="small" muted>{timeAgo(m.created_at)}</Text>
                  </View>
                  <PressableScale onPress={() => setActions(m)} accessibilityRole="button" accessibilityLabel="Message actions">
                    <Icon name="ellipsis-horizontal" size={18} color={colors.textFaint} />
                  </PressableScale>
                </View>
                {parent && (
                  <View style={[styles.quote, { borderLeftColor: colors.primary, backgroundColor: colors.surfaceMuted }]}>
                    <Text variant="small" muted numberOfLines={2}>
                      {profiles.get(parent.user_id)?.full_name || 'Member'}: {preview(parent)}
                    </Text>
                  </View>
                )}
                {m.body ? <Text>{m.body}</Text> : null}
                <MediaStrip items={m.media.filter((x) => urls[x.path]).map((x) => ({ url: urls[x.path], type: x.type }))} height={180} />
                {m.hidden && <Text variant="small" color={colors.danger}>Hidden by a moderator</Text>}
                <ReactionBar reactions={summariseReactions(reactions.filter((r) => r.message_id === m.id), userId)} canReact onReact={(e) => react(m.id, e)} />
              </PressableScale>
            );
          }}
        />
      )}

      {paused ? (
        <View style={[styles.composerWrap, { marginBottom: composerBottom }]}>
          <View style={[styles.composer, { backgroundColor: colors.surface, boxShadow: shadows.raised }]}>
            <Text variant="caption" muted style={{ textAlign: 'center' }}>
              A moderator has paused your messages here for now. You can still read the Discussion.
            </Text>
          </View>
        </View>
      ) : (
      <View style={[styles.composerWrap, { marginBottom: composerBottom }]}>
      <View style={[styles.composer, { backgroundColor: colors.surface, boxShadow: shadows.raised }]}>
        {error && <Notice tone="danger"><Text variant="caption">{error}</Text></Notice>}
        {replyTo && (
          <View style={styles.replyBar}>
            <Icon name="return-down-forward" size={16} color={colors.primary} />
            <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
              Replying to {profiles.get(replyTo.user_id)?.full_name || 'Member'}: {preview(replyTo)}
            </Text>
            <PressableScale onPress={() => setReplyTo(null)} accessibilityLabel="Cancel reply" accessibilityRole="button">
              <Icon name="close" size={18} color={colors.textFaint} />
            </PressableScale>
          </View>
        )}
        {attach.length > 0 && (
          <View style={styles.replyBar}>
            <Icon name="attach" size={16} color={colors.primary} />
            <Text variant="caption" muted style={{ flex: 1 }}>{attach.length} attached</Text>
            <PressableScale onPress={() => setAttach([])} accessibilityLabel="Remove attachments" accessibilityRole="button">
              <Icon name="close" size={18} color={colors.textFaint} />
            </PressableScale>
          </View>
        )}
        <View style={styles.row}>
          <PressableScale
            onPress={async () => {
              const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.7, allowsMultipleSelection: true, selectionLimit: 4, videoMaxDuration: 60 });
              if (!res.canceled) setAttach(res.assets.slice(0, 4));
            }}
            accessibilityRole="button"
            accessibilityLabel="Attach photos or videos"
            style={[styles.iconBtn, { backgroundColor: colors.surfaceMuted }]}>
            <Icon name="image-outline" size={20} color={colors.primary} />
          </PressableScale>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a message"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={2000}
            style={[type('body'), styles.input, { backgroundColor: colors.surfaceMuted, color: colors.text }]}
            accessibilityLabel="Message"
            onKeyPress={(e) => {
              const ne = e.nativeEvent as { key: string; shiftKey?: boolean };
              if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
                e.preventDefault();
                if (canSend) send();
              }
            }}
          />
          <PressableScale
            onPress={send}
            haptic
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={[styles.iconBtn, { backgroundColor: colors.primary }]}>
            {sending ? <ActivityIndicator color={colors.onPrimary} /> : <Icon name="send" size={18} color={colors.onPrimary} />}
          </PressableScale>
        </View>
      </View>
      </View>
      )}

      <Sheet visible={!!actions} onClose={() => setActions(null)}>
        {actions && (
          <View style={{ gap: spacing.sm }}>
            <QuickReactions
              current={reactions.find((r) => r.message_id === actions.id && r.user_id === userId)?.emoji}
              onPick={(e) => {
                const mineNow = reactions.find((r) => r.message_id === actions.id && r.user_id === userId)?.emoji;
                react(actions.id, mineNow === e ? null : e);
                setActions(null);
              }}
            />
            <Row icon="return-down-forward" title="Reply" onPress={() => { setReplyTo(actions); setActions(null); }} />
            {actions.user_id === userId ? (
              <Row
                icon="trash-outline"
                title="Delete message"
                danger
                onPress={async () => {
                  const id = actions.id;
                  setActions(null);
                  setMessages((ms) => ms.filter((m) => m.id !== id));
                  const { error: e } = await supabase.from('discussion_messages').delete().eq('id', id);
                  if (e) setError(e.message);
                  load();
                }}
              />
            ) : (
              <>
                {isStaff && !profiles.get(actions.user_id)?.badge && (
                  <Row
                    icon="shield-checkmark-outline"
                    title="Delete for everyone"
                    subtitle={`Shows “${deletedLabel({ deleted_by_role: myRole })}” in its place`}
                    danger
                    onPress={() => staffDelete(actions)}
                  />
                )}
                <Row icon="flag-outline" title="Report this message" onPress={() => { setFlag(actions); setActions(null); }} />
                <Row
                  icon="ban"
                  title="Block this person"
                  danger
                  onPress={async () => {
                    await blockUser(userId, actions.user_id);
                    setActions(null);
                    load();
                  }}
                />
              </>
            )}
          </View>
        )}
      </Sheet>
      <FlagSheet visible={!!flag} onClose={() => setFlag(null)} target={flag ? { type: 'message', id: flag.id } : null} authorId={flag?.user_id} myId={userId} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: GUTTER, paddingBottom: spacing.sm, width: '100%', maxWidth: 760, alignSelf: 'center' },
  bubble: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  byline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  deleted: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1, minWidth: 0 },
  quote: { borderLeftWidth: 3, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER },
  composerWrap: { paddingHorizontal: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  composer: { borderRadius: radius.lg, padding: spacing.sm, gap: spacing.xs },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: 11, paddingBottom: 11 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
