const app = require('./app');
const config = require('./config');
const { connectWithRetry } = require('./db');
const { startReportScheduler } = require('./services/reports');

const start = async () => {
  app.listen(config.port, () => {
    console.log(`Backend listening on port ${config.port}`);
  });

  connectWithRetry(config.mongoUri);
  startReportScheduler().catch((error) => {
    console.error('Report scheduler failed to initialize:', error);
  });
};

start().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
