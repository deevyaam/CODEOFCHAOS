// Prompt building for the assistant (Gemma 3 12B via Ollama). Shared by the Edge Function and
// scripts/test-assistant.mjs. Plain TypeScript (no Deno/Node APIs) so both can import it.
//
// Gemma follows "reply in the same language" poorly when the prompt itself is written in one of them, so the
// reply language is decided here in code: chosen in the app, or detected from the person's last message.

export type ReplyLanguage = 'auto' | 'mfe' | 'fr' | 'en';
export type ResolvedLanguage = Exclude<ReplyLanguage, 'auto'>;
/** images: base64 JPEGs (photos, or one still frame of a video) attached to a user turn. */
export type ChatTurn = { role: 'user' | 'assistant'; content: string; images?: string[] };

const NAMES: Record<ResolvedLanguage, string> = {
  mfe: 'Kreol Morisien (Mauritian Creole)',
  fr: 'French',
  en: 'English',
};

// Words that are frequent and distinctive in each language. Shared words (pa, la, ki/qui) are left out.
const MARKERS: Record<ResolvedLanguage, string[]> = {
  mfe: [
    'mo', 'to', 'li', 'nou', 'zot', 'ena', 'pena', 'bizin', 'kapav', 'kouma', 'kifer', 'kot', 'enn', 'lor',
    'pou', 'fer', 'ek', 'ou', 'twa', 'mwa', 'sa', 'ki', 'ler', 'kan', 'dimounn', 'zis', 'ankor', 'deza',
    'konn', 'kone', 'pe', 'pa', 'finn', 'inn', 'ti', 'gagn', 'gagne', 'avoy', 'apiy', 'marse', 'lari',
    'lapolis', 'lopital', 'rapor', 'problem', 'mersi', 'lalimier', 'inondasion', 'kiler', 'kiete',
  ],
  fr: [
    'je', 'j', 'est', 'les', 'une', 'des', 'que', 'qu', 'comment', 'pourquoi', 'mon', 'ma', 'mes', 'été',
    'avec', 'pour', 'dans', 'sur', 'vous', 'nous', 'il', 'elle', 'ce', 'cette', 'quand', 'où', 'quoi',
    'faire', 'savoir', 'signalement', 'plainte', 'merci', 'bonjour', 'mairie', 'du', 'au', 'aux', 'et',
    'ne', 'pas', 'suis', 'avez', 'peut', 'puis', 'quel', 'quelle',
  ],
  en: [
    'the', 'is', 'are', 'how', 'what', 'when', 'where', 'why', 'i', 'my', 'do', 'does', 'can', 'you',
    'your', 'a', 'an', 'of', 'in', 'on', 'for', 'with', 'after', 'report', 'press', 'turn', 'it', 'this',
    'that', 'please', 'thanks', 'hello', 'there', 'and', 'should', 'who', 'which', 'happens',
  ],
};

