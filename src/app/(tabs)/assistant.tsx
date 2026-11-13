import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardVisible, useTabBarSpace } from '@/components/layout';
import { Sheet } from '@/components/sheet';
import { Chip, Icon, Notice, PressableScale, Row, Segmented, Text } from '@/components/ui';
import { EMERGENCY_NUMBERS } from '@/config';
import { getPrefs, setPref, usePref, type AssistantLanguage } from '@/lib/prefs';
import { fetchReports, statusInfo, timeAgo } from '@/lib/reports';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { GUTTER, radius, spacing, useTheme } from '@/theme';

type Turn = { role: 'user' | 'assistant'; content: string };
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
  const { user, isGuest } = useSession();
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

  const ask = async (q: string) => {
    const content = q.trim();
    if (!content || busy) return;
    const next = [...turns, { role: 'user' as const, content }];
    setTurns(next);
    setText('');
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.functions.invoke('chat', {
      body: { messages: next, chatId, appStatus: await appStatus(), language },
    });
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
    setTurns([...next, { role: 'assistant', content: data.reply as string }]);
    if (data.chatId) setChatId(data.chatId as string);
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
          <View style={styles.starters}>
            {STARTERS[language].map((s) => (
              <Chip key={s} label={s} onPress={() => ask(s)} />
            ))}
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
            <Text color={t.role === 'user' ? colors.onPrimary : colors.text} selectable>{t.content}</Text>
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

      <View style={[styles.composer, { marginBottom: keyboard ? insets.bottom + spacing.sm : tabSpace - spacing.lg, backgroundColor: colors.surface, boxShadow: shadows.raised }]}>
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
          disabled={busy || !text.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={[styles.iconBtn, { backgroundColor: colors.primary }]}>
          <Icon name="arrow-up" size={20} color={colors.onPrimary} />
        </PressableScale>
      </View>

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

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: GUTTER, paddingBottom: spacing.sm, width: '100%', maxWidth: 760, alignSelf: 'center' },
  content: { paddingHorizontal: GUTTER, paddingVertical: spacing.md, gap: spacing.md, width: '100%', maxWidth: 760, alignSelf: 'center' },
  numbers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  number: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, minWidth: 90 },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  msg: { maxWidth: '86%', borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginHorizontal: 12, borderRadius: radius.lg, padding: spacing.sm },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: 11, paddingBottom: 11 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
