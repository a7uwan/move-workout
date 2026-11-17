# MOVE — API-connected personal workout PWA

## What this milestone adds
- `js/config.js`: configuration for your Apps Script Web App URL and API token.
- `js/api.js`: JSONP client for cross-origin calls from GitHub Pages to Apps Script.
- Completed workout sessions are saved locally first, then synced to the `WorkoutLogs` sheet.
- If a sync fails, the workout stays on the device as pending and retries when the app is online again.
- Apps Script deduplicates workout IDs so a retry should not create a duplicate row.

## 1. Configure the frontend
Open `js/config.js` and replace:
- `PASTE_YOUR_WEB_APP_URL_HERE` with your deployed Apps Script URL ending in `/exec`.
- `PASTE_YOUR_API_TOKEN_HERE` with the exact API token configured in Apps Script.

## 2. Update Apps Script
1. Open the Apps Script project connected to your MOVE spreadsheet.
2. Replace `Code.gs` with `apps-script/Code.gs` from this package.
3. IMPORTANT: Copy your existing real `SHEET_ID` and `API_TOKEN` values into the two constants at the top. Do not leave the placeholders.
4. Save.
5. Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy.
6. Keep using the same Web App URL if editing the existing deployment.

## 3. Update GitHub Pages
Upload/replace the project files in your existing repository, including the new `js/config.js` and `js/api.js`. Commit the changes and wait for GitHub Pages to publish.

## 4. Test
1. Open your MOVE site and refresh it. If an old version remains cached, close the installed PWA and reopen it; the service worker cache version has been updated.
2. Start a workout, then tap START TIMER to begin the first exercise.
3. Complete a workout.
4. Open `WorkoutLogs` in Google Sheets. A new row should appear with ID, routine name, start time, end time, duration seconds, and status.
5. If the phone is offline during completion, the record remains local and the app attempts to sync when it comes online again.

## Security and limitations
- The token embedded in `js/config.js` is visible to anyone who inspects the public website. It is not secure authentication. Use this only for personal testing; do not store sensitive information in this spreadsheet.
- JSONP uses GET requests, which are appropriate only for this small, non-sensitive personal workout log. Do not put private data or large payloads in query strings.
- This milestone syncs completed sessions only; it does not yet sync exercise-by-exercise detail or custom routine edits.
- The existing exercise timer and announcements remain in place. The dumbbell curl is still a timed placeholder, not yet a 100-rep counter.
- Apple Health integration requires a native iOS app, not a PWA.
