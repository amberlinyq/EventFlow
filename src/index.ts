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
  try {
    // Initialize Pub/Sub
    await pubsubService.initialize();

    // Initialize BigQuery (non-blocking - server can start even if BigQuery fails)
    try {
      await bigqueryService.initialize();
      logger.info('BigQuery initialized');
    } catch (error) {
      logger.warn({ error }, 'BigQuery initialization failed (non-critical, continuing...)');
    }

    // Test database connection
    await prisma.$connect();
    logger.info('Database connected');

    const port = env.PORT;
    app.listen(port, () => {
      logger.info({ port, env: env.NODE_ENV }, 'Server started');
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
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
