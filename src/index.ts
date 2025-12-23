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
  const port = env.PORT;
  
  // Start listening immediately so Cloud Run health checks pass
  app.listen(port, '0.0.0.0', () => {
    logger.info({ port, env: env.NODE_ENV }, 'Server started and listening');
  });

  // Initialize services in background (non-blocking)
  // This allows the server to start even if services take time to connect
  (async () => {
    try {
      // Initialize Pub/Sub (non-blocking)
      try {
        await pubsubService.initialize();
        logger.info('Pub/Sub initialized');
      } catch (error) {
        logger.warn({ error }, 'Pub/Sub initialization failed (non-critical, continuing...)');
      }

      // Initialize BigQuery (non-blocking)
      try {
        await bigqueryService.initialize();
        logger.info('BigQuery initialized');
      } catch (error) {
        logger.warn({ error }, 'BigQuery initialization failed (non-critical, continuing...)');
      }

      // Test database connection (required but non-blocking for startup)
      try {
        await prisma.$connect();
        logger.info('Database connected');
      } catch (error) {
        logger.error({ error }, 'Database connection failed - some features may not work');
      }
    } catch (error) {
      logger.error({ error }, 'Error during service initialization');
    }
  })();
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await bigqueryService.flush();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await bigqueryService.flush();
  await prisma.$disconnect();
  process.exit(0);
});

startServer();
