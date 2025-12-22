import { Router, Request, Response } from 'express';
import prisma from '../db/client';
import { pubsubService } from '../services/pubsub';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

// Get failed events
router.get(
  '/events/failed',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where: {
          status: {
            in: ['FAILED', 'DEAD_LETTER'],
          },
        },
        orderBy: {
          failedAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.event.count({
        where: {
          status: {
            in: ['FAILED', 'DEAD_LETTER'],
          },
        },
      }),
    ]);

    res.json({
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

// Get event by ID
router.get(
  '/events/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
    });

    if (!event) {
      throw new AppError(404, 'Event not found');
    }

    res.json(event);
  })
);

// Replay failed event
router.post(
  '/events/:id/replay',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
    });

    if (!event) {
      throw new AppError(404, 'Event not found');
    }

    if (event.status === 'PROCESSED') {
      throw new AppError(400, 'Event is already processed');
    }

    // Reset event status
    const updatedEvent = await prisma.event.update({
      where: { id: event.id },
      data: {
        status: 'PENDING',
        failedAt: null,
        failureReason: null,
        retryCount: 0,
      },
    });

    // Publish to Pub/Sub
    try {
      await pubsubService.publishEvent(event.id);
      logger.info({ eventId: event.id }, 'Failed event replayed');
    } catch (error) {
      logger.error({ error, eventId: event.id }, 'Failed to replay event');
      throw new AppError(500, 'Failed to queue event for replay');
    }

    res.json({
      success: true,
      message: 'Event queued for replay',
      event: updatedEvent,
    });
  })
);

// Get processing metrics
router.get(
  '/metrics',
  asyncHandler(async (req: Request, res: Response) => {
    const [total, pending, processing, processed, failed, deadLetter] = await Promise.all([
      prisma.event.count(),
      prisma.event.count({ where: { status: 'PENDING' } }),
      prisma.event.count({ where: { status: 'PROCESSING' } }),
      prisma.event.count({ where: { status: 'PROCESSED' } }),
      prisma.event.count({ where: { status: 'FAILED' } }),
      prisma.event.count({ where: { status: 'DEAD_LETTER' } }),
    ]);

    // Get events by type
    const eventsByType = await prisma.event.groupBy({
      by: ['eventType'],
      _count: true,
    });

    // Get processing time stats (for processed events)
    const processedEvents = await prisma.event.findMany({
      where: { status: 'PROCESSED' },
      select: {
        createdAt: true,
        processedAt: true,
      },
    });

    const processingTimes = processedEvents
      .filter((e) => e.processedAt)
      .map((e) => {
        const time = e.processedAt!.getTime() - e.createdAt.getTime();
        return time / 1000; // Convert to seconds
      });

    const avgProcessingTime =
      processingTimes.length > 0
        ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
        : 0;

    res.json({
      summary: {
        total,
        pending,
        processing,
        processed,
        failed,
        deadLetter,
      },
      eventsByType: eventsByType.map((e) => ({
        eventType: e.eventType,
        count: e._count,
      })),
      processingStats: {
        averageProcessingTimeSeconds: Math.round(avgProcessingTime * 100) / 100,
        totalProcessed: processed,
      },
    });
  })
);

export default router;
