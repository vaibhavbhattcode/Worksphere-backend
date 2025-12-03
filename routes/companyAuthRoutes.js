// routes/companyAuthRoutes.js
import express from "express";
import {
  registerCompany,
  verifyCompanyEmail,
  loginCompany,
  resendCompanyVerification,
  forgotCompanyPassword,
  resetCompanyPassword,
} from "../controllers/companyAuthController.js";
import CompanyProfile from "../models/CompanyProfile.js";
import { verifyToken } from "../utils/jwt.js";

const router = express.Router();

router.post("/register", registerCompany);
router.post("/login", loginCompany);
router.get("/verify-email", verifyCompanyEmail);
router.post("/resend-verification", resendCompanyVerification);
router.post("/forgot-password", forgotCompanyPassword);
router.post("/reset-password", resetCompanyPassword);

// JWT is stateless; logout is a no-op on the server (client should discard the token)
router.post("/logout", (req, res) => res.json({ message: "Logged out" }));

// Updated status endpoint to fetch profile details if authenticated.
router.get("/status", async (req, res) => {
  // Prevent caching of auth status
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  const auth = req.headers.authorization || "";
  try {
    const token = auth.split(" ")[1];
    const payload = token ? verifyToken(token) : null;
    if (payload?.type === "company") {
      const companyProfile = await CompanyProfile.findOne({ company: payload.sub });
      return res.json({ loggedIn: true, type: "company", company: companyProfile || {} });
    }
  } catch (err) {
    console.log("Company auth status error:", err.message);
  }
  return res.json({ loggedIn: false, type: null });
});

// No Google OAuth for companies

export default router;
