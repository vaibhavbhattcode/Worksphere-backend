// utils/apiResponse.js - Centralized API response helpers
import messages from './messages.js';

/**
 * Standard success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code
 * @param {Object} meta - Additional metadata (pagination, etc.)
 */
export const success = (res, data = null, message = 'Success', statusCode = 200, meta = null) => {
  const response = {
    success: true,
    message,
    data,
  };
  
  if (meta) {
    response.meta = meta;
  }
  
  return res.status(statusCode).json(response);
};

/**
 * Create success response (201)
 */
export const created = (res, data = null, message = 'Resource created successfully') => {
  return success(res, data, message, 201);
};

/**
 * Standard error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Object} errors - Validation errors or additional error details
 */
export const error = (res, message = 'An error occurred', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message,
  };
  
  if (errors) {
    response.errors = errors;
  }
  
  return res.status(statusCode).json(response);
};

/**
 * Bad Request error (400)
 */
export const badRequest = (res, message = 'Bad Request', errors = null) => {
  return error(res, message, 400, errors);
};

/**
 * Unauthorized error (401)
 */
export const unauthorized = (res, message = 'Unauthorized - Please login') => {
  return error(res, message, 401);
};

/**
 * Forbidden error (403)
 */
export const forbidden = (res, message = 'Forbidden - You do not have permission') => {
  return error(res, message, 403);
};

/**
 * Not Found error (404)
 */
export const notFound = (res, message = 'Resource not found') => {
  return error(res, message, 404);
};

/**
 * Conflict error (409)
 */
export const conflict = (res, message = 'Resource already exists') => {
  return error(res, message, 409);
};

/**
 * Validation error (422)
 */
export const validationError = (res, errors, message = 'Validation failed') => {
  return error(res, message, 422, errors);
};

/**
 * Server error (500)
 */
export const serverError = (res, message = 'Internal server error', err = null) => {
  if (process.env.NODE_ENV !== 'production' && err) {
    console.error('[ServerError]', err);
  }
  return error(res, message, 500);
};

/**
 * Send response using message key from messages.js
 */
export const sendWithMessageKey = (res, messageKey, data = null, statusCode = 200, isError = false) => {
  const message = isError 
    ? messages.en.errors[messageKey] || messageKey
    : messages.en.success[messageKey] || messageKey;
  
  if (isError) {
    return error(res, message, statusCode);
  }
  return success(res, data, message, statusCode);
};

/**
 * Paginated response helper
 */
export const paginated = (res, data, page, limit, total, message = 'Data retrieved successfully') => {
  const totalPages = Math.ceil(total / limit);
  
  return success(res, data, message, 200, {
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    }
  });
};

// Export all helpers as default object
export default {
  success,
  created,
  error,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validationError,
  serverError,
  sendWithMessageKey,
  paginated,
};
