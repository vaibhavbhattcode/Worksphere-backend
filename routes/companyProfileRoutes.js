// routes/companyProfileRoutes.js
import express from "express";
import {
  getCompanyProfile,
  updateCompanyProfile,
  uploadCompanyLogo,
  getRandomFeaturedCompanies, // <-- add this import
} from "../controllers/companyProfileController.js";
import { requireCompanyJwt } from "../middleware/authJwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Company authenticated routes
router.get("/", requireCompanyJwt, asyncHandler(getCompanyProfile));
router.put("/", requireCompanyJwt, asyncHandler(updateCompanyProfile));
router.post("/logo", requireCompanyJwt, asyncHandler(uploadCompanyLogo));

// Public route for random featured companies
router.get("/featured-random", getRandomFeaturedCompanies);

export default router;
