# CoachCatch hardware handoff

Your sensor reports two things to the backend during a live session: rep
counts and breath rate. Both are a **cross-check, not the source of truth**
— the phone camera is canonical for the rep count shown to the coach. Your
numbers just need to be roughly right; nobody reconciles them against the
camera's count.

## Where to get the Sensor code

When a student starts a session on their phone, the live session screen
shows a large 8-character **"Sensor code"** at the top (e.g. `53f9dd55`).
That's the `deviceToken` — type it into your firmware (or pass it to
`bridge.py`). It's generated fresh per session and **stops working the
moment the student taps "End workout"** (the backend clears it on
completion), so you don't need to worry about stale tokens carrying into
the next session.

No login, no JWT, no pairing flow beyond that one code.

## Endpoint 1 — report a rep

```
POST /api/devices/reps
X-Device-Token: <the Sensor code>
Content-Type: application/json

{"sessionId": "<optional, cross-checked if present>", "repNumber": 1}
```

Example:

```bash
curl -X POST http://localhost:3001/api/devices/reps \
  -H "X-Device-Token: 53f9dd55" \
  -H "Content-Type: application/json" \
  -d '{"repNumber": 1}'
```

`repNumber` should increase by one each time (just keep a counter on the
device or in your bridge script — it doesn't need to match the camera's
count).

## Endpoint 2 — report a breath-rate reading

```
POST /api/devices/biometrics
X-Device-Token: <the Sensor code>
Content-Type: application/json

{"type": "breath_rate", "value": "18"}
```

Example:

```bash
curl -X POST http://localhost:3001/api/devices/biometrics \
  -H "X-Device-Token: 53f9dd55" \
  -H "Content-Type: application/json" \
  -d '{"type": "breath_rate", "value": "18"}'
```

`value` is a breath-force/intensity score, not a literal rate — the app
buckets it into four zones:

| Score  | Zone               |
|--------|--------------------|
| 0-10   | Resting            |
| 10-20  | Moderate breathing |
| 20-40  | Heavy breathing    |
| 40+    | Labored breathing  |

Send a reading every few seconds — no need to stream continuously.

## Responses

- `201 {"ok": true}` — accepted.
- `401` — the token is missing, wrong, or the session has already ended.
  This is expected once the student finishes their workout; just stop
  sending.
- `400` — malformed body (missing `repNumber`, or `type`/`value` for
  biometrics).

## Two ways to get data in

1. **`esp32_example.ino`** — if your sensor is on an ESP32 (or similar)
   with WiFi, this connects to WiFi and POSTs directly. Fill in your
   WiFi credentials, the laptop's LAN IP running `make dev`, and the
   Sensor code, then wire in your actual rep/breath-analyzer detection
   logic where marked.

2. **`bridge.py`** — your no-WiFi insurance policy. If the ESP32's WiFi
   is being flaky mid-demo, plug it into a laptop over USB, have it print
   plain lines (`REP` or `BR:18`) to Serial instead of doing HTTP itself,
   and run this script to forward those lines to the backend over the
   laptop's network connection. See the script's header comment for exact
   usage, including a `--dry-run` mode that reads from stdin instead of a
   serial port (useful for testing the backend calls without hardware at
   all).
