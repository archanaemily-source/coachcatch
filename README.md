# CoachApp

A student does squats in front of their phone camera; MediaPipe pose
detection counts reps and scores form right in the browser. A teammate's
hardware sensor independently reports its own rep count and breath rate to
the backend as a cross-check. The coach sees live sessions and post-workout
reports.

**Pitch:** reps prove the motion, breath proves the effort, and camera +
hardware agreeing proves the system.

See [CLAUDE.md](CLAUDE.md) for the full data model, API contract, and
access-control rules.

## Make targets

```
make install  - install backend + frontend dependencies
make dev      - run backend (3001) and frontend (5173) together
make seed     - wipe the DB and load demo coach/students/sessions
make test     - run backend endpoint tests + rep-engine unit tests
make build    - production build of the frontend, sanity-check backend
make e2e      - re-seed, then run the curl end-to-end workout script
make help     - list all targets
```

First run: `make install && make seed && make dev`.

## Demo logins

All passwords are `password123`.

| Role    | Email             | Name          |
|---------|-------------------|---------------|
| Coach   | coach@demo.app    | Coach Dana    |
| Student | jordan@demo.app   | Jordan Reyes  |
| Student | sam@demo.app      | Sam Whitfield |

## How to demo (two browsers side by side)

1. `make dev` (backend on :3001, frontend on :5173).
2. Open two browser windows side by side: one logged in as `coach@demo.app`
   (coach dashboard), one as `jordan@demo.app` (student home) — or a phone
   for the student side, see below.
3. On the student side, tap **Start session**, then hold the phone/camera
   so your full body is in frame and do a few squats.
4. On the coach side, select **Jordan Reyes**, then click the session
   marked **LIVE** — it polls every 4 seconds and updates the rep count,
   cross-check badge, and breath-rate chart in real time.
5. Tap **End workout** on the student side to see the summary screen; the
   coach's panel updates on its next poll.

## Phone testing (camera access needs HTTPS)

The dev server binds to all interfaces (`host: true`), so a phone on the
same WiFi can already reach `http://<your-laptop-ip>:5173`. But
`getUserMedia` (camera access) is blocked by browsers over plain HTTP on
anything other than `localhost`, so for the live camera screen on a real
phone you need HTTPS:

```bash
ngrok http 5173
```

Open the `https://*.ngrok-free.app` URL it gives you on the phone. The
Vite proxy still forwards `/api` to the backend on :3001 on your laptop, so
you don't need to tunnel the backend separately.

## 90-second demo script

1. **(10s)** "CoachApp cross-checks a phone camera against hardware —
   reps prove the motion, breath proves the effort."
2. **(20s)** Student taps Start session, sensor code appears — "that code
   is what the hardware teammate's sensor pairs with, no login needed."
   Do 3-4 visible squats; watch the giant rep counter and depth gauge live.
3. **(15s)** Do one intentionally shallow squat — the red "GO DEEPER"
   banner flashes and it's *not* counted as a full rep.
4. **(15s)** Switch to the coach's screen — the session is tagged LIVE,
   updating every 4s, camera reps headline in orange, device count next to
   it with the cross-check badge, breath-rate line climbing in teal.
5. **(15s)** Tap End workout — summary screen with camera reps, device
   count, avg form score, and the effort note.
6. **(15s)** "If the camera can't see you or the hardware isn't paired
   yet, manual entry and the hardware bridge script both fall back
   gracefully — nothing blocks the workout."

## Known limits

- One exercise: squats only, by design (see [CLAUDE.md](CLAUDE.md)).
- The pose model assumes a roughly side-on camera angle so the knee/hip/
  ankle landmarks are all visible — a straight-on front view will trigger
  the "step back" cue more often.
- The breath-rate "effort" note is a coaching signal for the demo, not a
  medical claim or a validated fitness metric.
- The device rep count is a cross-check only; it's never reconciled with
  or averaged into the camera's count, even when they disagree.
- The Vite dev server has a known, low-severity advisory (any origin can
  read dev-server responses) — acceptable for a local/ngrok hackathon demo,
  not for a real deployment.
