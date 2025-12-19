import { BigQuery } from '@google-cloud/bigquery';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface EventRow {
  id: string;
  eventType: string;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
  status: string;
  createdAt: string;
  processedAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  retryCount: number;
}

class BigQueryService {
  private client: BigQuery;
  private datasetId: string;
  private tableId: string;
  private dataset: any = null;
  private table: any = null;

  // Batching for Sandbox compatibility (load jobs instead of streaming)
  private eventBuffer: EventRow[] = [];
  private readonly BATCH_SIZE: number = 10; // Flush after 10 events
  private isFlushing: boolean = false;

  constructor() {
    const options: { projectId: string; keyFilename?: string } = {
      projectId: env.GCP_PROJECT_ID,
    };

    if (env.GCP_CREDENTIALS_PATH) {
      options.keyFilename = env.GCP_CREDENTIALS_PATH;
    }

    this.client = new BigQuery(options);
    this.datasetId = env.BIGQUERY_DATASET_ID;
    this.tableId = env.BIGQUERY_TABLE_ID;
  }

  async initialize(): Promise<void> {
    try {
      // Create dataset if it doesn't exist
      const [dataset] = await this.client.dataset(this.datasetId).get({ autoCreate: true });
      this.dataset = dataset;

      if (!this.dataset) {
        throw new Error('Failed to get or create dataset');
      }

      // Create table if it doesn't exist
      const table = this.dataset.table(this.tableId);
      const [exists] = await table.exists();

      if (!exists) {
        const schema = [
          { name: 'id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'eventType', type: 'STRING', mode: 'REQUIRED' },
          { name: 'payload', type: 'JSON', mode: 'REQUIRED' },
          { name: 'metadata', type: 'JSON', mode: 'NULLABLE' },
          { name: 'status', type: 'STRING', mode: 'REQUIRED' },
          { name: 'createdAt', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'processedAt', type: 'TIMESTAMP', mode: 'NULLABLE' },
          { name: 'failedAt', type: 'TIMESTAMP', mode: 'NULLABLE' },
          { name: 'failureReason', type: 'STRING', mode: 'NULLABLE' },
          { name: 'retryCount', type: 'INTEGER', mode: 'REQUIRED' },
        ];

        await table.create({
          schema,
          timePartitioning: {
            type: 'DAY',
            field: 'createdAt',
          },
        });

        this.table = table;
        logger.info(
          { dataset: this.datasetId, table: this.tableId },
          'BigQuery table created'
        );
      } else {
        this.table = table;
        logger.info(
          { dataset: this.datasetId, table: this.tableId },
          'BigQuery table already exists'
        );
      }
    } catch (error) {
      logger.error({ error }, 'Failed to initialize BigQuery');
      throw error;
    }
  }

  /**
   * Add event to buffer for batch loading (Sandbox-compatible)
   * Events are flushed when buffer reaches BATCH_SIZE
   */
  async insertEvent(event: EventRow): Promise<void> {
    if (!this.table) {
      await this.initialize();
    }

    const row: EventRow = {
      id: event.id,
      eventType: event.eventType,
      payload: event.payload,
      metadata: event.metadata,
      status: event.status,
      createdAt: event.createdAt,
      processedAt: event.processedAt,
      failedAt: event.failedAt,
      failureReason: event.failureReason,
      retryCount: event.retryCount,
    };

    // Add to buffer
    this.eventBuffer.push(row);
    logger.debug({ eventId: event.id, bufferSize: this.eventBuffer.length }, 'Event added to BigQuery buffer');

    // Flush if buffer is full
    if (this.eventBuffer.length >= this.BATCH_SIZE) {
      await this.flushBuffer();
    }
  }

  /**
   * Flush buffered events to BigQuery using load job (Sandbox-compatible)
   */
  private async flushBuffer(): Promise<void> {
    if (this.isFlushing || this.eventBuffer.length === 0) return;

    this.isFlushing = true;
    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      if (!this.table) {
        await this.initialize();
      }

      // Create temporary file with newline-delimited JSON
      const tempFile = path.join(os.tmpdir(), `bigquery-events-${Date.now()}.json`);

      try {
        // Write events as newline-delimited JSON
        const jsonLines = eventsToFlush.map((event) => JSON.stringify(event)).join('\n');
        fs.writeFileSync(tempFile, jsonLines, 'utf8');

        // Load data into BigQuery
        const [job] = await this.table!.load(tempFile, {
          sourceFormat: 'NEWLINE_DELIMITED_JSON',
          writeDisposition: 'WRITE_APPEND',
          autodetect: false,
        });

        // Wait for job to complete by polling getMetadata()
        // The job starts asynchronously, so we need to poll until it's done
        let metadata;
        let attempts = 0;
        const maxAttempts = 120; // 2 minutes max (1 second intervals)

        while (attempts < maxAttempts) {
          [metadata] = await job.getMetadata();

          // Check if job is done (success or error)
          if (metadata.status?.state === 'DONE' || metadata.status?.state === 'ERROR') {
            break;
          }

          // Job is still running, wait and check again
          await new Promise((resolve) => setTimeout(resolve, 1000));
          attempts++;
        }

        // Verify job completed successfully
        if (metadata.status?.state !== 'DONE') {
          if (metadata.status?.state === 'ERROR') {
            throw new Error(
              `BigQuery load job failed: ${JSON.stringify(metadata.status.errors || metadata.status.errorResult)}`
            );
          }
          throw new Error(
            `BigQuery load job did not complete within timeout. State: ${metadata.status?.state || 'UNKNOWN'}`
          );
        }

        // Check for errors even if state is DONE
        if (metadata.status?.errors && metadata.status.errors.length > 0) {
          throw new Error(`BigQuery load job failed: ${JSON.stringify(metadata.status.errors)}`);
        }

        const rowsLoaded =
          metadata.statistics?.load?.outputRows ||
          metadata.statistics?.outputRows ||
          eventsToFlush.length;

        logger.info(
          {
            eventCount: eventsToFlush.length,
            rowsLoaded,
            jobId: job.id || metadata.id,
            eventIds: eventsToFlush.map((e) => e.id).slice(0, 5),
          },
          'Events flushed to BigQuery via load job'
        );
      } finally {
        // Cleanup temporary file
        try {
          if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch (cleanupError) {
          logger.warn({ error: cleanupError, tempFile }, 'Failed to cleanup temp file');
        }
      }
    } catch (error) {
      // Re-queue events if flush failed
      this.eventBuffer.unshift(...eventsToFlush);
      logger.error(
        {
          error,
          eventCount: eventsToFlush.length,
          bufferSize: this.eventBuffer.length,
        },
        'Failed to flush events to BigQuery, events re-queued'
      );
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Force flush any remaining events in buffer
   * Call this during graceful shutdown
   */
  async flush(): Promise<void> {
    if (this.eventBuffer.length > 0) {
      logger.info({ bufferSize: this.eventBuffer.length }, 'Flushing remaining events to BigQuery');
      await this.flushBuffer();
    }
  }

  /**
   * BigQuery is append-only; status updates tracked in PostgreSQL
   */
  async updateEventStatus(
    eventId: string,
    status: string,
    _processedAt?: Date | null,
    _failedAt?: Date | null,
    _failureReason?: string | null,
    _retryCount?: number
  ): Promise<void> {
    logger.debug({ eventId, status }, 'Event status update (tracked in PostgreSQL only)');
  }
}

export const bigqueryService = new BigQueryService();
