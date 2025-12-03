import express from "express";
import {
  scheduleInterview,
  getInterviewsByJob,
  cancelInterview,
} from "../controllers/interviewController.js";
import { requireCompanyJwt } from "../middleware/authJwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Schedule or Reschedule Interview
router.post("/", requireCompanyJwt, asyncHandler(scheduleInterview));

// Fetch Interviews by Job
router.get("/job/:jobId", requireCompanyJwt, asyncHandler(getInterviewsByJob));

// Cancel Interview
router.delete("/:interviewId", requireCompanyJwt, asyncHandler(cancelInterview));

export default router;
