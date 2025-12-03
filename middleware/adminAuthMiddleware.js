import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Strict JWT-only admin guard. Requires Authorization: Bearer <token>.
export const isAdmin = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    const parts = auth.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ message: "Missing or invalid Authorization header" });
    }

    const token = parts[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided. Admin access denied." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded._id);
    if (!user || (!user.isAdmin && user.role !== "admin") || user.isActive === false) {
      return res.status(403).json({ message: "Access denied. Admins only." });
    }

    // Set both req.admin and req.user for compatibility
    req.admin = { id: user._id, email: user.email };
    req.user = user; // Full user object for backward compatibility
    return next();
  } catch (error) {
    console.error("[adminAuth]", error.message);
    return res.status(401).json({ message: "Authentication failed" });
  }
};
