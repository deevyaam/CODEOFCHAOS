// Publishes the web app to Expo Hosting and records the version so it can be reopened later.
//
//   npm run deploy:web                         asks for confirmation before publishing
//   npm run deploy:web -- --yes                no prompt (you have already approved this publish)
//   npm run deploy:web -- --allow-placeholders publish even if legal details are still placeholders
//
// Steps: commit the working tree ("Before deploy …") → build legal pages → expo export --platform web →
// eas deploy --prod → append to DEPLOYMENTS.md → commit → tag web-YYYY-MM-DD-HHMM.
// Nothing is pushed: push commits and tags yourself when you are ready.
import { execSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const args = new Set(process.argv.slice(2));
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const tag = `web-${stamp}`;

if (out(`git tag --list ${tag}`)) {
  console.error(`✖ Tag ${tag} already exists. Wait a minute and try again.`);
  process.exit(1);
}

if (!args.has('--yes')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    'This publishes the web app, including the legal pages and contact details, to your production URL. Continue? (yes/no) ',
  );
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Cancelled. Nothing was changed.');
    process.exit(0);
  }
}

// 1. Snapshot the working tree so this exact source can be reopened.
sh('git add -A');
const dirty = spawnSync('git', ['diff', '--cached', '--quiet']).status !== 0;
if (dirty) sh(`git commit -m "Before deploy ${stamp}"`);
const sourceCommit = out('git rev-parse --short HEAD');

// 2. Build.
sh(`node scripts/build-legal.mjs${args.has('--allow-placeholders') ? '' : ' --strict'}`);
sh('npx expo export --platform web');

// 3. Publish.
const deploy = spawnSync('npx', ['eas-cli@latest', 'deploy', '--prod', '--non-interactive'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
  stdio: ['inherit', 'pipe', 'inherit'],
});
process.stdout.write(deploy.stdout ?? '');
if (deploy.status !== 0) {
  console.error('✖ eas deploy failed. The "Before deploy" commit is kept; nothing was tagged.');
  process.exit(deploy.status ?? 1);
}
const urls = [...(deploy.stdout ?? '').matchAll(/https:\/\/[^\s)]+\.expo\.app[^\s)]*/g)].map((m) => m[0]);
const url = urls[urls.length - 1] ?? '(see EAS dashboard)';

// 4. Record and tag.
if (!existsSync('DEPLOYMENTS.md')) {
  writeFileSync('DEPLOYMENTS.md', '# Web deployments\n\n| Tag | Date | Source commit | URL |\n|---|---|---|---|\n');
}
appendFileSync('DEPLOYMENTS.md', `| ${tag} | ${now.toISOString()} | ${sourceCommit} | ${url} |\n`);
sh('git add DEPLOYMENTS.md');
sh(`git commit -m "Deploy web ${stamp}" -m "Source ${sourceCommit}, ${url}"`);
sh(`git tag -a ${tag} -m "Web deploy ${stamp} (${url})"`);

console.log(`\n✔ Published ${url}\n  Tagged ${tag}. Reopen this version any time with: git checkout ${tag}`);
