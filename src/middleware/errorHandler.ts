import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error | AppError | ZodError,
  req: Request,
  res: Response
): void => {
  if (err instanceof ZodError) {
    logger.warn({ errors: err.errors, path: req.path }, 'Validation error');
    res.status(400).json({
      error: 'Validation error',
      details: err.errors,
    });
    return;
  }

  if (err instanceof AppError) {
    logger.warn(
      { statusCode: err.statusCode, message: err.message, path: req.path },
      'Application error'
    );
    res.status(err.statusCode).json({
      error: err.message,
    });
    return;
  }

  logger.error({ error: err, path: req.path, stack: err.stack }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { message: err.message }),
  });
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
