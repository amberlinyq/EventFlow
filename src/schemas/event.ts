import { z } from 'zod';

export const eventPayloadSchema = z.object({
  eventType: z.string().min(1).max(100),
  payload: z.record(z.any()),
  metadata: z
    .object({
      source: z.string().optional(),
      userId: z.string().optional(),
      timestamp: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
});

export type EventPayload = z.infer<typeof eventPayloadSchema>;

