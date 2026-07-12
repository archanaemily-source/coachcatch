const app = require('./app');
const { startFirebaseBreathPolling } = require('./lib/firebaseIngest');

const PORT = process.env.BACKEND_PORT || 3001;
app.listen(PORT, () => {
  console.log(`CoachApp backend listening on port ${PORT}`);
});

if (!process.env.DISABLE_FIREBASE_POLL) {
  startFirebaseBreathPolling();
  console.log('Polling Firebase breath analyzer feed every 4s...');
}
