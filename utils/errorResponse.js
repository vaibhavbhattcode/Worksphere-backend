// utils/errorResponse.js

/**
 * Sends a standardized error response.
 * @param {object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {object} [extra] - Additional error details
 */
export function sendError(res, statusCode, message, extra = {}) {
  return res.status(statusCode).json({ message, ...extra });
}
