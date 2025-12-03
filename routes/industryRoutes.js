// routes/industryRoutes.js
import express from "express";
import {
  getAllIndustries,
  getAllIndustriesAdmin,
  getIndustryById,
  createIndustry,
  updateIndustry,
  deleteIndustry,
  getIndustriesWithJobCounts,
} from "../controllers/industryController.js";
import { isAdmin } from "../middleware/adminAuthMiddleware.js";

const router = express.Router();

// Public routes
router.get("/", getAllIndustries);
router.get("/analytics", getIndustriesWithJobCounts);
router.get("/:id", getIndustryById);

// Admin routes (require admin authentication)
router.get("/admin/all", isAdmin, getAllIndustriesAdmin);
router.post("/", isAdmin, createIndustry);
router.put("/:id", isAdmin, updateIndustry);
router.delete("/:id", isAdmin, deleteIndustry);

export default router;
