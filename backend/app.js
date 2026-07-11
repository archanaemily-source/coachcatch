require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const coachRoutes = require('./routes/coaches');
const studentRoutes = require('./routes/students');
const goalRoutes = require('./routes/goals');
const sessionRoutes = require('./routes/sessions');
const deviceRoutes = require('./routes/devices');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/coaches', coachRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/devices', deviceRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

module.exports = app;
