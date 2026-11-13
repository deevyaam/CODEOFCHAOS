// Generates plain-HTML legal pages into public/ (copied to the web export root by `expo export`).
// Usage: node scripts/build-legal.mjs [--strict]   (--strict fails if any placeholder is still unconfirmed)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

// legal.ts is plain TypeScript (types only), which Node 22.18+/24 can import directly.
const { LEGAL_DOCS, LEGAL_UPDATED } = await import(new URL('../src/content/legal.ts', import.meta.url));

// Read the token values from src/config.ts without importing Expo modules.
const config = readFileSync(join(root, 'src/config.ts'), 'utf8');
const constant = (name) => config.match(new RegExp(`export const ${name} = '([^']*)'`))?.[1];
const tokens = {
  APP_NAME: constant('APP_NAME'),
  CONTACT_EMAIL: constant('CONTACT_EMAIL'),
  OPERATOR_NAME: constant('OPERATOR_NAME'),
  DATA_REGION: constant('DATA_REGION'),
};
const isPlaceholder = (v) => /^<[A-Z0-9_]+>$/.test(v ?? '');
const unconfirmed = Object.entries(tokens).filter(([, v]) => !v || isPlaceholder(v)).map(([k]) => k);

if (unconfirmed.length) {
  const msg = `Unconfirmed legal details: ${unconfirmed.join(', ')} (set them in src/config.ts)`;
  if (strict) {
    console.error(`✖ ${msg}`);
    process.exit(1);
  }
  console.warn(`⚠ ${msg} — they are highlighted in the generated pages.`);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = (text) =>
  esc(text).replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    const v = tokens[k] ?? k;
    if (isPlaceholder(v)) return `<mark title="Not confirmed yet">${esc(v)}</mark>`;
    if (k === 'CONTACT_EMAIL') return `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
    return esc(v);
  });

const nav = LEGAL_DOCS.map((d) => `<a href="/${d.id}.html">${esc(d.title)}</a>`).join(' · ');

mkdirSync(join(root, 'public'), { recursive: true });
for (const d of LEGAL_DOCS) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title)} — ${esc(tokens.APP_NAME)}</title>
<style>
:root{color-scheme:light dark;--bg:#FBF8F3;--fg:#0F1B22;--muted:#5E6E77;--card:#fff;--link:#0E7C74;--mark:#FFE9A8}
@media (prefers-color-scheme:dark){:root{--bg:#0B1418;--fg:#EEF3F4;--muted:#B8C3C9;--card:#18262E;--link:#4CC3B8;--mark:#5A4A12}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 64px}
nav{font-size:14px;margin-bottom:24px}a{color:var(--link)}
section{background:var(--card);border-radius:22px;padding:16px 20px;margin:16px 0;box-shadow:0 10px 28px rgba(15,27,34,.07)}
h1{font-size:28px;line-height:1.2;margin:0 0 8px}h2{font-size:19px;margin:0 0 8px}
.muted{color:var(--muted);font-size:14px}mark{background:var(--mark);color:inherit;font-weight:700;padding:0 2px}
</style>
</head>
<body><main>
<nav>${nav}</nav>
<h1>${esc(d.title)}</h1>
<p class="muted">Last updated ${esc(LEGAL_UPDATED)}</p>
<p>${fill(d.intro)}</p>
${d.sections.map((s) => `<section><h2>${esc(s.heading)}</h2>${s.body.map((p) => `<p>${fill(p)}</p>`).join('')}</section>`).join('\n')}
</main></body></html>
`;
  writeFileSync(join(root, 'public', `${d.id}.html`), html);
}
console.log(`✔ Wrote ${LEGAL_DOCS.length} legal pages to public/`);
