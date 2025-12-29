import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // DATABASE_URL must be a valid postgresql:// string
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is missing').url('Invalid URL format'),

  // Coerce converts the string "8080" from Cloud Run into a number 8080
  PORT: z.coerce.number().default(8080),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  GCP_PROJECT_ID: z.string().min(1, 'GCP_PROJECT_ID is missing'),

  PUBSUB_TOPIC_NAME: z.string().default('events'),
  PUBSUB_SUBSCRIPTION_NAME: z.string().default('events-worker'),
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
    // This exits early so Cloud Run knows immediately if the config is wrong
    process.exit(1);
  }
  throw error;
}

export { env };
