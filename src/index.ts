import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './utils/logger';
import { env } from './config/env';
import { pubsubService } from './services/pubsub';
import { bigqueryService } from './services/bigquery';
import { errorHandler } from './middleware/errorHandler';
import eventsRouter from './routes/events';
import adminRouter from './routes/admin';
import prisma from './db/client';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/events', eventsRouter);
app.use('/admin', adminRouter);

// Error handling
app.use(errorHandler);

// Start server
async function startServer() {
  const port = env.PORT || 8080;

  // 1. Start listening IMMEDIATELY (Crucial for Cloud Run)
  app.listen(port, '0.0.0.0', () => {
    logger.info({ port, env: env.NODE_ENV }, '🚀 Server started and listening');
  });

  // 2. Initialize services in the background
  try {
    // Database connection
    await prisma
      .$connect()
      .then(() => logger.info('✅ Database connected'))
      .catch((err) => logger.error({ err }, '❌ Database connection failed'));

    // Pub/Sub
    await pubsubService
      .initialize()
      .then(() => logger.info('✅ Pub/Sub initialized'))
      .catch((err) => logger.warn({ err }, '⚠️ Pub/Sub init failed'));

    // BigQuery
    await bigqueryService
      .initialize()
      .then(() => logger.info('✅ BigQuery initialized'))
      .catch((err) => logger.warn({ err }, '⚠️ BigQuery init failed'));
  } catch (error) {
    logger.error({ error }, 'Unexpected error during background initialization');
  }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  await bigqueryService.flush();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();
