import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    coverLetter: {
      type: String,
      default: "",
    },
    resume: {
      type: String, // URL of the resume (from user's profile)
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "hired", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// Prevent duplicate applications and speed up lookups
applicationSchema.index({ jobId: 1, userId: 1 }, { unique: true });
applicationSchema.index({ userId: 1, createdAt: -1 });
applicationSchema.index({ jobId: 1, createdAt: -1 });
applicationSchema.index({ status: 1 });

const Application = mongoose.model("Application", applicationSchema);

export default Application;
