// The single list of allowed reaction emojis on the app side.
// KEEP IN STEP with public.is_reaction_emoji() in supabase/schema.sql — the database rejects anything else.
export const REACTION_EMOJIS = [
  '👍', '👎', '❤️', '😂', '😮', '😢',
  '😡', '🙏', '👏', '🔥', '🎉', '💯',
  '🤔', '😊', '😍', '🥲', '😅', '🙌',
  '💪', '👀', '✅', '❌', '⚠️', '🚨',
  '🚗', '🚌', '🌧️', '☀️', '🌊', '🌳',
  '🏥', '🚓', '🗑️', '💡', '🇲🇺', '🤝',
] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const DEFAULT_QUICK_REACTIONS: string[] = ['👍', '❤️', '😂', '😮', '🙏', '⚠️'];

export function isReactionEmoji(e: string): e is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(e);
}

export type ReactionSummary = { emoji: string; count: number; mine: boolean };

/** Group raw reaction rows into per-emoji counts, keeping the order of REACTION_EMOJIS. */
export function summariseReactions(
  rows: { emoji: string; user_id: string }[],
  me: string | undefined,
): ReactionSummary[] {
  const map = new Map<string, ReactionSummary>();
  for (const r of rows) {
    const s = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    s.count += 1;
    if (r.user_id === me) s.mine = true;
    map.set(r.emoji, s);
  }
  return [...map.values()].sort(
    (a, b) =>
      (REACTION_EMOJIS as readonly string[]).indexOf(a.emoji) -
      (REACTION_EMOJIS as readonly string[]).indexOf(b.emoji),
  );
}