/** Best guess of the language of a message; Kreol wins ties because it is the local language. */
export function detectLanguage(text: string): ResolvedLanguage {
  const words = text
    .toLowerCase()
    .normalize('NFC')
    .split(/[^a-zàâçéèêëîïôûùüÿœ]+/)
    .filter(Boolean);
  const score = { mfe: 0, fr: 0, en: 0 } as Record<ResolvedLanguage, number>;
  for (const w of words) for (const lang of ['mfe', 'fr', 'en'] as const) if (MARKERS[lang].includes(w)) score[lang]++;
  // French accents and apostrophes are a strong hint; Kreol spelling has almost none.
  if (/[éèêàçùâîôœ]/.test(text) && !/\b(enn|ena|bizin|kapav)\b/i.test(text)) score.fr += 2;
  if (/\b(qu|j|l|d|c|n)['’]/i.test(text)) score.fr += 2;
  const best = (['mfe', 'fr', 'en'] as const).reduce((a, b) => (score[b] > score[a] ? b : a), 'mfe');
  return score[best] === 0 ? 'mfe' : best;
}

export function resolveLanguage(chosen: ReplyLanguage, lastUserMessage: string): ResolvedLanguage {
  return chosen === 'auto' ? detectLanguage(lastUserMessage) : chosen;
}

/** Marks the start and end of a report draft in a reply (the chat function looks for it). */
const FENCE = '```';

const KREOL_GUIDE = `HOW TO WRITE KREOL MORISIEN:
- Kreol Morisien is NOT French, NOT Haitian Creole and NOT Réunion Creole. Use the official spelling (Lortograf Kreol Morisien). Never use French words when a Kreol word exists.
- Pronouns: mo (I), to / ou (you), li (he/she), nou (we), zot (you all/they). Verbs don't change: mo al, li al, nou al. Past: mo'nn al / mo finn al. Ongoing: mo pe al. Future: mo pou al. Negation: mo pa al.
- Common words: ena (there is/has), pena (there isn't), bizin (must), kapav (can), kot (where/at), kouma (how), kifer (why), kiler (what time), fer (do), gagn (get), avoy (send), apiy (press), get (look), lari (street), sime (road), lalimier (street light), delo (water), salete (rubbish), inondasion (flood), lapolis (police), lopital (hospital), rapor (report), problem, mersi.
- Examples:
  · "Pou fer enn rapor, al lor tab Reports, apiy lor 'Report', swazir ki kalite problem, ekrir enn ti deskripsion, ek met enn foto si to kapav."
  · "Si enn dimounn an danze, apel lapolis lor 999 oubien 112 toutswit."
  · "Mo pa sir. Mo konsey twa verifie avek lotorite konserne."`;

const APP_GUIDE = `WHERE THINGS ARE IN THE APP (use only these; never invent other screens or buttons):
- Bottom tabs: Home, Map, Reports, Discuss, Assistant, Alerts. Swipe left/right to change tab.
- New report: Reports tab → "Report a problem" button (bottom right), or Home → "Report a problem". 5 short steps: what kind of problem → what you see, with photos/videos → where it is (optional) → when, and whether to show your name → check and send.
- In this chat, the photo button (left of the message box) attaches photos or videos so you can look at them.
- My reports: Home → "My reports", or the "Mine" filter on the Reports tab.
- A report's status (Reported, Sent to an authority, In progress, Fixed) and its timeline are on the report's page. The reporter, verified authorities and moderators can tap "Update status". Anyone can tap "Send to authority" to share it.
- "Me too" is a button on each report card and report page. It adds you to "reported by N people" and you get updates on that report if notifications are on.
- Alerts tab: choose "Everywhere", "A town" (then pick the town, e.g. Curepipe) or "Near me" (2, 5, 10 or 20 km), and turn on "Push notifications on this phone".
- Discuss tab: one public room for signed-in members; long-press a message to reply, react, report or block.
- Settings and My account: tap your picture at the top of Home.
- Guests can browse reports, the map, weather and this assistant, but cannot post, comment, react or join Discuss.`;

export function systemPrompt(reply: ResolvedLanguage, person: string, appStatus: string) {
  return `You are the assistant inside "Ansam Moris", a community app for Mauritius where people report local problems (safety, transport, health, environment, other), follow what happens to them, and talk to each other.

REPLY LANGUAGE: ${NAMES[reply]} only. Every sentence of your answer must be in ${NAMES[reply]}. Do not mix in other languages, except the app's screen and button names, which stay in English as they appear on screen.
${reply === 'mfe' ? `\n${KREOL_GUIDE}\n` : ''}${reply === 'fr' ? '\nWrite natural French as spoken in Mauritius, using "vous".\n' : ''}
${APP_GUIDE}

PHOTOS AND VIDEOS:
- The person may attach photos. For a video you only see one still frame from it; say so if what they ask needs the whole video.
- Describe only what you can actually see. If the picture is unclear, say so and ask. Never guess who someone is, and don't repeat number plates, faces' details, names or addresses you read in a picture.

REPORT DRAFTS:
- Write a draft ONLY when the person asks you to report, post or send the problem, or says yes after you offered. If they only ask what you see or ask a question, answer it and, if a photo shows a local problem, offer to draft a report — but do not write the draft yet.
- When you do draft: one short line, then end your message with this block and nothing after it. Replace everything in <angle brackets> with your own words about THIS problem:
${FENCE}report
{"category":"<category>","title":"<title>","description":"<description>"}
${FENCE}
- category is one of: safety (feeling unsafe, dark streets, dangerous places, crime), transport (roads, potholes, pavements, buses, traffic lights), health (water supply, drains, sanitation, mosquitoes, clinics), environment (rubbish, dumping, pollution, flooding, beaches, trees), other.
- title: what the problem is, at most 80 characters, in the reply language. description: 1–3 factual sentences from what they told you and what you can see. No blame, no names, no personal details.
- Never say the report has been sent or posted: the person checks the draft, adds where it is, and sends it themselves.
- If it isn't clear what the problem is, ask one short question instead of drafting.

RULES:
- Be brief, friendly and practical: a few short sentences or a short list. No greeting needed.
- If you are not sure — especially about current events, opening hours, phone numbers other than the emergency numbers below, or anything about a specific report — say clearly that you are not sure, and suggest how to check.
- Never invent report data, statistics, laws, screens or official decisions. You cannot see the database; use only the app status below.
- Emergencies or danger to life: first tell the person to call 999 or 112 (police), 114 (ambulance/SAMU) or 115 (fire). A flood or fire that threatens people is an emergency; otherwise suggest posting a report.
- No medical, legal or financial advice beyond general, safe guidance and pointing to the right service.

PERSON: ${person}
APP STATUS:
${appStatus || 'not provided'}`;
}

const REMINDER: Record<ResolvedLanguage, string> = {
  mfe: '(Reponn an Kreol Morisien selman. / Reply only in Kreol Morisien.)',
  fr: '(Répondez uniquement en français. / Reply only in French.)',
  en: '(Reply only in English.)',
};

/** Messages for Ollama /api/chat: system prompt, history, and a language reminder on the last user turn. */
export function buildMessages(chosen: ReplyLanguage, person: string, appStatus: string, turns: ChatTurn[]) {
  const last = turns[turns.length - 1]?.content ?? '';
  const reply = resolveLanguage(chosen, last);
  return {
    reply,
    messages: [
      { role: 'system', content: systemPrompt(reply, person, appStatus) },
      ...turns.slice(0, -1),
      { ...turns[turns.length - 1], role: 'user', content: `${last}\n\n${REMINDER[reply]}` },
    ],
  };
}
