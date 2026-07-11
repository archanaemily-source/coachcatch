// Endpoint test suite. Boots the backend against an isolated on-disk DB,
// runs assertions with fetch, and prints a pass/fail summary.
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const TEST_DB = path.join(__dirname, 'test.db');
for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

process.env.DB_PATH = './test.db';
process.env.PORT = '3999';
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret-not-for-prod-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');
}

const app = require('./app');
const db = require('./db');
const { decrypt } = require('./crypto');

const BASE = 'http://localhost:3999';
let server;
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL - ${name}`);
    console.log(`         ${err.message}`);
  }
}

async function api(method, url, { token, deviceToken, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (deviceToken) headers['X-Device-Token'] = deviceToken;
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    // no body
  }
  return { status: res.status, body: json };
}

async function registerAndLogin(name, email, role) {
  const reg = await api('POST', '/api/auth/register', {
    body: { name, email, password: 'password123', role },
  });
  return reg.body.token;
}

async function main() {
  await new Promise((resolve) => {
    server = app.listen(process.env.PORT, resolve);
  });

  console.log('Running backend endpoint tests...\n');

  let coachToken, coachId, studentToken, studentId, otherStudentToken, otherStudentId;

  await test('coach can register and login', async () => {
    const reg = await api('POST', '/api/auth/register', {
      body: { name: 'Coach Dana', email: 'coach@test.local', password: 'password123', role: 'coach' },
    });
    assert.strictEqual(reg.status, 201);
    assert.ok(reg.body.token);
    coachToken = reg.body.token;
    const payload = JSON.parse(Buffer.from(coachToken.split('.')[1], 'base64url').toString());
    coachId = payload.id;

    const login = await api('POST', '/api/auth/login', {
      body: { email: 'coach@test.local', password: 'password123' },
    });
    assert.strictEqual(login.status, 200);
    assert.ok(login.body.token);
  });

  await test('bad login returns 401', async () => {
    const res = await api('POST', '/api/auth/login', {
      body: { email: 'coach@test.local', password: 'wrong-password' },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('missing token returns 401 on protected route', async () => {
    const res = await api('GET', `/api/coaches/${coachId}/students`);
    assert.strictEqual(res.status, 401);
  });

  await test('student can register and login', async () => {
    const reg = await api('POST', '/api/auth/register', {
      body: { name: 'Jordan Reyes', email: 'jordan@test.local', password: 'password123', role: 'student' },
    });
    assert.strictEqual(reg.status, 201);
    studentToken = reg.body.token;
    const payload = JSON.parse(Buffer.from(studentToken.split('.')[1], 'base64url').toString());
    studentId = payload.id;
  });

  await test('unlinked student registered for negative access tests', async () => {
    const reg = await api('POST', '/api/auth/register', {
      body: { name: 'Sam Whitfield', email: 'sam@test.local', password: 'password123', role: 'student' },
    });
    assert.strictEqual(reg.status, 201);
    otherStudentToken = reg.body.token;
    const payload = JSON.parse(Buffer.from(otherStudentToken.split('.')[1], 'base64url').toString());
    otherStudentId = payload.id;
  });

  await test('coach links to student directly in DB (simulating admin linking)', async () => {
    // No API endpoint creates links (out of spec scope); seed the link directly.
    const crypto = require('crypto');
    db.prepare('INSERT INTO coach_student_links (id, coachId, studentId, createdAt) VALUES (?, ?, ?, ?)').run(
      crypto.randomUUID(),
      coachId,
      studentId,
      new Date().toISOString()
    );
    const linked = db
      .prepare('SELECT * FROM coach_student_links WHERE coachId = ? AND studentId = ?')
      .get(coachId, studentId);
    assert.ok(linked);
  });

  await test('coach can create a goal for a linked student', async () => {
    const res = await api('POST', '/api/goals', {
      token: coachToken,
      body: { studentId, targetReps: 20 },
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.goal.targetReps, 20);
  });

  await test('coach is blocked (403) from creating a goal for an unlinked student', async () => {
    const res = await api('POST', '/api/goals', {
      token: coachToken,
      body: { studentId: otherStudentId, targetReps: 10 },
    });
    assert.strictEqual(res.status, 403);
  });

  await test('student is blocked (403) from creating goals', async () => {
    const res = await api('POST', '/api/goals', {
      token: studentToken,
      body: { studentId, targetReps: 5 },
    });
    assert.strictEqual(res.status, 403);
  });

  let sessionId, deviceToken;

  await test('student can start a session and receives a deviceToken', async () => {
    const res = await api('POST', '/api/sessions', { token: studentToken, body: {} });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.sessionId);
    assert.strictEqual(res.body.deviceToken.length, 8);
    sessionId = res.body.sessionId;
    deviceToken = res.body.deviceToken;
  });

  await test('student is blocked from another student session', async () => {
    const res = await api('GET', `/api/sessions/${sessionId}`, { token: otherStudentToken });
    assert.strictEqual(res.status, 403);
  });

  await test('device rep accepted with valid token', async () => {
    const res = await api('POST', '/api/devices/reps', {
      deviceToken,
      body: { sessionId, repNumber: 1, timestamp: new Date().toISOString() },
    });
    assert.strictEqual(res.status, 201);
  });

  await test('device rep rejected 401 with bad token', async () => {
    const res = await api('POST', '/api/devices/reps', {
      deviceToken: 'deadbeef',
      body: { sessionId, repNumber: 2 },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('device biometric accepted and NOT stored as plaintext', async () => {
    const res = await api('POST', '/api/devices/biometrics', {
      deviceToken,
      body: { sessionId, type: 'heart_rate', value: '137', timestamp: new Date().toISOString() },
    });
    assert.strictEqual(res.status, 201);

    const row = db
      .prepare('SELECT value FROM biometric_readings WHERE sessionId = ? ORDER BY timestamp DESC LIMIT 1')
      .get(sessionId);
    assert.ok(row);
    assert.notStrictEqual(row.value, '137');
    // Stored value must be in the iv:authTag:ciphertext hex format, not bare
    // plaintext (a raw substring search for "137" would be flaky here: it's
    // a valid hex digit sequence with a real chance of appearing by chance
    // inside ~130 random hex characters).
    assert.match(row.value, /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i);
    assert.strictEqual(decrypt(row.value), '137');
  });

  await test('camera reps recorded and live GET returns cameraRepCount/deviceRepCount/latestHeartRate', async () => {
    for (let i = 1; i <= 3; i++) {
      const res = await api('POST', `/api/sessions/${sessionId}/reps`, {
        token: studentToken,
        body: { source: 'camera', repNumber: i, timestamp: new Date().toISOString(), formScore: 0.8 },
      });
      assert.strictEqual(res.status, 201);
    }
    const res = await api('GET', `/api/sessions/${sessionId}`, { token: studentToken });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.cameraRepCount, 3);
    assert.strictEqual(res.body.deviceRepCount, 1);
    assert.strictEqual(res.body.latestHeartRate, 137);
    assert.ok(res.body.deviceToken, 'owner should still see deviceToken while in_progress');
  });

  await test('coach viewing a live linked-student session does not see deviceToken', async () => {
    const res = await api('GET', `/api/sessions/${sessionId}`, { token: coachToken });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.deviceToken, undefined);
  });

  await test('session completion computes correct summary (camera canonical, device cross-check)', async () => {
    const res = await api('POST', `/api/sessions/${sessionId}/complete`, { token: studentToken });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.summary.totalReps, 3);
    assert.strictEqual(res.body.summary.deviceRepCount, 1);
    assert.strictEqual(res.body.summary.avgFormScore, 0.8);
    assert.ok(res.body.summary.durationSeconds >= 0);
  });

  await test('device token rejected after session complete', async () => {
    const res = await api('POST', '/api/devices/reps', {
      deviceToken,
      body: { sessionId, repNumber: 99 },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('reps rejected 409 after complete', async () => {
    const res = await api('POST', `/api/sessions/${sessionId}/reps`, {
      token: studentToken,
      body: { source: 'manual', repNumber: 100 },
    });
    assert.strictEqual(res.status, 409);
  });

  await test('manual-only session falls back totalReps to manual count', async () => {
    const start = await api('POST', '/api/sessions', { token: studentToken, body: {} });
    const manualSessionId = start.body.sessionId;
    for (let i = 1; i <= 5; i++) {
      await api('POST', `/api/sessions/${manualSessionId}/reps`, {
        token: studentToken,
        body: { source: 'manual', repNumber: i },
      });
    }
    const complete = await api('POST', `/api/sessions/${manualSessionId}/complete`, { token: studentToken });
    assert.strictEqual(complete.body.summary.totalReps, 5);
    assert.strictEqual(complete.body.summary.deviceRepCount, null);
    assert.strictEqual(complete.body.summary.avgFormScore, null);
  });

  await test('GET /api/students/:id/sessions visible to owner and linked coach', async () => {
    const asOwner = await api('GET', `/api/students/${studentId}/sessions`, { token: studentToken });
    assert.strictEqual(asOwner.status, 200);
    assert.ok(asOwner.body.sessions.length >= 2);

    const asCoach = await api('GET', `/api/students/${studentId}/sessions`, { token: coachToken });
    assert.strictEqual(asCoach.status, 200);

    const asUnlinkedCoach = await api('GET', `/api/students/${studentId}/sessions`, { token: otherStudentToken });
    assert.strictEqual(asUnlinkedCoach.status, 403);
  });

  server.close();
  db.close();
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
