import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z
    .string()
    .optional()
    .transform((val) => Number(val || process.env.PORT || '8080')), // Cloud Run sets PORT=8080, default to 8080
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  GCP_PROJECT_ID: z.string(),
  PUBSUB_TOPIC_NAME: z.string().default('events'),
  PUBSUB_SUBSCRIPTION_NAME: z.string().default('events-worker'),
  GCP_CREDENTIALS_PATH: z.string().optional(),
  BIGQUERY_DATASET_ID: z.string().default('eventflow'),
  BIGQUERY_TABLE_ID: z.string().default('events'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment variables:');
    error.errors.forEach((err) => {
      console.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export { env };

