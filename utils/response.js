// Minimal response helpers for consistency
export const ok = (res, data = {}, meta) => {
  return res.status(200).json({ success: true, data, meta });
};

export const created = (res, data = {}, meta) => {
  return res.status(201).json({ success: true, data, meta });
};

export const badRequest = (res, message = "Bad Request", details) => {
  return res.status(400).json({ success: false, message, details });
};

export const unauthorized = (res, message = "Unauthorized") => {
  return res.status(401).json({ success: false, message });
};

export const forbidden = (res, message = "Forbidden") => {
  return res.status(403).json({ success: false, message });
};

export const notFound = (res, message = "Not Found") => {
  return res.status(404).json({ success: false, message });
};

export const serverError = (res, message = "Internal Server Error", error) => {
  if (process.env.NODE_ENV !== "production" && error) {
    // eslint-disable-next-line no-console
    console.error("[serverError]", error);
  }
  return res.status(500).json({ success: false, message });
};

export default {
  ok,
  created,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
};
