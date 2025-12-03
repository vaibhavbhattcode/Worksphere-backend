// backend/routes/jobTitleSuggestRoutes.js
import express from "express";
import { suggestJobTitles } from "../controllers/jobTitleSuggestController.js";
import { requireCompanyJwt } from "../middleware/authJwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// GET /api/jobs/suggest-title?query=React
router.get("/suggest-title", requireCompanyJwt, asyncHandler(suggestJobTitles));

export default router;
