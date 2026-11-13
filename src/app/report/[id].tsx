import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authenticate } from '@/components/app-lock';
import { Avatar } from '@/components/avatar';
import { FlagSheet, ReactionBar } from '@/components/community';
import { StackHeader } from '@/components/layout';
import { MediaStrip } from '@/components/media-view';
import { MeTooButton, StatusPill } from '@/components/report-card';
import { Sheet } from '@/components/sheet';
import { Button, Card, Empty, Icon, Notice, PressableScale, Row, Text } from '@/components/ui';
import { authoritiesFor, type Authority } from '@/lib/authorities';
import { summariseReactions } from '@/lib/discussion';
import { getPrefs } from '@/lib/prefs';
import { badgeLabel, useProfiles } from '@/lib/profiles';
import {
  STATUSES,
  categoryInfo,
  mediaUrl,
  statusInfo,
  timeAgo,
  uploadMedia,
  type Comment,
  type MediaItem,
  type Report,
  type Status,
} from '@/lib/reports';
import { useSession } from '@/lib/session';
import { BUCKETS, supabase } from '@/lib/supabase';
import { useVotes } from '@/lib/votes';
import { GUTTER, radius, spacing, useTheme } from '@/theme';

type Reaction = { comment_id: string; user_id: string; emoji: string };

