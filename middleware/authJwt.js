import { verifyToken } from "../utils/jwt.js";
import { unauthorized, forbidden } from "../utils/apiResponse.js";
import User from "../models/User.js";
import Company from "../models/Company.js";

/**
 * Extract Bearer token from Authorization header
 */
function extractBearer(req) {
  const auth = req.headers.authorization || "";
  const parts = auth.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer") {
    return parts[1];
  }
  return null;
}

/**
 * Base authentication function
 */
async function authenticateToken(req, res, expectedType = null, allowBoth = false) {
  try {
    const token = extractBearer(req);
    if (!token) {
      return { error: true, response: unauthorized(res, "Missing Authorization header") };
    }

    const decoded = verifyToken(token);

    // Check token type if specific type is required
    if (expectedType && !allowBoth && decoded.type !== expectedType) {
      return { error: true, response: forbidden(res, "Invalid token type") };
    }

    // Handle user authentication
    if (decoded.type === "user" && (allowBoth || expectedType === "user")) {
      const user = await User.findById(decoded.sub);
      if (!user || user.isActive === false) {
        return { error: true, response: unauthorized(res, "User not found or inactive") };
      }
      if (user.role && user.role !== "jobSeeker") {
        return { error: true, response: forbidden(res, "Not a job seeker account") };
      }
      req.user = user;
      req.userType = "user";
      return { error: false };
    }

    // Handle company authentication
    if (decoded.type === "company" && (allowBoth || expectedType === "company")) {
      const company = await Company.findById(decoded.sub);
      if (!company || company.isActive === false) {
        return { error: true, response: unauthorized(res, "Company not found or inactive") };
      }
      req.user = company; // Keep compatibility with existing controllers
      req.company = company;
      req.userType = "company";
      return { error: false };
    }

    return { error: true, response: forbidden(res, "Invalid token type") };
  } catch (err) {
    console.error("Authentication error:", err.message);
    return { error: true, response: unauthorized(res, "Invalid or expired token") };
  }
}

/**
 * Middleware: Require user JWT
 */
export const requireUserJwt = async (req, res, next) => {
  const result = await authenticateToken(req, res, "user");
  if (result.error) return;
  next();
};

/**
 * Middleware: Require company JWT
 */
export const requireCompanyJwt = async (req, res, next) => {
  const result = await authenticateToken(req, res, "company");
  if (result.error) return;
  next();
};

/**
 * Middleware: Require user OR company JWT
 */
export const requireUserOrCompanyJwt = async (req, res, next) => {
  const result = await authenticateToken(req, res, null, true);
  if (result.error) return;
  next();
};

/**
 * Optional authentication - doesn't block if no token provided
 */
export const optionalAuth = async (req, res, next) => {
  const token = extractBearer(req);
  if (!token) {
    return next();
  }

  try {
    const decoded = verifyToken(token);
    
    if (decoded.type === "user") {
      const user = await User.findById(decoded.sub);
      if (user && user.isActive !== false) {
        req.user = user;
        req.userType = "user";
      }
    } else if (decoded.type === "company") {
      const company = await Company.findById(decoded.sub);
      if (company && company.isActive !== false) {
        req.company = company;
        req.user = company;
        req.userType = "company";
      }
    }
  } catch (err) {
    // Invalid token - continue without auth
    console.log("Optional auth failed:", err.message);
  }
  
  next();
};
