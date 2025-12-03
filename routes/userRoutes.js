// routes/userRoutes.js
import express from "express";

const router = express.Router();

import {
  getProfile,
  getProfileById,
  updateProfile,
  uploadPhoto,
  uploadResume,
  removeResume,
  uploadCertificate,
  deleteCertificate,
  certificateUpload,
  uploadVideoIntro,
  deleteVideoIntro,
  getAnalytics,
  getUserDashboardOverview,
  getResumeBuilderState,
  saveResumeBuilderState,
  updateResumeSourcePreference,
} from "../controllers/userController.js";
import { parseResumeAndExtractProfile, checkParserHealth } from "../controllers/resumeParserController.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  saveJob,
  removeSavedJob,
  getSavedJobs,
} from "../controllers/savedJobController.js";
// Auth is enforced at mount with requireUserJwt in server.js

const requireUser = (req, res, next) => {
  if (req.user) return next();
  return res.status(401).json({ message: "Not authenticated" });
};

// Resume parser autofill endpoint
router.post("/profile/parse-resume", requireUser, asyncHandler(parseResumeAndExtractProfile));

// Health check for parser service
router.get("/profile/parser-health", requireUser, asyncHandler(checkParserHealth));

// Note: Public overview route is exposed at server level (GET /api/user/overview)
// Do not re-declare here to avoid requiring auth via requireUserJwt mount

router.get("/profile", requireUser, asyncHandler(getProfile));
router.put("/profile", requireUser, asyncHandler(updateProfile));
// Note: uploadPhoto and uploadResume are arrays of middlewares (multer + handler)
// Do NOT wrap arrays with asyncHandler — pass them directly/spread so Express composes them.
router.post("/profile/upload-photo", requireUser, ...uploadPhoto);
router.post("/profile/upload-resume", requireUser, ...uploadResume);
router.delete("/profile/resume", requireUser, asyncHandler(removeResume));
router.post(
  "/profile/upload-certificate",
  requireUser,
  certificateUpload.single("certificate"),
  asyncHandler(uploadCertificate)
);
router.delete("/profile/certificate/:certificateId", requireUser, asyncHandler(deleteCertificate));

router.post("/profile/upload-video-intro", requireUser, ...uploadVideoIntro);
router.delete("/profile/video-intro", requireUser, asyncHandler(deleteVideoIntro));
router.get("/analytics", requireUser, asyncHandler(getAnalytics));

router.get("/profile/resume-builder", requireUser, asyncHandler(getResumeBuilderState));
router.put("/profile/resume-builder", requireUser, asyncHandler(saveResumeBuilderState));
router.put("/profile/resume-source", requireUser, asyncHandler(updateResumeSourcePreference));

// Route to save a job
router.post("/save-job/:jobId", requireUser, asyncHandler(saveJob));

// Route to remove a saved job
router.delete("/remove-job/:jobId", requireUser, asyncHandler(removeSavedJob));

// Route to fetch saved jobs
router.get("/saved-jobs", requireUser, asyncHandler(getSavedJobs));

export default router;
