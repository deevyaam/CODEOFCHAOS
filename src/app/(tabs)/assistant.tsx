import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardVisible, useTabBarSpace } from '@/components/layout';
import { Sheet } from '@/components/sheet';
import { Button, Chip, Icon, Notice, PressableScale, Row, Segmented, Text } from '@/components/ui';
import { EMERGENCY_NUMBERS } from '@/config';
import { forAssistant, isVideo } from '@/lib/ai-media';
import { getPrefs, setPref, usePref, type AssistantLanguage } from '@/lib/prefs';
import { setReportDraft, type PickedMedia } from '@/lib/report-draft';
import { categoryInfo, fetchReports, statusInfo, timeAgo, type Category } from '@/lib/reports';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { GUTTER, radius, spacing, useTheme } from '@/theme';

type Draft = { category: Category; title: string; description: string };
/** media: the picked files (kept on this phone for the report); images: small JPEGs for the assistant. */
type Turn = { role: 'user' | 'assistant'; content: string; media?: PickedMedia[]; images?: string[]; attachments?: number; draft?: Draft };
type Attached = PickedMedia & { image: string | null; ready: boolean };

const MAX_ATTACH = 3;

/** Sent when someone attaches a picture without typing anything. */
const LOOK: Record<AssistantLanguage, string> = {
  auto: 'Ki to trouve lor sa?',
  mfe: 'Ki to trouve lor sa?',
  fr: 'Que voyez-vous sur cette image ?',
  en: 'What can you see in this?',
};
type SavedChat = { id: string; title: string | null; messages: Turn[]; updated_at: string };

const STARTERS: Record<AssistantLanguage, string[]> = {
  auto: [
    'Kouma mo fer enn rapor pou enn lalimier ki pa marse?',
    'Que se passe-t-il après l’envoi d’un signalement ?',
    'How is my latest report doing?',
    'Ena inondasion kot mwa, ki mo bizin fer?',
  ],
  mfe: [
    'Kouma mo fer enn rapor pou enn lalimier ki pa marse?',
    'Ki arive apre mo fini avoy enn rapor?',
    'Kot mo dernie rapor ete?',
    'Ena inondasion kot mwa, ki mo bizin fer?',
  ],
  fr: [
    'Comment signaler un lampadaire en panne ?',
    'Que se passe-t-il après l’envoi d’un signalement ?',
    'Où en est mon dernier signalement ?',
    'Qui contacter en cas d’inondation ?',
  ],
  en: [
    'How do I report a broken street light?',
    'What happens after I send a report?',
    'How is my latest report doing?',
    'Who should I contact about flooding?',
  ],
};

const LANGUAGE_OPTIONS: { value: AssistantLanguage; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'mfe', label: 'Kreol' },
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

const PLACEHOLDER: Record<AssistantLanguage, string> = {
  auto: 'Ask in Kreol, French or English',
  mfe: 'Poz enn kestion',
  fr: 'Posez votre question',
  en: 'Ask anything',
};

