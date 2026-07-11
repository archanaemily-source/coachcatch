const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken } = require('../auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password || !['coach', 'student'].includes(role)) {
    return res.status(400).json({ error: 'name, email, password, and role (coach|student) are required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'email already registered' });

  const id = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO users (id, role, name, email, passwordHash, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, role, name, email, passwordHash, createdAt);

  const token = signToken({ id, role, name });
  res.status(201).json({ token });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'invalid email or password' });
  }

  const token = signToken(user);
  res.json({ token });
});

module.exports = router;
