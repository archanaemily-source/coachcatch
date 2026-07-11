const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config();

const dbPath = path.resolve(__dirname, process.env.DB_PATH || './data.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('coach','student')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_student_links (
  id TEXT PRIMARY KEY,
  coachId TEXT NOT NULL,
  studentId TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  studentId TEXT NOT NULL,
  coachId TEXT NOT NULL,
  exerciseType TEXT NOT NULL DEFAULT 'squat',
  targetReps INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  studentId TEXT NOT NULL,
  goalId TEXT,
  exerciseType TEXT NOT NULL DEFAULT 'squat',
  deviceToken TEXT,
  startedAt TEXT NOT NULL,
  endedAt TEXT,
  status TEXT NOT NULL CHECK(status IN ('in_progress','completed'))
);

CREATE TABLE IF NOT EXISTS rep_events (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('camera','device','manual')),
  repNumber INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  formScore REAL
);

CREATE TABLE IF NOT EXISTS biometric_readings (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_links_coach ON coach_student_links(coachId);
CREATE INDEX IF NOT EXISTS idx_links_student ON coach_student_links(studentId);
CREATE INDEX IF NOT EXISTS idx_goals_student ON goals(studentId);
CREATE INDEX IF NOT EXISTS idx_sessions_student ON sessions(studentId);
CREATE INDEX IF NOT EXISTS idx_sessions_devicetoken ON sessions(deviceToken);
CREATE INDEX IF NOT EXISTS idx_rep_events_session ON rep_events(sessionId);
CREATE INDEX IF NOT EXISTS idx_biometrics_session ON biometric_readings(sessionId);
`);

module.exports = db;
