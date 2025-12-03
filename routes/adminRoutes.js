import express from "express";
import { isAdmin } from "../middleware/adminAuthMiddleware.js";

import adminController from "../controllers/adminController.js";

const router = express.Router();

// Admin Dashboard Stats
router.get("/stats", isAdmin, adminController.getStats);

// User Management
router.get("/users", isAdmin, adminController.getAllUsers);
router.put("/users/:id", isAdmin, adminController.updateUser);
router.delete("/users/:id", isAdmin, adminController.deleteUser);
router.patch(
  "/users/:id/toggle-active",
  isAdmin,
  adminController.toggleUserActive
); // Add this route
router.patch(
  "/users/bulk-toggle-active",
  isAdmin,
  adminController.bulkToggleUsersActive
);

// Company Management
router.get("/companies", isAdmin, adminController.getAllCompanies);
router.get(
  "/companies/:id/details",
  isAdmin,
  adminController.getCompanyDetails
);
router.put("/companies/:id", isAdmin, adminController.updateCompany);
router.delete("/companies/:id", isAdmin, adminController.deleteCompany);
router.patch(
  "/companies/:id/toggle-active",
  isAdmin,
  adminController.toggleCompanyActive
);
router.patch(
  "/companies/bulk-toggle-active",
  isAdmin,
  adminController.bulkToggleCompaniesActive
);

// Job Management
router.get("/jobs", isAdmin, adminController.getAllJobs);
router.put("/jobs/:id", isAdmin, adminController.updateJob);
router.patch("/jobs/:id/approve", isAdmin, adminController.approveJob);
router.patch("/jobs/:id/reject", isAdmin, adminController.rejectJob);
router.patch("/jobs/:id/feature", isAdmin, adminController.featureJob);
router.patch("/jobs/:id/unfeature", isAdmin, adminController.unfeatureJob);
router.delete("/jobs/:id", isAdmin, adminController.deleteJob);

// User Growth
router.get("/user-growth", isAdmin, adminController.getUserGrowth);

// Job Stats
router.get("/job-stats", isAdmin, adminController.getJobStats);

// Job Trends
router.get("/job-trends", isAdmin, adminController.getJobTrends);

export default router;
