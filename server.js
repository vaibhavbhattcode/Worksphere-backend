// server.js

import dotenv from "dotenv";
dotenv.config();

import express from "express";
// Validate environment early
import "./config/env.js";
import cors from "cors";
import passport from "passport";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import connectDB from "./config/db.js";
import "./config/passport.js";
import http from "http";
import { initSocket } from "./socket.js";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import xss from "xss-clean";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import profileRoutes from "./routes/profile.js";
import aiRoutes from "./routes/ai.js";
import companyAuthRoutes from "./routes/companyAuthRoutes.js";
import companyProfileRoutes from "./routes/companyProfileRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import industryRoutes from "./routes/industryRoutes.js";
import rateLimit from "express-rate-limit";
import companyDashboardRoutes from "./routes/companyDashboardRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import companyApplicationRoutes from "./routes/companyApplicationRoutes.js";
import companyListRoutes from "./routes/companyListRoutes.js";
import interviewRoutes from "./routes/interviewRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";

import adminAuthRoutes from "./routes/adminAuthRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { isAdmin } from "./middleware/adminAuthMiddleware.js";

import { getRecommendedAndAllJobs } from "./controllers/jobController.js";
import { getUserDashboardOverview, getProfileById } from "./controllers/userController.js";
import { requireUserJwt, requireCompanyJwt, requireUserOrCompanyJwt } from "./middleware/authJwt.js";
import { cleanupSearches } from "./controllers/searchController.js";
import { asyncHandler } from "./utils/asyncHandler.js";
import { initializeJobSchedulers } from "./utils/jobScheduler.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

connectDB();

const app = express();
// Trust proxy so rate-limits and IPs are correct behind proxies/devtools
app.set("trust proxy", 1);
const server = http.createServer(app);
initSocket(server);

// Increase JSON/urlencoded payload limits to allow large base64 PDF payloads
// Resume builder can submit data URIs for generated PDFs; set to 50MB to be safe for client-generated PDFs
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
// Security middlewares
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());
// Request logging (redacts bodies and credentials)
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(compression());
// Configure Helmet with CSP that allows the frontend to frame uploads (for PDF/image previews)
app.use(
  helmet({
    frameguard: false, // Prefer CSP frame-ancestors over X-Frame-Options
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // Allow the frontend to embed iframes for resources served by this backend
        "frame-ancestors": [
          "'self'",
          process.env.FRONTEND_URL || "http://localhost:3000",
        ],
        // Allow images/media from this origin, data/blob and the frontend origin (for dev tooling)
        "img-src": [
          "'self'",
          "data:",
          "blob:",
          process.env.FRONTEND_URL || "http://localhost:3000",
          "http://localhost:5000",
        ],
        "media-src": [
          "'self'",
          "data:",
          "blob:",
          process.env.FRONTEND_URL || "http://localhost:3000",
          "http://localhost:5000",
        ],
        // PDFs served as static files are fine; disallow plugins
        "object-src": ["'none'"],
      },
    },
  })
);
// Initialize passport for Google OAuth (user only)
app.use(passport.initialize());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(
  "/uploads",
  express.static("uploads", {
    // Encourage browser caching for uploaded assets to reduce re-fetching and UI jank
    maxAge: "7d",
    etag: true,
    setHeaders: (res) => {
      res.set(
        "Access-Control-Allow-Origin",
        process.env.FRONTEND_URL || "http://localhost:3000"
      );
      res.set("Access-Control-Allow-Credentials", "true");
      // Immutable since filenames include timestamps; safe to cache
      res.set("Cache-Control", "public, max-age=604800, immutable");
      // Ensure static files explicitly permit being iframed by the frontend
      res.set(
        "Content-Security-Policy",
        `frame-ancestors 'self' ${process.env.FRONTEND_URL || "http://localhost:3000"}`
      );
    },
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  message: "Too many requests, please try again later.",
});

// Sessions removed; JWT is used for user/company/admin

// ───────────────────────────────────────────────────────────────────────────
// 1) EXPOSE “/api/jobs/recommended” under userSessionMiddleware
//    so that req.user is populated for logged‐in users
app.get("/api/jobs/recommended", requireUserJwt, getRecommendedAndAllJobs);

// ───────────────────────────────────────────────────────────────────────────
// 2) Mount all other /api/jobs routes (company‐only endpoints)
// Rate limiter for job posting (company)
const jobPostLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // max 10 job posts per 10 minutes per IP
  message: "Too many job posts from this company. Please wait before posting again.",
  keyGenerator: (req) => req.user?._id || req.ip,
});

