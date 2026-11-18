# MOVE: personal workout PWA

A phone-friendly workout timer that runs on GitHub Pages and saves completed sessions to a Google Sheet.

## Features
- **Home:** streak, this week's minutes, this month's workout count, and a month calendar.
- **Workouts:** routines loaded from the `Routines` sheet. Pick reps (1 to 20) before START WORKOUT.
- **Timer:** each exercise repeats for the chosen reps. LR30 exercises run Right 30s, then Left 30s, with "CHANGE SIDE" at 25 seconds into each side. A beep sounds 3 seconds before each new movement. Exercise images come from the `Image_URL` column.
- **Background use:** leaving the timer keeps the workout running. A "Back to workout" bar appears above the menu.
- **Screen awake:** the app asks the browser to keep the screen on while it is open.
- **History:** sessions grouped by month, with each session's duration and monthly totals.
- **Stats:** summary boxes, a month calendar (tap a date to list its sessions), and a weekly minutes chart.
- **Offline:** sessions are saved on the device first and synced to Google Sheets when online.

## Google Sheet tabs
| Tab | Purpose | Headers (row 1) |
|---|---|---|
| `Routines` | One row per exercise. See `ROUTINES-GUIDE.md`. | `Routine`, `Order`, `Exercise`, `Duration_s`, `Rest_s`, `Side`, `Reps`, `Image_URL`, `Notes` |
| `WorkoutLogs` | Written by the app, one row per completed session. | `id`, `routineName`, `startedAt`, `endedAt`, `durationSeconds`, `status`, `reps` |

## Setup

### 1. Configure the frontend
Open `js/config.js` and set:
- `API_URL` to your Apps Script Web App URL, ending in `/exec`.
- `API_TOKEN` to the same token used in `Code.gs`.

### 2. Update Apps Script
1. Open the Apps Script project attached to your spreadsheet.
2. Replace `Code.gs` with `apps-script/Code.gs` from this project.
3. Check that `SHEET_ID` and `API_TOKEN` at the top hold your real values, not placeholders.
4. Save.
5. Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy.
6. Keep the same Web App URL.

### 3. Prepare the sheet
- Add `reps` as the header in column G of `WorkoutLogs` if it is missing.
- Fill `Routines` as described in `ROUTINES-GUIDE.md`. The FISIO routine is in `FISIO-routine.tsv`.

### 4. Publish
Upload the project files to your GitHub Pages repository, including `css/theme-glass.css`, `css/features.css`, `js/stats.js`, `js/routines.js`, `js/history.js`, and `ROUTINES-GUIDE.md`. Commit and wait for GitHub Pages to publish.

If an old version stays on the phone, close the installed app and reopen it. The service worker cache is named `move-pwa-v6-glass`.

## Usage notes
- **Image links** must be direct `https://` links to an image file.
- **Dumbbell curls** use a 60-second timer. Count the 100 reps yourself.
- **Sound and speech** need a tap on the screen before they play, because mobile browsers block audio until then.
- **Wake lock** works on iOS 16.4 and later, and on current Chrome and Edge. Older browsers keep the screen on only if the phone's own auto-lock setting allows it.

## Security and limitations
- The token in `js/config.js` is visible to anyone who opens the public site. Use it only for personal data, and keep no sensitive information in the sheet.
- Requests use JSONP (GET), which suits small personal logs. Do not send large payloads.
- Apple Health integration needs a native iOS app, not a PWA.
- Edits to a routine in the sheet appear after the app refreshes. The last copy is kept on the device for offline use.
