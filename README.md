# Ansam Moris

A community app for Mauritius: report local problems (safety, transport, health, environment, other), follow what happens to them, and talk to each other. Expo SDK 58 · Expo Router · React Native 0.88 · Supabase.

## What's where

| Path | What |
|---|---|
| `src/app/` | Routes only (Expo Router). Tabs live in `src/app/(tabs)/` in this order: Home, Map, Reports, Discuss, Assistant, Alerts |
| `src/components/` | UI: floating tab bar, tab swipe, sheet, weather scene/card, map (`report-map.tsx` phones, `report-map.web.tsx` Leaflet), cards |
| `src/theme/` | Tokens (colours, type scale, radius, spacing, light/dark shadows) and motion rules |
| `src/lib/` | Supabase client, session/accounts, consent (`TERMS_VERSION`), prefs, reports, weather, push |
| `src/lib/discussion.ts` | The 36 allowed reaction emojis — keep in step with `is_reaction_emoji()` in `supabase/schema.sql` |
| `src/content/legal.ts` | Privacy policy, Terms, Legal notice, Delete-your-data text |
| `src/config.ts` | Contact email, operator name and data region (placeholders until you confirm them) |
| `supabase/schema.sql`, `supabase/community.sql` | Tables, RLS, helpers, triggers, storage, realtime |
| `supabase/functions/` | Edge Functions: `events` (push + media cleanup), `delete-account`, `chat` (assistant: Gemma 3 12B via Ollama, prompt in `chat/prompt.ts`) |
| `scripts/test-assistant.mjs` | Sends Kreol, French and English questions to Ollama with the real prompt |
| `scripts/build-legal.mjs` | Generates `public/*.html` legal pages (runs on every web build) |
| `scripts/deploy-web.mjs` | Commit → build → `eas deploy --prod` → `DEPLOYMENTS.md` → tag `web-YYYY-MM-DD-HHMM` |

## Placeholders still to fill in

| Placeholder | Where |
|---|---|
| `<YOUR_SUPABASE_PROJECT_REF>` and publishable key | `.env` (copy `.env.example`) |
| `<YOUR_EXPO_PROJECT_ID>` | Written to `app.json` by `npx eas-cli@latest init` |
| `<YOUR_CONTACT_EMAIL>`, `<YOUR_NAME_AND_TEAM>`, `<YOUR_SUPABASE_REGION>` | `src/config.ts` (shown highlighted in the legal pages until set) |
| Authority contact details | `src/lib/authorities.ts` (unconfirmed, so “Send to authority” uses the share sheet) |

`npm run deploy:web` refuses to publish while legal placeholders remain (unless `--allow-placeholders`) and always asks before publishing.

## Set up Supabase (once)

1. Create a project. Copy its URL and **publishable** key into `.env`. Never put the service-role key in the app.
2. SQL editor: run `supabase/schema.sql`, then `supabase/community.sql`.
3. Authentication → Sign In / Providers: enable **Email**, **Anonymous sign-ins** (guest mode), and **Google** (needs a client id/secret from Google Cloud).
4. Authentication → URL configuration → Redirect URLs, add:
   - `ansammoris://auth-callback` (installed app)
   - `exp://**` (Expo Go during development)
   - `http://localhost:8081/auth-callback` and your web URL + `/auth-callback`
5. Edge Functions (Supabase CLI):
   ```bash
   npx supabase login
   npx supabase link --project-ref <YOUR_SUPABASE_PROJECT_REF>
   npx supabase secrets set OLLAMA_URL=<https URL of your Ollama server> EVENTS_SECRET=<long random string>
   # optional: OLLAMA_MODEL (default gemma3:12b), OLLAMA_API_KEY (Ollama Cloud or a protected proxy)
   npx supabase functions deploy chat
   npx supabase functions deploy delete-account
   npx supabase functions deploy events --no-verify-jwt
   ```
6. Vault (SQL editor), so database triggers can call `events` through pg_net:
   ```sql
   select vault.create_secret('https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/functions/v1/events', 'events_url');
   select vault.create_secret('<same EVENTS_SECRET>', 'events_secret');
   ```
7. Make yourself an admin (find your user id under Authentication → Users):
   ```sql
   insert into public.user_roles (user_id, is_admin, is_moderator) values ('<your-user-id>', true, true)
   on conflict (user_id) do update set is_admin = true, is_moderator = true;
   ```
   Verify an authority with `authority_name = '…', authority_verified = true`.

## Run it

```bash
npm install
npm start          # Expo Go (scan the QR code)
npm run web        # browser at http://localhost:8081
npm run check      # tsc --noEmit, expo lint, expo-doctor
```

Push notifications don't work in Expo Go on Android; build a development client for that:

```bash
npx eas-cli@latest init
npx eas-cli@latest build --profile development --platform android
npm run start:dev-client
```

Android release builds also need a Google Maps key: set `GOOGLE_MAPS_ANDROID_API_KEY` as an EAS environment variable.

## Ship it

```bash
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --profile production
npx eas-cli@latest update --channel production --message "…"
npm run deploy:web
```

## Working rules

- Expo Router only; non-route code stays out of `src/app/`.
- Every screen: light and dark, phone width (16 px gutter, no horizontal scroll), Reduce Motion.
- Motion: critically damped springs (`src/theme/motion.ts`), bounce only after a flick, press scale 0.97 / 120 ms, instant tab switches, platform screen transitions, sheets drag to dismiss.
- Haptics only on meaningful actions (post, vote, react), never on scroll.
- Install Expo packages with `npx expo install`. Never commit `.env` or secrets.
