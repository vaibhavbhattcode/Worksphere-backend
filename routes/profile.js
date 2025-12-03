// routes/profile.js
import express from "express";
import { getProfileById } from "../controllers/userController.js"; // Use getProfileById for fetching by userId

const router = express.Router();

// Use the real controller to fetch profile details by userId
router.get("/:userId", getProfileById);

export default router;
