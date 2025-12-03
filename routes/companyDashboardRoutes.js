// routes/companyDashboardRoutes.js
import express from "express";
import { getDashboardOverview } from "../controllers/companyDashboardController.js";
import { requireCompanyJwt } from "../middleware/authJwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

router.get("/overview", requireCompanyJwt, asyncHandler(getDashboardOverview));

export default router;
