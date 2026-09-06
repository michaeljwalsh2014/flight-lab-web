# Flight Lab release safety

These rules apply to every future Flight Lab change in this repository.

- Never overwrite, delete, or replace an existing saved Sites version.
- Before every production publish: validate the app, commit and push the exact source, package that exact build, and save it as a new Sites version.
- Deploy only the newly saved version. Keep the previous production version available for immediate rollback.
- Preserve the v38 Improved, v39 Knowledge, and v40 Gemini model choices. The user requested removing v37 from the selector; migrate a saved v37 selection to v38 without deleting saved user data.
- Save every release as a new Sites version and retain at least the previous four saved releases for rollback. Never delete old saved releases just because a model choice is removed from the UI.
- Preserve the Coach's Show more / Show less control unless the user explicitly requests its removal.
- Keep stored plane, throw, measurement, scan, Coach conversation, feedback, and preference data backward-compatible. Never clear or rename browser storage keys without a migration and explicit user approval.
- Tell the user the new saved-version number after publishing and confirm that rollback remains available.
