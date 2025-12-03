// routes/notificationRoutes.js
import express from "express";
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  clearAllNotifications,
} from "../controllers/notificationController.js";
// Auth is enforced at mount with requireUserJwt in server.js

const router = express.Router();

// GET all
router.get("/", getUserNotifications);

// GET unread count
router.get("/unread-count", getUnreadCount);

// PATCH mark as read
router.patch("/:id/read", markAsRead);

// PATCH mark all as read
router.patch("/mark-all-read", markAllAsRead);

// DELETE all
router.delete("/", clearAllNotifications);

export default router;
