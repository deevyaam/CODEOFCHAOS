import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { REACTION_EMOJIS, type ReactionSummary } from '@/lib/discussion';
import { usePref } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';
import { radius, spacing, useTheme } from '@/theme';

import { Sheet } from './sheet';
import { Button, Icon, Notice, PressableScale, Row, Text } from './ui';

/** Reaction chips under a message/comment. One reaction per person: tapping another replaces it. */
export function ReactionBar({
  reactions,
  canReact,
  onReact,
}: {
  reactions: ReactionSummary[];
  canReact: boolean;
  onReact: (emoji: string | null) => void;
}) {
  const { colors } = useTheme();
  const [picker, setPicker] = useState(false);
  const mine = reactions.find((r) => r.mine)?.emoji ?? null;
  return (
    <View style={styles.bar}>
      {reactions.map((r) => (
        <PressableScale
          key={r.emoji}
          disabled={!canReact}
          haptic
          onPress={() => onReact(r.mine ? null : r.emoji)}
          accessibilityRole="button"
          accessibilityLabel={`${r.emoji} ${r.count}${r.mine ? ', your reaction' : ''}`}
          style={[styles.chip, { backgroundColor: r.mine ? colors.primarySoft : colors.surfaceMuted }]}>
          <Text variant="label">{r.emoji}</Text>
          <Text variant="small" color={r.mine ? colors.primary : colors.textMuted}>{r.count}</Text>
        </PressableScale>
      ))}
      {canReact && (
        <PressableScale
          onPress={() => setPicker(true)}
          accessibilityRole="button"
          accessibilityLabel="Add reaction"
          style={[styles.chip, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name="happy-outline" size={16} color={colors.textMuted} />
          <Icon name="add" size={12} color={colors.textMuted} />
        </PressableScale>
      )}
      <EmojiPicker
        visible={picker}
        current={mine}
        onClose={() => setPicker(false)}
        onPick={(e) => {
          setPicker(false);
          onReact(e === mine ? null : e);
        }}
      />
    </View>
  );
}

export function QuickReactions({ onPick, current }: { onPick: (e: string) => void; current?: string | null }) {
  const quick = usePref('quickReactions');
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
      {quick.map((e) => (
        <PressableScale
          key={e}
          haptic
          onPress={() => onPick(e)}
          accessibilityRole="button"
          accessibilityLabel={`React ${e}`}
          style={[styles.quick, { backgroundColor: current === e ? colors.primarySoft : colors.surfaceMuted }]}>
          <Text style={{ fontSize: 24, lineHeight: 30 }}>{e}</Text>
        </PressableScale>
      ))}
    </View>
  );
}

export function EmojiPicker({
  visible,
  onClose,
  onPick,
  current,
  title = 'React',
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (e: string) => void;
  current?: string | null;
  title?: string;
}) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <QuickReactions onPick={onPick} current={current} />
      <Text variant="label" muted style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>All reactions</Text>
      <View style={styles.grid}>
        {REACTION_EMOJIS.map((e) => (
          <Pressable
            key={e}
            onPress={() => onPick(e)}
            accessibilityRole="button"
            accessibilityLabel={e}
            style={[styles.cell, current === e && { backgroundColor: colors.primarySoft }]}>
            <Text style={{ fontSize: 26, lineHeight: 32 }}>{e}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const REASONS = [
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'abuse', label: 'Harassment, hate or abuse' },
  { value: 'personal_info', label: 'Shares someone’s personal information' },
  { value: 'false_info', label: 'False or misleading' },
  { value: 'dangerous', label: 'Dangerous or illegal' },
  { value: 'other', label: 'Something else' },
] as const;

/** Flag a report, comment or message for moderators, and optionally block its author. */
export function FlagSheet({
  visible,
  onClose,
  target,
  authorId,
  myId,
}: {
  visible: boolean;
  onClose: () => void;
  target: { type: 'report' | 'comment' | 'message'; id: string } | null;
  authorId?: string | null;
  myId?: string;
}) {
  const { colors, type } = useTheme();
  const [reason, setReason] = useState<(typeof REASONS)[number]['value'] | null>(null);
  const [details, setDetails] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setReason(null);
    setDetails('');
    setDone(null);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title="Report a problem with this post">
      {done ? (
        <View style={{ gap: spacing.md }}>
          <Notice><Text>{done}</Text></Notice>
          <Button title="Done" onPress={close} />
        </View>
      ) : (
        <View style={{ gap: spacing.xs }}>
          {REASONS.map((r) => (
            <Row
              key={r.value}
              title={r.label}
              onPress={() => setReason(r.value)}
              right={<Icon name={reason === r.value ? 'radio-button-on' : 'radio-button-off'} color={colors.primary} />}
            />
          ))}
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Anything else moderators should know (optional)"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={1000}
            style={[type('body'), { backgroundColor: colors.surfaceMuted, color: colors.text, borderRadius: radius.md, padding: spacing.md, minHeight: 80, textAlignVertical: 'top' }]}
          />
          <Button
            title="Send to moderators"
            disabled={!reason || !target}
            loading={busy}
            style={{ marginTop: spacing.md }}
            onPress={async () => {
              if (!target || !reason) return;
              setBusy(true);
              const { error } = await supabase
                .from('content_flags')
                .insert({ target_type: target.type, target_id: target.id, reason, details: details.trim() || null });
              setBusy(false);
              setDone(
                error?.code === '23505'
                  ? 'You already reported this. Moderators will look at it.'
                  : error
                    ? error.message
                    : 'Thanks. Moderators will review it.',
              );
            }}
          />
          {authorId && myId && authorId !== myId && (
            <Button
              kind="danger"
              icon="ban"
              title="Block this person"
              style={{ marginTop: spacing.sm }}
              onPress={async () => {
                const { error } = await blockUser(myId, authorId);
                setDone(error ? error.message : 'Blocked. You won’t see their posts. You can unblock them in Settings.');
              }}
            />
          )}
        </View>
      )}
    </Sheet>
  );
}

export function blockUser(me: string, other: string) {
  return supabase.from('user_blocks').upsert({ blocker_id: me, blocked_id: other });
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 30, borderRadius: radius.pill },
  quick: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '16.66%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
});
