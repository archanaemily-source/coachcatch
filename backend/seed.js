require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { encrypt } = require('./crypto');
const { formScoreFromMinAngle } = require('./lib/summary');

function wipe() {
  db.exec(`
    DELETE FROM biometric_readings;
    DELETE FROM rep_events;
    DELETE FROM sessions;
    DELETE FROM goals;
    DELETE FROM coach_student_links;
    DELETE FROM users;
  `);
}

function createUser(name, email, role) {
  const id = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync('password123', 10);
  db.prepare(
    'INSERT INTO users (id, role, name, email, passwordHash, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, role, name, email, passwordHash, new Date().toISOString());
  return id;
}

function link(coachId, studentId) {
  db.prepare(
    'INSERT INTO coach_student_links (id, coachId, studentId, createdAt) VALUES (?, ?, ?, ?)'
  ).run(crypto.randomUUID(), coachId, studentId, new Date().toISOString());
}

function createGoal(studentId, coachId, targetReps) {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO goals (id, studentId, coachId, exerciseType, targetReps, active, createdAt)
     VALUES (?, ?, ?, 'squat', ?, 1, ?)`
  ).run(id, studentId, coachId, targetReps, new Date().toISOString());
  return id;
}

function createCompletedSession(studentId, goalId, opts) {
  const { startMinutesAgo, cameraReps, deviceReps, hrStart, hrEnd } = opts;
  const sessionId = crypto.randomUUID();
  const startedAt = new Date(Date.now() - startMinutesAgo * 60000);
  const durationSec = 70 + cameraReps * 5;
  const endedAt = new Date(startedAt.getTime() + durationSec * 1000);

  db.prepare(
    `INSERT INTO sessions (id, studentId, goalId, exerciseType, deviceToken, startedAt, endedAt, status)
     VALUES (?, ?, ?, 'squat', NULL, ?, ?, 'completed')`
  ).run(sessionId, studentId, goalId, startedAt.toISOString(), endedAt.toISOString());

  for (let i = 1; i <= cameraReps; i++) {
    const t = new Date(startedAt.getTime() + (i * durationSec * 1000) / cameraReps);
    const minAngle = 70 + Math.random() * 45; // 70-115 degrees at bottom of rep
    const formScore = Number(formScoreFromMinAngle(minAngle).toFixed(2));
    db.prepare(
      'INSERT INTO rep_events (id, sessionId, source, repNumber, timestamp, formScore) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), sessionId, 'camera', i, t.toISOString(), formScore);
  }

  for (let i = 1; i <= deviceReps; i++) {
    const t = new Date(startedAt.getTime() + (i * durationSec * 1000) / deviceReps);
    db.prepare(
      "INSERT INTO rep_events (id, sessionId, source, repNumber, timestamp, formScore) VALUES (?, ?, 'device', ?, ?, NULL)"
    ).run(crypto.randomUUID(), sessionId, i, t.toISOString());
  }

  const hrPoints = 6;
  for (let i = 0; i < hrPoints; i++) {
    const t = new Date(startedAt.getTime() + (i * durationSec * 1000) / (hrPoints - 1));
    const hr = Math.round(hrStart + ((hrEnd - hrStart) * i) / (hrPoints - 1));
    db.prepare(
      "INSERT INTO biometric_readings (id, sessionId, type, value, timestamp) VALUES (?, ?, 'heart_rate', ?, ?)"
    ).run(crypto.randomUUID(), sessionId, encrypt(hr), t.toISOString());
  }

  return sessionId;
}

function main() {
  wipe();

  const coachId = createUser('Coach Dana', 'coach@demo.app', 'coach');
  const jordanId = createUser('Jordan Reyes', 'jordan@demo.app', 'student');
  const samId = createUser('Sam Whitfield', 'sam@demo.app', 'student');

  link(coachId, jordanId);
  link(coachId, samId);

  const jordanGoal = createGoal(jordanId, coachId, 20);
  const samGoal = createGoal(samId, coachId, 15);

  // 3 completed sessions total: Jordan has a two-session history, Sam has one.
  createCompletedSession(jordanId, jordanGoal, {
    startMinutesAgo: 60 * 24 * 3,
    cameraReps: 18,
    deviceReps: 17,
    hrStart: 88,
    hrEnd: 142,
  });
  createCompletedSession(jordanId, jordanGoal, {
    startMinutesAgo: 60 * 24 * 1,
    cameraReps: 22,
    deviceReps: 20,
    hrStart: 91,
    hrEnd: 151,
  });
  createCompletedSession(samId, samGoal, {
    startMinutesAgo: 60 * 24 * 2,
    cameraReps: 13,
    deviceReps: 15,
    hrStart: 85,
    hrEnd: 133,
  });

  console.log('Seed complete.');
  console.log('  Coach:   coach@demo.app  / password123');
  console.log('  Student: jordan@demo.app / password123');
  console.log('  Student: sam@demo.app    / password123');
}

main();
