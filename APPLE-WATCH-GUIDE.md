# MOVE on Apple Watch Series 9 — setup guide

MOVE is a web PWA. Apple Watch cannot run web apps natively, so it cannot display your timer on the watch face. However, there are three real ways to get useful workout information on your watch during a MOVE session, ordered from easiest to most powerful.

---

## Option A — Use the built-in Workout app alongside MOVE (easiest, no setup)

1. On your iPhone, open MOVE and start a workout.
2. On your Apple Watch, raise your wrist and tap the **Workout** app (the green circle icon).
3. Select **Other** (or any matching type such as **Functional Strength Training**).
4. Tap **Start** (or the timer icon to start immediately).
5. The watch now tracks heart rate, active calories, and elapsed time independently.
6. MOVE announces each exercise and counts down on your phone. The watch gives you heart rate and haptic alerts.
7. When MOVE finishes, swipe right on the watch and tap **End** in the Workout app to save the Apple Health record.

This is the recommended approach. You get heart rate on your wrist and voice cues from your phone.

---

## Option B — Mirror your iPhone screen to the watch via AssistiveTouch (no extra apps)

AssistiveTouch on watchOS can receive a mirrored view of your iPhone screen.

1. On your iPhone, go to **Settings → Accessibility → AssistiveTouch** and turn it **On**.
2. On your Apple Watch, go to **Settings → Accessibility → AssistiveTouch** and turn it **On**.
3. Back on your iPhone, open **Settings → Accessibility → AssistiveTouch → Mirror iPhone** and select your watch.
4. Open MOVE on your iPhone and start a workout.
5. Raise your wrist — the watch shows a mirrored view of whatever is on your iPhone screen, including the MOVE timer.

**Limitations:** the mirrored image is small on the 41/45 mm display, and the watch cannot interact with MOVE. It is read-only.

---

## Option C — Use a third-party bridge app (most capable)

Apps such as **Workouts++ (by David Smith)**, **WorkOutDoors**, or **Gymaholic** let you define custom workout types and show metrics on the watch face. None of them run MOVE directly, but you can use them as a companion timer/heart-rate display while MOVE runs on your phone.

For a tighter integration, **Scriptable** (free on the App Store) can run JavaScript and display dynamic data on a watch complication via a widget. The steps are:

1. Install **Scriptable** on your iPhone from the App Store.
2. In Scriptable, create a new script. Paste the script below.
3. Add a Scriptable widget to your iPhone home screen, choose your script, and set it to update every minute.
4. On your Apple Watch, add a **Siri Watch Face** or **Infograph Modular** face, and add the Scriptable complication using the same script.
5. MOVE writes the current workout state to `localStorage`. The Scriptable script reads it and displays the exercise name and remaining time on the complication.

### Scriptable bridge script

Paste this into a new Scriptable script. Name it **MOVE Watch**.

```javascript
// MOVE Watch bridge for Scriptable.
// Reads the last known workout state written by the MOVE app to localStorage.
// Because Scriptable cannot directly read a web app's localStorage,
// you need to trigger this script from a shortcut after each exercise step.
// See the Shortcut steps below.

const fm = FileManager.local();
const path = fm.joinPath(fm.documentsDirectory(), 'move-watch-state.json');

let state = { exercise: 'No workout', remaining: '--', phase: 'idle' };
if (fm.fileExists(path)) {
  try { state = JSON.parse(fm.readString(path)); } catch (_) {}
}

const w = new ListWidget();
w.backgroundColor = new Color('#0d1b2a');
const title = w.addText(state.exercise || 'MOVE');
title.textColor = new Color('#6ee7b7');
title.font = Font.boldSystemFont(13);
const sub = w.addText(state.phase === 'rest' ? `Rest · ${state.remaining}` : state.remaining || '--');
sub.textColor = Color.white();
sub.font = Font.systemFont(11);
w.presentSmall();
Script.setWidget(w);
Script.complete();
```

### iOS Shortcut to push state from MOVE to Scriptable

Because web apps cannot call native APIs directly, you create a Shortcut that MOVE triggers via a URL scheme, and the Shortcut writes to the Scriptable file.

1. Open the **Shortcuts** app.
2. Create a new shortcut named **MOVE State**.
3. Add the action **Get Contents of URL**: URL = `move://state` (or use a custom URL scheme you configure in MOVE — see step 4).
4. Add the action **Save File**, save to Scriptable's iCloud folder as `move-watch-state.json`.
5. In MOVE `js/app.js`, after `renderTimer(s)`, add:
   ```javascript
   // Push state to Scriptable for the watch complication.
   if (window.webkit?.messageHandlers?.scriptable) {
     // Native app — not applicable in PWA.
   }
   // For Shortcuts: encode state as a URL and open it.
   // Uncomment if you have configured the Shortcut above.
   // const enc = encodeURIComponent(JSON.stringify({ exercise: s.current?.name, remaining: mmss(s.remaining), phase: s.phase }));
   // window.location.href = `shortcuts://run-shortcut?name=MOVE%20State&input=${enc}`;
   ```
6. The complication updates each time the Shortcut runs (at most every minute on the watch).

**Note:** opening a `shortcuts://` URL navigates away from MOVE in Safari. This approach works best when MOVE is installed as a PWA (Add to Home Screen) with its own standalone window, so the Shortcuts URL opens in the background.

---

## What cannot be done on a PWA + Apple Watch

| Feature | Why not possible |
|---|---|
| Native watch app | Requires Swift/WatchKit, not available to web apps |
| Always-on display showing MOVE timer | Requires watchOS native app |
| Haptic alerts from MOVE directly | Only available to native apps |
| Heart-rate data inside MOVE | HealthKit is not available to web apps on iOS |

For full Apple Watch integration, the app would need to be rebuilt as a native iOS + watchOS app using Swift and WatchKit. The existing logic, sheet data, and exercise library could be reused, but the timer and UI would be rewritten in SwiftUI.

---

## Quick-start recommendation for Series 9

Do this now, in under two minutes:

1. Open MOVE → Workouts → pick FISIO → choose reps → START WORKOUT.
2. On your watch: raise wrist → tap **Workout** → **Other** → start.
3. Work out. MOVE counts down on your phone. The watch shows your heart rate, calories, and elapsed time.
4. When done, end both MOVE and the watch workout.

That is the best experience available without a native app.
