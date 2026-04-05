const app = require('./app');
const config = require('./config');
const { connectWithRetry } = require('./db');
const { startReportScheduler } = require('./services/reports');
const { logInfo, logError } = require('./lib/logger');

const start = async () => {
  app.listen(config.port, () => {
    logInfo('startup', { message: `Backend listening on port ${config.port}` });
  });

  connectWithRetry(config.mongoUri);
  startReportScheduler().catch((error) => {
    logError('startup', { message: 'Report scheduler failed to initialize', error });
  });
};

start().catch((error) => {
  logError('startup', { message: 'Fatal startup error', error });
  process.exit(1);
});
