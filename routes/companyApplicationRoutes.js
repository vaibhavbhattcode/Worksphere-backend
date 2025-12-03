// routes/companyApplicationRoutes.js
import express from "express";
import {
  getJobApplications,
  updateApplicationStatus,
  getAllApplicationsForCompany,
} from "../controllers/companyApplicationController.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireCompanyJwt } from "../middleware/authJwt.js";

const router = express.Router();

// NEW: Get all applications for all jobs posted by the company
router.get("/all", requireCompanyJwt, asyncHandler(getAllApplicationsForCompany));

// Get applications for a single job
router.get("/:jobId", requireCompanyJwt, asyncHandler(getJobApplications));

// Update application status (hired/rejected)
router.put(
  "/:applicationId/status",
  requireCompanyJwt,
  asyncHandler(updateApplicationStatus)
);

export default router;
