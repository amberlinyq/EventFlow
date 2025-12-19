import { Router, Request, Response } from 'express';
import { eventPayloadSchema } from '../schemas/event';
import prisma from '../db/client';
import { pubsubService } from '../services/pubsub';
import { bigqueryService } from '../services/bigquery';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    // Validate request body
    const validatedData = eventPayloadSchema.parse(req.body);

    logger.info({ eventType: validatedData.eventType }, 'Received event');

    // Store event in database
    const event = await prisma.event.create({
      data: {
        eventType: validatedData.eventType,
        payload: validatedData.payload,
        metadata: validatedData.metadata || {},
        status: 'PENDING',
      },
    });

    logger.info({ eventId: event.id, eventType: event.eventType }, 'Event stored in database');

    // Store event in BigQuery (non-blocking - don't fail if BigQuery is unavailable)
    try {
      await bigqueryService.insertEvent({
        id: event.id,
        eventType: event.eventType,
        payload: event.payload as Record<string, any>,
        metadata: (event.metadata as Record<string, any>) || undefined,
        status: event.status,
        createdAt: event.createdAt.toISOString(),
        processedAt: event.processedAt?.toISOString() || null,
        failedAt: event.failedAt?.toISOString() || null,
        failureReason: event.failureReason || null,
        retryCount: event.retryCount,
      });
      logger.info({ eventId: event.id }, 'Event stored in BigQuery');
    } catch (error) {
      // Log error but don't fail the request - BigQuery is additional storage
      logger.error({ error, eventId: event.id }, 'Failed to store event in BigQuery (non-critical)');
    }

    // Publish to Pub/Sub for async processing
    try {
      await pubsubService.publishEvent(event.id);
    } catch (error) {
      logger.error({ error, eventId: event.id }, 'Failed to publish event to Pub/Sub');
      // Update event status to failed
      await prisma.event.update({
        where: { id: event.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          failureReason: 'Failed to publish to Pub/Sub',
        },
      });
      throw new AppError(500, 'Failed to queue event for processing');
    }

    res.status(201).json({
      success: true,
      eventId: event.id,
      message: 'Event received and queued for processing',
    });
  })
);

export default router;

