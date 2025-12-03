// models/Notification.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", index: true },
    type: {
      type: String,
      required: true,
      enum: [
        "application_submitted",
        "application_viewed",
        "application_accepted",
        "application_rejected",
        "interview_scheduled",
        "interview_rescheduled",
        "interview_reminder",
        "interview_cancelled",
        "message_received",
        "job_match",
        "job_expired",
        "profile_viewed",
        "saved_job_expiring",
        "new_job_posted",
        "company_response",
        "system"
      ],
      index: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false, index: true },
    data: {
      jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
      applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application" },
      interviewId: { type: mongoose.Schema.Types.ObjectId, ref: "Interview" },
      conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
      companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
      actionUrl: { type: String },
      metadata: { type: mongoose.Schema.Types.Mixed }
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium"
    },
    expiresAt: { type: Date }
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ companyId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Notification", notificationSchema);

// Backward compatibility alias
export { notificationSchema };
