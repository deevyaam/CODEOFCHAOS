// Assistant chat — Gemma 3 12B served by Ollama. Answers in Kreol Morisien, French or English.
// Signed-in members' chats are saved to assistant_chats; guests' chats are answered but never stored.
//
// Function secrets:
//   OLLAMA_URL      base URL of an Ollama server reachable from Supabase, e.g. https://ollama.example.com
//                   (a tunnel to your own machine, a server, or https://ollama.com for Ollama Cloud)
//   OLLAMA_MODEL    optional, defaults to gemma3:12b
//   OLLAMA_API_KEY  optional, sent as "Authorization: Bearer …" (Ollama Cloud or a protected proxy)
import { createClient } from 'npm:@supabase/supabase-js@2';

import { buildMessages, resolveLanguage, type ReplyLanguage } from './prompt.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LANGUAGES: ReplyLanguage[] = ['auto', 'mfe', 'fr', 'en'];
const TIMEOUT_MS = 140_000; // a cold start plus a photo can take over a minute on this PC

const BUSY: Record<ReplyLanguage, string> = {
  auto: 'The assistant is unavailable right now. Please try again in a moment.',
  en: 'The assistant is unavailable right now. Please try again in a moment.',
  fr: "L'assistant n'est pas disponible pour le moment. Réessayez dans un instant.",
  mfe: 'Lasistan pa disponib pou lemoman. Reesey dan enn ti moman.',
};

type Turn = { role: 'user' | 'assistant'; content: string; images?: string[]; attachments?: number };
type Draft = { category: 'safety' | 'transport' | 'health' | 'environment' | 'other'; title: string; description: string };

const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 700_000; // ~500 KB of JPEG; the app sends ~100 KB per picture.
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const CATEGORIES = ['safety', 'transport', 'health', 'environment', 'other'];

const DRAFT_READY: Record<'mfe' | 'fr' | 'en', string> = {
  en: 'Here is a draft report. Check it, add where it is, then send it.',
  fr: 'Voici un brouillon de signalement. Vérifiez-le, ajoutez le lieu, puis envoyez-le.',
  mfe: 'Ala enn brouyon rapor. Verifie li, azout kot sa ete, apre avoy li.',
};

/** Pull the ```report {...}``` block out of the model's reply. */
function takeDraft(reply: string): { text: string; draft: Draft | null } {
  const m = reply.match(/```\s*report\s*([\s\S]*?)```/i) ?? reply.match(/```\s*json\s*(\{[\s\S]*?"category"[\s\S]*?\})\s*```/i);
  if (!m) return { text: reply, draft: null };
  const text = reply.replace(m[0], '').trim();
  try {
    const d = JSON.parse(m[1].trim()) as Partial<Draft>;
    const category = CATEGORIES.includes(String(d.category)) ? (d.category as Draft['category']) : 'other';
    const title = String(d.title ?? '').trim().slice(0, 80);
    const description = String(d.description ?? '').trim().slice(0, 1000);
    if (!title) return { text, draft: null };
    return { text, draft: { category, title, description } };
  } catch {
    return { text, draft: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return json({ error: 'Sign in (or continue as guest) to use the assistant' }, 401);
  const isGuest = Boolean(user.is_anonymous);

  let body: { messages?: Turn[]; chatId?: string; appStatus?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const language: ReplyLanguage = LANGUAGES.includes(body.language as ReplyLanguage) ? (body.language as ReplyLanguage) : 'auto';
  const turns = (body.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000), images: m.role === 'user' ? cleanImages(m.images) : [],
      attachments: m.role === 'user' ? Math.min(Math.max(Number(m.attachments) || 0, 0), 10) : 0 }));
  // Pictures go to the model only from the latest message that has them, to keep requests small.
  const withImages = turns.map((t) => t.images.length > 0).lastIndexOf(true);
  const modelTurns = turns.map((t, i) => (i === withImages ? { role: t.role, content: t.content, images: t.images } : { role: t.role, content: t.content }));
  if (!turns.length || turns[0].role !== 'user' || turns[turns.length - 1].role !== 'user') {
    return json({ error: 'The conversation must start and end with a user message' }, 400);
  }

  const replyLanguage = resolveLanguage(language, turns[turns.length - 1].content);
  const busy = BUSY[replyLanguage];
  const baseUrl = (Deno.env.get('OLLAMA_URL') ?? '').replace(/\/+$/, '');
  if (!baseUrl) {
    console.error('OLLAMA_URL is not set');
    return json({ error: busy }, 503);
  }
  const model = Deno.env.get('OLLAMA_MODEL') || 'gemma3:12b';
  const apiKey = Deno.env.get('OLLAMA_API_KEY');

  // Short, factual snapshot of the app's state (from the client) so the assistant can answer "how is my report doing".
  const appStatus = (body.appStatus ?? '').slice(0, 3000);

  let reply = '';
  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: '30m',
        options: { temperature: 0.3, num_ctx: 8192, num_predict: 700 },
        messages: buildMessages(language, isGuest ? 'guest (read-only)' : 'signed-in member', appStatus, modelTurns).messages,
      }),
    });
    if (!res.ok) {
      console.error('Ollama error', res.status, (await res.text()).slice(0, 500));
      return json({ error: busy }, 502);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    reply = (data.message?.content ?? '').trim();
    if (!reply) return json({ error: busy }, 502);
  } catch (error) {
    console.error('Ollama request failed', error instanceof Error ? error.message : error);
    return json({ error: busy }, 504);
  }

  const { text, draft } = takeDraft(reply);
  reply = text || (draft ? DRAFT_READY[replyLanguage] : reply);

  // Guests' chats are never saved. Pictures are never saved with a chat, only how many there were.
  let chatId = body.chatId ?? null;
  if (!isGuest) {
    const all = [
      ...turns.map((t) => {
        const n = Math.max(t.images.length, t.attachments);
        return n ? { role: t.role, content: t.content, attachments: n } : { role: t.role, content: t.content };
      }),
      { role: 'assistant' as const, content: reply, ...(draft ? { draft } : {}) },
    ];
    if (chatId) {
      await supabase.from('assistant_chats').update({ messages: all }).eq('id', chatId);
    } else {
      const { data } = await supabase
        .from('assistant_chats')
        .insert({ messages: all, title: turns[0].content.slice(0, 80) })
        .select('id')
        .single();
      chatId = data?.id ?? null;
    }
  }

  return json({ reply, draft, chatId, saved: !isGuest });
});

function cleanImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.replace(/^data:image\/[a-z]+;base64,/, ''))
    .filter((x) => x.length > 0 && x.length <= MAX_IMAGE_CHARS && BASE64.test(x))
    .slice(0, MAX_IMAGES);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
