import { pubsubService } from './services/pubsub';
import { processEvent } from './services/eventProcessor';
import { logger } from './utils/logger';
import { env } from './config/env';
import prisma from './db/client';

async function startWorker() {
  logger.info('Starting event processing worker...');

  // Initialize Pub/Sub
  await pubsubService.createSubscriptionIfNotExists();
  const subscription = pubsubService.getSubscription();

  // Configure message handling
  subscription.on('message', async (message) => {
    let eventId: string;
    
    try {
      const data = JSON.parse(message.data.toString());
      eventId = data.eventId;
    } catch (error) {
      logger.error({ error, messageId: message.id }, 'Failed to parse message data');
      message.ack(); // Acknowledge to prevent infinite retries
      return;
    }

    if (!eventId) {
      logger.error({ messageId: message.id }, 'Message missing eventId');
      message.ack();
      return;
    }

    logger.info({ eventId, messageId: message.id }, 'Received message from Pub/Sub');

    try {
      await processEvent(eventId);
      message.ack();
      logger.info({ eventId }, 'Message acknowledged');
    } catch (error) {
      logger.error({ error, eventId }, 'Failed to process event');
      
      // Check retry count
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { retryCount: true },
      });

      if (event && event.retryCount >= 3) {
        // Max retries reached, acknowledge to prevent infinite retries
        message.ack();
        logger.warn({ eventId }, 'Max retries reached, acknowledging message');
      } else {
        // Nack to retry
        message.nack();
        logger.info({ eventId }, 'Message nacked for retry');
      }
    }
  });

  subscription.on('error', (error) => {
    logger.error({ error }, 'Pub/Sub subscription error');
  });

  logger.info('Worker started and listening for messages');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

startWorker().catch((error) => {
  logger.error({ error }, 'Failed to start worker');
  process.exit(1);
});