app.use(
  "/api/jobs",
  (req, res, next) => {
    if (req.method === "POST") {
      return jobPostLimiter(req, res, next);
    }
    next();
  },
  jobRoutes
);

// ───────────────────────────────────────────────────────────────────────────
// 3) Other routes
// Tighter auth limiter for brute-force protection BUT skip benign status/options probes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.method === "GET" && ["/status", "/options"].includes(req.path), // allow unlimited lightweight status/options checks
});
app.use("/api/auth", authLimiter, authRoutes);
app.get("/api/user/overview", asyncHandler(getUserDashboardOverview));
app.use("/api/user", requireUserJwt, userRoutes);
app.use("/api/user/profile", requireUserOrCompanyJwt, profileRoutes);
// AI routes:
// - Most endpoints are public, but specific ones enforce auth inside aiRoutes (e.g., career-suggestions)
app.use("/api/ai", limiter, aiRoutes);

app.use("/api/notifications", requireUserJwt, notificationRoutes);
// Chat routes for users
app.use("/api/chat", requireUserJwt, chatRoutes);
app.use("/api/company/auth", authLimiter, companyAuthRoutes);
app.use("/api/company/profile", requireCompanyJwt, companyProfileRoutes);
// Allow companies to view user profiles (for applications)
app.get("/api/company/user-profile/:userId", requireCompanyJwt, asyncHandler(getProfileById));
app.use("/api/company/dashboard", requireCompanyJwt, companyDashboardRoutes);
app.use("/api/company/notifications", requireCompanyJwt, notificationRoutes);
// Chat routes for companies (same handlers; actor derived from path)
app.use("/api/company/chat", requireCompanyJwt, chatRoutes);
app.use("/api/searches", requireUserJwt, searchRoutes);

app.use("/api/applications", requireUserJwt, applicationRoutes);
app.use("/api/company/applications", requireCompanyJwt, companyApplicationRoutes);
app.use("/api/company/interviews", requireCompanyJwt, interviewRoutes);
app.use("/api/companies", companyListRoutes);
app.use("/api/company-profiles", companyProfileRoutes);
app.use("/api/industries", industryRoutes);
// Admin auth is JWT-based (no sessions)
// Admin auth: existing mount at /admin/auth; add explicit API alias /api/admin/auth
app.use("/admin/auth", authLimiter, adminAuthRoutes);
app.use("/api/admin/auth", authLimiter, adminAuthRoutes);

// Mount admin API at both /api/admin and /admin for backward compatibility
// JWT-only with isAdmin middleware to prevent any unauthenticated access
app.use("/api/admin", isAdmin, adminRoutes);
app.use("/admin", isAdmin, adminRoutes);

// Health check route
app.get("/", (req, res) => {
  res.json({ 
    success: true, 
    message: "Work Sphere backend is running ✅",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

// 404 handler for unknown routes - must be after all other routes
app.use(notFoundHandler);

// Centralized error handler - must be last middleware
app.use(errorHandler);
// Set up periodic cleanup of old search records (runs daily at 2 AM)
const scheduleSearchCleanup = () => {
  const now = new Date();
  const nextRun = new Date();
  nextRun.setHours(2, 0, 0, 0); // 2:00 AM
  
  // If it's already past 2 AM today, schedule for tomorrow
  if (now > nextRun) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  const timeUntilNextRun = nextRun.getTime() - now.getTime();
  
  setTimeout(() => {
    console.log('[Scheduler] Starting search cleanup task');
    cleanupSearches()
      .then(result => {
        console.log(`[Scheduler] Search cleanup completed. Removed: ${result?.deleted || 0}, Remaining: ${result?.remaining || 0}`);
      })
      .catch(err => {
        console.error('[Scheduler] Search cleanup failed:', err);
      });
    
    // Schedule next run (24 hours later)
    setInterval(() => {
      console.log('[Scheduler] Starting search cleanup task');
      cleanupSearches()
        .then(result => {
          console.log(`[Scheduler] Search cleanup completed. Removed: ${result?.deleted || 0}, Remaining: ${result?.remaining || 0}`);
        })
        .catch(err => {
          console.error('[Scheduler] Search cleanup failed:', err);
        });
    }, 24 * 60 * 60 * 1000); // 24 hours
  }, timeUntilNextRun);
  
  console.log(`[Scheduler] Search cleanup scheduled for ${nextRun}`);
};

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  // Start the periodic cleanup task
  scheduleSearchCleanup();
  
  // Initialize job management schedulers
  try {
    initializeJobSchedulers();
  } catch (error) {
    console.error('⚠️  Job schedulers failed to initialize:', error.message);
    console.log('   Server will continue without automated job management');
  }
});
