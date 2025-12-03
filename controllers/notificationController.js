// controllers/notificationController.js
import Notification from "../models/Notification.js";
import { emitToActor } from "../socket.js";

export const getUserNotifications = async (req, res) => {
  try {
    console.log("=== FETCHING NOTIFICATIONS ===");
    console.log("User:", req.user?._id);
    console.log("Company:", req.company?._id);
    console.log("Actor:", req.actor);
    
    // Determine actor type - company takes precedence if authenticated via company route
    const isCompany = !!req.company;
    const actorType = isCompany ? "company" : "user";
    const actorId = isCompany ? req.company?._id : req.user?._id;

    console.log("Detected actor type:", actorType, "Actor ID:", actorId);

    if (!actorId) {
      console.error("No actor ID found");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const query = actorType === "company" ? { companyId: actorId } : { userId: actorId };
    console.log("Query:", query);

    const notifications = await Notification.find(query)
      .select("type title message isRead createdAt data priority")
      .populate({ path: "data.jobId", select: "jobTitle location" })
      .populate({ path: "data.companyId", select: "companyName" })
      .populate({ path: "data.applicationId", select: "status" })
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    console.log(`Found ${notifications.length} notifications for ${actorType}:${actorId}`);

    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const isCompany = !!req.company;
    const actorType = isCompany ? "company" : "user";
    const actorId = isCompany ? req.company?._id : req.user?._id;

    if (!actorId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const query = actorType === "company" 
      ? { companyId: actorId, isRead: false } 
      : { userId: actorId, isRead: false };

    const count = await Notification.countDocuments(query);

    console.log(`Unread count for ${actorType}:${actorId} = ${count}`);

    res.json({ count });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const isCompany = !!req.company;
    const actorType = isCompany ? "company" : "user";
    const actorId = isCompany ? req.company?._id : req.user?._id;

    if (!actorId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const query = actorType === "company" 
      ? { _id: req.params.id, companyId: actorId }
      : { _id: req.params.id, userId: actorId };

    const notification = await Notification.findOne(query);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    notification.isRead = true;
    await notification.save();

    // Emit real-time count update
    const unreadCount = await Notification.countDocuments(
      actorType === "user" 
        ? { userId: actorId, isRead: false }
        : { companyId: actorId, isRead: false }
    );

    emitToActor(actorType, actorId, "notificationCountUpdated", { count: unreadCount });

    res.json({ message: "Marked as read", unreadCount });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    const isCompany = !!req.company;
    const actorType = isCompany ? "company" : "user";
    const actorId = isCompany ? req.company?._id : req.user?._id;

    if (!actorId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const query = actorType === "company" 
      ? { companyId: actorId, isRead: false }
      : { userId: actorId, isRead: false };

    await Notification.updateMany(query, { isRead: true });

    // Emit real-time count update
    emitToActor(actorType, actorId, "notificationCountUpdated", { count: 0 });
    emitToActor(actorType, actorId, "notificationsMarkedRead", { all: true });

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all as read:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const clearAllNotifications = async (req, res) => {
  try {
    const isCompany = !!req.company;
    const actorType = isCompany ? "company" : "user";
    const actorId = isCompany ? req.company?._id : req.user?._id;

    if (!actorId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const query = actorType === "company" ? { companyId: actorId } : { userId: actorId };

    if (req.body.id) {
      await Notification.deleteOne({ _id: req.body.id, ...query });
      
      // Emit real-time count update
      const unreadCount = await Notification.countDocuments({ ...query, isRead: false });
      emitToActor(actorType, actorId, "notificationCountUpdated", { count: unreadCount });
      emitToActor(actorType, actorId, "notificationDeleted", { id: req.body.id });

      return res.status(200).json({ message: "Notification deleted", unreadCount });
    }

    await Notification.deleteMany(query);

    // Emit real-time updates
    emitToActor(actorType, actorId, "notificationCountUpdated", { count: 0 });
    emitToActor(actorType, actorId, "notificationsCleared");

    res.status(200).json({ message: "All notifications cleared." });
  } catch (err) {
    console.error("Clear failed", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Helper function to create and emit notifications
export const createNotification = async ({
  userId,
  companyId,
  type,
  title,
  message,
  data = {},
  priority = "medium",
  expiresAt = null
}) => {
  try {
    console.log('🔔 Creating notification:', { userId, companyId, type, title });

    // Defensive: require at least one recipient id
    if (!userId && !companyId) {
      console.warn('⚠️ createNotification called without userId or companyId. Skipping notification creation.', { type, title, data });
      return null;
    }
    
    const notification = await Notification.create({
      userId,
      companyId,
      type,
      title,
      message,
      data,
      priority,
      expiresAt
    });

    console.log('✅ Notification created:', notification._id);

    const populatedNotification = await Notification.findById(notification._id)
      .select("type title message isRead createdAt data priority")
      .populate({ path: "data.jobId", select: "jobTitle location" })
      .populate({ path: "data.companyId", select: "companyName" })
      .populate({ path: "data.applicationId", select: "status" })
      .lean();

    // Emit to recipient (only if recipient id exists)
    const recipientType = userId ? "user" : "company";
    const recipientId = userId || companyId;
    if (recipientId) {
      try {
        console.log(`📤 Emitting notification to ${recipientType}:${recipientId}`);
        emitToActor(recipientType, recipientId, "notification", populatedNotification);
      } catch (emitErr) {
        console.error('❌ Error emitting notification via socket:', emitErr);
      }
    } else {
      console.warn('⚠️ No recipientId available; skipping socket emit for notification', { notificationId: notification._id });
    }

    // Emit count update
    const query = userId ? { userId, isRead: false } : { companyId, isRead: false };
    const unreadCount = await Notification.countDocuments(query);
    
    console.log(`📤 Emitting count update: ${unreadCount} to ${recipientType}:${recipientId}`);
    emitToActor(recipientType, recipientId, "notificationCountUpdated", { count: unreadCount });

    return notification;
  } catch (error) {
    console.error("❌ Error creating notification:", error);
    throw error;
  }
};
