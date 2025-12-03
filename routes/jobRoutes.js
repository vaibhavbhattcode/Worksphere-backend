// routes/jobRoutes.js

import express from "express";
import {
  createJob,
  getPostedJobs,
  getJobDetails,
  updateJob,
  updateJobStatus,
  getJobApplicants,
  deleteJob,
  getJobs,
  getJobsByCompanyId,
  getRecommendedAndAllJobs,
  getJobsPaginated,
} from "../controllers/jobController.js";
import { getJobCategories, getTrendingIndustries } from "../controllers/jobCategoriesController.js";
import { requireCompanyJwt, requireUserJwt } from "../middleware/authJwt.js";

const router = express.Router();
// — Public endpoints —
router.get("/", getJobs);
router.get("/company/jobs/:companyId", getJobsByCompanyId);
router.get("/categories", getJobCategories);
router.get("/trending-industries", getTrendingIndustries);
router.get("/paginated", getJobsPaginated); // New optimized endpoint with pagination and filtering

// ** Must come BEFORE “/:jobId” so “recommended” isn’t treated as an ID **
// Returns a single array of all jobs, each with isRecommended flag, sorted with recommended first.
router.get("/recommended", requireUserJwt, getRecommendedAndAllJobs);

// — Company-only endpoints —
router.post("/", requireCompanyJwt, createJob);
router.get("/posted", requireCompanyJwt, getPostedJobs);
router.put("/:jobId", requireCompanyJwt, updateJob);
router.patch("/:jobId/status", requireCompanyJwt, updateJobStatus);
router.delete("/:jobId", requireCompanyJwt, deleteJob);

// Now that "/recommended" is defined, this “/:jobId” will only match real ObjectIds
router.get("/:jobId", getJobDetails);
router.get("/:jobId/applicants", requireCompanyJwt, getJobApplicants);

export default router;
