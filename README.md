# Flight Lab

Paper-airplane hangar, throw measurement, photo inspections, flight-path illustration and conversational Coach. The web app uses React, Vinext and Cloudflare Workers; the optional iOS project is in `native/FlightLab`.

## Development and validation

Use Node 22.13 or newer. Install dependencies with `pnpm install`, run `pnpm dev`, and run `pnpm test` before release. The test command builds the app and runs every test file, including saving/recovery, backups, scan races, report reopening, feedback and AI routes. Run `pnpm exec tsc --noEmit --incremental false` for type checking.

## Configuration

Keep local configuration in ignored `.env.local` and production secrets in Sites settings. `FLIGHT_LAB_OWNER_EMAIL` identifies the owner; Legacy shared bearer links now redirect to `/pricing`; free passes are account-based code grants. Provider configuration lives in `app/gemini-server.ts`; optional OpenAI fallback uses `OPENAI_API_KEY`. Never commit credentials. `.openai/hosting.json` declares the existing Site identity and D1 `DB` binding.

AI budgets are stored atomically in D1, shared across server instances. Each Pro account has a ten-minute budget per feature: ten Coach requests, five scans, five video reviews. Paid and code-granted accounts each have their own budget; changing a browser client ID cannot reset it. Unavailable storage prevents paid calls. The limiter creates its dedicated table on first use, without altering user records.

Pro defaults to Flight Lab 4.6 Auto (Gemini 3.8 Flash). Explicit saved model/thinking selections remain intact, and older model choices stay available.

## Free AI allowance

The free page includes a light-themed Coach drawer using the existing Gemini API connection and three on-device photo inspections per day. Free sign-in ties the 20 daily Coach messages and three inspections to a verified account across devices. Both allowances reset to full every day at 6 a.m. America/Chicago time, including daylight saving transitions; unused uses do not accumulate. `free_ai_usage` is a separate D1 table with atomic counters keyed by an account hash and the local date of the most recent reset. Failed Coach requests restore the reserved message; rejected photos do not spend an inspection. Free video reviews and pricing are not included. Pro routes, access rules and existing limits are unchanged.

## Saved data

Planes, throws, reports, feedback and preferences remain in browser local storage under their existing keys. Active AI evidence uses session storage. Download a backup before moving browsers or devices. Version-1 backups merge new records while retaining local conflicts, and include measurement setup and layout preferences. Original unfinished photo/video files are not included. Saved reports reopen as historical analysis; estimates and illustrated paths do not establish physical accuracy.

## Releases and rollback

Follow `AGENTS.md`: validate, commit and push the exact source, package that exact build, save a new Sites version, and deploy only that newly saved version. Record the Git commit and Sites version together. Preserve all existing saved versions, including at least the previous four releases, with the previous production version available for immediate rollback. Never overwrite a release. Report the saved-version number and rollback availability after publishing.

Preserve model choices 3.8, 3.9 and 4.0 and the Coach Show more/Show less control. A saved v37 selection migrates to v38. Storage keys must not be cleared or renamed without migration and explicit approval.

Pro Coach allows 50 messages per signed-in account each day, resetting at 6 a.m. America/Chicago. Shared-link visitors sign in for individual allowances. Pro includes seven AI reviews shared across photo and video analysis per account each day. All daily allowances reset at 6 a.m. Central; exhausted Coach and inspection allowances show the next reset date. Failed Pro AI reviews restore their review slot.
