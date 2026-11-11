# MOVE — Personal Workout PWA

Starter project for a personal workout PWA hosted on GitHub Pages.

## Included in this starter
- Minimalist dark glassmorphism interface
- Home, Workouts, History and Stats screens
- Eight starter exercise entries
- Get-ready countdown, exercise/rest timer, pause, resume, skip and end
- IndexedDB workout history (local device)
- Basic PWA manifest and service worker
- Starter Google Apps Script API in `apps-script/Code.gs`

## Important starter limitations
This is the first development milestone, not the finished product:
- The current bicep curl entry uses a timed placeholder; a proper 100-rep counter is a later enhancement.
- The Google Sheets API is not yet wired into the frontend sync queue.
- Voice announcements, robust session recovery, custom routine editor, calories and advanced statistics are not yet implemented.
- iOS may suspend browser JavaScript in the background. Keep the workout screen active.
- Replace the placeholder icons with your own 192px and 512px PNG icons before deployment.

## Local preview
Because service workers require HTTPS or localhost, run a local web server rather than opening `index.html` directly. For example, in this folder:
`python -m http.server 8000`
Then visit `http://localhost:8000`.

## GitHub Pages
Upload the contents of this folder to a GitHub repository, then enable Pages from Settings > Pages > Deploy from a branch > main > /(root).

## Google Sheets setup
Create tabs named `Routines`, `Exercises`, `RoutineDetails`, `WorkoutLogs`. Add these header rows:
- Routines: `routine_id, routine_name, description, target_duration, is_active`
- Exercises: `exercise_id, exercise_name, category, default_duration, default_reps, side_mode, instructions`
- RoutineDetails: `routine_detail_id, routine_id, exercise_id, sequence, duration, rest_duration, reps, enabled`
- WorkoutLogs: `log_id, routine_name, start_time, end_time, duration_seconds, status`

Open Extensions > Apps Script, paste `apps-script/Code.gs`, set the spreadsheet ID and a long random token, then deploy as a Web App. This starter backend is not yet connected to the frontend.
