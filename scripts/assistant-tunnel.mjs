// Makes the Gemma 3 12B on this PC reachable by the Supabase "chat" Edge Function.
//
//   npm run assistant:tunnel
//
// 1. Starts a small proxy on 127.0.0.1:11435 in front of Ollama (127.0.0.1:11434). The proxy only accepts
//    POST /api/chat with "Authorization: Bearer <key>", only for the allowed model, with a size and rate limit.
//    Ollama itself is never exposed.
// 2. Starts a Cloudflare quick tunnel (https://<random>.trycloudflare.com) to the proxy.
// 3. Stores OLLAMA_URL and OLLAMA_API_KEY as secrets of the Supabase project in .env, so the app uses it.
// Keep this window open: the assistant works only while it runs (and while this PC is on). Ctrl+C stops it.
//
// The key is generated once and kept in .ollama-proxy-key (git-ignored). Delete that file to rotate it.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OLLAMA = process.env.OLLAMA_LOCAL_URL ?? 'http://127.0.0.1:11434';
const MODEL = process.env.OLLAMA_MODEL ?? 'gemma3:12b';
const PORT = Number(process.env.OLLAMA_PROXY_PORT ?? 11435);
const MAX_BODY = 512 * 1024;
const MAX_PER_MINUTE = 30;
const KEY_FILE = '.ollama-proxy-key';

// ── Project ref from .env ────────────────────────────────────────────────────
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const ref = env.match(/EXPO_PUBLIC_SUPABASE_URL=https:\/\/([a-z0-9]{20})\.supabase\.co/)?.[1];
if (!ref) {
  console.error('✖ Could not find the Supabase project in .env (EXPO_PUBLIC_SUPABASE_URL).');
  process.exit(1);
}

// ── Check Ollama and the model ──────────────────────────────────────────────
try {
  const tags = await (await fetch(`${OLLAMA}/api/tags`)).json();
  if (!tags.models?.some((m) => m.name === MODEL)) {
    console.error(`✖ Ollama is running but doesn't have ${MODEL}. Run: ollama pull ${MODEL}`);
    process.exit(1);
  }
} catch {
  console.error(`✖ Ollama isn't answering at ${OLLAMA}. Start the Ollama app first.`);
  process.exit(1);
}

// ── Key ─────────────────────────────────────────────────────────────────────
if (!existsSync(KEY_FILE)) writeFileSync(KEY_FILE, randomBytes(32).toString('hex'), { mode: 0o600 });
const KEY = readFileSync(KEY_FILE, 'utf8').trim();
const keyBuf = Buffer.from(`Bearer ${KEY}`);
const authorised = (header = '') => {
  const b = Buffer.from(header);
  return b.length === keyBuf.length && timingSafeEqual(b, keyBuf);
};

// ── Proxy ───────────────────────────────────────────────────────────────────
const hits = [];
const server = http.createServer(async (req, res) => {
  const send = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  if (req.method !== 'POST' || req.url !== '/api/chat') return send(404, { error: 'not found' });
  if (!authorised(req.headers.authorization)) return send(401, { error: 'unauthorised' });

  const now = Date.now();
  while (hits.length && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= MAX_PER_MINUTE) return send(429, { error: 'too many requests' });
  hits.push(now);

  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) return send(413, { error: 'too large' });
    chunks.push(c);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return send(400, { error: 'invalid json' });
  }
  if (!Array.isArray(body.messages)) return send(400, { error: 'messages required' });
  // Only the allowed model, no streaming, bounded output.
  body.model = MODEL;
  body.stream = false;
  body.options = { ...(body.options ?? {}), num_predict: Math.min(Number(body.options?.num_predict) || 700, 1000) };

  const started = Date.now();
  try {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    res.end(await r.text());
    console.log(`  ↳ chat answered in ${((Date.now() - started) / 1000).toFixed(1)} s (${r.status})`);
  } catch (e) {
    console.log(`  ↳ Ollama failed: ${e.message}`);
    send(502, { error: 'ollama unavailable' });
  }
});
await new Promise((ok) => server.listen(PORT, '127.0.0.1', ok));
console.log(`✔ Proxy on http://127.0.0.1:${PORT} → ${OLLAMA} (${MODEL})`);

// ── Tunnel ──────────────────────────────────────────────────────────────────
const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
const url = await new Promise((resolve, reject) => {
  const onData = (d) => {
    const m = d.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) resolve(m[0]);
  };
  tunnel.stdout.on('data', onData);
  tunnel.stderr.on('data', onData);
  tunnel.on('exit', (code) => reject(new Error(`cloudflared exited (${code})`)));
  setTimeout(() => reject(new Error('cloudflared did not give a URL within 60 s')), 60_000);
}).catch((e) => {
  console.error(`✖ ${e.message}`);
  server.close();
  process.exit(1);
});
console.log(`✔ Tunnel ${url}`);

// ── Supabase secrets (written to a temp file so the key never appears in a command line) ──
const envFile = join(tmpdir(), `lpt-ollama-${process.pid}.env`);
writeFileSync(envFile, `OLLAMA_URL=${url}\nOLLAMA_API_KEY=${KEY}\nOLLAMA_MODEL=${MODEL}\n`, { mode: 0o600 });
const set = spawnSync('npx', ['supabase@latest', 'secrets', 'set', '--env-file', envFile, '--project-ref', ref, '--yes'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
  encoding: 'utf8',
});
rmSync(envFile, { force: true });
if (set.status !== 0) {
  console.error(`✖ Couldn't update the Supabase secrets (is the Supabase CLI signed in?):\n${(set.stderr || set.stdout).replaceAll(KEY, '***')}`);
} else {
  console.log(`✔ Supabase project ${ref} now uses this tunnel (OLLAMA_URL, OLLAMA_API_KEY, OLLAMA_MODEL)`);
}
console.log('\nThe assistant works while this window stays open. Press Ctrl+C to stop.\n');

const stop = () => {
  tunnel.kill();
  server.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
tunnel.on('exit', () => {
  console.error('✖ The tunnel stopped. Run npm run assistant:tunnel again.');
  server.close();
  process.exit(1);
});
