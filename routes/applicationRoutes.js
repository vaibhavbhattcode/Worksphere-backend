// routes/applicationRoutes.js
import express from "express";
import {
  submitApplication,
  getApplicationsForJob,
  getUserApplication,
  getAllUserApplications,
  getAppliedJobs,
} from "../controllers/applicationController.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireUserJwt } from "../middleware/authJwt.js";

const router = express.Router();

router.get("/my", requireUserJwt, asyncHandler(getAllUserApplications));
router.get("/my/:jobId", requireUserJwt, asyncHandler(getUserApplication));
router.post("/", requireUserJwt, asyncHandler(submitApplication));
router.get("/applied", requireUserJwt, asyncHandler(getAppliedJobs));
router.get("/:jobId", requireUserJwt, asyncHandler(getApplicationsForJob));

export default router;
