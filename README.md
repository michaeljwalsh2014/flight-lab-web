# Flight Lab

Paper-airplane hangar, throw measurement, photo inspections, flight-path illustration and conversational Coach. The web app uses React, Vinext and Cloudflare Workers; the optional iOS project is in `native/FlightLab`.

## Development and validation

Use Node 22.13 or newer. Install dependencies with `pnpm install`, run `pnpm dev`, and run `pnpm test` before release. The test command builds the app and runs every test file, including saving/recovery, backups, scan races, report reopening, feedback and AI routes. Run `pnpm exec tsc --noEmit --incremental false` for type checking.

## Configuration

Keep local configuration in ignored `.env.local` and production secrets in Sites settings. `FLIGHT_LAB_OWNER_EMAIL` identifies the owner; `FLIGHT_LAB_PRO_SHARE_TOKEN` enables the shared Pro pass. Provider configuration lives in `app/gemini-server.ts`; optional OpenAI fallback uses `OPENAI_API_KEY`. Never commit credentials. `.openai/hosting.json` declares the existing Site identity and D1 `DB` binding.

AI budgets are stored atomically in D1, shared across server instances. Each account or shared pass has a ten-minute budget per feature: ten Coach requests, five scans, five video reviews. All holders of one shared pass share its budget; changing a browser client ID cannot reset it. Unavailable storage prevents paid calls. The limiter creates its dedicated table on first use, without altering user records.

## Saved data

Planes, throws, reports, feedback and preferences remain in browser local storage under their existing keys. Active AI evidence uses session storage. Download a backup before moving browsers or devices. Version-1 backups merge new records while retaining local conflicts, and include measurement setup and layout preferences. Original unfinished photo/video files are not included. Saved reports reopen as historical analysis; estimates and illustrated paths do not establish physical accuracy.

## Releases and rollback

Follow `AGENTS.md`: validate, commit and push the exact source, package that exact build, save a new Sites version, and deploy only that newly saved version. Record the Git commit and Sites version together. Preserve all existing saved versions, including at least the previous four releases, with the previous production version available for immediate rollback. Never overwrite a release. Report the saved-version number and rollback availability after publishing.

Preserve model choices 3.8, 3.9 and 4.0 and the Coach Show more/Show less control. A saved v37 selection migrates to v38. Storage keys must not be cleared or renamed without migration and explicit approval.
