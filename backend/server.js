const app = require('./app');
const { startFirebaseBreathPolling } = require('./lib/firebaseIngest');

const PORT = process.env.BACKEND_PORT || 3001;
app.listen(PORT, () => {
  console.log(`CoachCatch backend listening on port ${PORT}`);
});

if (!process.env.DISABLE_FIREBASE_POLL) {
  const started = startFirebaseBreathPolling();
  if (started) console.log('Polling Firebase breath analyzer feed every 4s...');
}
