import { env } from './config/environment.js';
import app from './app.js';
import { logger } from './utils/logger.js';

app.listen(env.port, () => {
  logger.info(`thy.self backend running on port ${env.port}`, {
    environment: env.nodeEnv,
  });
});
