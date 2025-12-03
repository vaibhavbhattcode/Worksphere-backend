// utils/responseHelper.js
import { sendError } from "./errorResponse.js";
import messages from "./messages.js";

export const sendSuccess = (res, data = null, messageKey = null, statusCode = 200) => {
  const message = messageKey ? messages.en.success[messageKey] : "Success";
  return res.status(statusCode).json({ success: true, message, data });
};

export const sendErrorResponse = (res, messageKey, statusCode = 500, extra = {}) => {
  const message = messages.en.errors[messageKey] || messageKey;
  return sendError(res, statusCode, message, extra);
};
