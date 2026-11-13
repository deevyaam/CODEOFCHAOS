// Sends sample questions to Ollama with the assistant's real prompt, to check language handling.
//   node --no-warnings scripts/test-assistant.mjs            uses http://localhost:11434 and gemma3:12b
//   node --no-warnings scripts/test-assistant.mjs --detect   only prints which language each question is detected as
//   OLLAMA_URL=... OLLAMA_MODEL=... node --no-warnings scripts/test-assistant.mjs
const { buildMessages, detectLanguage } = await import(new URL('../supabase/functions/chat/prompt.ts', import.meta.url));

const url = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const model = process.env.OLLAMA_MODEL ?? 'gemma3:12b';

// [chosen language, question, expected reply language]
const cases = [
  ['auto', 'Kouma mo kapav fer enn rapor pou enn lalimier ki pa marse dan mo lari?', 'mfe'],
  ['auto', 'Ena inondasion kot mwa, ki mo bizin fer?', 'mfe'],
  ['auto', 'Ki ler lopital Victoria ouver?', 'mfe'],
  ['auto', 'Mo finn fer enn rapor yer, kouma mo kone si lapolis inn trouv li?', 'mfe'],
  ['auto', 'Comment savoir si ma plainte a été envoyée à la mairie ?', 'fr'],
  ['auto', 'comment je peux mettre une photo dans un signalement', 'fr'],
  ['auto', 'What happens after I press Me too on a report?', 'en'],
  ['auto', 'how do i post anonymously', 'en'],
  ['mfe', 'How do I turn on alerts for Curepipe?', 'mfe'],
  ['fr', 'Kouma mo fer enn rapor?', 'fr'],
];

let detectOk = 0;
for (const [chosen, question, expected] of cases) {
  const got = chosen === 'auto' ? detectLanguage(question) : chosen;
  if (got === expected) detectOk++;
  if (process.argv.includes('--detect')) {
    console.log(`${got === expected ? 'ok  ' : 'MISS'} ${got.padEnd(3)} ${question}`);
    continue;
  }
  const { reply, messages } = buildMessages(chosen, 'signed-in member', 'They have not posted any reports yet.', [
    { role: 'user', content: question },
  ]);
  const started = Date.now();
  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: false, keep_alive: '30m', options: { temperature: 0.3, num_ctx: 8192, num_predict: 700 }, messages }),
  });
  const j = await res.json();
  console.log(`\n── [${chosen} → ${reply}] ${question}\n${j.message?.content?.trim() ?? JSON.stringify(j)}\n(${((Date.now() - started) / 1000).toFixed(1)} s)`);
}
console.log(`\nLanguage detection: ${detectOk}/${cases.length} as expected`);
