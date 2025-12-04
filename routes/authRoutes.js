// routes/authRoutes.js
import express from "express";
import passport from "passport";
import {
  registerUser,
  verifyEmail,
  loginUser,
} from "../controllers/authController.js";
import { verifyToken, signUserToken } from "../utils/jwt.js";

const router = express.Router();

// Registration route for local signup
router.post("/register", registerUser);

// JWT-based login for users
router.post("/login", loginUser);

// JWT is stateless; logout is a no-op on the server (client should discard the token)
router.post("/logout", (req, res) => res.json({ message: "Logged out" }));

router.get("/status", (req, res) => {
  // Prevent caching of auth status
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  const auth = req.headers.authorization || "";
  try {
    const token = auth.split(" ")[1];
    const payload = token ? verifyToken(token) : null;
    if (payload?.type === "user") {
      return res.json({ loggedIn: true, type: "user" });
    }
  } catch (err) {
    console.log("User auth status error:", err.message);
  }
  return res.json({ loggedIn: false, type: null });
});

// Expose auth options so frontend can enable/disable providers gracefully
router.get("/options", (req, res) => {
  return res.json({ google: HAS_GOOGLE });
});

// Google OAuth for job seekers -> issues JWT on success
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const HAS_GOOGLE = Boolean(process.env.GOOGLE_CLIENT_ID) && Boolean(process.env.GOOGLE_CLIENT_SECRET);

// Initiate Google OAuth
if (HAS_GOOGLE) {
  router.get(
    "/google",
    passport.authenticate("google", { scope: ["profile", "email"], session: false })
  );
} else {
  router.get("/google", (req, res) => {
    const url = new URL(FRONTEND_URL + "/login");
    url.searchParams.set("error", "google_oauth_not_configured");
    return res.redirect(url.toString());
  });
}

// Callback: issue JWT and redirect to frontend with token
if (HAS_GOOGLE) {
  router.get(
    "/google/callback",
    (req, res, next) => {
      passport.authenticate("google", { session: false }, (err, user, info) => {
        if (err) {
          console.error("[Google OAuth] Error:", err);
          return res.redirect(FRONTEND_URL + "/login?error=google_auth_error");
        }
        if (!user) {
          console.error("[Google OAuth] No user returned:", info);
          return res.redirect(FRONTEND_URL + "/login?error=google_auth_failed");
        }
        // Attach user to request
        req.user = user;
        next();
      })(req, res, next);
    },
    async (req, res) => {
      // req.user provided by passport strategy
      if (!req.user) {
        return res.redirect(FRONTEND_URL + "/login?error=google_auth_failed");
      }
      try {
        const token = signUserToken({ _id: req.user.id, email: req.user.email || req.user.emails?.[0]?.value });
        const url = new URL(FRONTEND_URL + "/auth/google/callback");
        url.searchParams.set("token", token);
        console.log("[Google OAuth] Success! Redirecting with token");
        return res.redirect(url.toString());
      } catch (e) {
        console.error("[Google OAuth] Token generation error:", e);
        return res.redirect(FRONTEND_URL + "/login?error=token_issue_failed");
      }
    }
  );
} else {
  router.get("/google/callback", (req, res) => {
    return res.redirect(FRONTEND_URL + "/login?error=google_oauth_not_configured");
  });
}

// Email verification route
router.get("/verify-email", verifyEmail);

export default router;
