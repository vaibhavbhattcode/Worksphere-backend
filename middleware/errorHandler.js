// middleware/errorHandler.js - Centralized error handling middleware

/**
 * Global error handler middleware
 * Catches all errors thrown in the application
 */
export const errorHandler = (err, req, res, next) => {
  // Log error for debugging
  console.error('[Error Handler]', {
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Default error status and message
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token has expired',
    });
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    let message = 'File upload error';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size exceeds limit';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field';
    }
    return res.status(400).json({
      success: false,
      message,
    });
  }

  // Default error response
  const response = {
    success: false,
    message,
  };

  // Include stack trace in development
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    response.stack = err.stack;
  }

  res.status(status).json(response);
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * Usage: router.get('/path', asyncHandler(async (req, res) => {...}))
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
