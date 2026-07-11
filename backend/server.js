const app = require('./app');

const PORT = process.env.BACKEND_PORT || 3001;
app.listen(PORT, () => {
  console.log(`CoachApp backend listening on port ${PORT}`);
});