export default function ReportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isGuest, roles } = useSession();
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState<Report | null>(null);
  const [missing, setMissing] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [sending, setSending] = useState(false);
  const [sheet, setSheet] = useState<'status' | 'send' | 'more' | null>(null);
  const [flag, setFlag] = useState<{ type: 'report' | 'comment'; id: string; authorId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reports = useMemo(() => (report ? [report] : []), [report]);
  const { voted, toggle, canVote } = useVotes(reports);
  const profiles = useProfiles([report?.author_id ?? '', ...comments.map((c) => c.user_id ?? '')].filter(Boolean));

  const canChangeStatus = !isGuest && (isOwner || roles.authority_verified || roles.is_moderator || roles.is_admin);

  const load = useCallback(async () => {
    const { data } = await supabase.from('reports').select('*').eq('id', id).maybeSingle();
    if (!data) return setMissing(true);
    setReport(data as Report);
    const { data: cs } = await supabase.from('report_comments').select('*').eq('report_id', id).order('created_at');
    setComments((cs ?? []) as Comment[]);
    const ids = (cs ?? []).map((c) => c.id as string);
    if (ids.length) {
      const { data: rs } = await supabase.from('report_comment_reactions').select('comment_id,user_id,emoji').in('comment_id', ids);
      setReactions((rs ?? []) as Reaction[]);
    } else setReactions([]);
  }, [id]);

  useEffect(() => {
    // load() sets state only after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    if (user && !isGuest) {
      supabase.from('report_owners').select('report_id').eq('report_id', id).maybeSingle().then(({ data }) => setIsOwner(!!data));
    }
    const ch = supabase
      .channel(`report-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports', filter: `id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'report_comments', filter: `report_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'report_comment_reactions' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, load, user, isGuest]);

  const approve = async (what: string) => (getPrefs().approveImportant ? authenticate(`Approve: ${what}`) : true);

  const changeStatus = async (status: Status, sentTo?: string, note?: string) => {
    if (!(await approve('change status'))) return;
    setError(null);
    const { error: e } = await supabase.from('report_comments').insert({
      report_id: id,
      status_change: status,
      sent_to: sentTo ?? null,
      body: note ?? '',
    });
    if (e) setError(e.message);
    setSheet(null);
  };

  const sendComment = async () => {
    if (!user) return;
    setSending(true);
    setError(null);
    try {
      // Anonymous reporters upload to the anonymous folder so their id never appears in a file path.
      const folder = isOwner && report?.is_anonymous ? `anonymous/${Crypto.randomUUID()}` : user.id;
      const media: MediaItem[] = photo ? [await uploadMedia(BUCKETS.reportMedia, folder, photo)] : [];
      const { error: e } = await supabase.from('report_comments').insert({ report_id: id, body: text.trim(), media });
      if (e) throw e;
      setText('');
      setPhoto(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send');
    } finally {
      setSending(false);
    }
  };

  const react = async (commentId: string, emoji: string | null) => {
    if (!user) return;
    if (emoji) await supabase.from('report_comment_reactions').upsert({ comment_id: commentId, user_id: user.id, emoji });
    else await supabase.from('report_comment_reactions').delete().eq('comment_id', commentId).eq('user_id', user.id);
    load();
  };

  const sendTo = async (a: Authority) => {
    if (!report) return;
    const link = Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/report/${report.id}` : `lifepoweredbytech://report/${report.id}`;
    const where = [report.place_name, report.town].filter(Boolean).join(', ');
    const map = report.lat != null ? `https://www.openstreetmap.org/?mlat=${report.lat}&mlon=${report.lng}#map=18/${report.lat}/${report.lng}` : '';
    const body = `${report.title}\n\n${report.description}\n\n${where ? `Where: ${where}\n` : ''}${map ? `Map: ${map}\n` : ''}Reported via Life Powered by Tech: ${link}`;
    if (a.email) await Linking.openURL(`mailto:${a.email}?subject=${encodeURIComponent(`Report: ${report.title}`)}&body=${encodeURIComponent(body)}`);
    else if (a.url) await Linking.openURL(a.url);
    else await Share.share({ message: body, title: report.title });
    if (canChangeStatus && report.status === 'reported') {
      const confirm = () => changeStatus('sent', a.name);
      if (Platform.OS === 'web') {
        if (window.confirm(`Mark this report as sent to ${a.name}?`)) confirm();
      } else {
        Alert.alert('Mark as sent?', `Mark this report as “Sent to ${a.name}”?`, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Mark as sent', onPress: confirm },
        ]);
      }
    }
    setSheet(null);
  };

  const deleteReport = async () => {
    if (!(await approve('delete report'))) return;
    const go = async () => {
      const { error: e } = await supabase.from('reports').delete().eq('id', id);
      if (e) setError(e.message);
      else router.back();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this report and its comments, photos and videos? This can’t be undone.')) go();
    } else {
      Alert.alert('Delete report?', 'This removes the report, its comments, photos and videos. It can’t be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: go },
      ]);
    }
  };

  if (missing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StackHeader title="Report" />
        <Empty icon="search-outline" title="Report not found" body="It may have been removed or hidden." />
      </View>
    );
  }
  if (!report) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StackHeader title="Report" />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      </View>
    );
  }

  const cat = categoryInfo(report.category);
  const author = report.author_id ? profiles.get(report.author_id) : null;
  const authorName = report.is_anonymous ? 'Anonymous' : author?.full_name || 'A member';
  const currentIdx = STATUSES.findIndex((s) => s.value === report.status);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <StackHeader
        title={cat.label}
        right={
          <PressableScale onPress={() => setSheet('more')} accessibilityRole="button" accessibilityLabel="More actions" style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
            <Icon name="ellipsis-horizontal" size={20} />
          </PressableScale>
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ gap: spacing.sm }}>
          <Text variant="title">{report.title}</Text>
          <View style={styles.byline}>
            {report.is_anonymous ? (
              <View style={[styles.anon, { backgroundColor: colors.surfaceMuted }]}>
                <Icon name="eye-off" size={16} color={colors.textMuted} />
              </View>
            ) : (
              <Avatar profile={author ?? null} name={authorName} size={28} />
            )}
            <Text variant="caption" muted style={{ flex: 1 }}>
              {authorName}
              {badgeLabel(author) ? ` · ${badgeLabel(author)}` : ''} · {timeAgo(report.created_at)}
            </Text>
          </View>
          {report.hidden && (
            <Notice tone="warning"><Text>Hidden by a moderator. Only you and moderators can see it.</Text></Notice>
          )}
        </View>

        <MediaStrip items={report.media.map((m) => ({ url: mediaUrl(m), type: m.type }))} />

        {report.description ? <Text>{report.description}</Text> : null}

        <Card style={{ gap: spacing.md }}>
          <View style={styles.rowBetween}>
            <StatusPill status={report.status} />
            <MeTooButton count={report.me_too_count} on={voted.has(report.id)} disabled={!canVote} onPress={() => toggle(report.id)} />
          </View>
          <Text variant="caption" muted>
            Reported by {report.me_too_count + 1} {report.me_too_count === 0 ? 'person' : 'people'}
            {report.sent_to ? ` · Sent to ${report.sent_to}` : ''}
          </Text>
          <View style={styles.steps} accessibilityLabel={`Status: ${statusInfo(report.status).label}`}>
            {STATUSES.map((s, i) => (
              <View key={s.value} style={{ flex: 1, gap: 4 }}>
                <View style={[styles.stepBar, { backgroundColor: i <= currentIdx ? colors.primary : colors.surfaceSunken }]} />
                <Text variant="small" color={i === currentIdx ? colors.text : colors.textFaint} numberOfLines={2}>{s.label}</Text>
              </View>
            ))}
          </View>
          {(report.town || report.place_name || report.occurred_at) && (
            <Text variant="caption" muted>
              {[report.place_name, report.town].filter(Boolean).join(', ')}
              {report.occurred_at ? `${report.place_name || report.town ? ' · ' : ''}Happened ${timeAgo(report.occurred_at)}` : ''}
            </Text>
          )}
          <View style={styles.actions}>
            <Button kind="secondary" icon="paper-plane-outline" title="Send to authority" onPress={() => setSheet('send')} style={{ flexGrow: 1 }} />
            {canChangeStatus && <Button kind="secondary" icon="swap-vertical" title="Update status" onPress={() => setSheet('status')} style={{ flexGrow: 1 }} />}
          </View>
        </Card>

        <Text variant="headline" style={{ marginTop: spacing.md }}>Timeline</Text>
        <View style={{ gap: spacing.md }}>
          <TimelineItem icon="flag" title="Reported" when={report.created_at} />
          {comments.map((c) => {
            const p = c.user_id ? profiles.get(c.user_id) : null;
            const name = c.by_reporter && report.is_anonymous ? 'The reporter' : p?.full_name || 'A member';
            if (c.status_change) {
              return (
                <TimelineItem
                  key={c.id}
                  icon={statusInfo(c.status_change).icon}
                  title={`${statusInfo(c.status_change).label}${c.sent_to ? `: ${c.sent_to}` : ''}`}
                  subtitle={`${name}${badgeLabel(p) ? ` (${badgeLabel(p)})` : ''}${c.body ? ` — ${c.body}` : ''}`}
                  when={c.created_at}
                />
              );
            }
            const rs = summariseReactions(reactions.filter((r) => r.comment_id === c.id), user?.id);
            return (
              <Card key={c.id} style={{ gap: spacing.sm }}>
                <View style={styles.byline}>
                  <Avatar profile={p ?? null} name={name} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text variant="label">{name}{badgeLabel(p) ? ` · ${badgeLabel(p)}` : ''}</Text>
                    <Text variant="small" muted>{timeAgo(c.created_at)}</Text>
                  </View>
                  {!isGuest && c.user_id !== user?.id && !(c.by_reporter && isOwner) && (
                    <PressableScale onPress={() => setFlag({ type: 'comment', id: c.id, authorId: c.user_id })} accessibilityRole="button" accessibilityLabel="Report this comment">
                      <Icon name="flag-outline" size={18} color={colors.textFaint} />
                    </PressableScale>
                  )}
                </View>
                {c.body ? <Text>{c.body}</Text> : null}
                <MediaStrip items={c.media.map((m) => ({ url: mediaUrl(m), type: m.type }))} height={160} />
                {c.hidden && <Text variant="small" color={colors.danger}>Hidden by a moderator</Text>}
                <ReactionBar reactions={rs} canReact={!isGuest} onReact={(e) => react(c.id, e)} />
              </Card>
            );
          })}
        </View>
        {error && <Notice tone="danger"><Text>{error}</Text></Notice>}
      </ScrollView>

      {!isGuest ? (
        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm, backgroundColor: colors.surface }]}>
          {photo && (
            <View style={styles.rowBetween}>
              <Text variant="caption" muted>1 photo attached</Text>
              <PressableScale onPress={() => setPhoto(null)} accessibilityLabel="Remove photo" accessibilityRole="button">
                <Icon name="close-circle" size={18} color={colors.textFaint} />
              </PressableScale>
            </View>
          )}
          <View style={styles.composerRow}>
            <PressableScale
              onPress={async () => {
                const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
                if (!res.canceled) setPhoto(res.assets[0]);
              }}
              accessibilityRole="button"
              accessibilityLabel="Attach a photo"
              style={[styles.iconBtn, { backgroundColor: colors.surfaceMuted }]}>
              <Icon name="image-outline" size={20} color={colors.primary} />
            </PressableScale>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Add a comment"
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={2000}
              style={[type('body'), styles.input, { backgroundColor: colors.surfaceMuted, color: colors.text }]}
              accessibilityLabel="Comment"
            />
            <PressableScale
              onPress={sendComment}
              disabled={sending || (!text.trim() && !photo)}
              haptic
              accessibilityRole="button"
              accessibilityLabel="Send comment"
              style={[styles.iconBtn, { backgroundColor: colors.primary }]}>
              {sending ? <ActivityIndicator color={colors.onPrimary} /> : <Icon name="send" size={18} color={colors.onPrimary} />}
            </PressableScale>
          </View>
        </View>
      ) : (
        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm, backgroundColor: colors.surface }]}>
          <Text variant="caption" muted style={{ textAlign: 'center' }}>Sign in to comment and react.</Text>
        </View>
      )}

      <Sheet visible={sheet === 'status'} onClose={() => setSheet(null)} title="Update status">
        {STATUSES.map((s) => (
          <Row
            key={s.value}
            icon={s.icon}
            title={s.label}
            right={report.status === s.value ? <Icon name="checkmark" color={colors.primary} /> : undefined}
            onPress={report.status === s.value ? undefined : () => changeStatus(s.value)}
          />
        ))}
        <Text variant="small" muted style={{ marginTop: spacing.sm }}>
          The change appears in the timeline with your name, and people following the report are notified.
        </Text>
      </Sheet>

      <Sheet visible={sheet === 'send'} onClose={() => setSheet(null)} title="Send to the right authority">
        <Notice tone="warning">
          <Text variant="caption">
            Official contact details haven’t been confirmed yet, so this opens your share options. Check the authority’s official website for how they take reports.
          </Text>
        </Notice>
        {authoritiesFor(report.category).map((a) => (
          <Row key={a.id} icon="business-outline" title={a.name} subtitle={a.email ?? a.url ?? 'Share the report'} onPress={() => sendTo(a)} />
        ))}
      </Sheet>

      <Sheet visible={sheet === 'more'} onClose={() => setSheet(null)}>
        <Row
          icon="share-outline"
          title="Share"
          onPress={() => {
            setSheet(null);
            Share.share({ message: `${report.title} — reported on Life Powered by Tech` });
          }}
        />
        {!isGuest && !isOwner && (
          <Row
            icon="flag-outline"
            title="Report this post"
            onPress={() => {
              setSheet(null);
              setFlag({ type: 'report', id: report.id, authorId: report.author_id });
            }}
          />
        )}
        {(isOwner || roles.is_admin) && <Row icon="trash-outline" title="Delete report" danger onPress={() => { setSheet(null); deleteReport(); }} />}
      </Sheet>

      <FlagSheet visible={!!flag} onClose={() => setFlag(null)} target={flag} authorId={flag?.authorId} myId={user?.id} />
    </KeyboardAvoidingView>
  );
}

function TimelineItem({ icon, title, subtitle, when }: { icon: Parameters<typeof Icon>[0]['name']; title: string; subtitle?: string; when: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.timeline}>
      <View style={[styles.dot, { backgroundColor: colors.primarySoft }]}>
        <Icon name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label">{title}</Text>
        {subtitle ? <Text variant="caption" muted>{subtitle}</Text> : null}
        <Text variant="small" muted>{timeAgo(when)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: spacing.xxl, gap: spacing.lg, width: '100%', maxWidth: 760, alignSelf: 'center' },
  byline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  anon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  steps: { flexDirection: 'row', gap: spacing.sm },
  stepBar: { height: 4, borderRadius: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  timeline: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  composer: { paddingHorizontal: GUTTER, paddingTop: spacing.sm, gap: spacing.xs },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: 11, paddingBottom: 11 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
