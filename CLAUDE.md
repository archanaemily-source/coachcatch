# CoachApp

CoachApp is a sports coaching web app: a student performs squats in front of their phone camera, and MediaPipe pose detection running in the browser counts reps and scores form; a teammate's hardware sensor independently reports its own rep count and heart rate to the backend as a cross-check. The coach sees live sessions and post-workout reports. Pitch: "reps prove the motion, heart rate proves the effort, and camera + hardware agreeing proves the system."

## Makefile commands
- `make dev` — run backend (port 3001) and frontend (Vite, port 5173) together
- `make seed` — wipe the DB and load demo coach/students/sessions
- `make test` — run backend endpoint tests + rep-engine unit tests
- `make build` — production build of the frontend, sanity-check backend
- `make help` — list all targets

## Stack rules
- Backend: Node.js + Express + better-sqlite3 (raw SQL, no ORM), bcryptjs, jsonwebtoken, dotenv, cors.
- Frontend: Vite + React + Tailwind CSS + react-router-dom. Vite dev server proxies `/api` to `http://localhost:3001` and sets `host: true` for phone testing.
- JWT is held only in React state/context — never localStorage.
- No websockets. Live updates are 4s polling of `GET /api/sessions/:id`.
- No ORM, no Docker, no admin roles, no extra exercises beyond squats, no video upload.
- Never hardcode secrets. Secrets live in `backend/.env` (gitignored); `backend/.env.example` documents the shape.

## Data model (SQLite)
- `users(id uuid, role 'coach'|'student', name, email unique, passwordHash, createdAt)`
- `coach_student_links(id, coachId, studentId, createdAt)`
- `goals(id, studentId, coachId, exerciseType default 'squat', targetReps int, active bool, createdAt)`
- `sessions(id, studentId, goalId nullable, exerciseType, deviceToken nullable, startedAt, endedAt nullable, status 'in_progress'|'completed')`
- `rep_events(id, sessionId, source 'camera'|'device'|'manual', repNumber int, timestamp, formScore float nullable)`
- `biometric_readings(id, sessionId, type 'heart_rate', value TEXT encrypted, timestamp)`

## API contract
- `POST /api/auth/register {name,email,password,role}` -> `{token}`; `POST /api/auth/login` -> `{token}`. JWT payload `{id, role, name}`, 2-day expiry.
- `GET /api/coaches/:id/students` — the coach themself only.
- `GET /api/students/:id/goals` — that student or a linked coach.
- `POST /api/goals {studentId, targetReps}` — coach only, linked students only.
- `POST /api/sessions` — student only -> `{sessionId, deviceToken}`. deviceToken = random 8-char hex, typed into hardware firmware by hand.
- `POST /api/sessions/:id/reps {source:'camera'|'manual', repNumber, timestamp?, formScore?}` — session owner only; 409 if session completed.
- `POST /api/sessions/:id/complete` -> `{summary}`. Sets status/endedAt, NULLs deviceToken (expires on completion).
- `GET /api/sessions/:id` — owner or linked coach. Returns session + rep events + decrypted biometrics + cameraRepCount + deviceRepCount + latestHeartRate + summary if completed. Hides deviceToken from coaches. Polled every 4s during live sessions.
- `GET /api/students/:id/sessions` — owner or linked coach; includes summary per completed session.
- `POST /api/devices/reps` and `POST /api/devices/biometrics` — NO JWT. Header `X-Device-Token` must match an `in_progress` session's token. Bodies: `{sessionId, repNumber, timestamp?}` and `{sessionId, type:'heart_rate', value, timestamp?}`. 401 on bad/expired token.

## Summary computation
- `totalReps` = count of `source='camera'` events; falls back to `manual` count if zero camera events.
- `deviceRepCount` = count of `source='device'` events (null if zero) — a separate field, never merged into totalReps.
- `avgFormScore` = average of non-null camera `formScore`s.
- `durationSeconds` from first/last event timestamps.

## Access control
- Students can only read/write their own goals, sessions, and rep/biometric data.
- Coaches can only read a student's data if a `coach_student_links` row exists; coaches never write rep/biometric data.
- Device endpoints trust only a valid, unexpired `X-Device-Token` tied to an `in_progress` session — no JWT involved.
- Biometric values are encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`) and only decrypted server-side when returned to an authorized owner/coach.

## formScore formula
Per rep: `formScore = clamp01((120 - minKneeAngleDuringRep) / 20)` — deeper squats (lower min angle) score higher, capped at 1.

## Hard rules
- Camera is canonical for `totalReps`. Device count is a cross-check only — it is never reconciled into or averaged with the camera count.
- Never add co-authors (or any `Co-Authored-By` line) to git commits.
