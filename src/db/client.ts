import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
});

prisma.$on('query' as never, (e: any) => {
  logger.debug({ query: e.query, params: e.params, duration: `${e.duration}ms` }, 'Database query');
});

prisma.$on('error' as never, (e: any) => {
  logger.error({ error: e }, 'Database error');
});

prisma.$on('warn' as never, (e: any) => {
  logger.warn({ warning: e }, 'Database warning');
});

export default prisma;

