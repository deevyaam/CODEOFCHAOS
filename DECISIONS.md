# Decision log

Why Ansam Moris works the way it does. Each entry records a decision that shapes the app, the reason behind it, and what it means for later work, so nobody has to dig through commits or chats to find out.

**When to add an entry:** a choice someone could reasonably question later, such as a library or service, who is allowed to do what, a trade-off, or something deliberately left out. Small fixes and styling tweaks don't need one.

**How:** copy the template to the end of the list, give it the next number, and link the commit or pull request. Don't rewrite old entries when things change. Add a new entry and set the old one's status to `Superseded by D-0XX`.

```markdown
## D-0XX: Short title
- **Date:** YYYY-MM-DD · **Status:** Accepted | Superseded by D-0XX | Reverted
- **Decided by:** name(s) · **Source:** commit / PR link

**Context:** what problem or question came up.
**Decision:** what we chose.
**Consequences:** what follows from it, including the downsides we accepted.
```

## Index

| # | Decision | Date | Status |
|---|---|---|---|
| [D-001](#d-001-expo-and-supabase) | Expo (SDK 58) with Expo Router, and Supabase for the backend | 2026-11-13 | Accepted |
| [D-002](#d-002-database-changes-as-re-runnable-sql-files) | Database changes live in re-runnable SQL files | 2026-11-13 | Accepted |
| [D-003](#d-003-assistant-runs-on-the-teams-own-computer) | Assistant runs Gemma 3 12B on the team's own computer | 2026-11-13 | Accepted |
| [D-004](#d-004-changes-go-through-pull-requests) | Changes go through branches and pull requests | 2026-11-13 | Accepted |
| [D-005](#d-005-discuss-bubbles-coloured-by-role) | Discuss bubbles coloured by role | 2026-11-13 | Accepted |
| [D-006](#d-006-only-staff-close-reports) | Only staff can close or reopen reports | 2026-11-13 | Accepted |
| [D-007](#d-007-deleted-messages-leave-a-visible-note) | Deleted chat messages leave a visible note naming the role | 2026-11-13 | Accepted, extended by D-012 |
| [D-008](#d-008-role-changes-and-posting-pauses-enforced-in-the-database) | Role changes and posting pauses enforced in the database | 2026-11-14 | Accepted |
| [D-009](#d-009-assistant-drafts-reports-but-never-sends-them) | Assistant drafts reports but never sends them | 2026-11-14 | Accepted |
| [D-010](#d-010-no-facebook-sign-in) | No Facebook sign-in | 2026-11-14 | Accepted |
| [D-011](#d-011-openstreetmap-on-android-apple-maps-on-iphone) | OpenStreetMap on Android, Apple Maps on iPhone | 2026-11-14 | Accepted |
| [D-012](#d-012-admins-can-delete-any-non-admin-message) | Admins can delete any non-admin message | 2026-11-14 | Accepted |
| [D-013](#d-013-push-notifications-on-by-default) | Push notifications on by default | 2026-11-14 | Accepted |
| [D-014](#d-014-live-location-when-reporting) | Live location when reporting | 2026-11-14 | Accepted |

---

## D-001: Expo and Supabase
- **Date:** 2026-11-13 · **Status:** Accepted
- **Decided by:** deevyaam · **Source:** `4275a95` (Build Life Powered by Tech community app)

**Context:** A community app for Mauritius that has to work on Android, iPhone and the web, with accounts, live updates and file uploads.
**Decision:** Expo SDK 58 with Expo Router (routes in `src/app/`) and React Native 0.88. Supabase provides auth, the Postgres database with row-level security, storage, realtime and Edge Functions.
**Consequences:** One codebase covers all three platforms, and native folders are generated rather than edited (see `AGENTS.md`). Permission rules live in the database (RLS and triggers), so the app's screens are only a convenience and the database is what actually enforces them.

## D-002: Database changes as re-runnable SQL files
- **Date:** 2026-11-13 · **Status:** Accepted
- **Decided by:** deevyaam · **Source:** `4275a95`, README "Set up Supabase"

**Context:** The database schema needs to change as features are added.
**Decision:** Keep the schema in `supabase/schema.sql`, `supabase/community.sql` and `supabase/roles.sql`, written so they are safe to run again (`create … if not exists`, `create or replace`, `drop policy if exists`). Changes are applied by running the files in the Supabase SQL Editor rather than with numbered migrations.
**Consequences:** It's simple to set up and easy to read in one place. But nothing tracks whether the live database is up to date: **after merging a change to these files, someone has to run them in Supabase**, or the app and the database disagree.

## D-003: Assistant runs on the team's own computer
- **Date:** 2026-11-13 · **Status:** Accepted
- **Decided by:** deevyaam · **Source:** `4275a95`, `scripts/assistant-tunnel.mjs`

**Context:** The app needs an assistant that answers in Kreol Morisien, French and English, without paying for a hosted AI service.
**Decision:** Gemma 3 12B runs in Ollama on a team member's PC. `npm run assistant:tunnel` exposes it through a key-protected proxy and a Cloudflare quick tunnel, and saves the tunnel address as a Supabase secret for the `chat` Edge Function.
**Consequences:** The assistant costs nothing to run, but it **only works while that PC is on and the tunnel window is open**. The tunnel address changes on every restart, so the script has to be re-run, with the Supabase CLI logged in. Users see "The assistant is unavailable right now" otherwise.

## D-004: Changes go through pull requests
- **Date:** 2026-11-13 · **Status:** Accepted
- **Decided by:** kesh1108, deevyaam · **Source:** PRs [#1](https://github.com/deevyaam/CODEOFCHAOS/pull/1) to [#4](https://github.com/deevyaam/CODEOFCHAOS/pull/4)

**Context:** Two people work on the same repository, and one contributor's local copy had started from an older download of it.
**Decision:** Contributors without ownership work on a branch and open a pull request into `main`. Nobody force-pushes `main`.
**Consequences:** No one's work gets overwritten, and each change has a description explaining why it was made. Pulling often matters, because `src/app/report/new.tsx` in particular changes a lot and uncommitted work on it caused merge conflicts.

## D-005: Discuss bubbles coloured by role
- **Date:** 2026-11-13 · **Status:** Accepted
- **Decided by:** kesh1108 · **Source:** [#1](https://github.com/deevyaam/CODEOFCHAOS/pull/1), [#2](https://github.com/deevyaam/CODEOFCHAOS/pull/2)

**Context:** In Discuss, people couldn't easily tell official replies from members' messages.
**Decision:** Message bubbles are coloured by the author's role: moderators and admins **green** (changed from violet in #2), verified authorities **blue**, normal members plain, and your own messages teal. A badge with an icon sits next to the name. The colours are theme tokens (`moderator`, `authority` in `src/theme/tokens.ts`) with light and dark variants.
**Consequences:** It only changes how messages look and uses the roles already in `user_roles`. An authority only gets the blue style once `authority_verified` is true.

## D-006: Only staff close reports
- **Date:** 2026-11-13 · **Status:** Accepted
- **Decided by:** kesh1108 · **Source:** [#3](https://github.com/deevyaam/CODEOFCHAOS/pull/3) (`10b6404`)

**Context:** Reporters could mark their own report **Fixed**, so a problem could look solved without anyone official confirming it.
**Decision:** Moderators, admins and verified authorities can set any status. The reporter can still move their own report to **Sent** or **In progress**, but can't close it (Fixed) or reopen a fixed one. This is enforced in `report_comments_before_insert` in `schema.sql`. The app shows "Fixed" as locked for non-staff.
**Consequences:** A "Fixed" status now means someone with a role confirmed it. Reporters who see their problem fixed have to wait for staff to close it.

## D-007: Deleted messages leave a visible note
- **Date:** 2026-11-13 · **Status:** Accepted, extended by D-012
- **Decided by:** kesh1108 · **Source:** [#3](https://github.com/deevyaam/CODEOFCHAOS/pull/3) (`10b6404`)

**Context:** Moderators and authorities needed to remove members' messages, but silently removing them would hide that moderation happened.
**Decision:** `staff_delete_message()` empties the message (text, media and reactions) and keeps the row with `deleted_at` and `deleted_by_role`. Everyone sees "Message deleted by a moderator" (or "by an authority") in its place. It shows the role, never the moderator's name. Staff messages can't be deleted this way.
**Consequences:** Moderation is visible and accountable without exposing individual moderators. Deleted messages still take up a slot in the room, and replies quoting them show "Deleted message".

## D-008: Role changes and posting pauses enforced in the database
- **Date:** 2026-11-14 · **Status:** Accepted
- **Decided by:** deevyaam · **Source:** `709c319` (Let moderators change roles and pause posting)

**Context:** Moderators needed a way to manage roles and stop someone posting, without that power being misused.
**Decision:** The People & roles screen calls `set_user_access` (in `roles.sql`). It covers making someone a Member, Moderator or Authority, and pausing their reports, comments or Discuss messages with a reason they can see. Rules: moderators only, never your own access, only admins can change admins. Every change is logged in `role_changes`.
**Consequences:** The database enforces the rules, so they hold even outside the app, and every role change leaves a record.

## D-009: Assistant drafts reports but never sends them
- **Date:** 2026-11-14 · **Status:** Accepted
- **Decided by:** deevyaam · **Source:** `4d3d6d8` (Let the assistant look at photos and draft reports)

**Context:** Members wanted to show the assistant a photo and turn it into a report.
**Decision:** The assistant can look at up to 3 photos or videos and produce a draft card that opens Report a problem pre-filled. **Nothing is sent until the person checks it and sends it themselves.** Pictures are shrunk to 896 px JPEGs (videos: one still frame), and are never saved with past chats.
**Consequences:** A person stays in control of every report, and less photo data is kept. Larger uploads needed a longer chat timeout (140 s) and a 3 MB tunnel limit.

## D-010: No Facebook sign-in
- **Date:** 2026-11-14 · **Status:** Accepted
- **Decided by:** deevyaam · **Source:** `e707b20` (Remove Facebook sign-in)

**Context:** Facebook sign-in was already switched off in Supabase, but the button was still in the app.
**Decision:** Sign-in offers Google, email and guest only. The Facebook button, provider type and privacy-policy mentions were removed.
**Consequences:** There's one fewer provider to configure and explain in the privacy policy. To bring it back, it has to be enabled in Supabase and the button restored.

## D-011: OpenStreetMap on Android, Apple Maps on iPhone
- **Date:** 2026-11-14 · **Status:** Accepted
- **Decided by:** deevyaam · **Source:** `a642371`

**Context:** Google Maps on Android needs an API key, and the Map tab crashed without one.
**Decision:** Android shows the shared Leaflet/OpenStreetMap page (`src/components/leaflet-map.ts`, also used on the web) in a WebView. iPhones keep Apple Maps.
**Consequences:** No Google Maps key is needed, and Android and the web share one map. Map features have to keep working in both the Leaflet page and the iPhone map (for example `centerOn`, used by live location).

## D-012: Admins can delete any non-admin message
- **Date:** 2026-11-14 · **Status:** Accepted
- **Decided by:** deevyaam · **Source:** `fc4de86`

**Context:** Under D-007, nobody could remove a moderator's or authority's message.
**Decision:** Admins can delete messages from members, moderators and authorities, but not from other admins, and the room shows "Message deleted by an admin". Moderators and authorities still remove members' messages only.
**Consequences:** It closes the gap where staff messages couldn't be moderated, while keeping D-007's visible note.

## D-013: Push notifications on by default
- **Date:** 2026-11-14 · **Status:** Accepted
- **Decided by:** deevyaam · **Source:** `2abfd5d`, `fc4de86`

**Context:** People missed updates because they had to turn notifications on themselves.
**Decision:** Signed-in members' phones are signed up automatically with all topics on: new reports in their area, their reports, reports they backed, and Discuss. Discuss notifications are sent at most once every 10 minutes per phone, and skip the author and anyone blocked either way.
**Consequences:** More people get updates, so limits are needed to avoid spam. Android push still depends on Firebase (`google-services.json`) being set up. Without it, Alerts explains that push isn't switched on.

## D-014: Live location when reporting
- **Date:** 2026-11-14 · **Status:** Accepted
- **Decided by:** kesh1108 · **Source:** [#4](https://github.com/deevyaam/CODEOFCHAOS/pull/4) (`b51b4ee`)

**Context:** "I am there now" read the position once, at medium accuracy, and on phones the map didn't move to it.
**Decision:** It now follows the phone's live position (high accuracy, foreground only) through `useLiveLocation` in `src/lib/live-location.ts`, and the pin moves as the person moves. Tapping or dragging the pin stops following. Tracking only runs on that step. If location is refused or no position arrives within 15 s, the person places the pin by hand.
**Consequences:** Pins from people on the spot are more accurate. GPS is only used while choosing the place, which saves battery and keeps the location private. It hasn't been tested on a real phone yet.
