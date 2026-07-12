#!/usr/bin/env bash
# End-to-end curl script: login -> start session -> camera reps -> device
# reps + biometrics via deviceToken -> complete -> assert summary numbers.
# Requires the backend running on BASE_URL (default http://localhost:3001)
# with the seed data loaded (make seed).
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
FAIL=0

pass() { echo "  ok - $1"; }
fail() {
  echo "  FAIL - $1"
  FAIL=1
}

json_get() {
  # $1=json $2=key path (simple dotted path, numeric-safe via node)
  node -e "
    const data = JSON.parse(process.argv[1]);
    const path = process.argv[2].split('.');
    let v = data;
    for (const k of path) v = v?.[k];
    console.log(v === undefined ? '' : v);
  " "$1" "$2"
}

echo "Running Phase 4 end-to-end script against $BASE_URL ..."
echo

LOGIN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"jordan@demo.app","password":"password123"}')
TOKEN=$(json_get "$LOGIN" token)
if [ -n "$TOKEN" ]; then pass "login as jordan@demo.app"; else fail "login as jordan@demo.app"; echo "$LOGIN"; exit 1; fi

START=$(curl -s -X POST "$BASE_URL/api/sessions" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}')
SESSION_ID=$(json_get "$START" sessionId)
DEVICE_TOKEN=$(json_get "$START" deviceToken)
if [ -n "$SESSION_ID" ] && [ -n "$DEVICE_TOKEN" ]; then
  pass "start session (id=$SESSION_ID, deviceToken=$DEVICE_TOKEN)"
else
  fail "start session"; echo "$START"; exit 1
fi

for i in 1 2 3 4 5; do
  RES=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/sessions/$SESSION_ID/reps" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"source\":\"camera\",\"repNumber\":$i,\"formScore\":0.9}")
  if [ "$RES" != "201" ]; then fail "post camera rep $i (got $RES)"; fi
done
pass "posted 5 camera reps"

for i in 1 2; do
  RES=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/devices/reps" \
    -H "X-Device-Token: $DEVICE_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"sessionId\":\"$SESSION_ID\",\"repNumber\":$i}")
  if [ "$RES" != "201" ]; then fail "post device rep $i (got $RES)"; fi
done
pass "posted 2 device reps"

for br in 16 22 28; do
  RES=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/devices/biometrics" \
    -H "X-Device-Token: $DEVICE_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"sessionId\":\"$SESSION_ID\",\"type\":\"breath_rate\",\"value\":\"$br\"}")
  if [ "$RES" != "201" ]; then fail "post biometric br=$br (got $RES)"; fi
done
pass "posted 3 biometric readings"

COMPLETE=$(curl -s -X POST "$BASE_URL/api/sessions/$SESSION_ID/complete" -H "Authorization: Bearer $TOKEN")
TOTAL_REPS=$(json_get "$COMPLETE" summary.totalReps)
DEVICE_REP_COUNT=$(json_get "$COMPLETE" summary.deviceRepCount)
AVG_FORM=$(json_get "$COMPLETE" summary.avgFormScore)

if [ "$TOTAL_REPS" = "5" ]; then pass "summary.totalReps == 5 (camera canonical)"; else fail "summary.totalReps expected 5, got $TOTAL_REPS"; fi
if [ "$DEVICE_REP_COUNT" = "2" ]; then pass "summary.deviceRepCount == 2 (cross-check)"; else fail "summary.deviceRepCount expected 2, got $DEVICE_REP_COUNT"; fi
if [ "$AVG_FORM" = "0.9" ]; then pass "summary.avgFormScore == 0.9"; else fail "summary.avgFormScore expected 0.9, got $AVG_FORM"; fi

GET_SESSION=$(curl -s "$BASE_URL/api/sessions/$SESSION_ID" -H "Authorization: Bearer $TOKEN")
LATEST_BR=$(json_get "$GET_SESSION" latestBreathRate)
if [ "$LATEST_BR" = "28" ]; then pass "latestBreathRate == 28"; else fail "latestBreathRate expected 28, got $LATEST_BR"; fi

DEVICE_REP_AFTER=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/devices/reps" \
  -H "X-Device-Token: $DEVICE_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$SESSION_ID\",\"repNumber\":99}")
if [ "$DEVICE_REP_AFTER" = "401" ]; then pass "device token rejected after complete (401)"; else fail "expected 401 after complete, got $DEVICE_REP_AFTER"; fi

REP_AFTER=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/sessions/$SESSION_ID/reps" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"source":"manual","repNumber":100}')
if [ "$REP_AFTER" = "409" ]; then pass "reps rejected 409 after complete"; else fail "expected 409 after complete, got $REP_AFTER"; fi

echo ""
if [ "$FAIL" = "0" ]; then
  echo "All e2e checks passed."
  exit 0
else
  echo "Some e2e checks FAILED."
  exit 1
fi
