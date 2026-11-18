# How to add a routine in the Routines sheet

The app reads the tab named **Routines** in your Google Sheet. Each row is one exercise. Rows with the same **Routine** name form one routine, and the Workout tab lists each routine.

## Headers (row 1, exact spelling)

| Header | What to enter | Required? | Example |
|---|---|---|---|
| **Routine** | Name of the routine. Every exercise in the same routine uses the same name. | Yes | `FISIO` |
| **Order** | Position of the exercise in the routine: 1, 2, 3 ... | Recommended | `1` |
| **Exercise** | Name of the movement, shown on the timer and in the list. | Yes | `Supine Spinal Twist` |
| **Duration_s** | Seconds for the exercise. For LR30 exercises, this is the total for both sides. | Yes (blank becomes 30) | `60` |
| **Rest_s** | Seconds of rest after each rep. Use `0` for no rest. | No (blank becomes 0) | `0` |
| **Side** | `LR30`, `None`, or `Count` (see below). | No (blank becomes None) | `LR30` |
| **Reps** | Default reps. The rep picker on the Workout tab overrides this value each time you start. | No | `6` |
| **Image_URL** | Direct `https://` link to a picture of the exercise. | No | `https://example.com/piriformis.jpg` |
| **Notes** | Short cue shown under the exercise name. | No | `Keep the back flat` |

## Rules to know

- **Spelling must match.** Routine names are case-sensitive, so `FISIO` and `fisio` are two different routines. Keep the same spelling in every row.
- **Rows without a Routine or Exercise name are skipped.** A row with the wrong header name is also ignored, so check row 1 first.
- **Side LR30** means the app runs Right 30s, then Left 30s. Each side gets half of Duration_s. For example, `Duration_s = 60` gives 30 seconds per side. The app announces "CHANGE SIDE" at the 25-second mark of each side.
- **Side None** means one timed hold of Duration_s seconds.
- **Side Count** means the user taps once per rep. Duration_s is the target reps per round (for example `100`). The timer does not count down. Tap the TAP +1 REP button until the target is reached, then the next round starts.
- **Order** sorts the exercises. Two exercises with the same Order number are sorted by the sheet, not guaranteed. Give each exercise its own number.
- **Image_URL** must start with `https://` and link straight to an image file (`.jpg`, `.png`, `.webp`). Google Drive or Dropbox share pages do not work. To test a link, paste it into a browser: it should show only the picture.
- **Reps are chosen in the app.** Each exercise repeats the number of reps picked on the Workout tab before the next exercise starts.
- **Changes appear after a refresh.** Open the app with a connection, or switch tabs. The last copy is kept on the device for offline use.

## Example: two routines

| Routine | Order | Exercise | Duration_s | Rest_s | Side | Reps | Image_URL | Notes |
|---|---|---|---|---|---|---|---|---|
| FISIO | 1 | Supine Piriformis Stretch | 60 | 0 | LR30 | 6 | | Relax the shoulders |
| FISIO | 2 | Glute Bridge | 30 | 0 | None | 6 | | Press through heels |
| MOBILITY | 1 | Cat-Cow | 45 | 5 | None | 3 | | Slow and controlled |

## Adding a new routine

1. Add a row for the first exercise, with the routine name in **Routine**.
2. Add one row per exercise below it, using the same routine name and Order 1, 2, 3 ...
3. Leave **Reps** and **Image_URL** blank if you don't have them yet.
4. Open the app and check the Workout tab. The routine appears as a card, and tapping it lists the exercises.
5. Pick reps and tap START WORKOUT.

## To change a routine

Edit the cell in the sheet, then refresh the app. To remove a routine, delete its rows. Finished sessions stay in the history even if the routine is deleted.