export default function Assistant() {
  const { user, isGuest, limits } = useSession();
  const { colors, type, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const keyboard = useKeyboardVisible();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedChat[] | null>(null);
  const [attached, setAttached] = useState<Attached[]>([]);
  const [attachMenu, setAttachMenu] = useState(false);
  const language = usePref('assistantLanguage');
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [turns, busy]);

  const appStatus = async () => {
    const lines = [`Signed in: ${isGuest ? 'guest (read-only)' : 'member'}`];
    const area = getPrefs().alertArea;
    lines.push(`Alert area: ${area.mode === 'town' ? area.town : area.mode === 'near' ? `within ${area.km} km` : 'everywhere'}`);
    if (user && !isGuest) {
      try {
        const mine = await fetchReports({ mine: true, limit: 10 }, user.id);
        if (mine.length) {
          lines.push('Their reports (newest first):');
          mine.forEach((r) =>
            lines.push(`- "${r.title}" (${r.category}), status ${statusInfo(r.status).label}${r.sent_to ? `, sent to ${r.sent_to}` : ''}, ${r.me_too_count} me-too, ${r.comment_count} comments, posted ${timeAgo(r.created_at)}`),
          );
        } else lines.push('They have not posted any reports yet.');
      } catch {
        lines.push('Their reports could not be loaded right now.');
      }
    }
    return lines.join('\n');
  };

  const preparing = attached.some((a) => !a.ready);
  const full = attached.length >= MAX_ATTACH;

  const attach = async (camera: boolean) => {
    setAttachMenu(false);
    setError(null);
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
      videoMaxDuration: 60,
      allowsMultipleSelection: !camera,
      selectionLimit: MAX_ATTACH - attached.length,
    };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setError('To take a photo, the app needs your camera. You can allow this in your phone’s settings.');
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled) return;
    const picked: PickedMedia[] = res.assets.slice(0, MAX_ATTACH - attached.length).map((a) => ({
      uri: a.uri,
      mimeType: a.mimeType,
      type: a.type,
      width: a.width,
      height: a.height,
    }));
    setAttached((all) => [...all, ...picked.map((p) => ({ ...p, image: null, ready: false }))]);
    // Shrink each one for the assistant; the original file is kept for the report.
    for (const p of picked) {
      const image = await forAssistant(p);
      setAttached((all) => all.map((a) => (a.uri === p.uri ? { ...a, image, ready: true } : a)));
    }
  };

  const ask = async (q: string) => {
    const content = q.trim() || (attached.length ? LOOK[language] : '');
    if (!content || busy || preparing) return;
    const media: PickedMedia[] = attached.map((a) => ({ uri: a.uri, mimeType: a.mimeType, type: a.type, width: a.width, height: a.height }));
    const images = attached.map((a) => a.image).filter((x): x is string => !!x);
    const unseen = attached.length - images.length;
    const mine: Turn = { role: 'user', content, ...(media.length ? { media, images, attachments: media.length } : {}) };
    const next = [...turns, mine];
    setTurns(next);
    setText('');
    setAttached([]);
    setBusy(true);
    setError(null);
    // Only the latest pictures go to the assistant, to keep things quick.
    const last = next.map((t) => !!t.images?.length).lastIndexOf(true);
    const { data, error: e } = await supabase.functions.invoke('chat', {
      body: {
        messages: next.map((t, i) => ({ role: t.role, content: t.content, attachments: t.attachments, ...(i === last ? { images: t.images } : {}) })),
        chatId,
        appStatus: await appStatus(),
        language,
      },
    });
    if (unseen && !e) {
      setError(`The assistant couldn’t open ${unseen === 1 ? 'one of your files' : `${unseen} of your files`}. They’ll still be added if you make a report.`);
    }
    setBusy(false);
    if (e || !data?.reply) {
      // The function returns a message in the chosen language; fall back to a generic one.
      let message = 'The assistant isn’t available right now. Please try again.';
      try {
        const body = await (e as { context?: Response } | null)?.context?.json();
        if (typeof body?.error === 'string') message = body.error;
      } catch {}
      setError(message);
      return;
    }
    setTurns([...next, { role: 'assistant', content: data.reply as string, ...(data.draft ? { draft: data.draft as Draft } : {}) }]);
    if (data.chatId) setChatId(data.chatId as string);
  };

  /** Photos for a draft: the ones attached most recently before it in this chat (still on this phone). */
  const draftMedia = (upTo: number) => turns.slice(0, upTo).filter((t) => t.media?.length).at(-1)?.media ?? [];

  const openDraft = (d: Draft, upTo: number) => {
    setReportDraft({ ...d, media: draftMedia(upTo).slice(0, 6) });
    router.push('/report/new');
  };

  const openHistory = async () => {
    const { data } = await supabase.from('assistant_chats').select('id,title,messages,updated_at').order('updated_at', { ascending: false }).limit(30);
    setHistory((data ?? []) as SavedChat[]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text variant="display" accessibilityRole="header">Assistant</Text>
          <Text muted>{isGuest ? 'Guest chats aren’t saved.' : 'Ask about the app, your reports or who to contact.'}</Text>
        </View>
        {!isGuest && (
          <PressableScale onPress={openHistory} accessibilityRole="button" accessibilityLabel="Past chats" style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
            <Icon name="time-outline" size={20} />
          </PressableScale>
        )}
        {turns.length > 0 && (
          <PressableScale
            onPress={() => {
              setTurns([]);
              setChatId(null);
              setError(null);
              setAttached([]);
            }}
            accessibilityRole="button"
            accessibilityLabel="New chat"
            style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
            <Icon name="create-outline" size={20} />
          </PressableScale>
        )}
      </View>

      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Notice tone="danger" icon="call">
          <Text variant="label">In an emergency, call now</Text>
          <View style={styles.numbers}>
            {EMERGENCY_NUMBERS.map((e) => (
              <PressableScale
                key={e.label}
                onPress={() => Linking.openURL(`tel:${e.numbers[0]}`)}
                accessibilityRole="button"
                accessibilityLabel={`Call ${e.label} ${e.numbers.join(' or ')}`}
                style={[styles.number, { backgroundColor: colors.surface }]}>
                <Text variant="small" muted>{e.label}</Text>
                <Text variant="label" color={colors.danger}>{e.numbers.join(' / ')}</Text>
              </PressableScale>
            ))}
          </View>
          <Text variant="small" muted>The assistant can make mistakes and will say when it isn’t sure. It isn’t an emergency service.</Text>
        </Notice>

        <View style={{ gap: spacing.sm }}>
          <Text variant="label" muted>Reply language · Lang repons · Langue</Text>
          <Segmented value={language} onChange={(v) => setPref('assistantLanguage', v)} options={LANGUAGE_OPTIONS} />
        </View>

        {turns.length === 0 && (
          <View style={{ gap: spacing.md }}>
            <View style={styles.starters}>
              {STARTERS[language].map((s) => (
                <Chip key={s} label={s} onPress={() => ask(s)} />
              ))}
            </View>
            <View style={[styles.tip, { backgroundColor: colors.primarySoft }]}>
              <Icon name="camera-outline" size={22} color={colors.primary} />
              <Text style={{ flex: 1 }}>
                Tap <Text variant="bodyStrong">the photo button</Text> below to show me a problem. Ask what I see, or say{' '}
                <Text variant="bodyStrong">“report it”</Text> and I’ll fill in a report for you to check.
              </Text>
            </View>
          </View>
        )}

        {turns.map((t, i) => (
          <View
            key={i}
            style={[
              styles.msg,
              t.role === 'user'
                ? { alignSelf: 'flex-end', backgroundColor: colors.primary }
                : { alignSelf: 'flex-start', backgroundColor: colors.surface, boxShadow: shadows.card },
            ]}>
            {!!t.media?.length && (
              <View style={styles.bubbleMedia}>
                {t.media.map((m, j) => (
                  <Thumb key={j} item={m} size={72} />
                ))}
              </View>
            )}
            {!t.media?.length && !!t.attachments && (
              <Text variant="small" color={colors.onPrimary} style={{ opacity: 0.85 }}>
                {t.attachments === 1 ? '1 photo or video' : `${t.attachments} photos or videos`} (not kept with past chats)
              </Text>
            )}
            <Text color={t.role === 'user' ? colors.onPrimary : colors.text} selectable>{t.content}</Text>
            {t.draft && (
              <DraftCard
                draft={t.draft}
                photos={draftMedia(i).length}
                blocked={isGuest ? 'guest' : limits.no_reports ? 'paused' : null}
                onOpen={() => openDraft(t.draft!, i)}
              />
            )}
          </View>
        ))}
        {busy && (
          <View style={[styles.msg, { alignSelf: 'flex-start', backgroundColor: colors.surface, flexDirection: 'row', gap: spacing.sm }]}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text muted>Thinking…</Text>
          </View>
        )}
        {error && <Notice tone="warning"><Text>{error}</Text></Notice>}
      </ScrollView>

      <View style={[styles.composerWrap, { marginBottom: keyboard ? insets.bottom + spacing.sm : tabSpace - spacing.lg, backgroundColor: colors.surface, boxShadow: shadows.raised }]}>
        {attached.length > 0 && (
          <View style={styles.attachedRow}>
            {attached.map((a, i) => (
              <View key={a.uri}>
                <Thumb item={a} size={64} loading={!a.ready} />
                <PressableScale
                  onPress={() => setAttached((all) => all.filter((_, j) => j !== i))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${isVideo(a) ? 'video' : 'photo'} ${i + 1}`}
                  hitSlop={8}
                  style={[styles.remove, { backgroundColor: colors.text }]}>
                  <Icon name="close" size={14} color={colors.background} />
                </PressableScale>
              </View>
            ))}
          </View>
        )}
        <View style={styles.composer}>
        <PressableScale
          onPress={() => (Platform.OS === 'web' ? attach(false) : setAttachMenu(true))}
          disabled={busy || full}
          accessibilityRole="button"
          accessibilityLabel={full ? `Photo limit reached (${MAX_ATTACH})` : 'Add a photo or video'}
          style={[styles.iconBtn, { backgroundColor: colors.primarySoft, opacity: busy || full ? 0.5 : 1 }]}>
          <Icon name="image-outline" size={22} color={colors.primary} />
        </PressableScale>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={PLACEHOLDER[language]}
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={2000}
          style={[type('body'), styles.input, { backgroundColor: colors.surfaceMuted, color: colors.text }]}
          accessibilityLabel="Your question"
        />
        <PressableScale
          onPress={() => ask(text)}
          disabled={busy || preparing || (!text.trim() && !attached.length)}
          accessibilityRole="button"
          accessibilityLabel={preparing ? 'Getting your photo ready' : 'Send'}
          style={[styles.iconBtn, { backgroundColor: colors.primary }]}>
          {preparing ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Icon name="arrow-up" size={20} color={colors.onPrimary} />}
        </PressableScale>
        </View>
      </View>

      <Sheet visible={attachMenu} onClose={() => setAttachMenu(false)} title="Show the assistant">
        <Row icon="camera-outline" title="Take a photo or video" onPress={() => attach(true)} />
        <Row icon="images-outline" title="Choose from your phone" subtitle={`Up to ${MAX_ATTACH - attached.length} more`} onPress={() => attach(false)} />
      </Sheet>

      <Sheet visible={history !== null} onClose={() => setHistory(null)} title="Past chats">
        {history?.length === 0 && <Text muted>No saved chats yet.</Text>}
        {history?.map((c) => (
          <Row
            key={c.id}
            icon="chatbubble-ellipses-outline"
            title={c.title || 'Chat'}
            subtitle={timeAgo(c.updated_at)}
            onPress={() => {
              setTurns(c.messages);
              setChatId(c.id);
              setHistory(null);
            }}
          />
        ))}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function Thumb({ item, size, loading }: { item: PickedMedia; size: number; loading?: boolean }) {
  const { colors } = useTheme();
  const video = isVideo(item);
  return (
    <View style={{ width: size, height: size, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceMuted }}>
      {video ? (
        <View style={styles.center}>
          <Icon name="videocam" size={size / 3} color={colors.textMuted} />
        </View>
      ) : (
        <Image source={{ uri: item.uri }} style={{ width: size, height: size }} contentFit="cover" accessibilityLabel="Attached photo" />
      )}
      {video && (
        <View style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
          <Icon name="play" size={10} color="#fff" />
        </View>
      )}
      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      )}
    </View>
  );
}

function DraftCard({ draft, photos, blocked, onOpen }: { draft: Draft; photos: number; blocked: 'guest' | 'paused' | null; onOpen: () => void }) {
  const { colors } = useTheme();
  const cat = categoryInfo(draft.category);
  return (
    <View style={[styles.draft, { borderColor: colors.separator, backgroundColor: colors.background }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={[styles.catIcon, { backgroundColor: cat.color }]}>
          <Icon name={cat.icon} size={16} color="#fff" />
        </View>
        <Text variant="small" muted style={{ flex: 1 }}>Draft report · {cat.label}</Text>
      </View>
      <Text variant="bodyStrong">{draft.title}</Text>
      {!!draft.description && <Text>{draft.description}</Text>}
      <Text variant="small" muted>
        {photos ? `${photos === 1 ? '1 photo or video' : `${photos} photos or videos`} will be added. ` : ''}Not sent yet.
      </Text>
      {blocked === 'guest' ? (
        <Text variant="small" muted>Sign in to post reports.</Text>
      ) : blocked === 'paused' ? (
        <Text variant="small" muted>A moderator has paused reporting for your account.</Text>
      ) : (
        <Button title="Check and send" icon="arrow-forward" onPress={onOpen} accessibilityLabel={`Check and send the report: ${draft.title}`} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: GUTTER, paddingBottom: spacing.sm, width: '100%', maxWidth: 760, alignSelf: 'center' },
  content: { paddingHorizontal: GUTTER, paddingVertical: spacing.md, gap: spacing.md, width: '100%', maxWidth: 760, alignSelf: 'center' },
  numbers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  number: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, minWidth: 90 },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  msg: { maxWidth: '86%', borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  composerWrap: { marginHorizontal: 12, borderRadius: radius.lg, padding: spacing.sm, gap: spacing.sm },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  attachedRow: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs, paddingHorizontal: spacing.xs },
  remove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bubbleMedia: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', left: 4, bottom: 4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md },
  draft: { marginTop: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  catIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: 11, paddingBottom: 11 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
